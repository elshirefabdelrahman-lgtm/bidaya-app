begin;
create table public.auth_rate_limits(bucket text primary key, window_start timestamptz not null,hits integer not null);
alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon,authenticated;
create function public.auth_take_slot(p_bucket text, p_max_hits integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 v_hits integer;
 v_now timestamptz := now();
begin
 if p_bucket is null or length(trim(p_bucket))=0 then
  raise exception 'Invalid bucket';
 end if;
 if p_max_hits is null or p_max_hits<1 or p_max_hits>=2147483647 then
  raise exception 'Invalid rate limit';
 end if;
 -- One atomic upsert locks the conflicting row; no separate read/increment race.
 -- Rejected attempts count too, but never extend the fixed fifteen-minute window.
 insert into public.auth_rate_limits as r (bucket,window_start,hits)
 values(p_bucket,v_now,1)
 on conflict on constraint auth_rate_limits_pkey do update
 set hits=case when r.window_start<=v_now-interval '15 minutes' then 1
          else least(r.hits::bigint+1,2147483647)::integer end,
     window_start=case when r.window_start<=v_now-interval '15 minutes'
                  then v_now else r.window_start end
 returning r.hits into v_hits;
 return v_hits<=p_max_hits;
end $$;
create function public.admin_save_profile(actor uuid,profile jsonb) returns void language plpgsql security definer set search_path='' as $$
declare b text;begin
 if not exists(select 1 from public.profiles where id=actor and active and role='Super Admin') then raise exception 'Access denied';end if;
 if actor=(profile->>'id')::uuid then raise exception 'Cannot edit own account';end if;
 for b in select jsonb_array_elements_text(profile->'branches') loop
  if not exists(select 1 from public.branches where id=b) then raise exception 'Unknown branch';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.profiles(id,name,username,email,role,active,permissions,branches)
 values((profile->>'id')::uuid,trim(profile->>'name'),profile->>'username',profile->>'email',profile->>'role',(profile->>'active')::boolean,
 array(select jsonb_array_elements_text(profile->'permissions')),array(select jsonb_array_elements_text(profile->'branches')))
 on conflict(id) do update set name=excluded.name,username=excluded.username,email=excluded.email,role=excluded.role,active=excluded.active,permissions=excluded.permissions,branches=excluded.branches;
end $$;
revoke all on function public.auth_take_slot(text,integer),public.admin_save_profile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.auth_take_slot(text,integer),public.admin_save_profile(uuid,jsonb) to service_role;
commit;
