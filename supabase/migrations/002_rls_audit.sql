begin;
create function public.app_allowed(area text, b text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and
 (p.role='Super Admin' or (area=any(p.permissions) and (b is null or b=any(p.branches)))))
$$;
create function public.app_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); b text; oldv jsonb; newv jsonb;
begin
 if tg_op='DELETE' then raise exception 'Permanent deletion is forbidden'; end if;
 if tg_op='UPDATE' then oldv:=to_jsonb(old); end if;
 newv:=to_jsonb(new); b:=newv->>'branch';
 insert into public.audit_logs(actor_id,actor_name,action,entity,branch,before_value,after_value)
 values(uid,(select name from public.profiles where id=uid),tg_op,tg_table_name,b,oldv,newv);
 return new;
end $$;
do $$ declare t text; a text; begin
 foreach t in array array['cases','case_payments','expenses','employees','employee_salaries','salary_payments','employee_advances','advance_settlements'] loop
  a:=case when t='cases' then 'cases' when t in ('case_payments','expenses') then 'finance' when t='employees' then 'employees' else 'payroll' end;
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy read_allowed on public.%I for select to authenticated using (public.app_allowed(%L,branch) or public.app_allowed(''reports'',branch)%s)',t,a,
   case when t='cases' then ' or public.app_allowed(''finance'',branch)' when t='employees' then ' or public.app_allowed(''payroll'',branch)' when t='case_payments' then ' or public.app_allowed(''cases'',branch)' else '' end);
  execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.app_audit()',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create index on public.%I(branch)',t);
 end loop;
end $$;
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.audit_logs enable row level security;
alter table public.operation_requests enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (public.app_allowed('users') and exists(select 1 where public.app_allowed('users')) or id=auth.uid());
-- Only Super Admin may inspect full account/permission records. Replace general policy.
drop policy profiles_read on public.profiles;
create function public.app_super() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active and role='Super Admin')$$;
create policy profiles_read on public.profiles for select to authenticated using(public.app_super() or (id=auth.uid() and active));
create policy branches_read on public.branches for select to authenticated using(public.app_super() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and branches.id=any(p.branches)));
create policy audit_read on public.audit_logs for select to authenticated using(public.app_super() or (branch is not null and public.app_allowed('audit',branch)));
revoke all on public.profiles,public.branches,public.audit_logs,public.operation_requests from anon,authenticated;
grant select on public.profiles,public.branches,public.audit_logs to authenticated;
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.app_audit();
create trigger audit_branches after insert or update or delete on public.branches for each row execute function public.app_audit();
create function public.audit_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Audit log is append-only';end $$;
create trigger immutable before update or delete on public.audit_logs for each row execute function public.audit_immutable();
revoke all on function public.app_allowed(text,text),public.app_super(),public.app_audit(),public.audit_immutable() from public,anon;
grant execute on function public.app_allowed(text,text),public.app_super() to authenticated;
commit;
