-- User submitted media remains unlisted until its business/ad moderation is approved.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('nargis-public-media','nargis-public-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create table public.business_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null unique,
  sort_order smallint not null default 0 check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique (business_id,sort_order)
);
create table public.advertisement_images (
  id uuid primary key default gen_random_uuid(),
  advertisement_id uuid not null references public.advertisements(id) on delete cascade,
  storage_path text not null unique,
  sort_order smallint not null default 0 check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  unique (advertisement_id,sort_order)
);

alter table public.business_images enable row level security;
alter table public.advertisement_images enable row level security;

create policy "approved business photos are public" on public.business_images for select to anon,authenticated
using (exists(select 1 from public.businesses b where b.id=business_id and b.status='approved' and b.account_status='active'));
create policy "owners and authorized reviewers read business photos" on public.business_images for select to authenticated
using (exists(select 1 from public.businesses b where b.id=business_id and (b.owner_id=(select auth.uid()) or public.has_permission('listings.review'))));
create policy "owners submit photos for own business" on public.business_images for insert to authenticated
with check (public.is_active_account() and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid()) and b.status in ('pending_review','changes_requested')));
create policy "owners manage photos for own pending business" on public.business_images for delete to authenticated
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid()) and b.status in ('pending_review','changes_requested')));

create policy "approved advertisement photos are public" on public.advertisement_images for select to anon,authenticated
using (exists(select 1 from public.advertisements a where a.id=advertisement_id and a.status='approved' and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>=now())));
create policy "owners and ad reviewers read advertisement photos" on public.advertisement_images for select to authenticated
using (exists(select 1 from public.advertisements a where a.id=advertisement_id and (a.owner_id=(select auth.uid()) or public.has_permission('ads.review'))));
create policy "owners submit photos for own pending ads" on public.advertisement_images for insert to authenticated
with check (public.is_active_account() and exists(select 1 from public.advertisements a where a.id=advertisement_id and a.owner_id=(select auth.uid()) and a.status='pending_review'));
create policy "owners manage photos for own pending ads" on public.advertisement_images for delete to authenticated
using (exists(select 1 from public.advertisements a where a.id=advertisement_id and a.owner_id=(select auth.uid()) and a.status='pending_review'));

grant select,insert,delete on public.business_images,public.advertisement_images to authenticated;
grant select on public.business_images,public.advertisement_images to anon;

create policy "owners upload media only to their own pending records" on storage.objects for insert to authenticated
with check (
  bucket_id='nargis-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (
    ((storage.foldername(name))[2]='businesses' and exists(
      select 1 from public.businesses b where b.id=((storage.foldername(name))[3])::uuid
        and b.owner_id=(select auth.uid()) and b.status in ('pending_review','changes_requested')
    ))
    or
    ((storage.foldername(name))[2]='ads' and exists(
      select 1 from public.advertisements a where a.id=((storage.foldername(name))[3])::uuid
        and a.owner_id=(select auth.uid()) and a.status='pending_review'
    ))
  )
);
create policy "owners replace or remove media from own pending records" on storage.objects for update to authenticated
using (
  bucket_id='nargis-public-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (((storage.foldername(name))[2]='businesses' and exists(select 1 from public.businesses b where b.id=((storage.foldername(name))[3])::uuid and b.owner_id=(select auth.uid()) and b.status in ('pending_review','changes_requested')))
    or ((storage.foldername(name))[2]='ads' and exists(select 1 from public.advertisements a where a.id=((storage.foldername(name))[3])::uuid and a.owner_id=(select auth.uid()) and a.status='pending_review')))
)
with check (
  bucket_id='nargis-public-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (((storage.foldername(name))[2]='businesses' and exists(select 1 from public.businesses b where b.id=((storage.foldername(name))[3])::uuid and b.owner_id=(select auth.uid()) and b.status in ('pending_review','changes_requested')))
    or ((storage.foldername(name))[2]='ads' and exists(select 1 from public.advertisements a where a.id=((storage.foldername(name))[3])::uuid and a.owner_id=(select auth.uid()) and a.status='pending_review')))
);
create policy "owners delete media from own pending records" on storage.objects for delete to authenticated
using (
  bucket_id='nargis-public-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (((storage.foldername(name))[2]='businesses' and exists(select 1 from public.businesses b where b.id=((storage.foldername(name))[3])::uuid and b.owner_id=(select auth.uid()) and b.status in ('pending_review','changes_requested')))
    or ((storage.foldername(name))[2]='ads' and exists(select 1 from public.advertisements a where a.id=((storage.foldername(name))[3])::uuid and a.owner_id=(select auth.uid()) and a.status='pending_review')))
);
