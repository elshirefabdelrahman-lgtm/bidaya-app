-- Apply after 001-005. No table data is deleted or updated.
-- PostgreSQL cannot rename existing input parameters with CREATE OR REPLACE.
-- Replace only this function, without CASCADE; dependencies cause a safe rollback.
begin;

drop function if exists public.auth_take_slot(text, integer) restrict;

create function public.auth_take_slot(p_bucket text, p_max_hits integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_now timestamptz := now();
begin
  if p_bucket is null or length(trim(p_bucket)) = 0 then
    raise exception 'Invalid bucket';
  end if;
  if p_max_hits is null or p_max_hits < 1 or p_max_hits >= 2147483647 then
    raise exception 'Invalid rate limit';
  end if;

  -- Atomic upsert: concurrent attempts lock the same bucket row.
  -- Rejected attempts count without extending the fifteen-minute window.
  insert into public.auth_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_now, 1)
  on conflict on constraint auth_rate_limits_pkey do update
  set hits = case
        when r.window_start <= v_now - interval '15 minutes' then 1
        else least(r.hits::bigint + 1, 2147483647)::integer
      end,
      window_start = case
        when r.window_start <= v_now - interval '15 minutes' then v_now
        else r.window_start
      end
  returning r.hits into v_hits;

  return v_hits <= p_max_hits;
end;
$$;

revoke all on function public.auth_take_slot(text, integer)
  from public, anon, authenticated;
grant execute on function public.auth_take_slot(text, integer) to service_role;

-- Refresh PostgREST's named RPC argument metadata after commit.
notify pgrst, 'reload schema';

commit;
