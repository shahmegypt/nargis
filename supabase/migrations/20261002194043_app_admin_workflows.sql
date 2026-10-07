alter table public.businesses add column if not exists moderation_note text;
alter table public.businesses add column if not exists moderated_by uuid references public.profiles(id);
alter table public.businesses add column if not exists moderated_at timestamptz;
alter table public.advertisements add column if not exists moderation_note text;
alter table public.advertisements add column if not exists moderation_reason text;
alter table public.advertisements add column if not exists moderated_by uuid references public.profiles(id);

create table public.homepage_settings (
  singleton boolean primary key default true check (singleton),
  automatic_featured boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.homepage_settings(singleton) values(true) on conflict(singleton) do nothing;
alter table public.homepage_settings enable row level security;
create policy "public reads homepage settings" on public.homepage_settings for select to anon,authenticated using (singleton);
create policy "homepage managers update homepage settings" on public.homepage_settings for update to authenticated
using (public.has_permission('homepage.manage')) with check (public.has_permission('homepage.manage'));
grant select on public.homepage_settings to anon,authenticated;
grant update on public.homepage_settings to authenticated;

create table public.private_messages (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index private_messages_thread_idx on public.private_messages(resident_id,created_at);
alter table public.private_messages enable row level security;
create policy "resident and authorized admins read private messages" on public.private_messages for select to authenticated
using (resident_id=(select auth.uid()) or public.has_permission('reviews.read_private') or public.has_permission('accounts.manage'));
create policy "resident starts private message thread" on public.private_messages for insert to authenticated
with check (public.is_active_account() and resident_id=(select auth.uid()) and author_id=(select auth.uid()));
create policy "authorized admins reply privately" on public.private_messages for insert to authenticated
with check (author_id=(select auth.uid()) and (public.has_permission('reviews.read_private') or public.has_permission('accounts.manage')));
create policy "authorized admins update message read state" on public.private_messages for update to authenticated
using (public.has_permission('reviews.read_private') or public.has_permission('accounts.manage'))
with check (public.has_permission('reviews.read_private') or public.has_permission('accounts.manage'));
grant select,insert,update on public.private_messages to authenticated;

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  target_url text not null default '/',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index user_notifications_recent_idx on public.user_notifications(user_id,created_at desc);
alter table public.user_notifications enable row level security;
create policy "users read their notifications" on public.user_notifications for select to authenticated using (user_id=(select auth.uid()));
create policy "users mark their notifications read" on public.user_notifications for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "admins send in app notifications" on public.user_notifications for insert to authenticated
with check (public.has_permission('settings.manage'));
grant select,update on public.user_notifications to authenticated;
grant insert on public.user_notifications to authenticated;

create or replace function public.get_my_access_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p.id is null then '{}'::jsonb else jsonb_build_object(
    'user_id',p.id,'display_name',p.display_name,'account_status',p.account_status,
    'roles',coalesce((select jsonb_agg(distinct r.role_key) from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p.id),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(distinct pm.permission_key) from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id join public.permissions pm on pm.id=rp.permission_id where ur.user_id=p.id),'[]'::jsonb),
    'accepted_policies',coalesce((select jsonb_agg(jsonb_build_object('key',pa.policy_key,'version',pa.version)) from public.policy_acceptances pa where pa.user_id=p.id),'[]'::jsonb)
  ) end
  from public.profiles p where p.id=(select auth.uid());
$$;
revoke all on function public.get_my_access_context() from public,anon;
grant execute on function public.get_my_access_context() to authenticated;

create or replace function public.admin_set_business_review(
  _business_id uuid, _status public.listing_status, _moderation_note text default null,
  _verify_location boolean default false, _featured boolean default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.has_permission('listings.review') or public.has_permission('homepage.manage')) then raise exception 'not authorized'; end if;
  update public.businesses set
    status=_status,
    moderation_note=_moderation_note,
    moderated_by=(select auth.uid()),
    moderated_at=now(),
    approved_at=case when _status='approved' then coalesce(approved_at,now()) else approved_at end,
    location_verified_by=case when _verify_location then (select auth.uid()) else location_verified_by end,
    is_featured=coalesce(_featured,is_featured),
    featured_by=case when _featured is not null then (select auth.uid()) else featured_by end
  where id=_business_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'business_reviewed','business',_business_id::text,
    jsonb_build_object('status',_status,'location_verified',_verify_location,'featured',_featured,'note',_moderation_note));
end;
$$;
revoke all on function public.admin_set_business_review(uuid,public.listing_status,text,boolean,boolean) from public,anon;
grant execute on function public.admin_set_business_review(uuid,public.listing_status,text,boolean,boolean) to authenticated;

create or replace function public.admin_set_ad_review(_ad_id uuid,_status public.ad_status,_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('ads.review') then raise exception 'not authorized'; end if;
  update public.advertisements set status=_status,moderated_by=(select auth.uid()),reviewed_by=(select auth.uid()),reviewed_at=now(),moderation_reason=_reason where id=_ad_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'advertisement_reviewed','advertisement',_ad_id::text,jsonb_build_object('status',_status,'reason',_reason));
end;
$$;
revoke all on function public.admin_set_ad_review(uuid,public.ad_status,text) from public,anon;
grant execute on function public.admin_set_ad_review(uuid,public.ad_status,text) to authenticated;
