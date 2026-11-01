-- Read-only totals from the original case_payments ledger; no duplicate collection table.
-- SECURITY INVOKER preserves the caller's branch and case/payment RLS policies.
begin;
create view public.case_financials with (security_invoker = true) as
select c.id as case_id, c.branch, c.data->>'name' as case_name,
 c.fee as agreed_amount,
 coalesce(sum(p.amount) filter (where not coalesce((p.data->>'voided')::boolean,false)),0) as paid_amount,
 c.fee-coalesce(sum(p.amount) filter (where not coalesce((p.data->>'voided')::boolean,false)),0) as remaining_amount,
 case
  when c.fee=coalesce(sum(p.amount) filter (where not coalesce((p.data->>'voided')::boolean,false)),0) then 'مكتمل'
  when coalesce(sum(p.amount) filter (where not coalesce((p.data->>'voided')::boolean,false)),0)=0 then 'لم يدفع'
  else 'دفع جزءًا'
 end as payment_status
from public.cases c left join public.case_payments p on p.case_id=c.id
group by c.id,c.branch,c.data,c.fee;
revoke all on public.case_financials from public,anon,authenticated;
grant select on public.case_financials to authenticated;
commit;
