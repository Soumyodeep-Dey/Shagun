-- Aggregate inside PostgreSQL so totals never depend on a REST row limit or UI page.
create function public.dashboard_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'pending_count',(select count(*) from public.contributions where payment_status='pending'),
  'rows',coalesce((select jsonb_agg(to_jsonb(t)) from (
    select goal_id,payment_mode,sum(amount_paise)::bigint as amount_paise
    from public.contributions where payment_status='succeeded' group by goal_id,payment_mode
  ) t),'[]'::jsonb)
 )
$$;
revoke all on function public.dashboard_summary() from public,anon;
grant execute on function public.dashboard_summary() to authenticated;
