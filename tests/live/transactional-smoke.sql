-- Optional live database smoke test. Execute only with an authorized database
-- administrator. Never commits fixtures; no existing patient records are read.
-- This tests deployed SQL/RLS, not HTTP sessions or cross-device persistence.
begin;
set local statement_timeout = '30s';
select set_config('request.jwt.claim.sub', 'cc77c8ad-f84d-46fe-854c-e24da20b9a85', true);
insert into public.branches(id) values ('__BIDAYA_TRANSACTION_TEST__');
insert into public.cases(id,branch,data) values (
 '__BIDAYA_TRANSACTION_CASE__','__BIDAYA_TRANSACTION_TEST__',
 '{"id":"__BIDAYA_TRANSACTION_CASE__","name":"اختبار تقني غير حقيقي","branch":"__BIDAYA_TRANSACTION_TEST__","fee":30000,"admission":"2026-11-01","status":"نشطة","phone":""}'
);
set local role authenticated;
do $$
declare c text := '__BIDAYA_TRANSACTION_CASE__';
 b text := '__BIDAYA_TRANSACTION_TEST__';
 req uuid := gen_random_uuid();
 payload jsonb; e text; n numeric;
begin
 if not public.app_super() then raise exception 'TEST_ADMIN_REQUIRED'; end if;
 perform public.app_command('caseEdit',jsonb_build_object('id',c,'name','اختبار تعديل غير حقيقي','branch',b,'fee',30000,'admission','2026-11-01','status','نشطة','phone',''),gen_random_uuid());
 payload:=jsonb_build_object('caseId',c,'amount',10000,'date','2026-11-01','receipt',gen_random_uuid()::text,'method','نقدي');
 perform public.app_command('collection',payload,req);
 perform public.app_command('collection',payload,req);
 select remaining_amount into n from public.case_financials where case_id=c;
 if n is distinct from 20000 then raise exception 'TEST_FIRST_BALANCE'; end if;
 perform public.app_command('collection',jsonb_build_object('caseId',c,'amount',5000,'date','2026-11-01','receipt',gen_random_uuid()::text),gen_random_uuid());
 select remaining_amount into n from public.case_financials where case_id=c;
 if n is distinct from 15000 then raise exception 'TEST_SECOND_BALANCE'; end if;
 select sum(amount) into n from public.case_payments where case_id=c;
 if n is distinct from 15000 then raise exception 'TEST_COLLECTION_SUM'; end if;
 begin
  perform public.app_command('collection',jsonb_build_object('caseId',c,'amount',15001,'date','2026-11-01','receipt',gen_random_uuid()::text),gen_random_uuid());
  raise exception 'TEST_OVERPAYMENT_ACCEPTED';
 exception when others then
  if sqlerrm not like '%Overpayment%' then raise; end if;
 end;
 perform public.app_command('expense',jsonb_build_object('branch',b,'amount',300,'date','2026-11-01','category','اختبار','description','اختبار تقني غير حقيقي'),gen_random_uuid());
 perform public.app_command('employee',jsonb_build_object('branch',b,'name','موظف اختبار غير حقيقي','role','اختبار','salary',6000,'hired','2026-11-01'),gen_random_uuid());
 select id into strict e from public.employees where branch=b;
 perform public.app_command('advance',jsonb_build_object('employeeId',e,'amount',1000,'date','2026-11-01'),gen_random_uuid());
 perform public.app_command('salary',jsonb_build_object('employeeId',e,'month','2026-11','additions',0,'deduction',0,'advance',1000,'paid',5000,'date','2026-11-01'),gen_random_uuid());
 select sum(amount) into n from public.salary_payments where branch=b;
 if n is distinct from 5000 then raise exception 'TEST_SALARY_PAYMENT'; end if;
 select sum(amount) into n from public.advance_settlements where branch=b;
 if n is distinct from 1000 then raise exception 'TEST_ADVANCE_SETTLEMENT'; end if;
 if not exists(select 1 from public.audit_logs where branch=b and entity='case_payments') then raise exception 'TEST_AUDIT_MISSING'; end if;
 begin
  update public.profiles set role='Super Admin' where id=auth.uid();
  raise exception 'TEST_PROFILE_ESCALATION_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
