import { createClient } from '@supabase/supabase-js';
import { businesses as sampleBusinesses } from './data';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const isBackendConfigured = Boolean(supabase);

export async function requestLoginCode(phone, acceptedPolicyKeys = [], acceptedPolicyVersions = {}) {
  if (!supabase) return { demo: true };
  const required = ['terms', 'privacy', 'conduct'];
  if (!required.every((key) => acceptedPolicyKeys.includes(key))) {
    throw new Error('لازم توافق على شروط الاستخدام وسياسة الخصوصية وقواعد الاستخدام قبل إنشاء الحساب.');
  }
  if(!required.every((key)=>typeof acceptedPolicyVersions[key]==='string'&&acceptedPolicyVersions[key].length>0)) throw new Error('افتح نصوص السياسات الحالية ووافق على أحدث نسخة قبل التسجيل.');
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { data: { accepted_required_policies: required, accepted_policy_versions:acceptedPolicyVersions } },
  });
  if (error) throw error;
  return { demo: false };
}

export async function verifyLoginCode(phone, token) {
  if (!supabase) return { demo: true };
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return { demo: false };
}

export async function submitOwnerAdvertisement(payload) {
  if (!supabase) return { demo: true };
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error('سجّل الدخول أولًا لإرسال إعلان.');
  const { images = [], ...ad } = payload;
  if (!ad.business_id) throw new Error('اختار النشاط المرتبط بالإعلان.');
  const { data: savedAd, error } = await supabase.from('advertisements')
    .insert({ ...ad, owner_id: data.user.id, status: 'pending_review' }).select('id').single();
  if (error) throw error;
  await uploadListingImages({ userId: data.user.id, recordId: savedAd.id, kind: 'ads', images, table: 'advertisement_images', foreignKey: 'advertisement_id', updateTable: 'advertisements', updateColumn: 'image_url' });
  return { demo: false };
}

export async function submitBusinessListing(payload) {
  if (!supabase) return { demo: true };
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error('سجّل الدخول أولًا لإضافة نشاط.');
  const { images = [], ...business } = payload;
  const { data: savedBusiness, error } = await supabase.from('businesses')
    .insert({ ...business, owner_id: data.user.id, status: 'pending_review' }).select('id').single();
  if (error) throw error;
  await uploadListingImages({ userId: data.user.id, recordId: savedBusiness.id, kind: 'businesses', images, table: 'business_images', foreignKey: 'business_id', updateTable: 'businesses', updateColumn: 'cover_image_url' });
  return { demo: false };
}

async function uploadListingImages({ userId, recordId, kind, images, table, foreignKey, updateTable, updateColumn, keepRecordOnFailure = false }) {
  if (!images.length) return;
  const bucket = 'nargis-public-media';
  const paths = [];
  try {
    const rows = [];
    for (const [sortOrder, file] of images.entries()) {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${userId}/${kind}/${recordId}/${sortOrder}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      paths.push(path);
      rows.push({ [foreignKey]: recordId, storage_path: path, sort_order: sortOrder });
    }
    const { error: rowsError } = await supabase.from(table).insert(rows);
    if (rowsError) throw rowsError;
    const { error: coverError } = await supabase.from(updateTable).update({ [updateColumn]: paths[0] }).eq('id', recordId);
    if (coverError) throw coverError;
  } catch (error) {
    if (paths.length) await supabase.storage.from(bucket).remove(paths);
    if (!keepRecordOnFailure) await supabase.from(updateTable).delete().eq('id', recordId);
    throw new Error(`تم إنشاء الطلب لكن تعذر إرفاق الصور: ${error.message}`);
  }
}

async function signMediaPath(path) {
  if (!path || /^https?:\/\//i.test(path)) return path || null;
  const { data, error } = await supabase.storage.from('nargis-public-media').createSignedUrl(path, 12 * 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

async function signBusinessMedia(rows) {
  return Promise.all((rows || []).map(async (business) => {
    const gallery = (business.business_images || []).slice().sort((a,b)=>a.sort_order-b.sort_order);
    const signedGallery = await Promise.all(gallery.map((image) => signMediaPath(image.storage_path)));
    const cover = business.cover_image_url && !/^https?:\/\//i.test(business.cover_image_url)
      ? await signMediaPath(business.cover_image_url)
      : business.cover_image_url;
    return { ...business, cover_image_url: cover || signedGallery[0] || null, gallery: signedGallery.filter(Boolean) };
  }));
}

export async function fetchApprovedBusinesses({ offset = 0, limit = 30 } = {}) {
  if (!supabase) return null;
  const automaticFeatured = await fetchHomepageMode().catch(() => true);
  const { data, error } = await supabase
    .from('businesses')
    .select('id,name,category,district,mall,description,contact_phone,whatsapp,cover_image_url,pin_lat,pin_lng,is_featured,created_at,business_rating_summaries(average_rating,rating_count),business_images(storage_path,sort_order)')
    .eq('status', 'approved')
    .eq('account_status', 'active')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = await signBusinessMedia(data ?? []);
  if (automaticFeatured) rows.sort((a,b) => {
    const ar = Array.isArray(a.business_rating_summaries) ? a.business_rating_summaries[0] : a.business_rating_summaries;
    const br = Array.isArray(b.business_rating_summaries) ? b.business_rating_summaries[0] : b.business_rating_summaries;
    return Number(br?.average_rating||0)-Number(ar?.average_rating||0) || Number(br?.rating_count||0)-Number(ar?.rating_count||0);
  });
  return rows;
}

export async function submitBusinessRating({ businessId, score, comment }) {
  if (!supabase) return { demo: true };
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('سجّل الدخول أولًا لإرسال تقييمك.');

  const { data: rating, error } = await supabase
    .from('business_ratings')
    .upsert({ business_id: businessId, reviewer_id: authData.user.id, score }, { onConflict: 'business_id,reviewer_id' })
    .select('id')
    .single();
  if (error) throw error;

  if (comment?.trim()) {
    const { error: commentError } = await supabase
      .from('business_review_comments')
      .upsert({ rating_id: rating.id, business_id: businessId, comment: comment.trim() }, { onConflict: 'rating_id' });
    if (commentError) throw commentError;
  }
  return { demo: false };
}

export async function submitMaintenanceReport(payload) {
  if (!supabase) return { demo: true };
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('سجّل الدخول أولًا لإرسال البلاغ.');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('residence_district,building_number,apartment_number,residence_verified').eq('id',authData.user.id).single();
  if (profileError) throw profileError;
  if (!profile?.residence_verified) {
    const district = payload.residence_district;
    const building = Number(payload.building_number);
    const apartment = Number(payload.apartment_number);
    if (!district || !Number.isInteger(building) || !Number.isInteger(apartment)) throw new Error('سجّل المنطقة ورقم العمارة والشقة أولًا. بعد مراجعة الإدارة لبيانات السكن تقدر ترسل البلاغ.');
    const { error: residenceError } = await supabase.rpc('set_my_residence', { _district:district, _building:building, _apartment:apartment });
    if (residenceError) throw residenceError;
    return { demo:false, needsVerification:true };
  }
  const { error } = await supabase.from('maintenance_reports').insert({ category:payload.category,description:payload.description,resident_id:authData.user.id,building_number:String(profile.building_number),apartment_number:String(profile.apartment_number) });
  if (error) throw error;
  return { demo: false };
}

export async function submitAdvertisement(payload) {
  if (!supabase) return { demo: true };
  const { error } = await supabase.from('advertisements').insert({ ...payload, status: 'pending_review' });
  if (error) throw error;
  return { demo: false };
}

export async function fetchCurrentRequiredPolicies() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('policy_versions').select('policy_key,version,title,body').eq('required',true).order('policy_key');
  if (error) throw error;
  return data || [];
}

export async function acceptPolicies(userId, policyRows) {
  if (!supabase) return { demo: true };
  const rows = policyRows.map(({ policy_key, version }) => ({ user_id: userId, policy_key, version }));
  const { error } = await supabase.from('policy_acceptances').upsert(rows, { onConflict: 'user_id,policy_key,version', ignoreDuplicates:true });
  if (error) throw error;
  return { demo: false };
}

export async function getMyAccessContext() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_my_access_context');
  if (error) throw error;
  return data || null;
}

export async function fetchPublicOffers() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('advertisements')
    .select('id,title,body,category,image_url,starts_at,ends_at,advertisement_images(storage_path,sort_order),businesses(id,name,category,district,mall,description,contact_phone,cover_image_url,business_images(storage_path,sort_order))')
    .eq('status','approved').order('created_at',{ascending:false}).limit(60);
  if (error) throw error;
  return Promise.all((data || []).map(async (ad) => {
    const adImages = (ad.advertisement_images || []).slice().sort((a,b)=>a.sort_order-b.sort_order);
    const image_url = ad.image_url && !/^https?:\/\//i.test(ad.image_url) ? await signMediaPath(ad.image_url) : ad.image_url;
    const businessRows = await signBusinessMedia(ad.businesses ? [Array.isArray(ad.businesses) ? ad.businesses[0] : ad.businesses] : []);
    return { ...ad, image_url, businesses:Array.isArray(ad.businesses) ? businessRows : businessRows[0], gallery:await Promise.all(adImages.map((image)=>signMediaPath(image.storage_path))) };
  }));
}

export async function fetchMyBusinesses() {
  if (!supabase) {
    if (!import.meta.env.DEV) return null;
    try {
      const saved=JSON.parse(localStorage.getItem('nargis-local-demo-admin-v1')||'null');
      if(saved?.businesses?.length) return saved.businesses.filter((b)=>b.owner_id==='demo-owner');
    } catch {}
    const b=sampleBusinesses[0];
    return [{id:'demo-business-1',owner_id:'demo-owner',name:b.name,category:b.category,district:b.district,mall:b.mall,listing_kind:'business',status:'approved',account_status:'active',description:b.description,contact_phone:b.phone,cover_image_url:b.image,business_rating_summaries:[{average_rating:b.rating,rating_count:b.ratingCount}]}];
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('سجّل الدخول أولًا.');
  const { data, error } = await supabase.from('businesses')
    .select('id,name,category,district,mall,listing_kind,description,contact_phone,whatsapp,cover_image_url,pin_lat,pin_lng,status,account_status,is_featured,moderation_note,created_at,business_rating_summaries(average_rating,rating_count),business_images(storage_path,sort_order)')
    .eq('owner_id',auth.user.id).order('created_at',{ascending:false});
  if (error) throw error;
  return signBusinessMedia(data || []);
}

export async function fetchMyAds() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('advertisements')
    .select('id,business_id,title,body,category,image_url,status,moderation_reason,starts_at,ends_at,created_at,businesses(name)')
    .order('created_at',{ascending:false});
  if (error) throw error;
  return Promise.all((data || []).map(async (ad) => ({ ...ad, image_url:ad.image_url && !/^https?:\/\//i.test(ad.image_url) ? await signMediaPath(ad.image_url) : ad.image_url })));
}

export async function updateOwnerBusiness(id, payload) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { data: auth,error:authError } = await supabase.auth.getUser();
  if(authError||!auth.user) throw new Error('سجّل الدخول أولًا.');
  const { error } = await supabase.rpc('owner_update_business', {
    _id:id,_name:payload.name,_category:payload.category,_description:payload.description,
    _phone:payload.contact_phone,_whatsapp:payload.whatsapp || null,_district:payload.district || null,
    _mall:payload.mall || null,_lat:payload.pin_lat ?? null,_lng:payload.pin_lng ?? null,
  });
  if (error) throw error;
  if(payload.images?.length){
    const {data:oldImages,error:readError}=await supabase.from('business_images').select('storage_path').eq('business_id',id);
    if(readError)throw readError;
    const paths=(oldImages||[]).map((row)=>row.storage_path);
    if(paths.length){const {error:storageError}=await supabase.storage.from('nargis-public-media').remove(paths);if(storageError)throw storageError;}
    const {error:deleteError}=await supabase.from('business_images').delete().eq('business_id',id);
    if(deleteError)throw deleteError;
    await uploadListingImages({userId:auth.user.id,recordId:id,kind:'businesses',images:payload.images,table:'business_images',foreignKey:'business_id',updateTable:'businesses',updateColumn:'cover_image_url',keepRecordOnFailure:true});
  }
}

export async function setOwnerAdStatus(id, status) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { error } = await supabase.rpc('owner_set_ad_status', { _id:id, _status:status });
  if (error) throw error;
}

export async function fetchMyMaintenanceReports() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('maintenance_reports')
    .select('id,category,description,building_number,apartment_number,status,created_at,updated_at')
    .order('created_at',{ascending:false}).limit(50);
  if (error) throw error;
  return data || [];
}

export async function fetchMyPrivateReviewComments() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('business_review_comments')
    .select('id,business_id,comment,created_at,businesses!inner(id,name,owner_id)')
    .order('created_at',{ascending:false}).limit(100);
  if (error) throw error;
  return data || [];
}

export async function fetchMaintenanceModuleState() {
  if (!supabase) return true;
  const { data, error } = await supabase.from('maintenance_settings').select('enabled').eq('singleton',true).single();
  if (error) throw error;
  return Boolean(data?.enabled);
}

export async function updateMaintenanceModuleState(enabled) {
  if (!supabase) throw new Error('اربط Supabase لحفظ إعداد الصيانة.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('سجّل الدخول بصلاحية المدير الرئيسي.');
  const { error } = await supabase.from('maintenance_settings').update({ enabled, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq('singleton',true);
  if (error) throw error;
}

export async function fetchHomepageMode() {
  if (!supabase) return true;
  const { data, error } = await supabase.from('homepage_settings').select('automatic_featured').eq('singleton',true).single();
  if (error) throw error;
  return Boolean(data?.automatic_featured);
}

export async function updateHomepageMode(automaticFeatured) {
  if (!supabase) throw new Error('اربط Supabase لحفظ إعدادات الصفحة الرئيسية.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('ليس لديك صلاحية تغيير الظهور.');
  const { error } = await supabase.from('homepage_settings').update({ automatic_featured: automaticFeatured, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq('singleton',true);
  if (error) throw error;
}

export async function reviewBusiness({ id, status, note, verifyLocation = false, featured = null }) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { error } = await supabase.rpc('admin_set_business_review', { _business_id:id, _status:status, _moderation_note:note || null, _verify_location:verifyLocation, _featured:featured });
  if (error) throw error;
}

export async function reviewAd({ id, status, reason }) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { error } = await supabase.rpc('admin_set_ad_review', { _ad_id:id, _status:status, _reason:reason || null });
  if (error) throw error;
}

export async function updateAccountStatus(userId, status) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { error } = await supabase.rpc('admin_set_account_status', { _user_id:userId, _status:status });
  if (error) throw error;
}

export async function fetchAdminUsers({offset=0,limit=50,search=''}={}) {
  if (!supabase) return null;
  let query=supabase.from('profiles')
    .select('id,display_name,phone,account_status,created_at,residence_district,building_number,apartment_number,residence_verified,user_roles(roles(role_key))',{count:'exact'})
    .order('created_at',{ascending:false});
  const safeSearch=search.trim().replace(/[^\p{L}\p{N}\s+.-]/gu,'');
  if(safeSearch)query=query.or(`display_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`);
  const { data, error,count } = await query.range(offset,offset+limit-1);
  if (error) throw error;
  return {rows:data||[],count:count||0,offset,limit};
}

export async function verifyUserResidence(userId, verified) {
  const { error } = await supabase.rpc('admin_verify_residence', { _user:userId, _verified:verified });
  if (error) throw error;
}

export async function setUserRole(userId, roleKey, enabled) {
  const { error } = await supabase.rpc('admin_set_user_role', { _user:userId, _role:roleKey, _enabled:enabled });
  if (error) throw error;
}

export async function fetchAdminAuditLog() {
  if (!supabase) return [];
  const { data,error } = await supabase.from('audit_log').select('id,actor_id,action,entity_type,entity_id,details,created_at').order('created_at',{ascending:false}).limit(100);
  if (error) throw error;
  return data || [];
}

export async function fetchAdminAnalytics() {
  const {data,error}=await supabase.rpc('get_admin_analytics');
  if(error)throw error;
  return data||{};
}

export async function fetchDistrictGeofences() {
  const {data,error}=await supabase.from('district_geofences').select('district,boundary_geojson,updated_at');
  if(error)throw error;
  return data||[];
}

export async function saveDistrictGeofence(district,geojson) {
  const {error}=await supabase.rpc('admin_save_district_geofence',{_district:district,_geojson:geojson});
  if(error)throw error;
}

export async function fetchBusinessViewAnalytics(businessId) {
  const { data,error } = await supabase.rpc('get_my_business_view_analytics',{_business_id:businessId});
  if (error) throw error;
  return Array.isArray(data)?data[0]||{total_views:0,views_30_days:0}:data||{total_views:0,views_30_days:0};
}

export async function recordBusinessView(businessId) {
  if (!supabase) return;
  const { error } = await supabase.rpc('record_business_view', { _business_id:businessId });
  if (error) throw error;
}

export async function fetchMyNotifications() {
  if (!supabase) return [];
  const { data,error } = await supabase.from('user_notifications').select('id,title,body,target_url,created_at,read_at').order('created_at',{ascending:false}).limit(50);
  if (error) throw error;
  return data || [];
}

export async function markNotificationsRead() {
  const { error } = await supabase.rpc('mark_my_notifications_read');
  if (error) throw error;
}

export async function fetchAdminBusinesses() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('businesses')
    .select('id,owner_id,name,category,district,mall,listing_kind,description,contact_phone,cover_image_url,pin_lat,pin_lng,location_attested,location_verified_by,status,account_status,is_featured,moderation_note,created_at,business_images(storage_path,sort_order)')
    .order('created_at',{ascending:false}).limit(200);
  if (error) throw error;
  return signBusinessMedia(data || []);
}

export async function fetchAdminAds() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('advertisements')
    .select('id,business_id,owner_id,title,body,category,image_url,status,moderation_reason,created_at,advertisement_images(storage_path,sort_order),businesses(name)')
    .order('created_at',{ascending:false}).limit(200);
  if (error) throw error;
  return Promise.all((data || []).map(async (ad)=>({...ad,image_url:ad.image_url&&!/^https?:\/\//i.test(ad.image_url)?await signMediaPath(ad.image_url):ad.image_url,gallery:await Promise.all((ad.advertisement_images||[]).sort((a,b)=>a.sort_order-b.sort_order).map((image)=>signMediaPath(image.storage_path)))})));
}

export async function fetchAdminPrivateReviews() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('business_ratings')
    .select('id,business_id,reviewer_id,score,created_at,businesses(name),business_review_comments(comment),profiles!business_ratings_reviewer_id_fkey(display_name,phone)')
    .order('created_at',{ascending:false}).limit(200);
  if (error) throw error;
  return data || [];
}

export async function fetchAdminMaintenanceReports() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('maintenance_reports')
    .select('id,resident_id,category,description,building_number,apartment_number,status,assigned_to,created_at,updated_at')
    .order('created_at',{ascending:false}).limit(200);
  if (error) throw error;
  return data || [];
}

export async function updateMaintenanceReportStatus(reportId, status) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { error } = await supabase.from('maintenance_reports').update({ status, updated_at:new Date().toISOString() }).eq('id',reportId);
  if (error) throw error;
}

export async function fetchPrivateMessages(residentId) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('private_messages')
    .select('id,resident_id,author_id,message,created_at,read_at')
    .eq('resident_id',residentId).order('created_at',{ascending:true}).limit(200);
  if (error) throw error;
  return data || [];
}

export async function sendPrivateMessage({ residentId, message }) {
  if (!supabase) throw new Error('اربط Supabase أولًا.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('سجّل الدخول أولًا.');
  const { error } = await supabase.from('private_messages').insert({ resident_id:residentId, author_id:auth.user.id, message });
  if (error) throw error;
}
