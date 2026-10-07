-- Launch-readiness hardening for Nargis. Safe to apply after the initial migrations.

-- The neighborhood building counts and the allowed locations are enforced by the database.
alter table public.businesses drop constraint if exists businesses_district_check;
alter table public.businesses add constraint businesses_location_kind_check check (
  (listing_kind='business' and district in ('النرجس 1','النرجس 2')) or
  (listing_kind='freelancer' and (district is null or district in ('النرجس 1','النرجس 2')))
);
alter table public.businesses add constraint businesses_mall_district_check check (
  mall is null or (district='النرجس 1' and mall='مول الحياة') or (district='النرجس 2' and mall='مول اللؤلؤة')
);
alter table public.businesses add constraint businesses_coordinates_pair_check check ((pin_lat is null)=(pin_lng is null));
alter table public.businesses add constraint businesses_business_pin_required check (
  listing_kind <> 'business' or (pin_lat is not null and pin_lng is not null and location_attested)
);

-- An exact district outline must be configured by an administrator before a shop can be approved.
create extension if not exists postgis with schema extensions;
create table public.district_geofences(
  district text primary key check(district in ('النرجس 1','النرجس 2')),
  boundary_geojson jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.district_geofences enable row level security;
create policy "geofence managers read boundaries" on public.district_geofences for select to authenticated using(public.has_permission('settings.manage'));
grant select on public.district_geofences to authenticated;
create or replace function public.admin_save_district_geofence(_district text,_geojson jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare shape extensions.geometry;
begin
  if not public.has_permission('settings.manage') then raise exception 'not authorized'; end if;
  if _district not in ('النرجس 1','النرجس 2') then raise exception 'invalid district'; end if;
  shape:=extensions.st_setsrid(extensions.st_geomfromgeojson(_geojson::text),4326);
  if extensions.st_geometrytype(shape) not in ('ST_Polygon','ST_MultiPolygon') or not extensions.st_isvalid(shape) then raise exception 'GeoJSON must contain a valid Polygon or MultiPolygon'; end if;
  insert into public.district_geofences(district,boundary_geojson,updated_by,updated_at) values(_district,_geojson,(select auth.uid()),now())
  on conflict(district) do update set boundary_geojson=excluded.boundary_geojson,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_log(actor_id,action,entity_type,entity_id) values((select auth.uid()),'district_geofence_changed','district',_district);
end;
$$;
revoke all on function public.admin_save_district_geofence(text,jsonb) from public,anon;
grant execute on function public.admin_save_district_geofence(text,jsonb) to authenticated;

create or replace function public.admin_set_business_review(
  _business_id uuid, _status public.listing_status, _moderation_note text default null,
  _verify_location boolean default false, _featured boolean default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_business public.businesses%rowtype; v_boundary jsonb;
begin
  if not (public.has_permission('listings.review') or public.has_permission('homepage.manage')) then raise exception 'not authorized'; end if;
  select * into v_business from public.businesses where id=_business_id for update;
  if not found then raise exception 'business not found'; end if;
  if _status='approved' and v_business.listing_kind='business' then
    select boundary_geojson into v_boundary from public.district_geofences where district=v_business.district;
    if v_boundary is null then raise exception 'district boundary is not configured'; end if;
    if not _verify_location or v_business.pin_lat is null or v_business.pin_lng is null
      or not extensions.st_covers(extensions.st_setsrid(extensions.st_geomfromgeojson(v_boundary::text),4326),extensions.st_setsrid(extensions.st_makepoint(v_business.pin_lng,v_business.pin_lat),4326)) then
      raise exception 'business pin is outside the configured Nargis district boundary';
    end if;
  end if;
  update public.businesses set status=_status,moderation_note=_moderation_note,moderated_by=(select auth.uid()),moderated_at=now(),
    approved_at=case when _status='approved' then coalesce(approved_at,now()) else approved_at end,
    location_verified_by=case when _verify_location then (select auth.uid()) else location_verified_by end,
    is_featured=case when _status='approved' then coalesce(_featured,is_featured) else false end,
    featured_by=case when _featured is not null then (select auth.uid()) else featured_by end
  where id=_business_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values((select auth.uid()),'business_reviewed','business',_business_id::text,
    jsonb_build_object('status',_status,'location_verified',_verify_location,'featured',_featured,'note',_moderation_note));
end;
$$;
revoke all on function public.admin_set_business_review(uuid,public.listing_status,text,boolean,boolean) from public,anon;
grant execute on function public.admin_set_business_review(uuid,public.listing_status,text,boolean,boolean) to authenticated;

-- Never expose unapproved uploads by guessing a permanent public object URL.
update public.businesses set cover_image_url=regexp_replace(cover_image_url, '^.*/nargis-public-media/', '')
where cover_image_url like '%/nargis-public-media/%';
update public.advertisements set image_url=regexp_replace(image_url, '^.*/nargis-public-media/', '')
where image_url like '%/nargis-public-media/%';
update storage.buckets set public=false where id='nargis-public-media';
grant execute on function public.has_permission(text) to anon;
drop policy if exists "approved business photos are public" on public.business_images;
drop policy if exists "approved advertisement photos are public" on public.advertisement_images;
drop policy if exists "owners and authorized reviewers read business photos" on public.business_images;
drop policy if exists "owners and ad reviewers read advertisement photos" on public.advertisement_images;
create policy "approved business photos or authorized viewers" on public.business_images for select to anon,authenticated
using (
  exists(select 1 from public.businesses b where b.id=business_id and b.status='approved' and b.account_status='active')
  or (select auth.uid())=(select owner_id from public.businesses where id=business_id)
  or public.has_permission('listings.review') or public.has_permission('homepage.manage')
);
create policy "approved ad photos or authorized viewers" on public.advertisement_images for select to anon,authenticated
using (
  exists(select 1 from public.advertisements a where a.id=advertisement_id and a.status='approved' and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>=now()))
  or (select auth.uid())=(select owner_id from public.advertisements where id=advertisement_id)
  or public.has_permission('ads.review')
);
create policy "authorized users read only approved listing objects" on storage.objects for select to anon,authenticated
using (
  bucket_id='nargis-public-media' and (
    ((storage.foldername(name))[2]='businesses' and exists(
      select 1 from public.businesses b where b.id=((storage.foldername(name))[3])::uuid and b.status='approved' and b.account_status='active'
    )) or
    ((storage.foldername(name))[2]='ads' and exists(
      select 1 from public.advertisements a where a.id=((storage.foldername(name))[3])::uuid and a.status='approved'
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>=now())
    )) or
    ((select auth.uid())::text=(storage.foldername(name))[1] and (
      ((storage.foldername(name))[2]='businesses' and exists(select 1 from public.businesses b where b.id=((storage.foldername(name))[3])::uuid and b.owner_id=(select auth.uid()))) or
      ((storage.foldername(name))[2]='ads' and exists(select 1 from public.advertisements a where a.id=((storage.foldername(name))[3])::uuid and a.owner_id=(select auth.uid())))
    )) or public.has_permission('listings.review') or public.has_permission('homepage.manage') or public.has_permission('ads.review')
  )
);

-- Resident addresses are private; a resident selects an address and an admin verifies it.
alter table public.profiles add column if not exists residence_district text;
alter table public.profiles add column if not exists building_number integer;
alter table public.profiles add column if not exists apartment_number integer;
alter table public.profiles add column if not exists residence_verified boolean not null default false;
alter table public.profiles add column if not exists residence_verified_by uuid references public.profiles(id);
alter table public.profiles add constraint profiles_residence_district_check check (residence_district is null or residence_district in ('النرجس 1','النرجس 2'));
alter table public.profiles add constraint profiles_residence_building_range_check check (
  building_number is null or (building_number between 1 and case residence_district when 'النرجس 1' then 645 when 'النرجس 2' then 309 else 0 end)
);
alter table public.profiles add constraint profiles_residence_apartment_range_check check (apartment_number is null or apartment_number between 1 and 24);
alter table public.profiles add constraint profiles_residence_complete_check check (
  (residence_district is null and building_number is null and apartment_number is null and not residence_verified) or
  (residence_district is not null and building_number is not null and apartment_number is not null)
);

create or replace function public.set_my_residence(_district text,_building integer,_apartment integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_active_account() then raise exception 'active account required'; end if;
  if _district not in ('النرجس 1','النرجس 2') or _building<1 or _apartment not between 1 and 24 then raise exception 'invalid residence'; end if;
  if (_district='النرجس 1' and _building>645) or (_district='النرجس 2' and _building>309) then raise exception 'building out of range'; end if;
  update public.profiles set residence_district=_district,building_number=_building,apartment_number=_apartment,residence_verified=false,residence_verified_by=null,updated_at=now() where id=(select auth.uid());
end;
$$;
revoke all on function public.set_my_residence(text,integer,integer) from public,anon;
grant execute on function public.set_my_residence(text,integer,integer) to authenticated;

create or replace function public.admin_verify_residence(_user uuid,_verified boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.has_permission('accounts.manage') then raise exception 'not authorized'; end if;
  update public.profiles set residence_verified=_verified,residence_verified_by=case when _verified then (select auth.uid()) else null end,updated_at=now() where id=_user and residence_district is not null;
  if not found then raise exception 'residence not set'; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values ((select auth.uid()),'residence_verification_changed','profile',_user::text,jsonb_build_object('verified',_verified));
end;
$$;
revoke all on function public.admin_verify_residence(uuid,boolean) from public,anon;
grant execute on function public.admin_verify_residence(uuid,boolean) to authenticated;

drop policy if exists "residents file reports only while enabled" on public.maintenance_reports;
create policy "verified residents file reports only while enabled" on public.maintenance_reports for insert to authenticated
with check (
  resident_id=(select auth.uid()) and public.is_active_account()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.residence_verified
    and p.building_number::text=maintenance_reports.building_number and p.apartment_number::text=maintenance_reports.apartment_number)
  and exists(select 1 from public.maintenance_settings s where s.singleton and s.enabled)
);

-- Owners can request moderated edits and pause/resume their campaigns without changing review fields.
create or replace function public.owner_update_business(_id uuid,_name text,_category text,_description text,_phone text,_whatsapp text,_district text,_mall text,_lat double precision,_lng double precision)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_active_account() then raise exception 'active account required'; end if;
  update public.businesses set name=_name,category=_category,description=_description,contact_phone=_phone,whatsapp=_whatsapp,district=_district,mall=_mall,pin_lat=_lat,pin_lng=_lng,
    status='pending_review',is_featured=false,location_verified_by=null,moderation_note=null,updated_at=now()
  where id=_id and owner_id=(select auth.uid()) and account_status='active';
  if not found then raise exception 'business unavailable'; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id) values ((select auth.uid()),'business_edit_submitted','business',_id::text);
end;
$$;
revoke all on function public.owner_update_business(uuid,text,text,text,text,text,text,text,double precision,double precision) from public,anon;
grant execute on function public.owner_update_business(uuid,text,text,text,text,text,text,text,double precision,double precision) to authenticated;

create or replace function public.owner_set_ad_status(_id uuid,_status public.ad_status)
returns void language plpgsql security definer set search_path='' as $$
begin
  if _status not in ('paused','pending_review') then raise exception 'invalid owner status'; end if;
  update public.advertisements set status=_status where id=_id and owner_id=(select auth.uid()) and public.is_active_account() and status in ('approved','paused','pending_review');
  if not found then raise exception 'advertisement unavailable'; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values ((select auth.uid()),'owner_ad_status_changed','advertisement',_id::text,jsonb_build_object('status',_status));
end;
$$;
revoke all on function public.owner_set_ad_status(uuid,public.ad_status) from public,anon;
grant execute on function public.owner_set_ad_status(uuid,public.ad_status) to authenticated;

create or replace function public.admin_set_user_role(_user uuid,_role text,_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_role_id uuid;
begin
  if not public.has_permission('roles.manage') then raise exception 'not authorized'; end if;
  if _role not in ('resident','business_owner','ad_supervisor','maintenance_supervisor','admin') then raise exception 'invalid role'; end if;
  select id into v_role_id from public.roles where role_key=_role;
  if _enabled then insert into public.user_roles(user_id,role_id) values(_user,v_role_id) on conflict do nothing;
  else
    if _role='admin' and _user=(select auth.uid()) then raise exception 'cannot remove your own admin role'; end if;
    delete from public.user_roles ur where ur.user_id=_user and ur.role_id=v_role_id;
  end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values((select auth.uid()),'user_role_changed','profile',_user::text,jsonb_build_object('role',_role,'enabled',_enabled));
end;
$$;
revoke all on function public.admin_set_user_role(uuid,text,boolean) from public,anon;
grant execute on function public.admin_set_user_role(uuid,text,boolean) to authenticated;

-- Private analytics are visible only to the owner of the listing and authorized admins.
create table public.business_views (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique(business_id,viewer_id,viewed_on)
);
alter table public.business_views enable row level security;
create policy "only analytics admins can inspect raw view events" on public.business_views for select to authenticated using(public.has_permission('analytics.read'));
revoke all on public.business_views from anon,authenticated;
create or replace function public.record_business_view(_business_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_active_account() then return; end if;
  insert into public.business_views(business_id,viewer_id) select b.id,(select auth.uid()) from public.businesses b where b.id=_business_id and b.status='approved' and b.account_status='active' and b.owner_id is distinct from (select auth.uid())
  on conflict(business_id,viewer_id,viewed_on) do nothing;
end;
$$;
revoke all on function public.record_business_view(uuid) from public,anon;
grant execute on function public.record_business_view(uuid) to authenticated;
create or replace function public.get_my_business_view_analytics(_business_id uuid)
returns table(total_views bigint,views_30_days bigint) language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.businesses b where b.id=_business_id and b.owner_id=(select auth.uid()))
    and not public.has_permission('analytics.read') then raise exception 'not authorized'; end if;
  return query select count(*)::bigint,count(*) filter(where v.viewed_on>=current_date-29)::bigint from public.business_views v where v.business_id=_business_id;
end;
$$;
revoke all on function public.get_my_business_view_analytics(uuid) from public,anon;
grant execute on function public.get_my_business_view_analytics(uuid) to authenticated;
create or replace function public.get_admin_analytics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_permission('analytics.read') then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'businesses',(select count(*) from public.businesses),
    'approved_businesses',(select count(*) from public.businesses where status='approved' and account_status='active'),
    'pending_businesses',(select count(*) from public.businesses where status in ('pending_review','changes_requested')),
    'pending_ads',(select count(*) from public.advertisements where status='pending_review'),
    'active_accounts',(select count(*) from public.profiles where account_status='active'),
    'views_30_days',(select count(*) from public.business_views where viewed_on>=current_date-29),
    'approved_ads',(select count(*) from public.advertisements where status='approved' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()))
  );
end;
$$;
revoke all on function public.get_admin_analytics() from public,anon;
grant execute on function public.get_admin_analytics() to authenticated;

-- Prevent client-side edits to notification content or ownership after delivery.
revoke update on public.user_notifications from authenticated;
grant update(read_at) on public.user_notifications to authenticated;
create or replace function public.mark_my_notifications_read()
returns void language sql security invoker set search_path='' as $$
  update public.user_notifications set read_at=now() where user_id=(select auth.uid()) and read_at is null;
$$;
revoke all on function public.mark_my_notifications_read() from public,anon;
grant execute on function public.mark_my_notifications_read() to authenticated;

-- Require account-level rate limits before spending on Grok inference.
create table public.support_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index support_requests_user_time_idx on public.support_requests(user_id,created_at desc);
alter table public.support_requests enable row level security;
create or replace function public.consume_support_quota()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_last timestamptz; v_count integer;
begin
  if v_user is null or not public.is_active_account() then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  select max(created_at),count(*)::integer into v_last,v_count from public.support_requests where user_id=v_user and created_at>=date_trunc('day',now());
  if coalesce(v_count,0)>=20 or (v_last is not null and v_last>now()-interval '6 seconds') then return false; end if;
  insert into public.support_requests(user_id) values(v_user);
  return true;
end;
$$;
revoke all on function public.consume_support_quota() from public,anon;
grant execute on function public.consume_support_quota() to authenticated;

-- Publish longer, explicit policies; accepting 1.2 is recorded at signup and required on next login.
insert into public.policy_versions(policy_key,version,title,body) values
('terms','1.2','شروط استخدام تطبيق النرجس','يقدم التطبيق دليلًا محليًا للأنشطة التجارية والمهن الحرة والعروض، إلى جانب مساحة اختيارية وخاصة لمتابعة مرافق الحي. لا يمثل التطبيق إدارة سكنية ولا يوفر بوابات أو حراسة أو استجابة للطوارئ. يجب تقديم بيانات صحيحة ومحدثة، ويشترط أن يكون النشاط التجاري داخل النرجس 1 أو النرجس 2 وأن يوافق صاحب النشاط على التحقق من موقعه. إدراج النشاط والإعلان والصور والتعديلات تخضع للمراجعة وقد تُرفض أو تُخفى أو تُطلب تعديلات عليها. لا يجوز رفع محتوى مخالف للقانون أو مضلل أو منتهك للحقوق أو يحتوي بيانات شخصية دون إذن. الإعلانات يجب أن تكون دقيقة مع توضيح السعر والشروط والمدة عند انطباق ذلك. التقييمات تعبّر عن تجربة المستخدم، ويجوز للإدارة إخفاء المحتوى المسيء مع الاحتفاظ بسجل تدقيق. يجوز تعليق الحساب أو إيقافه أو حذفه حذفًا منطقيًا عند إساءة الاستخدام أو بطلب المستخدم. قد تتغير الشروط، ويطلب التطبيق موافقة جديدة عند نشر إصدار إلزامي.'),
('privacy','1.2','سياسة الخصوصية واستخدام البيانات','يجمع التطبيق رقم الهاتف واسم العرض وبيانات الحساب، وبيانات النشاط والتواصل والموقع الذي يقدمه صاحب النشاط، وبيانات التقييمات والبلاغات والرسائل والإشعارات اللازمة لتشغيل الخدمة. عنوان سكن المقيم، بما فيه المنطقة والعمارة والشقة، خاص به وبالإدارة المخولة للتحقق وفريق الصيانة عند الحاجة؛ لا يظهر للسكان الآخرين ولا يسجل سجل تصفحهم. متوسط النجوم فقط يظهر للعامة، والتعليق النصي يظهر لصاحب النشاط والإدارة المخولة، وهوية المقيم تظهر للإدارة المخولة فقط. يحتفظ التطبيق ببيانات الموافقة وسجل القرارات الإدارية لأغراض الأمان والنزاعات. لا تحفظ محادثة مساعد Grok في قاعدة بيانات التطبيق، لكن نص الرسالة يرسل إلى xAI لمعالجة الرد وفق إعداد الخدمة. تستخدم الصور المخزنة الخاصة روابط مؤقتة بعد فحص الصلاحيات. قد يتعامل مزودو الاستضافة وتسجيل الدخول والرسائل والإشعارات ومعالجة الذكاء الاصطناعي مع البيانات بالقدر الضروري لتقديم الخدمة، وقد تختلف رسومهم وسياسات احتفاظهم. يمكن للمستخدم طلب تصحيح أو حذف بيانات حسابه عبر الإدارة، مع جواز الاحتفاظ بما يلزم قانونيًا أو أمنيًا.'),
('conduct','1.2','قواعد الاستخدام والتعامل','احترم خصوصية السكان وأصحاب الأنشطة. لا تنتحل صفة شخص آخر، ولا تنشئ إدراجًا لنشاط خارج النرجس على أنه داخله، ولا تستخدم الصور أو العلامات دون حق. لا تستخدم التقييمات للإساءة أو التهديد أو نشر معلومات شخصية. لا ترسل بيانات دفع أو كلمات مرور أو رموز تحقق عبر المحادثات. يراجع المشرف المختص الأنشطة والعروض والمحتوى، ويحق له طلب تعديل أو رفض أو إخفاء محتوى مخالف. الحسابات الإدارية مقيدة بأقل صلاحية لازمة، وتسجل الإجراءات الحساسة. بلاغات الصيانة تقتصر على المرافق العامة المحددة في التطبيق ولا تضمن زمن استجابة. عند وجود خطر مباشر تواصل مع الطوارئ والجهات المختصة.')
on conflict(policy_key,version) do update set title=excluded.title,body=excluded.body,published_at=now();
update public.policy_versions set required=false where version='1.1';

create or replace function public.bootstrap_nargis_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare resident_role uuid;
begin
  if not coalesce((new.raw_user_meta_data->'accepted_required_policies') @> coalesce((select jsonb_agg(to_jsonb(policy_key)) from public.policy_versions where required), '[]'::jsonb),false)
     or exists(select 1 from public.policy_versions pv where pv.required and (new.raw_user_meta_data->'accepted_policy_versions'->>pv.policy_key) is distinct from pv.version) then
    raise exception 'Required Nargis policies must be accepted before account creation.';
  end if;
  insert into public.profiles(id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  select id into resident_role from public.roles where role_key='resident';
  insert into public.user_roles(user_id,role_id) values (new.id,resident_role) on conflict do nothing;
  insert into public.policy_acceptances(user_id,policy_key,version) select new.id,policy_key,version from public.policy_versions where required on conflict do nothing;
  return new;
end;
$$;

create or replace function public.notify_listing_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is not null and new.status is distinct from old.status then
    insert into public.user_notifications(user_id,title,body,target_url)
    values(new.owner_id,'تحديث على ملف نشاطك',case when new.status='approved' then 'تم اعتماد نشاطك وأصبح ظاهرًا في الدليل.' when new.status='changes_requested' then coalesce(new.moderation_note,'يرجى مراجعة التعديلات المطلوبة على ملفك.') when new.status='rejected' then coalesce(new.moderation_note,'لم تتم الموافقة على طلب الإدراج.') else 'تغيرت حالة ملف نشاطك.' end,'/owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger notify_business_status after update of status on public.businesses for each row execute function public.notify_listing_changes();

create or replace function public.notify_ad_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.user_notifications(user_id,title,body,target_url)
    values(new.owner_id,'تحديث على إعلانك',case when new.status='approved' then 'تم اعتماد إعلانك وبدأ عرضه.' when new.status='rejected' then coalesce(new.moderation_reason,'لم تتم الموافقة على الإعلان.') else 'تغيرت حالة إعلانك.' end,'/owner')
    on conflict do nothing;
    if new.status='approved' then
      insert into public.user_notifications(user_id,title,body,target_url)
      select distinct s.user_id,'عرض جديد في النرجس',new.title,'/offers' from public.push_subscriptions s join public.profiles p on p.id=s.user_id where p.account_status='active' and s.user_id<>new.owner_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger notify_ad_status after update of status on public.advertisements for each row execute function public.notify_ad_changes();

create or replace function public.notify_maintenance_report_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.user_notifications(user_id,title,body,target_url)
    values(new.resident_id,'تحديث بلاغ الصيانة',new.status,'/maintenance');
  end if;
  return new;
end;
$$;
create trigger notify_maintenance_status after update of status on public.maintenance_reports for each row execute function public.notify_maintenance_report_changes();

create or replace function public.audit_maintenance_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to then
    insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
    values((select auth.uid()),'maintenance_report_updated','maintenance_report',new.id::text,jsonb_build_object('status',new.status,'assigned_to',new.assigned_to));
  end if;
  return new;
end;
$$;
create trigger audit_maintenance_status after update of status,assigned_to on public.maintenance_reports for each row execute function public.audit_maintenance_changes();

create or replace function public.audit_platform_settings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'platform_setting_updated',tg_table_name,'singleton',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
  return new;
end;
$$;
create trigger audit_homepage_settings after update on public.homepage_settings for each row execute function public.audit_platform_settings();
create trigger audit_maintenance_settings after update on public.maintenance_settings for each row execute function public.audit_platform_settings();
