alter table public.couples add column demo_seed_id text;
-- Only Auth app_metadata (operator controlled), explicit owner, and marked existing rows qualify.
create function public.seed_demo(owner_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; existing public.couples; marker jsonb;
begin
 perform pg_advisory_xact_lock(717204315);
 select raw_app_meta_data into marker from auth.users where id=owner_id for update;
 if not found or marker->>'shagun_demo' is distinct from 'true' then raise exception 'Explicit demo Auth identity required'; end if;
 select * into existing from public.couples where user_id=owner_id for update;
 if found and (existing.demo_seed_id is distinct from 'aisha-rahul:v1' or existing.slug<>'aisha-rahul') then raise exception 'Existing non-demo wedding protected'; end if;
 if exists(select 1 from public.couples where slug='aisha-rahul' and user_id<>owner_id) then raise exception 'Demo slug belongs to another owner'; end if;
 if exists(select 1 from public.goals where id in ('e4b58d9d-433d-49eb-aa43-89fd20162701'::uuid,'e4b58d9d-433d-49eb-aa43-89fd20162702'::uuid) and couple_id is distinct from existing.id) then raise exception 'Demo goal identity conflict'; end if;
 insert into public.couples(user_id,partner1_name,partner2_name,wedding_date,slug,message,published_at,demo_seed_id)
 values(owner_id,'Aisha','Rahul',(now() at time zone 'Asia/Kolkata')::date+30,'aisha-rahul','Your presence is our greatest gift. If you’d like to give Shagun, you can leave a blessing and contribute towards our new beginning.',now(),'aisha-rahul:v1')
 on conflict(user_id) do update set partner1_name=excluded.partner1_name,partner2_name=excluded.partner2_name,wedding_date=excluded.wedding_date,message=excluded.message,published_at=excluded.published_at returning id into cid;
 insert into public.goals(id,couple_id,title,target_amount_paise,icon,note,sort_order,is_active) values
 ('e4b58d9d-433d-49eb-aa43-89fd20162701',cid,'Honeymoon in Europe',30000000,'plane','A little adventure, a lifetime of memories.',0,true),
 ('e4b58d9d-433d-49eb-aa43-89fd20162702',cid,'First Home',100000000,'home','A place to make our own.',1,true)
 on conflict(id) do update set title=excluded.title,target_amount_paise=excluded.target_amount_paise,icon=excluded.icon,note=excluded.note,sort_order=excluded.sort_order,is_active=true;
 return cid;
end $$;
revoke all on function public.seed_demo(uuid) from public,anon,authenticated;
grant execute on function public.seed_demo(uuid) to service_role;

-- Restricted investigation records contain no raw payloads, guest content, signatures or tokens.
create table public.payment_discrepancies (
 id uuid primary key default gen_random_uuid(), fingerprint text not null unique check(length(fingerprint)=64),
 attempt_id uuid not null references public.payment_attempts(id), source text not null check(source in ('order','callback','webhook')),
 provider_payment_id text check(length(provider_payment_id)<=128), provider_order_id text check(length(provider_order_id)<=128),
 field text not null check(field in ('amount','currency','order_id','payment_id')),
 expected_value text not null check(length(expected_value)<=128), observed_value text not null check(length(observed_value)<=128), created_at timestamptz not null default now()
);
create index discrepancies_attempt_idx on public.payment_discrepancies(attempt_id);
create table public.payment_captures (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null references public.contributions(id), attempt_id uuid not null references public.payment_attempts(id),
 provider text not null check(provider in ('mock','razorpay_test')), provider_order_id text, provider_payment_id text not null,
 amount_paise bigint not null check(amount_paise>0), currency text not null check(currency='INR'), is_intended boolean not null,
 captured_at timestamptz not null default now(), unique(provider,provider_payment_id)
);
create unique index one_intended_capture on public.payment_captures(contribution_id) where is_intended;
create index captures_contribution_idx on public.payment_captures(contribution_id);
create table public.duplicate_capture_incidents (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null references public.contributions(id),
 intended_capture_id uuid not null references public.payment_captures(id), extra_capture_id uuid not null unique references public.payment_captures(id),
 created_at timestamptz not null default now(), check(intended_capture_id<>extra_capture_id)
);
alter table public.payment_discrepancies enable row level security;
alter table public.payment_captures enable row level security;
alter table public.duplicate_capture_incidents enable row level security;
revoke all on public.payment_discrepancies,public.payment_captures,public.duplicate_capture_incidents from public,anon,authenticated;
grant all on public.payment_discrepancies,public.payment_captures,public.duplicate_capture_incidents to service_role;
-- Backfill existing verified attempts without discarding extra captures.
insert into public.payment_captures(contribution_id,attempt_id,provider,provider_order_id,provider_payment_id,amount_paise,currency,is_intended)
select contribution_id,id,provider,provider_order_id,provider_payment_id,amount_paise,currency,row_number() over(partition by contribution_id order by created_at,id)=1
from public.payment_attempts where status='succeeded' and provider_payment_id is not null;
insert into public.duplicate_capture_incidents(contribution_id,intended_capture_id,extra_capture_id)
select extra.contribution_id,intended.id,extra.id from public.payment_captures extra join public.payment_captures intended on intended.contribution_id=extra.contribution_id and intended.is_intended where not extra.is_intended;
create view public.payment_reconciliation with (security_invoker=true) as
select contribution_id,provider,currency,sum(amount_paise) filter(where is_intended) as intended_amount_paise,
 coalesce(sum(amount_paise) filter(where not is_intended),0) as extra_amount_paise,count(*) filter(where not is_intended) as extra_capture_count
from public.payment_captures group by contribution_id,provider,currency;
revoke all on public.payment_reconciliation from public,anon,authenticated;
grant select on public.payment_reconciliation to service_role;

create or replace function public.apply_payment(aid uuid, new_status text, payment_id text default null, event_id text default null, event_type text default null)
returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts; gift public.contributions; cap public.payment_captures; intended uuid;
begin
 if new_status not in ('pending','succeeded','failed','cancelled') then raise exception 'Invalid payment state'; end if;
 select * into a from public.payment_attempts where id=aid;
 if not found then raise exception 'Attempt unavailable'; end if;
 select * into gift from public.contributions where id=a.contribution_id for update;
 select * into a from public.payment_attempts where id=aid for update;
 if event_id is not null then
  insert into public.webhook_events(provider_event_id,event_type,processing_status,processed_at) values(event_id,event_type,'processed',now()) on conflict do nothing;
  if not found then return; end if;
 end if;
 if new_status='succeeded' then
  if payment_id is null then raise exception 'Captured payment identity required'; end if;
  select id into intended from public.payment_captures where contribution_id=gift.id and is_intended;
  insert into public.payment_captures(contribution_id,attempt_id,provider,provider_order_id,provider_payment_id,amount_paise,currency,is_intended)
   values(gift.id,a.id,a.provider,a.provider_order_id,payment_id,a.amount_paise,a.currency,intended is null) on conflict(provider,provider_payment_id) do nothing;
  select * into cap from public.payment_captures where provider=a.provider and provider_payment_id=payment_id;
  if cap.attempt_id<>a.id or cap.contribution_id<>gift.id then raise exception 'Captured payment association mismatch'; end if;
  if not cap.is_intended then
   insert into public.duplicate_capture_incidents(contribution_id,intended_capture_id,extra_capture_id) values(gift.id,intended,cap.id) on conflict(extra_capture_id) do nothing;
  end if;
  update public.payment_attempts set status='succeeded',provider_payment_id=case when status='succeeded' then coalesce(provider_payment_id,payment_id) else payment_id end where id=aid;
 elsif a.status='succeeded' then return;
 else update public.payment_attempts set status=new_status,provider_payment_id=coalesce(payment_id,provider_payment_id) where id=aid;
 end if;
 if gift.payment_status<>'succeeded' then
  update public.contributions set payment_status=case when exists(select 1 from public.payment_captures where contribution_id=gift.id) then 'succeeded'
   else (select status from public.payment_attempts where contribution_id=gift.id order by created_at desc,id desc limit 1) end where id=gift.id;
 end if;
end $$;
revoke all on function public.apply_payment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_payment(uuid,text,text,text,text) to service_role;
