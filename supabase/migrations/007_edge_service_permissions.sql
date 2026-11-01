-- Edge clients use service_role. BYPASSRLS does not replace table privileges.
-- Reversible privilege-only fix; no table data or existing migrations are changed.
begin;

grant usage on schema public to service_role;
grant select on table public.profiles to service_role;
-- admin-users records password-reset requests directly; no UPDATE/DELETE grant.
grant insert on table public.audit_logs to service_role;

notify pgrst, 'reload schema';
commit;
