import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BadgeCheck, Bell, Building2, Check, ChevronLeft, Clock3, Eye, MessageCircle, MessageSquareText, ShieldCheck, Star, Store, Tag, Users, Wrench, X } from 'lucide-react';
import {
  fetchAdminAds, fetchAdminAnalytics, fetchAdminAuditLog, fetchAdminBusinesses, fetchAdminMaintenanceReports, fetchAdminPrivateReviews, fetchAdminUsers, fetchBusinessViewAnalytics,
  fetchHomepageMode, fetchMaintenanceModuleState, fetchMyAds, fetchMyBusinesses, fetchMyPrivateReviewComments,
  fetchMyMaintenanceReports, fetchPrivateMessages, reviewAd, reviewBusiness, sendPrivateMessage, updateAccountStatus, setOwnerAdStatus, setUserRole, verifyUserResidence,
  updateHomepageMode, updateMaintenanceModuleState, updateMaintenanceReportStatus, fetchDistrictGeofences, saveDistrictGeofence, isBackendConfigured,
} from './supabase';
import { businesses as sampleBusinesses, samplePrivateReviews } from './data';

const demoStorageKey = 'nargis-local-demo-admin-v1';
const demoMode = import.meta.env.DEV && !isBackendConfigured;
function demoSeed() {
  return {
    businesses: sampleBusinesses.slice(0, 4).map((b, i) => ({ id:`demo-business-${i+1}`, owner_id:'demo-owner', name:b.name, category:b.category, district:b.district, mall:b.mall, listing_kind:'business', description:b.description, contact_phone:b.phone, cover_image_url:b.image, pin_lat:30.0+i/1000, pin_lng:31.0+i/1000, status:i<2?'approved':'pending_review', account_status:'active', is_featured:i===0, moderation_note:null, created_at:new Date(Date.now()-i*86400000).toISOString(), business_rating_summaries:[{average_rating:b.rating,rating_count:b.ratingCount}] })),
    ads:[{id:'demo-ad-1',business_id:'demo-business-1',owner_id:'demo-owner',title:'عرض الأسبوع',body:'خصم خاص لسكان النرجس على منتجات مختارة.',category:'مطاعم',image_url:sampleBusinesses[0]?.image,status:'pending_review',created_at:new Date().toISOString(),businesses:{name:sampleBusinesses[0]?.name}}],
    reviews:samplePrivateReviews.map((r,i)=>({id:`demo-review-${i}`,business_id:'demo-business-1',reviewer_id:`demo-resident-${i}`,score:r.stars,created_at:new Date().toISOString(),businesses:{name:r.business},business_review_comments:[{comment:r.comment}],profiles:{display_name:r.reviewer,phone:'+20100000000'+i}})),
    users:[{id:'demo-owner',display_name:'صاحب نشاط تجريبي',phone:'01000000001',account_status:'active',created_at:new Date().toISOString(),user_roles:[{roles:{role_key:'business_owner'}}]},{id:'demo-resident',display_name:'مقيم تجريبي',phone:'01000000002',account_status:'active',created_at:new Date().toISOString(),user_roles:[{roles:{role_key:'resident'}}]}],
    reports:[{id:'demo-report-1',resident_id:'demo-resident',category:'كهرباء وإنارة',description:'إضاءة السلم تحتاج إلى صيانة.',building_number:12,apartment_number:4,status:'جديد',created_at:new Date().toISOString()}],autoFeatured:true,maintenanceOn:true,
  };
}
function readDemo() {
  if (!demoMode) return null;
  try { const saved=localStorage.getItem(demoStorageKey); if(saved) return JSON.parse(saved); } catch {}
  const seed=demoSeed(); try { localStorage.setItem(demoStorageKey,JSON.stringify(seed)); } catch {} return seed;
}
function writeDemo(value) { if(!demoMode)return; try{localStorage.setItem(demoStorageKey,JSON.stringify(value));}catch{} }
export function saveDemoBusiness(payload) {
  const d=readDemo(); if(!d) return null;
  const {images,...details}=payload;
  const existingIndex=details.id?d.businesses.findIndex((b)=>b.id===details.id):-1;
  if(existingIndex>=0){const old=d.businesses[existingIndex];const updated={...old,...details,status:'pending_review',is_featured:false,moderation_note:null,updated_at:new Date().toISOString()};d.businesses[existingIndex]=updated;writeDemo(d);return updated;}
  const row={...details,id:crypto.randomUUID(),owner_id:'demo-owner',status:'pending_review',account_status:'active',is_featured:false,cover_image_url:'/brand/nargis-logo.png',moderation_note:null,created_at:new Date().toISOString()};
  d.businesses.unshift(row);writeDemo(d);return row;
}
export function saveDemoAdvertisement(payload) {
  const d=readDemo(); if(!d) return null;
  const business=d.businesses.find((b)=>b.id===payload.business_id);
  const row={...payload,id:crypto.randomUUID(),owner_id:'demo-owner',status:'pending_review',image_url:'/brand/nargis-logo.png',created_at:new Date().toISOString(),businesses:{name:business?.name||'نشاط تجريبي'}};
  d.ads.unshift(row);writeDemo(d);return row;
}

const permissionNames = {
  'accounts.manage': 'الحسابات', 'listings.review': 'مراجعة الأنشطة', 'ads.review': 'مراجعة الإعلانات',
  'reviews.read_private': 'التقييمات الخاصة', 'maintenance.manage': 'الصيانة', 'analytics.read': 'التحليلات',
  'homepage.manage': 'الرئيسية', 'roles.manage': 'الأدوار', 'settings.manage': 'الإعدادات',
};
const statusArabic = { pending_review: 'قيد المراجعة', approved: 'مقبول', changes_requested: 'مطلوب تعديل', rejected: 'مرفوض', hidden: 'مخفي', suspended: 'معلّق', disabled: 'موقوف', deleted: 'محذوف', active: 'نشط' };
const fmtDate = (value) => new Date(value).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

export function OwnerPortal({ context, openListing, openAd, showToast }) {
  const [businesses, setBusinesses] = useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [ads, setAds] = useState([]);
  const [comments, setComments] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewStats,setViewStats] = useState({total_views:0,views_30_days:0});

  async function refresh() {
    setLoading(true); setError('');
    try {
      if (demoMode) {
        const d=readDemo();
        setBusinesses(d.businesses.filter((b)=>b.owner_id==='demo-owner'));
        setAds(d.ads.filter((a)=>a.owner_id==='demo-owner'));
        setComments(d.reviews.map((r)=>({id:r.id,business_id:r.business_id,comment:r.business_review_comments?.[0]?.comment||'',created_at:r.created_at})));
        setReports(d.reports.filter((r)=>r.resident_id==='demo-owner'));
        return;
      }
      const [b, a, c, r] = await Promise.all([fetchMyBusinesses(), fetchMyAds(), fetchMyPrivateReviewComments(), fetchMyMaintenanceReports()]);
      setBusinesses(b || []); setAds(a || []); setComments(c || []); setReports(r || []);
    } catch (err) { setError(err.message || 'تعذر تحميل بيانات نشاطك.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); const handler=()=>refresh(); window.addEventListener('nargis:demo-refresh',handler); return ()=>window.removeEventListener('nargis:demo-refresh',handler); }, []);
  const selected = businesses.find((business)=>business.id===selectedId) || businesses.find((business) => business.status === 'approved' && business.account_status === 'active') || businesses[0];
  const rating = selected?.business_rating_summaries?.[0] || selected?.business_rating_summaries || {};
  const activeAds = ads.filter((ad) => ad.status === 'approved').length;
  useEffect(()=>{if(!selected?.id||demoMode)return;fetchBusinessViewAnalytics(selected.id).then(setViewStats).catch(()=>setViewStats({total_views:0,views_30_days:0}));},[selected?.id]);
  async function changeAdStatus(ad){const next=ad.status==='approved'?'paused':'pending_review';try{if(demoMode){const d=readDemo();writeDemo({...d,ads:d.ads.map((item)=>item.id===ad.id?{...item,status:next}:item)});}else await setOwnerAdStatus(ad.id,next);await refresh();showToast(next==='paused'?'تم إيقاف الإعلان مؤقتًا.':'عاد الإعلان للمراجعة قبل النشر.');}catch(error){showToast(error.message||'تعذر تحديث الإعلان.');}}

  return <div className="page-container inner-page portal-page">
    <PortalHeading kicker="مساحة صاحب النشاط" title="خلّي شغلك دايمًا في الصورة." detail="إدارة ملفك، عروضك، وإعلاناتك من مكان واحد." action={<button className="button-primary" onClick={openAd}><Tag size={16}/> إعلان جديد</button>}/>
    {error && <InlineNotice tone="error" text={error} onRetry={refresh}/>}
    {loading ? <LoadingPanel/> : businesses.length === 0 ? <EmptyPanel title="لسه ما أضفتش نشاط" text="قدّم نشاطك المحلي، وبعد مراجعة الإدارة هتظهر هنا أدوات الملف والإعلانات." action={<button className="button-primary" onClick={openListing}>إضافة نشاط <ArrowLeft size={15}/></button>}/> : <>
      <div className="owner-switcher">{businesses.map((b) => <button className={selected?.id === b.id ? 'selected' : ''} key={b.id} onClick={() => setSelectedId(b.id)}><Store size={15}/>{b.name}<span className={`tiny-status ${b.status}`}>{statusArabic[b.status]}</span></button>)}</div>
      <div className="owner-summary"><img src={selected?.cover_image_url || '/brand/nargis-logo.png'} alt=""/><div><span className="verified-line">{selected?.status === 'approved' ? <><BadgeCheck size={15}/> نشاط موثّق</> : <><Clock3 size={14}/>{statusArabic[selected?.status] || 'قيد المراجعة'}</>}</span><h2>{selected?.name}</h2><p>{selected?.category} · {selected?.mall || selected?.district || 'مهنة حرة'}</p></div><button className="button-outline" onClick={()=>openListing(selected)}>تحديث بيانات النشاط <ArrowLeft size={14}/></button></div>
      {selected?.moderation_note && selected.status !== 'approved' && <InlineNotice text={`ملاحظة الإدارة: ${selected.moderation_note}`}/>}
      <div className="stats-grid"><StatCard icon={<Eye/>} label="مشاهدات الملف" value={viewStats.total_views} note={`${viewStats.views_30_days} مشاهدة خلال 30 يومًا · للمستخدمين المسجلين`}/><StatCard icon={<Tag/>} label="إعلانات نشطة" value={activeAds} note={`${ads.filter((ad) => ad.status === 'pending_review').length} قيد المراجعة`}/><StatCard icon={<Star/>} label="متوسط التقييم" value={Number(rating.average_rating || 0).toFixed(1)} note={`${rating.rating_count || 0} تقييم · الهوية خاصة`}/></div>
      <div className="portal-columns"><section className="dashboard-panel"><PanelTitle kicker="حملاتك" title="الإعلانات والعروض" action={<button className="text-link" onClick={openAd}><Tag size={14}/> إعلان جديد</button>}/>{ads.length ? ads.map((ad) => <div className="portal-row" key={ad.id}><span className="ad-thumbnail"><Tag size={16}/></span><span className="portal-row-main"><b>{ad.title}</b><small>{ad.businesses?.name || selected?.name} · {fmtDate(ad.created_at)}</small>{ad.moderation_reason && <small className="reason-text">ملاحظة: {ad.moderation_reason}</small>}</span><span className={`pill-status ${ad.status}`}>{statusArabic[ad.status] || ad.status}</span>{['approved','paused'].includes(ad.status)&&<button className="button-outline" onClick={()=>changeAdStatus(ad)}>{ad.status==='approved'?'إيقاف مؤقت':'طلب إعادة النشر'}</button>}</div>) : <EmptyInline text="مفيش إعلانات لسه. ابدأ أول حملة لنشاطك."/>}</section>
        <section className="dashboard-panel"><PanelTitle kicker="تجارب الزوار" title="تعليقات خاصة"/><div className="owner-private-note"><ShieldCheck size={17}/><span>تشوف نص التعليق، لكن اسم ورقم صاحب التقييم لا يظهران لك.</span></div>{comments.filter((comment) => comment.business_id === selected?.id).length ? comments.filter((comment) => comment.business_id === selected?.id).slice(0,4).map((comment) => <div className="comment-card" key={comment.id}><span className="comment-stars">★★★★★</span><p>{comment.comment}</p><small>{fmtDate(comment.created_at)} · تقييم خاص</small></div>) : <EmptyInline text="لا توجد تعليقات مكتوبة على هذا النشاط."/>}</section></div>
      <section className="dashboard-panel owner-maintenance-panel"><PanelTitle kicker="المرافق العامة" title="بلاغات الصيانة الخاصة بي" action={<button className="text-link" onClick={() => window.dispatchEvent(new CustomEvent('nargis:navigate',{detail:'maintenance'}))}><Wrench size={14}/> متابعة البلاغات</button>}/>{reports.length ? reports.slice(0,3).map((r) => <div className="portal-row" key={r.id}><span className="ticket-icon"><Wrench size={15}/></span><span className="portal-row-main"><b>{r.category} · عمارة {r.building_number}</b><small>{r.description.slice(0,90)}</small></span><span className="pill-status">{r.status}</span></div>) : <EmptyInline text="لا توجد بلاغات صيانة مسجلة على حسابك."/>}</section>
    </>}
  </div>;
}

export function AdminPortal({ context, maintenanceOn, setMaintenanceOn, showToast }) {
  const permissions = context?.permissions || [];
  const tabs = [
    ['overview','نظرة عامة','analytics.read'],['listings','الأنشطة','listings.review'],['ads','الإعلانات','ads.review'],
    ['reviews','التقييمات الخاصة','reviews.read_private'],['users','الحسابات','accounts.manage'],
    ['audit','سجل الإدارة','accounts.manage'],
    ['maintenance','الصيانة','maintenance.manage'],['settings','الإعدادات','settings.manage'],
  ].filter(([, , permission]) => permissions.includes(permission));
  const [tab, setTab] = useState(tabs[0]?.[0] || 'overview');
  const [data, setData] = useState({ businesses:[], ads:[], reviews:[], users:[], reports:[], audit:[], analytics:{}, autoFeatured:true });
  const [busy, setBusy] = useState(false);
  const [userSearch,setUserSearch]=useState('');
  const [chatFor, setChatFor] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    if (demoMode) { const d=readDemo(); setData({businesses:d.businesses,ads:d.ads,reviews:d.reviews,users:d.users,reports:d.reports,autoFeatured:d.autoFeatured}); setMaintenanceOn(d.maintenanceOn); return; }
    const requested = [];
    if (permissions.includes('analytics.read')) requested.push(['analytics',fetchAdminAnalytics]);
    if (permissions.includes('listings.review')) requested.push(['businesses',fetchAdminBusinesses]);
    if (permissions.includes('ads.review')) requested.push(['ads',fetchAdminAds]);
    if (permissions.includes('reviews.read_private')) requested.push(['reviews',fetchAdminPrivateReviews]);
    if (permissions.includes('accounts.manage')) requested.push(['users',()=>fetchAdminUsers({search:userSearch})]);
    if (permissions.includes('accounts.manage')) requested.push(['audit',fetchAdminAuditLog]);
    if (permissions.includes('maintenance.manage')) requested.push(['reports',fetchAdminMaintenanceReports]);
    const results = await Promise.all(requested.map(async ([key, fetcher]) => [key, await fetcher()]));
    const updates=Object.fromEntries(results.map(([key,value])=>[key,key==='users'?(value?.rows||[]):(value||[])]));
    const userPage=results.find(([key])=>key==='users')?.[1];
    setData((old) => ({ ...old, ...updates,...(userPage?{usersTotal:userPage.count,usersOffset:userPage.offset}: {}) }));
    if (permissions.includes('homepage.manage')) {
      try { const automatic = await fetchHomepageMode(); setData((old) => ({ ...old, autoFeatured: automatic })); } catch (e) { setError(e.message); }
    }
    if (permissions.includes('settings.manage')) {
      try { setMaintenanceOn(await fetchMaintenanceModuleState()); } catch (e) { setError(e.message); }
    }
  }
  useEffect(() => { refresh().catch((err) => setError(err.message || 'تعذر تحميل لوحة الإدارة.')); }, [context?.user_id]);

  const stats = useMemo(() => ({
    businesses: data.businesses.length,
    pending: data.businesses.filter((x) => x.status === 'pending_review').length + data.ads.filter((x) => x.status === 'pending_review').length,
    activeUsers: data.users.filter((x) => x.account_status === 'active').length,
    ads: data.ads.filter((x) => x.status === 'approved').length,
  }), [data]);
  async function action(task, success) {
    setBusy(true);
    try { await task(); await refresh(); showToast(success); }
    catch (err) { showToast(err.message || 'تعذر تنفيذ الإجراء.'); }
    finally { setBusy(false); }
  }
  async function demoAction(update, success) {
    setBusy(true);
    try { const old=readDemo(); const next=update(old); writeDemo(next); await refresh(); showToast(success); }
    finally { setBusy(false); }
  }
  async function loadUsers(search=userSearch,append=false){
    if(demoMode)return;
    setBusy(true);
    try{const page=await fetchAdminUsers({search,offset:append?data.users.length:0});setUserSearch(search);setData((old)=>({...old,users:append?[...old.users,...page.rows]:page.rows,usersTotal:page.count,usersOffset:page.offset}));}
    catch(err){showToast(err.message||'تعذر البحث عن الحسابات.');}
    finally{setBusy(false);}
  }
  if (!tabs.length) return <div className="page-container inner-page"><EmptyPanel title="لا توجد صلاحيات إدارية لهذا الحساب" text="لو محتاج صلاحية، تواصل مع المدير الرئيسي."/></div>;

  return <div className="page-container inner-page admin-page portal-page"><PortalHeading kicker="الإدارة والتحكم" title="صورة كاملة. تحكم واضح." detail="كل إجراء إداري يسجل في سجل المراجعة بحسب صلاحية الحساب." action={<span className="admin-badge"><ShieldCheck size={15}/>{(context?.roles || []).includes('admin') ? 'مدير رئيسي' : 'مشرف'}</span>}/>
    {error && <InlineNotice tone="error" text={error} onRetry={() => refresh().catch((err) => setError(err.message))}/>}
    <div className="admin-tabs">{tabs.map(([id,label]) => <button key={id} className={tab===id?'selected':''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'overview' && <><div className="stats-grid admin-stats"><StatCard icon={<Store/>} label="الأنشطة المنشورة" value={data.analytics.approved_businesses??stats.businesses} note={`${data.analytics.businesses??stats.businesses} إدراج إجمالي`}/><StatCard icon={<Clock3/>} label="طلبات المراجعة" value={Number(data.analytics.pending_businesses||0)+Number(data.analytics.pending_ads||0)} note={`${data.analytics.pending_businesses||0} نشاط · ${data.analytics.pending_ads||0} إعلان`}/><StatCard icon={<Users/>} label="حسابات نشطة" value={data.analytics.active_accounts??stats.activeUsers} note="الإجمالي في قاعدة البيانات"/><StatCard icon={<Tag/>} label="مشاهدات آخر 30 يومًا" value={data.analytics.views_30_days||0} note={`${data.analytics.approved_ads||0} إعلان معتمد`}/></div><div className="portal-columns"><section className="dashboard-panel"><PanelTitle kicker="ابدأ من هنا" title="طلبات بانتظار القرار"/><QueueOverview businesses={data.businesses} ads={data.ads} onOpen={setTab}/></section><SettingsPanel permissions={permissions} maintenanceOn={maintenanceOn} setMaintenanceOn={setMaintenanceOn} autoFeatured={data.autoFeatured} setAutoFeatured={(value)=>setData((old)=>({...old,autoFeatured:value}))} onAction={action}/></div></>}
    {tab === 'listings' && <ListingModeration rows={data.businesses} busy={busy} onReview={(payload)=>demoMode?demoAction((d)=>({...d,businesses:d.businesses.map((b)=>b.id===payload.id?{...b,status:payload.status,moderation_note:payload.note,is_featured:payload.featured??b.is_featured}:b)}),'تم تحديث حالة النشاط في المعاينة المحلية.'):action(()=>reviewBusiness(payload),'تم تحديث حالة النشاط.')}/>}
    {tab === 'ads' && <AdModeration rows={data.ads} busy={busy} onReview={(payload)=>demoMode?demoAction((d)=>({...d,ads:d.ads.map((a)=>a.id===payload.id?{...a,status:payload.status,moderation_reason:payload.reason}:a)}),'تم تحديث حالة الإعلان في المعاينة المحلية.'):action(()=>reviewAd(payload),'تم تحديث حالة الإعلان.')}/>}
    {tab === 'reviews' && <ReviewModeration rows={data.reviews} onChat={setChatFor}/>}
    {tab === 'users' && <AccountModeration rows={data.users} total={data.usersTotal??data.users.length} busy={busy} canManageRoles={permissions.includes('roles.manage')} onSearch={(value)=>loadUsers(value,false)} onLoadMore={()=>loadUsers(userSearch,true)} onStatus={(id,status)=>demoMode?demoAction((d)=>({...d,users:d.users.map((u)=>u.id===id?{...u,account_status:status}:u)}),'تم تحديث حالة الحساب محليًا.'):action(()=>updateAccountStatus(id,status),'تم تحديث حالة الحساب.')} onResidence={(id,value)=>action(()=>verifyUserResidence(id,value),value?'تم اعتماد عنوان السكن.':'تم إلغاء اعتماد عنوان السكن.')} onRole={(id,role,enabled)=>demoMode?demoAction((d)=>({...d,users:d.users.map((u)=>{if(u.id!==id)return u;const current=(u.user_roles||[]).filter((x)=>x.roles?.role_key!==role);return {...u,user_roles:enabled?[...current,{roles:{role_key:role}}]:current};})}),enabled?'تمت إضافة دور الحساب محليًا.':'تمت إزالة دور الحساب محليًا.'):action(()=>setUserRole(id,role,enabled),enabled?'تمت إضافة دور الحساب.':'تمت إزالة دور الحساب.')}/>}
    {tab === 'audit' && <AuditLog rows={data.audit}/>}
    {tab === 'maintenance' && <MaintenanceModeration rows={data.reports} busy={busy} onStatus={(id,status)=>demoMode?demoAction((d)=>({...d,reports:d.reports.map((r)=>r.id===id?{...r,status}:r)}),'تم تحديث البلاغ محليًا.'):action(()=>updateMaintenanceReportStatus(id,status),'تم تحديث البلاغ.')}/>}
    {tab === 'settings' && <SettingsPanel permissions={permissions} maintenanceOn={maintenanceOn} setMaintenanceOn={setMaintenanceOn} autoFeatured={data.autoFeatured} setAutoFeatured={(value)=>setData((old)=>({...old,autoFeatured:value}))} onAction={action}/>}
    {chatFor && <AdminChat resident={chatFor} onClose={()=>setChatFor(null)} showToast={showToast}/>}
  </div>;
}

function ListingModeration({ rows, busy, onReview }) {
  const [notes, setNotes] = useState({}); const [verifiedLocations,setVerifiedLocations]=useState({}); const pending = rows.filter((row) => ['pending_review','changes_requested'].includes(row.status));
  return <section className="dashboard-panel moderation-panel"><PanelTitle kicker="التحقق قبل النشر" title={`طلبات الأنشطة · ${pending.length} معلّق`}/>{pending.length ? pending.map((b) => <article className="moderation-row" key={b.id}><img src={b.cover_image_url || '/brand/nargis-logo.png'} alt=""/><div className="moderation-body"><div className="moderation-title"><div><b>{b.name}</b><small>{b.category} · {b.district || 'مهنة حرة'}{b.mall ? ` · ${b.mall}` : ''}</small></div><span className="pill-status pending_review">{statusArabic[b.status]}</span></div><p>{b.description}</p><small className="moderation-contact">{b.contact_phone || 'بدون رقم تواصل'} · {fmtDate(b.created_at)}</small>{b.listing_kind==='business' ? b.pin_lat && b.pin_lng ? <><a className="map-review-link" href={`https://www.google.com/maps?q=${b.pin_lat},${b.pin_lng}`} target="_blank" rel="noreferrer"><Building2 size={14}/> راجع دبوس الموقع <ArrowUpRight size={13}/></a><label className="check-field location-check"><input type="checkbox" checked={Boolean(verifiedLocations[b.id])} onChange={(e)=>setVerifiedLocations((old)=>({...old,[b.id]:e.target.checked}))}/><span>تحققت أن الدبوس داخل النرجس 1 أو 2 وداخل مقر النشاط.</span></label></> : <InlineNotice tone="error" text="لا يمكن اعتماد نشاط تجاري بدون دبوس موقع."/> : <InlineNotice text="موقع المهنة الحرة اختياري، ويمكن اعتمادها بدون دبوس."/>}<label className="field-label"><span>ملاحظة للمالك في حالة طلب التعديل أو الرفض</span><input value={notes[b.id]||''} onChange={(e)=>setNotes((old)=>({...old,[b.id]:e.target.value}))} placeholder="اكتب ملاحظة واضحة…"/></label><div className="moderation-actions"><button disabled={busy} onClick={()=>onReview({id:b.id,status:'changes_requested',note:notes[b.id]||'يرجى استكمال بيانات النشاط.',verifyLocation:false})}>طلب تعديل</button><button className="reject" disabled={busy} onClick={()=>onReview({id:b.id,status:'rejected',note:notes[b.id]||'لم يستوفِ شروط النشر.',verifyLocation:false})}>رفض الطلب</button><button className="approve" disabled={busy || (b.listing_kind==='business' && (!b.pin_lat || !verifiedLocations[b.id]))} onClick={()=>onReview({id:b.id,status:'approved',note:null,verifyLocation:b.listing_kind==='business'})}><Check size={15}/> اعتماد ونشر</button></div></div></article>) : <EmptyInline text="مفيش طلبات نشاطات معلّقة."/>}{rows.filter((row)=>row.status==='approved').slice(0,5).map((b)=><div className="simple-table-row" key={b.id}><span><b>{b.name}</b><small>{b.category} · {b.district||'مهنة حرة'}</small></span><button className={`feature-pill ${b.is_featured?'selected':''}`} onClick={()=>onReview({id:b.id,status:'approved',note:null,verifyLocation:false,featured:!b.is_featured})}>{b.is_featured?'ظاهر في الرئيسية':'إضافة للرئيسية'}</button></div>)}</section>;
}

function AdModeration({ rows, busy, onReview }) { const pending=rows.filter((row)=>row.status==='pending_review'); return <section className="dashboard-panel moderation-panel"><PanelTitle kicker="موافقة مشرف الدعاية" title={`الإعلانات · ${pending.length} معلّق`}/>{pending.length ? pending.map((ad)=><article className="moderation-row ad-moderation" key={ad.id}>{ad.image_url && <img src={ad.image_url} alt=""/>}<div className="moderation-body"><div className="moderation-title"><div><b>{ad.title}</b><small>{ad.businesses?.name} · {ad.category} · {fmtDate(ad.created_at)}</small></div><span className="pill-status pending_review">قيد المراجعة</span></div><p>{ad.body}</p>{ad.gallery?.length>1&&<div className="detail-gallery">{ad.gallery.map((url,index)=><img src={url} key={`${ad.id}-${index}`} alt={`${ad.title} · ${index+1}`}/>)}</div>}<div className="moderation-actions"><button className="reject" disabled={busy} onClick={()=>onReview({id:ad.id,status:'rejected',reason:'لم يستوفِ ضوابط الإعلان.'})}>رفض الإعلان</button><button className="approve" disabled={busy} onClick={()=>onReview({id:ad.id,status:'approved',reason:null})}><Check size={15}/> موافقة ونشر</button></div></div></article>) : <EmptyInline text="مفيش إعلانات منتظرة المراجعة."/>}<div className="divider-label">سجل الإعلانات</div>{rows.filter((row)=>row.status!=='pending_review').slice(0,8).map((ad)=><div className="simple-table-row" key={ad.id}><span><b>{ad.title}</b><small>{ad.businesses?.name}</small></span><span className={`pill-status ${ad.status}`}>{statusArabic[ad.status]||ad.status}</span></div>)}</section>; }

function ReviewModeration({ rows, onChat }) { return <section className="dashboard-panel moderation-panel"><PanelTitle kicker="الإدارة فقط" title="تقييمات وتعليقات خاصة"/><div className="owner-private-note"><ShieldCheck size={17}/> السكان لا يرون هوية بعضهم أو التعليقات النصية. هذه الصفحة متاحة لحسابات الصلاحية فقط.</div>{rows.length ? rows.map((review)=><div className="private-review-row" key={review.id}><div className="review-rating"><span>{'★'.repeat(review.score)}{'☆'.repeat(5-review.score)}</span><small>{fmtDate(review.created_at)} · {review.businesses?.name}</small></div><p>{review.business_review_comments?.[0]?.comment || 'تقييم بالنجوم فقط، بدون تعليق.'}</p><div className="reviewer-contact"><span><b>{review.profiles?.display_name || 'مستخدم'}</b><small>{review.profiles?.phone || 'رقم غير متاح'}</small></span>{review.profiles?.phone && <a href={`https://wa.me/${review.profiles.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">واتساب</a>}<button onClick={()=>onChat({id:review.reviewer_id,name:review.profiles?.display_name||'مستخدم',phone:review.profiles?.phone})}><MessageCircle size={14}/> محادثة</button></div></div>) : <EmptyInline text="لا توجد تقييمات حتى الآن."/>}</section>; }

function AccountModeration({ rows, total=rows.length, busy, canManageRoles, onSearch, onLoadMore, onStatus, onResidence, onRole }) { const actions=[['active','تنشيط'],['suspended','تعليق'],['disabled','إيقاف'],['deleted','حذف ناعم']];const[roleChoice,setRoleChoice]=useState({});const[query,setQuery]=useState('');const availableRoles=['business_owner','ad_supervisor','maintenance_supervisor','admin'];return <section className="dashboard-panel moderation-panel"><PanelTitle kicker="إدارة الحسابات" title={`الحسابات · ${total} نتيجة`}/><form className="directory-toolbar" onSubmit={(e)=>{e.preventDefault();onSearch(query);}}><div className="search-field"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم الهاتف"/></div><button className="button-outline" disabled={busy}>بحث</button></form>{rows.map((user)=>{const roles=(user.user_roles||[]).map((x)=>x.roles?.role_key).filter(Boolean);const choice=roleChoice[user.id]||availableRoles[0];return <div className="account-row account-row-expanded" key={user.id}><span className="queue-avatar">{(user.display_name||user.phone||'؟')[0]}</span><span className="portal-row-main"><b>{user.display_name||'حساب جديد'}</b><small>{user.phone||user.id} · {fmtDate(user.created_at)}</small><small>{roles.join('، ')||'ساكن'}</small>{user.residence_district&&<small>السكن: {user.residence_district} · عمارة {user.building_number} · شقة {user.apartment_number} · {user.residence_verified?'معتمد':'بانتظار التحقق'}</small>}</span><span className={`pill-status ${user.account_status}`}>{statusArabic[user.account_status]}</span><select aria-label={`حالة ${user.display_name||user.phone}`} value={user.account_status} disabled={busy} onChange={(e)=>onStatus(user.id,e.target.value)}>{actions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{user.residence_district&&<button className="button-outline" disabled={busy} onClick={()=>onResidence(user.id,!user.residence_verified)}>{user.residence_verified?'إلغاء اعتماد السكن':'اعتماد السكن'}</button>}{canManageRoles&&<><select aria-label="الدور الإداري" value={choice} onChange={(e)=>setRoleChoice((old)=>({...old,[user.id]:e.target.value}))}>{availableRoles.map((role)=><option key={role} value={role}>{({business_owner:'صاحب نشاط',ad_supervisor:'مشرف دعاية',maintenance_supervisor:'مشرف صيانة',admin:'مدير رئيسي'})[role]}</option>)}</select><button className="button-outline" disabled={busy} onClick={()=>onRole(user.id,choice,!roles.includes(choice))}>{roles.includes(choice)?'إزالة الدور':'إضافة الدور'}</button></>}</div>;})}{rows.length===0&&<EmptyInline text="مفيش حسابات مطابقة."/>}{rows.length<total&&<button className="button-outline full-button" disabled={busy} onClick={onLoadMore}>تحميل حسابات إضافية</button>}</section>; }

function AuditLog({rows}){return <section className="dashboard-panel moderation-panel"><PanelTitle kicker="سجل تغييرات غير قابل للتعديل من الواجهة" title={`آخر الإجراءات · ${rows.length}`}/>{rows.length?rows.map((row)=><div className="portal-row" key={row.id}><span className="ticket-icon"><ShieldCheck size={15}/></span><span className="portal-row-main"><b>{row.action} · {row.entity_type}</b><small>{row.entity_id||'—'} · {new Date(row.created_at).toLocaleString('ar-EG')}</small>{Object.keys(row.details||{}).length>0&&<small>{JSON.stringify(row.details)}</small>}</span><small>منفذ: {row.actor_id?.slice(0,8)||'النظام'}</small></div>):<EmptyInline text="لا توجد إجراءات مسجلة بعد."/>}</section>;}

function MaintenanceModeration({ rows, busy, onStatus }) { return <section className="dashboard-panel moderation-panel"><PanelTitle kicker="فريق الصيانة فقط" title={`بلاغات خاصة · ${rows.length}`}/>{rows.length ? rows.map((r)=><div className="report-admin-row" key={r.id}><span className="ticket-icon"><Wrench size={16}/></span><span className="portal-row-main"><b>{r.category} · عمارة {r.building_number}{r.apartment_number?` · شقة ${r.apartment_number}`:''}</b><small>{r.description}</small><small>صاحب البلاغ: {r.resident_id.slice(0,8)}… · {fmtDate(r.created_at)}</small></span><select aria-label="حالة البلاغ" value={r.status} disabled={busy} onChange={(e)=>onStatus(r.id,e.target.value)}>{['جديد','قيد المتابعة','بحاجة لمعلومات','تم الحل','مغلق'].map((s)=><option key={s}>{s}</option>)}</select></div>) : <EmptyInline text="لا توجد بلاغات صيانة."/>}</section>; }

function SettingsPanel({ permissions, maintenanceOn, setMaintenanceOn, autoFeatured, setAutoFeatured, onAction }) {
  const saveFeatured = (value) => onAction(async()=>{if(demoMode){const d=readDemo();writeDemo({...d,autoFeatured:value});}else await updateHomepageMode(value);setAutoFeatured(value);},demoMode?'تم حفظ إعداد الرئيسية محليًا.':'تم حفظ إعداد ظهور الرئيسية.');
  const saveMaintenance = (value) => onAction(async()=>{if(demoMode){const d=readDemo();writeDemo({...d,maintenanceOn:value});}else await updateMaintenanceModuleState(value);setMaintenanceOn(value);},value?'تم تفعيل قسم الصيانة.':'تم إخفاء قسم الصيانة مع حفظ البيانات.');
  return <section className="dashboard-panel"><PanelTitle kicker="إعدادات المنصة" title="التحكم العام"/>{permissions.includes('homepage.manage')&&<div className="setting-row"><span><b>الظهور التلقائي للرئيسية</b><small>لو أوقفته، استخدم أزرار الإبراز اليدوي من صفحة الأنشطة.</small></span><Toggle initial={autoFeatured} onChange={saveFeatured}/></div>}{permissions.includes('settings.manage')&&<div className="setting-row"><span><b>قسم الصيانة</b><small>إخفاء كامل من الواجهة مع حفظ البلاغات السابقة.</small></span><Toggle initial={maintenanceOn} onChange={saveMaintenance}/></div>}{permissions.includes('roles.manage')&&<div className="setting-row"><span><b>الأدوار والصلاحيات</b><small>إضافة أدوار جاهزة من تبويب الحسابات؛ الإجراءات تسجل في سجل الإدارة.</small></span><span className="pill-status">{Object.keys(permissionNames).length} صلاحيات</span></div>}{permissions.includes('settings.manage')&&<GeoFenceSettings onAction={onAction}/>}<div className="setting-row"><span><b>حساب الصلاحيات الحالية</b><small>{permissions.map((p)=>permissionNames[p]||p).join(' · ')}</small></span></div></section>;
}

function GeoFenceSettings({onAction}) {
  const [values,setValues]=useState({'النرجس 1':'','النرجس 2':''});
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{fetchDistrictGeofences().then((rows)=>{setValues((old)=>({...old,...Object.fromEntries(rows.map((r)=>[r.district,JSON.stringify(r.boundary_geojson,null,2)]))}));setLoaded(true);}).catch(()=>setLoaded(true));},[]);
  const save=(district)=>onAction(async()=>{let geojson;try{geojson=JSON.parse(values[district]);}catch{throw new Error('صيغة GeoJSON غير صحيحة.');}await saveDistrictGeofence(district,geojson);},`تم حفظ حدود ${district}.`);
  return <div className="geofence-settings"><PanelTitle kicker="منع الإدراج خارج النرجس" title="حدود النرجس الجغرافية"/><p className="modal-copy">الصق شكل GeoJSON من نوع Polygon أو MultiPolygon للمنطقة. النظام سيرفض اعتماد أي متجر أو نشاط تجاري يقع دبوسه خارج الحدود. لا تضع إحداثيات تقديرية.</p>{['النرجس 1','النرجس 2'].map((district)=><label className="field-label" key={district}>{district}<textarea rows="5" spellCheck="false" placeholder={loaded?'الصق GeoJSON للهندسة فقط…':'جارٍ تحميل الحد الحالي…'} value={values[district]} onChange={(e)=>setValues((old)=>({...old,[district]:e.target.value}))}/><button className="button-outline" type="button" disabled={!values[district]?.trim()} onClick={()=>save(district)}>حفظ حد المنطقة</button></label>)}</div>;
}

function QueueOverview({ businesses, ads, onOpen }) { const pendingB=businesses.filter((x)=>x.status==='pending_review').length; const pendingA=ads.filter((x)=>x.status==='pending_review').length; return <>{pendingB>0&&<button className="queue-summary-row" onClick={()=>onOpen('listings')}><Store size={17}/><span>طلبات نشاط جديدة</span><b>{pendingB}</b><ChevronLeft size={15}/></button>}{pendingA>0&&<button className="queue-summary-row" onClick={()=>onOpen('ads')}><Tag size={17}/><span>إعلانات تنتظر موافقة المشرف</span><b>{pendingA}</b><ChevronLeft size={15}/></button>}{pendingA+pendingB===0&&<EmptyInline text="كل طلبات المراجعة محدثة."/>}</>; }
function AdminChat({ resident, onClose, showToast }) { const [messages,setMessages]=useState([]); const [text,setText]=useState(''); const [error,setError]=useState(''); async function load(){try{setMessages(await fetchPrivateMessages(resident.id)||[]);}catch(e){setError(e.message);}} useEffect(()=>{load();const id=setInterval(load,10000);return()=>clearInterval(id);},[resident.id]); async function send(e){e.preventDefault();if(!text.trim())return;try{await sendPrivateMessage({residentId:resident.id,message:text.trim()});setText('');await load();showToast('تم إرسال الرسالة الخاصة.');}catch(e){setError(e.message);}} return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal-panel chat-panel"><button className="modal-close" onClick={onClose}><X size={17}/></button><div className="modal-content"><span className="section-kicker">محادثة خاصة · الإدارة والمستخدم فقط</span><h2>مراسلة {resident.name}</h2>{resident.phone&&<a className="text-link" href={`https://wa.me/${resident.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">فتح واتساب <ArrowUpRight size={14}/></a>}{error&&<InlineNotice tone="error" text={error}/>}<div className="chat-messages">{messages.map((m)=><p className={m.author_id===resident.id?'incoming':'outgoing'} key={m.id}>{m.message}<small>{fmtDate(m.created_at)}</small></p>)}{!messages.length&&<EmptyInline text="ابدأوا المحادثة برسالة خاصة."/>}</div><form className="chat-compose" onSubmit={send}><input value={text} onChange={(e)=>setText(e.target.value)} maxLength={2000} placeholder="اكتب رسالة خاصة…"/><button className="button-primary">إرسال <ArrowLeft size={14}/></button></form></div></section></div>; }

function PortalHeading({ kicker,title,detail,action }){return <div className="page-heading"><div><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{detail}</p></div>{action}</div>;}
function PanelTitle({kicker,title,action}){return <div className="section-heading panel-title"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div>{action}</div>;}
function StatCard({icon,label,value,note}){return <div className="stat-card"><span className="stat-icon">{icon}</span><small>{label}</small><b>{value}</b><span>{note}</span></div>;}
function EmptyInline({text}){return <div className="empty-inline">{text}</div>;}
function EmptyPanel({title,text,action}){return <div className="empty-state"><Building2 size={23}/><b>{title}</b><span>{text}</span>{action}</div>;}
function LoadingPanel(){return <div className="empty-state"><span className="loading-spinner"/><b>لحظة، بنحمّل بياناتك</b></div>;}
function InlineNotice({text,tone='',onRetry}){return <div className={`inline-notice ${tone}`}>{text}{onRetry&&<button onClick={onRetry}>إعادة المحاولة</button>}</div>;}
function Toggle({initial,onChange}){const[on,setOn]=useState(initial);useEffect(()=>setOn(initial),[initial]);return <button type="button" aria-pressed={on} className={`toggle ${on?'on':''}`} onClick={()=>{setOn(!on);onChange?.(!on);}}><i/></button>;}
