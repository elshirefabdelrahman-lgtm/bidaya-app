-- Bidaya preparation only. Apply to a fresh Supabase project after review.
begin;
create sequence public.case_number_seq;
create table public.branches (id text primary key check(length(trim(id)) between 1 and 120));
create table public.profiles (
 id uuid primary key references auth.users(id), name text not null check(length(trim(name))>0),
 username text not null unique check(username ~ '^[a-zA-Z0-9_.-]{3,40}$'), email text not null unique,
 role text not null check(role in ('Super Admin','Admin','Accountant','Employee')), active boolean not null default true,
 permissions text[] not null default '{}', branches text[] not null default '{}',
 check(permissions <@ array['cases','finance','employees','payroll','reports','users','audit','settings']::text[])
);
create unique index profiles_username_lower on public.profiles(lower(username));
create unique index profiles_email_lower on public.profiles(lower(email));
-- JSON retains the UI record contract; generated typed columns enforce relationships and amounts.
create table public.cases (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 fee numeric(14,2) generated always as ((data->>'fee')::numeric) stored not null check(fee>=0),
 check(coalesce(length(trim(data->>'name')),0)>0),check(coalesce(data->>'status','') in ('نشطة','خرجت','مغلقة'))
);
create table public.employees (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 salary numeric(14,2) generated always as ((data->>'salary')::numeric) stored not null check(salary>=0),
 check(coalesce(length(trim(data->>'name')),0)>0), check(coalesce(length(trim(data->>'role')),0)>0)
);
create table public.case_payments (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 case_id text generated always as (data->>'caseId') stored not null references public.cases(id),
 amount numeric(14,2) generated always as ((data->>'amount')::numeric) stored not null check(amount>0),
 receipt text generated always as (data->>'receipt') stored not null unique check(length(trim(receipt))>0)
);
create table public.expenses (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 amount numeric(14,2) generated always as ((data->>'amount')::numeric) stored not null check(amount>0),
 check(coalesce(length(trim(data->>'description')),0)>0),check(coalesce(length(trim(data->>'category')),0)>0)
);
create table public.employee_salaries (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 employee_id text generated always as (data->>'employeeId') stored not null references public.employees(id),
 month text generated always as (data->>'month') stored not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 net numeric(14,2) generated always as ((data->>'base')::numeric+(data->>'additions')::numeric-(data->>'deduction')::numeric-(data->>'advance')::numeric) stored not null check(net>=0),
 unique(employee_id,month)
);
create table public.salary_payments (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 salary_id text generated always as (data->>'salaryId') stored not null references public.employee_salaries(id),
 employee_id text generated always as (data->>'employeeId') stored not null references public.employees(id),
 amount numeric(14,2) generated always as ((data->>'amount')::numeric) stored not null check(amount>0)
);
create table public.employee_advances (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 employee_id text generated always as (data->>'employeeId') stored not null references public.employees(id),
 amount numeric(14,2) generated always as ((data->>'amount')::numeric) stored not null check(amount>0)
);
create table public.advance_settlements (
 id text primary key, branch text not null references public.branches(id), data jsonb not null,
 employee_id text generated always as (data->>'employeeId') stored not null references public.employees(id),
 salary_id text generated always as (data->>'salaryId') stored references public.employee_salaries(id),
 amount numeric(14,2) generated always as ((data->>'amount')::numeric) stored not null check(amount>0),
 check(data->>'kind' in ('salary','cash')),
 check((data->>'kind'='salary')=(salary_id is not null))
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), at timestamptz not null default now(),
 actor_id uuid references auth.users(id), actor_name text, action text not null, entity text not null,
 branch text references public.branches(id), before_value jsonb, after_value jsonb
);
create table public.operation_requests (
 actor_id uuid not null references auth.users(id), request_id uuid not null, kind text not null,input jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
create index audit_logs_branch_at on public.audit_logs(branch,at);
create index case_payments_case_id on public.case_payments(case_id);
create index employee_salaries_employee_id on public.employee_salaries(employee_id);
create index salary_payments_salary_id on public.salary_payments(salary_id);
create index salary_payments_employee_id on public.salary_payments(employee_id);
create index employee_advances_employee_id on public.employee_advances(employee_id);
create index advance_settlements_employee_id on public.advance_settlements(employee_id);
create index advance_settlements_salary_id on public.advance_settlements(salary_id);
commit;
