-- Nargis local discovery: private community features and moderated public listings.
-- Shops and freelance professionals are separate from maintenance reports.

create extension if not exists pgcrypto with schema extensions;

create type public.account_status as enum ('active', 'suspended', 'disabled', 'deleted');
create type public.listing_status as enum ('pending_review', 'approved', 'changes_requested', 'rejected', 'hidden');
create type public.ad_status as enum ('pending_review', 'approved', 'rejected', 'paused', 'ended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  label text not null,
  is_system boolean not null default false
);
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  label text not null
);
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (user_id, role_id)
);

insert into public.roles(role_key,label,is_system) values
  ('resident','ساكن',true),('business_owner','صاحب نشاط',true),('admin','مدير رئيسي',true),
  ('ad_supervisor','مشرف دعاية',true),('maintenance_supervisor','مشرف صيانة',true)
on conflict (role_key) do nothing;
insert into public.permissions(permission_key,label) values
  ('accounts.manage','إدارة الحسابات'),('listings.review','مراجعة الأنشطة'),('ads.review','مراجعة الإعلانات'),
  ('reviews.read_private','عرض التقييمات الخاصة'),('maintenance.manage','إدارة الصيانة'),
  ('analytics.read','عرض التحليلات'),('homepage.manage','إدارة الظهور في الرئيسية'),('roles.manage','إدارة الأدوار'),
  ('settings.manage','إدارة إعدادات المنصة') on conflict (permission_key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.role_key='admin' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.permission_key='ads.review'
where r.role_key='ad_supervisor' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.permission_key='maintenance.manage'
where r.role_key='maintenance_supervisor' on conflict do nothing;

create or replace function public.has_permission(_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions p on p.id=rp.permission_id
    join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=(select auth.uid()) and p.permission_key=_permission and pr.account_status='active'
  );
$$;
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;
create or replace function public.is_active_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active');
$$;
revoke all on function public.is_active_account() from public;
grant execute on function public.is_active_account() to authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null,
  district text check (district in ('النرجس 1','النرجس 2') or (listing_kind='freelancer' and district is null)),
  mall text check (mall is null or (district='النرجس 1' and mall='مول الحياة') or (district='النرجس 2' and mall='مول اللؤلؤة')),
  listing_kind text not null default 'business' check (listing_kind in ('business','freelancer')),
  description text not null default '',
  contact_phone text,
  whatsapp text,
  cover_image_url text,
  pin_lat double precision,
  pin_lng double precision,
  location_attested boolean not null default false,
  location_verified_by uuid references public.profiles(id),
  status public.listing_status not null default 'pending_review',
  account_status public.account_status not null default 'active',
  is_featured boolean not null default false,
  featured_by uuid references public.profiles(id),
  featured_until timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pin_lat is null or pin_lat between -90 and 90),
  check (pin_lng is null or pin_lng between -180 and 180),
  check (status <> 'approved' or (listing_kind='freelancer' and pin_lat is null and pin_lng is null) or (location_attested and pin_lat is not null and pin_lng is not null and location_verified_by is not null)),
  check (district is not null or mall is null)
);
create index businesses_public_directory_idx on public.businesses(status,account_status,is_featured desc,created_at desc);
create index businesses_owner_idx on public.businesses(owner_id,created_at desc);

create or replace function public.assign_business_owner_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_role uuid;
begin
  select id into owner_role from public.roles where role_key='business_owner';
  insert into public.user_roles(user_id,role_id) values (new.owner_id,owner_role) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.assign_business_owner_role() from public,anon,authenticated;
create trigger assign_business_owner_role_after_listing
after insert on public.businesses for each row execute function public.assign_business_owner_role();

create table public.business_ratings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,reviewer_id)
);
create table public.business_review_comments (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null unique references public.business_ratings(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  comment text not null check (length(trim(comment)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index business_review_comments_business_idx on public.business_review_comments(business_id,created_at desc);
create view public.business_rating_summaries with (security_invoker=false) as
  select r.business_id, round(avg(r.score)::numeric,1) as average_rating, count(*)::integer as rating_count
  from public.business_ratings r join public.businesses b on b.id=r.business_id
  where b.status='approved' and b.account_status='active' group by r.business_id;

create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null default '',
  category text not null default 'general',
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.ad_status not null default 'pending_review',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index advertisements_public_idx on public.advertisements(status,starts_at,ends_at);

create table public.maintenance_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.maintenance_settings(singleton,enabled) values (true,true) on conflict (singleton) do nothing;
create table public.maintenance_reports (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id),
  category text not null check (category in ('كهرباء وإنارة','سباكة خارجية','نظافة عامة','زراعة وري')),
  description text not null check (length(trim(description)) between 5 and 2000),
  building_number text not null,
  apartment_number text,
  status text not null default 'جديد' check (status in ('جديد','قيد المتابعة','بحاجة لمعلومات','تم الحل','مغلق')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maintenance_reports_private_idx on public.maintenance_reports(resident_id,created_at desc);

create table public.policy_versions (
  policy_key text not null,
  version text not null,
  title text not null,
  body text not null,
  required boolean not null default true,
  published_at timestamptz not null default now(),
  primary key(policy_key,version)
);
insert into public.policy_versions(policy_key,version,title,body) values
('terms','1.1','شروط استخدام التطبيق','استخدم التطبيق لاكتشاف الأنشطة المحلية أو إضافة نشاط صحيح داخل النرجس. يمنع نشر محتوى مضلل أو مخالف.'),
('privacy','1.1','سياسة الخصوصية واستخدام البيانات','نحمي بيانات السكن والحساب. لا تظهر ملفات السكان أو نشاطهم لبعضهم. التقييم النصي خاص بصاحب النشاط والإدارة، وهوية المقيّم للإدارة فقط. عند استخدام خدمة العملاء الذكية تُرسل الرسائل إلى مزود Grok لمعالجتها؛ لا يحتفظ تطبيق النرجس بسجل المحادثة.'),
('conduct','1.1','قواعد الاستخدام والتعامل','تُراجع الأنشطة والإعلانات قبل النشر. للإدارة صلاحية إدارة الحسابات وفق صلاحيات وسجل تدقيق واضح.')
on conflict do nothing;
create table public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_key text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique(user_id,policy_key,version),
  foreign key(policy_key,version) references public.policy_versions(policy_key,version)
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  unique(user_id,endpoint)
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_ratings enable row level security;
alter table public.business_review_comments enable row level security;
alter table public.advertisements enable row level security;
alter table public.maintenance_settings enable row level security;
alter table public.maintenance_reports enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles read own or account managers" on public.profiles for select to authenticated
using (id=(select auth.uid()) or public.has_permission('accounts.manage'));
create policy "profiles update own safe fields" on public.profiles for update to authenticated
using (id=(select auth.uid()) or public.has_permission('accounts.manage'))
with check (id=(select auth.uid()) or public.has_permission('accounts.manage'));
create policy "role tables administrators" on public.roles for all to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy "permission tables administrators" on public.permissions for all to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy "role permissions administrators" on public.role_permissions for all to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy "user roles self or administrators" on public.user_roles for select to authenticated using (user_id=(select auth.uid()) or public.has_permission('roles.manage'));
create policy "user roles administrators update" on public.user_roles for all to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));

create policy "approved businesses are public" on public.businesses for select to anon,authenticated
using (status='approved' and account_status='active' and owner_id is not null and exists(select 1 from public.profiles p where p.id=owner_id and p.account_status='active'));
create policy "owners read their businesses" on public.businesses for select to authenticated using (owner_id=(select auth.uid()));
create policy "authorized reviewers read businesses" on public.businesses for select to authenticated
using (public.has_permission('listings.review') or public.has_permission('homepage.manage'));
create policy "authenticated owners submit listings" on public.businesses for insert to authenticated
with check (public.is_active_account() and owner_id=(select auth.uid()) and status='pending_review' and account_status='active' and is_featured=false and location_verified_by is null);
create policy "owners edit own pending listings" on public.businesses for update to authenticated
using (public.is_active_account() and owner_id=(select auth.uid())) with check (public.is_active_account() and owner_id=(select auth.uid()) and status in ('pending_review','changes_requested') and account_status='active' and is_featured=false and location_verified_by is null);
create policy "owners delete own unreviewed listings" on public.businesses for delete to authenticated
using (public.is_active_account() and owner_id=(select auth.uid()) and status in ('pending_review','changes_requested'));
create policy "listing reviewers moderate" on public.businesses for update to authenticated
using (public.has_permission('listings.review') or public.has_permission('homepage.manage'))
with check (public.has_permission('listings.review') or public.has_permission('homepage.manage'));

create policy "rating averages public through restricted view" on public.business_ratings for select to authenticated
using (reviewer_id=(select auth.uid()) or public.has_permission('reviews.read_private'));
create policy "authenticated residents add rating" on public.business_ratings for insert to authenticated
with check (public.is_active_account() and reviewer_id=(select auth.uid()));
create policy "residents update own rating" on public.business_ratings for update to authenticated
using (public.is_active_account() and reviewer_id=(select auth.uid())) with check (public.is_active_account() and reviewer_id=(select auth.uid()));
create policy "review comments owner and authorized admins" on public.business_review_comments for select to authenticated
using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
  or public.has_permission('reviews.read_private')
);
create policy "reviewers write own comments" on public.business_review_comments for insert to authenticated
with check (public.is_active_account() and exists(select 1 from public.business_ratings r where r.id=rating_id and r.reviewer_id=(select auth.uid()) and r.business_id=business_id));
create policy "reviewers update own comments" on public.business_review_comments for update to authenticated
using (public.is_active_account() and exists(select 1 from public.business_ratings r where r.id=rating_id and r.reviewer_id=(select auth.uid())))
with check (public.is_active_account() and exists(select 1 from public.business_ratings r where r.id=rating_id and r.reviewer_id=(select auth.uid())));

create policy "approved ads are public" on public.advertisements for select to anon,authenticated
using (status='approved' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()) and exists(select 1 from public.profiles p where p.id=owner_id and p.account_status='active') and exists(select 1 from public.businesses b where b.id=business_id and b.status='approved' and b.account_status='active'));
create policy "owners read ads" on public.advertisements for select to authenticated using (owner_id=(select auth.uid()));
create policy "ad reviewers read ads" on public.advertisements for select to authenticated using (public.has_permission('ads.review'));
create policy "owners submit ads for review" on public.advertisements for insert to authenticated
with check (
  public.is_active_account() and owner_id=(select auth.uid()) and status='pending_review'
  and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid()) and b.status='approved' and b.account_status='active')
);
create policy "owners edit pending ads" on public.advertisements for update to authenticated
using (public.is_active_account() and owner_id=(select auth.uid())) with check (public.is_active_account() and owner_id=(select auth.uid()) and status='pending_review');
create policy "owners delete own unreviewed ads" on public.advertisements for delete to authenticated
using (public.is_active_account() and owner_id=(select auth.uid()) and status='pending_review');
create policy "authorized ad reviewers moderate" on public.advertisements for update to authenticated
using (public.has_permission('ads.review')) with check (public.has_permission('ads.review'));

create policy "public can read maintenance module switch" on public.maintenance_settings for select to anon,authenticated using (singleton);
create policy "main admin changes maintenance switch" on public.maintenance_settings for update to authenticated
using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy "residents and authorized team see private reports" on public.maintenance_reports for select to authenticated
using (resident_id=(select auth.uid()) or public.has_permission('maintenance.manage'));
create policy "residents file reports only while enabled" on public.maintenance_reports for insert to authenticated
with check (
  resident_id=(select auth.uid())
  and public.is_active_account()
  and exists(select 1 from public.maintenance_settings s where s.singleton and s.enabled)
);
create policy "authorized maintenance team updates reports" on public.maintenance_reports for update to authenticated
using (public.has_permission('maintenance.manage')) with check (public.has_permission('maintenance.manage'));

create policy "published policy versions are public" on public.policy_versions for select to anon,authenticated using (true);
create policy "users read own policy acceptances" on public.policy_acceptances for select to authenticated
using (user_id=(select auth.uid()) or public.has_permission('accounts.manage'));
create policy "users accept policies for themselves" on public.policy_acceptances for insert to authenticated
with check (public.is_active_account() and user_id=(select auth.uid()));
create policy "users manage their push subscription" on public.push_subscriptions for all to authenticated
using (public.is_active_account() and user_id=(select auth.uid())) with check (public.is_active_account() and user_id=(select auth.uid()));
create policy "administrators read audit log" on public.audit_log for select to authenticated using (public.has_permission('accounts.manage'));

grant usage on schema public to anon, authenticated;
grant select on public.businesses, public.business_rating_summaries, public.advertisements, public.maintenance_settings, public.policy_versions to anon;
grant select on public.businesses, public.business_rating_summaries, public.advertisements, public.maintenance_settings, public.policy_versions to authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select on public.roles, public.permissions, public.user_roles to authenticated;
grant select,insert,update,delete on public.roles, public.permissions, public.role_permissions, public.user_roles to authenticated;
grant select,insert,update,delete on public.businesses, public.advertisements to authenticated;
grant select,insert,update on public.business_ratings, public.business_review_comments, public.maintenance_reports, public.policy_acceptances, public.push_subscriptions to authenticated;
grant select,update on public.maintenance_settings to authenticated;
grant select on public.audit_log to authenticated;
grant usage,select on sequence public.audit_log_id_seq to authenticated;

-- Keep anon from querying reviewer identity, score rows, or review text directly.
revoke all on public.business_ratings, public.business_review_comments from anon, authenticated;
grant select,insert,update on public.business_ratings, public.business_review_comments to authenticated;
revoke insert,update,delete on public.profiles from authenticated;
grant select,insert on public.profiles to authenticated;
grant update(display_name,phone) on public.profiles to authenticated;

create or replace function public.bootstrap_nargis_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare resident_role uuid;
begin
  if new.raw_user_meta_data->>'policy_version' is distinct from '1.1'
     or not coalesce((new.raw_user_meta_data->'accepted_required_policies') @> '["terms","privacy","conduct"]'::jsonb,false) then
    raise exception 'Required Nargis policies must be accepted before account creation.';
  end if;
  insert into public.profiles(id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  select id into resident_role from public.roles where role_key='resident';
  insert into public.user_roles(user_id,role_id) values (new.id,resident_role) on conflict do nothing;
  insert into public.policy_acceptances(user_id,policy_key,version)
  values (new.id,'terms','1.1'),(new.id,'privacy','1.1'),(new.id,'conduct','1.1') on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.bootstrap_nargis_user() from public, anon, authenticated;
create trigger nargis_auth_user_bootstrap after insert on auth.users
for each row execute function public.bootstrap_nargis_user();

create or replace function public.admin_set_account_status(_user_id uuid, _status public.account_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('accounts.manage') then raise exception 'not authorized'; end if;
  update public.profiles set account_status=_status, deleted_at=case when _status='deleted' then now() else null end, updated_at=now()
  where id=_user_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'account_status_changed','profile',_user_id::text,jsonb_build_object('status',_status));
end;
$$;
revoke all on function public.admin_set_account_status(uuid,public.account_status) from public, anon;
grant execute on function public.admin_set_account_status(uuid,public.account_status) to authenticated;
revoke update on public.profiles from authenticated;
grant update(display_name,phone) on public.profiles to authenticated;
