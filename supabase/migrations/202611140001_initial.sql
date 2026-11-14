create extension if not exists pgcrypto;
create table public.couples (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 partner1_name text not null check(length(partner1_name) between 1 and 80), partner2_name text not null check(length(partner2_name) between 1 and 80),
 wedding_date date not null, slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 64),
 photo_url text, message text not null default '' check(length(message)<=1500), published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.goals (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
 title text not null check(length(title) between 1 and 100), target_amount_paise bigint not null check(target_amount_paise>0 and target_amount_paise<=100000000000),
 icon text not null default 'heart' check(icon in ('heart','plane','home')), cover_url text,
 note text not null default '' check(length(note)<=400), is_active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,couple_id)
);
create table public.contributions (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id), goal_id uuid,
 guest_name text not null check(length(guest_name) between 1 and 100), amount_paise bigint not null check(amount_paise>0), currency text not null default 'INR' check(currency='INR'),
 blessing_message text not null default '' check(length(blessing_message)<=1000), envelope_design text not null check(envelope_design in ('red','floral','gold')),
 payment_status text not null default 'pending' check(payment_status in ('pending','succeeded','failed','cancelled')),
 payment_mode text not null check(payment_mode in ('mock','razorpay_test')), receipt_token_hash text not null unique,
 request_key uuid not null unique, request_hash text not null, thanked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(goal_id,couple_id) references public.goals(id,couple_id)
);
create table public.payment_attempts (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null references public.contributions(id),
 provider text not null check(provider in ('mock','razorpay_test')), provider_order_id text unique, provider_payment_id text unique,
 amount_paise bigint not null check(amount_paise>0), currency text not null check(currency='INR'),
 status text not null default 'pending' check(status in ('pending','succeeded','failed','cancelled')),
 idempotency_key uuid not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.webhook_events (
 id uuid primary key default gen_random_uuid(), provider_event_id text not null unique, event_type text not null,
 processing_status text not null check(processing_status in ('processed','ignored')), received_at timestamptz not null default now(), processed_at timestamptz
);
create table public.rate_limits (key text primary key, bucket timestamptz not null, hits integer not null);
create index goals_couple_idx on public.goals(couple_id);
create index contributions_couple_date_idx on public.contributions(couple_id,created_at desc);
create index attempts_contribution_idx on public.payment_attempts(contribution_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger couples_touch before update on public.couples for each row execute function public.touch_updated_at();
create trigger goals_touch before update on public.goals for each row execute function public.touch_updated_at();
create trigger contributions_touch before update on public.contributions for each row execute function public.touch_updated_at();
create trigger attempts_touch before update on public.payment_attempts for each row execute function public.touch_updated_at();
alter table public.couples enable row level security;
alter table public.goals enable row level security;
alter table public.contributions enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.couples,public.goals,public.contributions,public.payment_attempts,public.webhook_events,public.rate_limits from anon,authenticated;
grant all on public.couples,public.goals,public.contributions,public.payment_attempts,public.webhook_events,public.rate_limits to service_role;
grant select on public.couples,public.goals,public.contributions,public.payment_attempts to authenticated;
create policy owner_couples on public.couples for select to authenticated using(user_id=(select auth.uid()));
create policy owner_goals on public.goals for select to authenticated using(exists(select 1 from public.couples c where c.id=couple_id and c.user_id=(select auth.uid())));
create policy owner_contributions on public.contributions for select to authenticated using(exists(select 1 from public.couples c where c.id=couple_id and c.user_id=(select auth.uid())));
create policy owner_attempts on public.payment_attempts for select to authenticated using(exists(select 1 from public.contributions x join public.couples c on c.id=x.couple_id where x.id=contribution_id and c.user_id=(select auth.uid())));

-- Atomic owner editor: archived goals remain to preserve gift history. No financial write grants.
create function public.save_wedding(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; g jsonb; gid uuid; active_ids uuid[] := '{}'; photo text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_array_length(p->'goals')>3 then raise exception 'At most three dreams'; end if;
 photo := nullif(p->>'photo_url','');
 if photo is not null and photo not like '%/storage/v1/object/public/wedding-photos/'||auth.uid()::text||'/%' then raise exception 'Invalid photo ownership'; end if;
 insert into public.couples(user_id,partner1_name,partner2_name,wedding_date,slug,photo_url,message,published_at)
 values(auth.uid(),p->>'partner1_name',p->>'partner2_name',(p->>'wedding_date')::date,p->>'slug',photo,p->>'message',case when (p->>'publish')::boolean then now() else null end)
 on conflict(user_id) do update set partner1_name=excluded.partner1_name,partner2_name=excluded.partner2_name,wedding_date=excluded.wedding_date,slug=excluded.slug,photo_url=excluded.photo_url,message=excluded.message,published_at=excluded.published_at
 returning id into cid;
 for g in select value from jsonb_array_elements(p->'goals') loop
  gid := coalesce(nullif(g->>'id','')::uuid,gen_random_uuid());
  if exists(select 1 from public.goals where id=gid and couple_id<>cid) then raise exception 'Invalid goal'; end if;
  insert into public.goals(id,couple_id,title,target_amount_paise,icon,note,is_active,sort_order)
  values(gid,cid,g->>'title',(g->>'target_amount_paise')::bigint,g->>'icon',g->>'note',true,cardinality(active_ids))
  on conflict(id) do update set title=excluded.title,target_amount_paise=excluded.target_amount_paise,icon=excluded.icon,note=excluded.note,is_active=true,sort_order=excluded.sort_order where public.goals.couple_id=cid;
  if not found then raise exception 'Invalid goal ownership'; end if;
  active_ids := array_append(active_ids,gid);
 end loop;
 update public.goals set is_active=false where couple_id=cid and not(id=any(active_ids));
 return cid;
end $$;
revoke all on function public.save_wedding(jsonb) from public,anon;
grant execute on function public.save_wedding(jsonb) to authenticated;
create function public.mark_thanked(cid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.contributions set thanked_at=now() where id=cid and payment_status='succeeded' and couple_id in (select id from public.couples where user_id=auth.uid());
 if not found then raise exception 'Gift unavailable'; end if;
end $$;
revoke all on function public.mark_thanked(uuid) from public,anon;
grant execute on function public.mark_thanked(uuid) to authenticated;

-- Shared PostgreSQL limiter. Locking and counters survive instances/restarts.
create function public.take_rate_limit(k text, maximum integer, seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.rate_limits as r values(k,now(),1) on conflict(key) do update set
 hits=case when r.bucket<now()-make_interval(secs=>seconds) then 1 else r.hits+1 end,
 bucket=case when r.bucket<now()-make_interval(secs=>seconds) then now() else r.bucket end returning hits into n;
 return n<=maximum;
end $$;

-- Persist intent and initial attempt together. Only the trusted server can call this.
create function public.create_gift(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.couples; gift public.contributions; attempt public.payment_attempts;
begin
 select * into c from public.couples where slug=p->>'slug' and published_at is not null for share;
 if not found then raise exception 'Wedding unavailable'; end if;
 if nullif(p->>'goal_id','') is not null and not exists(select 1 from public.goals where id=(p->>'goal_id')::uuid and couple_id=c.id and is_active) then raise exception 'Dream unavailable'; end if;
 insert into public.contributions(couple_id,goal_id,guest_name,amount_paise,blessing_message,envelope_design,payment_mode,receipt_token_hash,request_key,request_hash)
 values(c.id,nullif(p->>'goal_id','')::uuid,p->>'guest_name',(p->>'amount_paise')::bigint,p->>'blessing_message',p->>'envelope_design',p->>'mode',p->>'token_hash',(p->>'request_key')::uuid,p->>'request_hash')
 on conflict(request_key) do nothing returning * into gift;
 if gift.id is null then
  select * into gift from public.contributions where request_key=(p->>'request_key')::uuid;
  if gift.request_hash<>p->>'request_hash' or gift.receipt_token_hash<>p->>'token_hash' then raise exception 'Idempotency conflict'; end if;
 end if;
 select * into gift from public.contributions where id=gift.id for update;
 select * into attempt from public.payment_attempts where contribution_id=gift.id order by created_at desc limit 1;
 if attempt.id is null or (attempt.status in ('failed','cancelled') and gift.payment_status<>'succeeded' and attempt.idempotency_key<>(p->>'attempt_key')::uuid) then
  insert into public.payment_attempts(contribution_id,provider,amount_paise,currency,idempotency_key)
  values(gift.id,gift.payment_mode,gift.amount_paise,'INR',(p->>'attempt_key')::uuid) returning * into attempt;
  update public.contributions set payment_status='pending' where id=gift.id;
  gift.payment_status := 'pending';
 end if;
 return jsonb_build_object('contribution_id',gift.id,'attempt_id',attempt.id,'order_id',attempt.provider_order_id,'status',gift.payment_status,'amount_paise',gift.amount_paise);
end $$;

-- All transitions serialize on contribution; success is terminal. Event insert and transition commit together.
create function public.apply_payment(aid uuid, new_status text, payment_id text default null, event_id text default null, event_type text default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts; gift public.contributions;
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
 if a.status='succeeded' then
  if new_status='succeeded' and payment_id is not null and a.provider_payment_id is distinct from payment_id then raise exception 'Payment mismatch'; end if;
  return;
 end if;
 update public.payment_attempts set status=new_status,provider_payment_id=coalesce(payment_id,provider_payment_id) where id=aid;
 if gift.payment_status<>'succeeded' then
  update public.contributions set payment_status=case
   when exists(select 1 from public.payment_attempts where contribution_id=gift.id and status='succeeded') then 'succeeded'
   else (select status from public.payment_attempts where contribution_id=gift.id order by created_at desc,id desc limit 1)
  end where id=gift.id;
 end if;
end $$;
revoke all on function public.take_rate_limit(text,integer,integer),public.create_gift(jsonb),public.apply_payment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.take_rate_limit(text,integer,integer),public.create_gift(jsonb),public.apply_payment(uuid,text,text,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('wedding-photos','wedding-photos',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy wedding_photo_insert on storage.objects for insert to authenticated with check(bucket_id='wedding-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wedding_photo_delete on storage.objects for delete to authenticated using(bucket_id='wedding-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wedding_photo_read on storage.objects for select to public using(bucket_id='wedding-photos');
