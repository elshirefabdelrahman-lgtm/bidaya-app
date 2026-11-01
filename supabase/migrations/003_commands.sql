begin;
create function public.app_money(v text, allow_zero boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric; begin
 n:=v::numeric;
 if n is null or n::text in ('NaN','Infinity','-Infinity') or n<0 or (not allow_zero and n=0) or n>10000000000 or round(n,2)<>n then raise exception 'Invalid amount'; end if;
 return n;
end $$;
create function public.app_day(v text) returns text language plpgsql immutable set search_path='' as $$
begin if v is null or v!~ '^\d{4}-\d{2}-\d{2}$' or to_char(v::date,'YYYY-MM-DD')<>v then raise exception 'Invalid date'; end if;return v;end $$;
create function public.app_command(kind text,input jsonb,request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles; oldrow jsonb; rowdata jsonb; c public.cases; e public.employees; s public.employee_salaries;
 target text; area text; b text; rid text:=gen_random_uuid()::text; amt numeric; bal numeric; n numeric; paid numeric; adv numeric; req public.operation_requests;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null then raise exception 'Access denied'; end if;
 -- Serializes financial changes, balance checks, receipts, and idempotency atomically.
 perform pg_advisory_xact_lock(78766401);
 if request_id is null then raise exception 'Request ID required'; end if;
 select * into req from public.operation_requests where actor_id=actor.id and operation_requests.request_id=app_command.request_id;
 if found then if req.kind<>app_command.kind or req.input<>app_command.input then raise exception 'Request ID reused with different input';end if;return;end if;
 area:=case when kind in ('case','caseEdit') then 'cases' when kind in ('employee','employeeEdit') then 'employees' when kind in ('collection','expense','void') then 'finance' when kind='branch' then 'settings' when kind in ('salary','salaryPayment','advance','repayment') then 'payroll' else null end;
 if area is null or not public.app_allowed(area) then raise exception 'Permission denied'; end if;
 if kind='branch' then
  b:=trim(input->>'name');if b is null or b='' then raise exception 'Branch required';end if;
  if not public.app_super() then raise exception 'Super Admin required to add branches';end if;
  insert into public.branches values(b);
 else
  if kind in ('case','caseEdit','employee','employeeEdit','expense') then b:=input->>'branch';
  elsif kind='collection' then select * into c from public.cases where id=input->>'caseId';b:=c.branch;
  elsif kind='salaryPayment' then select * into s from public.employee_salaries where id=input->>'salaryId';select * into e from public.employees where id=s.employee_id;b:=s.branch;
  elsif kind in ('salary','advance','repayment') then select * into e from public.employees where id=input->>'employeeId';b:=e.branch;
  elsif kind='void' then
   target:=case input->>'entity' when 'collections' then 'case_payments' when 'expenses' then 'expenses' else null end;
   if target is null then raise exception 'Unsupported reversal';end if;
   execute format('select data,branch from public.%I where id=$1',target) into oldrow,b using input->>'id';
  end if;
  if b is null or not public.app_allowed(area,b) then raise exception 'Branch access denied';end if;
  if input ? 'time' and (input->>'time')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid time';end if;
  if kind in ('case','caseEdit') then
   target:='cases';if kind='caseEdit' then
    select data into oldrow from public.cases where id=input->>'id';
    if oldrow is null or not public.app_allowed(area,oldrow->>'branch') then raise exception 'Access denied';end if;
    if b<>oldrow->>'branch' then raise exception 'Branch transfer requires separate migration';end if;rid:=input->>'id';
   else rid:=nextval('public.case_number_seq')::text;rid:=repeat('0',greatest(0,3-length(rid)))||rid;end if;
   amt:=public.app_money(input->>'fee',true);
   select coalesce(sum(amount),0) into bal from public.case_payments where case_id=rid and not coalesce((data->>'voided')::boolean,false);
   if amt<bal then raise exception 'Contract below collections';end if;
   perform public.app_day(input->>'admission');
   if coalesce(input->>'discharge','')<>'' then perform public.app_day(input->>'discharge');if input->>'discharge'<input->>'admission' then raise exception 'Invalid discharge';end if;end if;
   if input->>'status'<>'نشطة' and coalesce(input->>'discharge','')='' then raise exception 'Discharge date required';end if;
   rowdata=jsonb_build_object('id',rid,'name',trim(input->>'name'),'fee',amt,'branch',b,'admission',input->>'admission','discharge',coalesce(input->>'discharge',''),'status',input->>'status','note',coalesce(input->>'note',''),'phone',coalesce(input->>'phone',''));
  elsif kind in ('employee','employeeEdit') then
   target:='employees';if kind='employeeEdit' then select data into oldrow from public.employees where id=input->>'id';if oldrow is null or not public.app_allowed(area,oldrow->>'branch') then raise exception 'Access denied';end if;
    if b<>oldrow->>'branch' then raise exception 'Branch transfer requires separate migration';end if;rid:=input->>'id';end if;
   rowdata=jsonb_build_object('id',rid,'name',trim(input->>'name'),'role',trim(input->>'role'),'branch',b,'salary',public.app_money(input->>'salary',true),'hired',public.app_day(input->>'hired'),'active',coalesce((input->>'active')::boolean,true),'note',coalesce(input->>'note',''));
  elsif kind='collection' then
   target:='case_payments';amt:=public.app_money(input->>'amount');
   select c.fee-coalesce(sum(amount),0) into bal from public.case_payments where case_id=c.id and not coalesce((data->>'voided')::boolean,false);
   if amt>bal then raise exception 'Overpayment';end if;
   rowdata=jsonb_build_object('id',rid,'caseId',c.id,'amount',amt,'date',public.app_day(input->>'date'),'receipt',trim(input->>'receipt'),'method',input->>'method','note',input->>'note');
  elsif kind='expense' then
   target:='expenses';rowdata=jsonb_build_object('id',rid,'amount',public.app_money(input->>'amount'),'date',public.app_day(input->>'date'),'category',trim(input->>'category'),'description',trim(input->>'description'),'method',input->>'method','note',input->>'note');
  elsif kind in ('advance','repayment','salary','salaryPayment') then
   if e.id is null then raise exception 'Employee not found';end if;
   select coalesce(sum(amount),0) into bal from public.employee_advances where employee_id=e.id;
   select bal-coalesce(sum(amount),0) into bal from public.advance_settlements where employee_id=e.id;
   if kind in ('advance','repayment') then
    amt:=public.app_money(input->>'amount');if kind='repayment' and amt>bal then raise exception 'Repayment exceeds advances';end if;
    target:=case when kind='advance' then 'employee_advances' else 'advance_settlements' end;
    rowdata=jsonb_build_object('id',rid,'employeeId',e.id,'amount',amt,'date',public.app_day(input->>'date'),'kind',case when kind='advance' then 'advance' else 'cash' end,'note',input->>'note');
   elsif kind='salary' then
    target:='employee_salaries';adv:=public.app_money(input->>'advance',true);paid:=public.app_money(input->>'paid',true);
    n:=e.salary+public.app_money(input->>'additions',true)-public.app_money(input->>'deduction',true)-adv;
    if adv>bal or n<0 or paid>n then raise exception 'Invalid salary or advance balance';end if;
    rowdata=jsonb_build_object('id',rid,'employeeId',e.id,'month',input->>'month','base',e.salary,'additions',public.app_money(input->>'additions',true),'deduction',public.app_money(input->>'deduction',true),'advance',adv,'date',public.app_day(input->>'date'),'note',input->>'note');
   else
    target:='salary_payments';amt:=public.app_money(input->>'amount');
    select s.net-coalesce(sum(amount),0) into n from public.salary_payments where salary_id=s.id;
    if amt>n then raise exception 'Salary overpayment';end if;
    rowdata=jsonb_build_object('id',rid,'employeeId',e.id,'salaryId',s.id,'amount',amt,'date',public.app_day(input->>'date'),'note',input->>'note');
   end if;
  elsif kind='void' then
   if oldrow is null or coalesce((oldrow->>'voided')::boolean,false) then raise exception 'Already void or missing';end if;
   if coalesce(trim(input->>'reason'),'')='' then raise exception 'Reason required';end if;rid:=input->>'id';
   rowdata:=oldrow||jsonb_build_object('voided',true,'voidReason',trim(input->>'reason'),'voidedAt',now());
  end if;
  rowdata:=rowdata||jsonb_build_object('branch',b,'user',coalesce(oldrow->>'user',actor.name),'time',coalesce(oldrow->>'time',input->>'time'),'createdAt',coalesce(oldrow->>'createdAt',now()::text));
  if oldrow is not null then execute format('update public.%I set data=$1 where id=$2',target) using rowdata,rid;
  else execute format('insert into public.%I(id,branch,data) values($1,$2,$3)',target) using rid,b,rowdata;end if;
  if kind='salary' then
   if adv>0 then insert into public.advance_settlements(id,branch,data) values(gen_random_uuid()::text,b,jsonb_build_object('employeeId',e.id,'salaryId',rid,'kind','salary','amount',adv,'date',input->>'date','user',actor.name));end if;
   if paid>0 then insert into public.salary_payments(id,branch,data) values(gen_random_uuid()::text,b,jsonb_build_object('employeeId',e.id,'salaryId',rid,'amount',paid,'date',input->>'date','user',actor.name));end if;
  end if;
 end if;
 insert into public.operation_requests(actor_id,request_id,kind,input)values(actor.id,request_id,kind,input);
end $$;
-- SECURITY INVOKER: every array is filtered by its table's RLS, including audit.
create function public.app_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'currentUser',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
 'users',coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p),'[]'),
 'branches',coalesce((select jsonb_agg(id order by id) from public.branches),'[]'),
 'cases',coalesce((select jsonb_agg(data) from public.cases),'[]'),
 'collections',coalesce((select jsonb_agg(data) from public.case_payments),'[]'),
 'employees',coalesce((select jsonb_agg(data) from public.employees),'[]'),
 'expenses',coalesce((select jsonb_agg(data) from public.expenses),'[]'),
 'payroll',coalesce((select jsonb_agg(data) from public.employee_salaries),'[]'),
 'salaryPayments',coalesce((select jsonb_agg(data||jsonb_build_object('id',id)) from public.salary_payments),'[]'),
 'advances',coalesce((select jsonb_agg(data) from public.employee_advances),'[]'),
 'settlements',coalesce((select jsonb_agg(data||jsonb_build_object('id',id)) from public.advance_settlements),'[]'),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'at',at,'user',actor_name,'action',action,'entity',entity,'before',before_value,'after',after_value) order by at) from public.audit_logs),'[]'))
$$;
revoke all on function public.app_money(text,boolean),public.app_day(text),public.app_command(text,jsonb,uuid),public.app_snapshot() from public,anon;
grant execute on function public.app_command(text,jsonb,uuid),public.app_snapshot() to authenticated;
commit;
