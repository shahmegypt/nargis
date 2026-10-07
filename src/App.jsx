import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, BadgeCheck, Bell, Bookmark, BriefcaseBusiness, Building2, ImagePlus,
  CalendarDays, Check, ChevronDown, ChevronLeft, CircleHelp, Clock3, Coffee, Compass, Copy, Filter,
  Flame, Heart, House, MapPin, Menu, MessageCircle, MoreHorizontal, Navigation, Plus, Search, Settings,
  ShieldCheck, SlidersHorizontal, Sparkles, Star, Store, Tag, Utensils, Wrench, X,
} from 'lucide-react';
import { areas, businesses, categories, policies, samplePrivateReviews } from './data';
import { isBackendConfigured, supabase, getMyAccessContext, fetchCurrentRequiredPolicies, acceptPolicies, fetchApprovedBusinesses, fetchPublicOffers, fetchMyBusinesses, fetchMyMaintenanceReports, fetchMaintenanceModuleState, fetchMyNotifications, markNotificationsRead, recordBusinessView, submitBusinessRating, submitMaintenanceReport, submitBusinessListing, submitOwnerAdvertisement, requestLoginCode, verifyLoginCode, updateOwnerBusiness } from './supabase';
import { enablePushNotifications } from './notifications';
import { AdminPortal, OwnerPortal, saveDemoBusiness, saveDemoAdvertisement } from './portals';

const iconFor = { مطاعم: Utensils, كافيهات: Coffee, مخبوزات: Sparkles, صيدليات: Heart, 'سوبر ماركت': Store, 'خدمات ومهن': Wrench, 'عناية وجمال': Sparkles };
const nav = [{ id: 'discover', label: 'اكتشف', Icon: Compass }, { id: 'directory', label: 'الدليل', Icon: Store }, { id: 'offers', label: 'العروض', Icon: Tag }, { id: 'maintenance', label: 'الصيانة', Icon: Wrench }];

function App() {
  const [page, setPage] = useState(()=>['discover','directory','offers','maintenance','owner','admin'].includes(window.location.pathname.replace(/^\//,''))?window.location.pathname.replace(/^\//,''):'discover');
  const [directoryData, setDirectoryData] = useState(businesses);
  const [directoryOffset, setDirectoryOffset] = useState(0);
  const [hasMoreBusinesses, setHasMoreBusinesses] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [liveOffers, setLiveOffers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [category, setCategory] = useState('الكل');
  const [area, setArea] = useState('الكل');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [role, setRole] = useState('resident');
  const [session, setSession] = useState(null);
  const [accessContext, setAccessContext] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [policyBlocked, setPolicyBlocked] = useState(false);
  const [maintenanceOn, setMaintenanceOn] = useState(true);
  const [saved, setSaved] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [queryFilter, setQueryFilter] = useState('تلقائي');
  const [rating, setRating] = useState(0);

  const filtered = useMemo(() => {
    const query=search.trim().toLocaleLowerCase('ar');
    const rows=directoryData.filter((b)=>(category==='الكل'||b.category===category)&&(area==='الكل'||b.district===area)&&(!query||`${b.name} ${b.category} ${b.description}`.toLocaleLowerCase('ar').includes(query)));
    if(queryFilter==='الأعلى تقييمًا') rows.sort((a,b)=>Number(b.rating||0)-Number(a.rating||0));
    if(queryFilter==='العروض أولًا') rows.sort((a,b)=>Number(liveOffers.some((ad)=>ad.business_id===b.id))-Number(liveOffers.some((ad)=>ad.business_id===a.id)));
    if(queryFilter==='الأحدث') rows.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
    return rows;
  }, [directoryData, category, area, search, queryFilter, liveOffers]);
  useEffect(() => {
    if (!isBackendConfigured) return;
    setDirectoryLoading(true);
    fetchApprovedBusinesses({ offset:0, limit:30 }).then((rows) => { setHasMoreBusinesses(rows.length===30); setDirectoryOffset(rows.length); setDirectoryData(rows.map((b) => {
      const summary = Array.isArray(b.business_rating_summaries) ? b.business_rating_summaries[0] : b.business_rating_summaries;
      return { ...b, rating: Number(summary?.average_rating || 0), ratingCount: summary?.rating_count || 0, distance: b.mall || b.district, phone: b.contact_phone, open: true, verified: true, image: b.cover_image_url || '/brand/nargis-logo.png', offer: null, offerTag: null };
    })); }).catch((error) => showToast(error.message || 'تعذر تحميل دليل الأنشطة.')).finally(()=>setDirectoryLoading(false));
  }, []);
  useEffect(()=>{const openAccount=()=>setModal('account');window.addEventListener('nargis:open-account',openAccount);return()=>window.removeEventListener('nargis:open-account',openAccount);},[]);
  async function loadMoreBusinesses() {
    if (directoryLoading || !hasMoreBusinesses) return;
    setDirectoryLoading(true);
    try {
      const rows = await fetchApprovedBusinesses({ offset:directoryOffset, limit:30 });
      const mapped = rows.map((b)=>{ const summary=Array.isArray(b.business_rating_summaries)?b.business_rating_summaries[0]:b.business_rating_summaries; return {...b,rating:Number(summary?.average_rating||0),ratingCount:summary?.rating_count||0,distance:b.mall||b.district,phone:b.contact_phone,open:true,verified:true,image:b.cover_image_url||'/brand/nargis-logo.png',offer:null,offerTag:null}; });
      setDirectoryData((old)=>[...old,...mapped]); setDirectoryOffset((old)=>old+rows.length); setHasMoreBusinesses(rows.length===30);
    } catch(error) { showToast(error.message||'تعذر تحميل المزيد.'); }
    finally { setDirectoryLoading(false); }
  }
  useEffect(() => {
    if (!isBackendConfigured) return;
    fetchPublicOffers().then((rows) => setLiveOffers(rows || [])).catch((error) => showToast(error.message || 'تعذر تحميل العروض.'));
  }, []);
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(''), 3000); };
  const demoMode = import.meta.env.DEV && !isBackendConfigured;
  const demoAdminContext = { user_id:'demo-admin', roles:['admin'], permissions:['accounts.manage','listings.review','ads.review','reviews.read_private','maintenance.manage','analytics.read','homepage.manage','roles.manage','settings.manage'] };
  const go = (next) => {
    if (policyBlocked && !demoMode && next !== 'discover') { setModal('policy-acceptance'); showToast('وافق على السياسات الحالية أولًا لمتابعة استخدام التطبيق.'); return; }
    if (next === 'admin' && !demoMode && !accessContext?.permissions?.length) { setModal('account'); showToast('سجّل الدخول بحساب إداري لفتح اللوحة.'); return; }
    if (next === 'owner' && !demoMode && !session) { setModal('account'); showToast('سجّل الدخول أولًا لفتح مساحة صاحب النشاط.'); return; }
    if (next === 'maintenance' && !demoMode && !session) { setModal('account'); showToast('سجّل الدخول لمشاهدة بلاغاتك الخاصة.'); return; }
    setPage(next); window.history.replaceState({},'',next==='discover'?'/':`/${next}`); setSelected(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let alive = true;
    const syncSession = async (nextSession) => {
      if (!alive) return;
      setSession(nextSession || null);
      if (!nextSession) { setAccessContext(null); setRole('resident'); setAuthLoading(false); return; }
      setAuthLoading(true);
      try {
        const context = await getMyAccessContext();
        if (!alive) return;
        setAccessContext(context);
        const currentPolicies = await fetchCurrentRequiredPolicies();
        const acceptedSet = new Set((context?.accepted_policies || []).map((p) => `${p.key}:${p.version}`));
        const missingPolicies = (currentPolicies || []).some((p) => !acceptedSet.has(`${p.policy_key}:${p.version}`));
        setPolicyBlocked(missingPolicies);
        if (missingPolicies) setModal('policy-acceptance');
        const keys = context?.roles || [];
        setRole(keys.includes('admin') || (context?.permissions || []).includes('accounts.manage') ? 'admin' : keys.includes('business_owner') ? 'owner' : 'resident');
        if (context?.account_status !== 'active') { await supabase.auth.signOut(); showToast('الحساب غير نشط. تواصل مع الإدارة.'); }
      } catch (error) { if (alive) showToast(error.message || 'تعذر تحميل صلاحيات الحساب.'); }
      finally { if (alive) setAuthLoading(false); }
    };
    supabase.auth.getSession().then(({ data }) => syncSession(data.session)).catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      window.setTimeout(() => syncSession(nextSession), 0);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!isBackendConfigured) return;
    fetchMaintenanceModuleState().then(setMaintenanceOn).catch(() => {});
  }, []);
  useEffect(()=>{if(selected?.id&&session)recordBusinessView(selected.id).catch(()=>{});},[selected?.id,session?.user?.id]);
  useEffect(() => {
    if (page !== 'maintenance' || !session) return;
    fetchMyMaintenanceReports().then((rows) => setTickets((rows || []).map((r) => ({ id:r.id.slice(0,8), title:`${r.category} · عمارة ${r.building_number}${r.apartment_number ? ` · شقة ${r.apartment_number}` : ''}`, category:r.category, status:r.status, date:new Date(r.created_at).toLocaleDateString('ar-EG') })))).catch((error) => showToast(error.message || 'تعذر تحميل بلاغاتك.'));
  }, [page, session?.user?.id]);

  async function sendRating(event) {
    event.preventDefault();
    try { await submitBusinessRating({ businessId: selected.id, score: rating, comment: event.currentTarget.comment.value }); showToast(isBackendConfigured ? 'وصل تقييمك، وسيظهر لصاحب النشاط والإدارة فقط.' : 'تم حفظ التقييم في وضع العرض التجريبي.'); setModal(''); }
    catch (err) { showToast(err.message || 'تعذر إرسال التقييم.'); }
  }
  async function acceptRequiredPolicies() {
    try {
      const current = await fetchCurrentRequiredPolicies();
      await acceptPolicies(session.user.id, current || []);
      const context = await getMyAccessContext();
      setAccessContext(context); setPolicyBlocked(false); setModal('');
      showToast('تم حفظ موافقتك على السياسات الحالية.');
    } catch (error) { showToast(error.message || 'تعذر حفظ الموافقة.'); }
  }
  async function sendMaintenance(event) {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const payload = { category: fd.get('category'), description: fd.get('description'), residence_district:fd.get('district'), building_number: fd.get('building'), apartment_number: fd.get('apartment') };
    try { const result=await submitMaintenanceReport(payload); if(result?.needsVerification){showToast('حفظنا عنوان سكنك للمراجعة. هتقدر ترسل البلاغ بعد اعتماد الإدارة لعنوانك.');setModal('');return;} setTickets((old) => [{ id: `NR-${Math.floor(2100 + Math.random() * 700)}`, title: `${payload.category}`, category: payload.category, status: 'جديد', date: 'الآن' }, ...old]); showToast(isBackendConfigured ? 'تم إرسال البلاغ بشكل خاص.' : 'تم تسجيل البلاغ في العرض التجريبي.'); setModal(''); }
    catch (err) { showToast(err.message || 'تعذر إرسال البلاغ.'); }
  }
  async function sendListing(event) {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const payload = { id:fd.get('business_id') || null, name: fd.get('name'), category: fd.get('category'), district: fd.get('district') || null, mall: fd.get('mall') || null, listing_kind: fd.get('kind') === 'مهنة حرة' ? 'freelancer' : 'business', description: fd.get('description'), contact_phone: fd.get('phone'), whatsapp: fd.get('whatsapp') || null, pin_lat: fd.get('pin_lat') ? Number(fd.get('pin_lat')) : null, pin_lng: fd.get('pin_lng') ? Number(fd.get('pin_lng')) : null, location_attested: Boolean(fd.get('pin_lat')), images: fd.getAll('images').filter((file) => file instanceof File && file.size > 0) };
    try { if (payload.id && isBackendConfigured) await updateOwnerBusiness(payload.id,payload); else if (isBackendConfigured) await submitBusinessListing(payload); else { saveDemoBusiness(payload); window.dispatchEvent(new Event('nargis:demo-refresh')); } showToast(isBackendConfigured ? 'وصل التعديل للمراجعة قبل النشر.' : 'تم حفظ طلبك في المعاينة المحلية للمراجعة.'); setModal(''); }
    catch (err) { showToast(err.message || 'تعذر إرسال الطلب.'); }
  }
  async function sendOwnerAd(event) {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const payload = { business_id: fd.get('business_id'), title: fd.get('title'), body: fd.get('body'), category: fd.get('category'), starts_at: fd.get('starts_at') || null, ends_at: fd.get('ends_at') || null, images: fd.getAll('images').filter((file) => file instanceof File && file.size > 0) };
    try { if (isBackendConfigured) await submitOwnerAdvertisement(payload); else { saveDemoAdvertisement(payload); window.dispatchEvent(new Event('nargis:demo-refresh')); } showToast(isBackendConfigured ? 'وصل إعلانك للمشرف المختص للمراجعة.' : 'تم حفظ الإعلان في المعاينة المحلية للمراجعة.'); setModal(''); }
    catch (err) { showToast(err.message || 'تعذر إرسال الإعلان.'); }
  }

  return <div className="app-shell" dir="rtl">
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={() => go('discover')} aria-label="الرئيسية"><img src="/brand/nargis-logo.png"/><span><b>النرجس</b><small>قريب منك، كل يوم</small></span></button>
        <nav className="desktop-nav">{nav.filter((item) => maintenanceOn || item.id !== 'maintenance').map(({ id, label }) => <button className={page === id ? 'active' : ''} key={id} onClick={() => go(id)}>{label}{id === 'offers' && <i className="nav-dot"/>}</button>)}</nav>
        <div className="top-actions"><button className="icon-button notification" onClick={() => setModal('notifications')} aria-label="الإشعارات"><Bell size={19}/><i/></button><button className="profile-chip" onClick={() => session ? go(role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'account') : setModal('account')}><span className="avatar">{session ? (accessContext?.display_name || session.user.phone || 'م').slice(0,1) : 'م'}</span><span className="profile-copy"><b>{session ? `أهلًا ${accessContext?.display_name || ''}` : 'مساء الخير'}</b><small>{session ? role === 'admin' ? 'الإدارة' : role === 'owner' ? 'صاحب نشاط' : 'ساكن النرجس' : 'ضيف النرجس'}</small></span><ChevronDown size={15}/></button><button className="mobile-menu icon-button" onClick={() => setModal('menu')} aria-label="القائمة"><Menu/></button></div>
      </div>
    </header>

    <main>
      {selected ? <BusinessDetail business={selected} onBack={() => setSelected(null)} onRate={() => { setRating(0); setModal('rating'); }} onToast={showToast} onSave={() => setSaved(saved.includes(selected.id) ? saved.filter((x) => x !== selected.id) : [...saved, selected.id])} saved={saved.includes(selected.id)} /> : <>
        {page === 'discover' && <Discover businesses={filtered} setSelected={setSelected} category={category} setCategory={setCategory} area={area} setArea={setArea} search={search} setSearch={setSearch} setPage={go} setModal={setModal} queryFilter={queryFilter} setQueryFilter={setQueryFilter} saved={saved} onSave={(id) => setSaved(saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id])} />}
        {page === 'directory' && <Directory businesses={filtered} setSelected={setSelected} category={category} setCategory={setCategory} area={area} setArea={setArea} search={search} setSearch={setSearch} setModal={setModal} setQueryFilter={setQueryFilter} queryFilter={queryFilter} onLoadMore={loadMoreBusinesses} hasMore={hasMoreBusinesses} loading={directoryLoading} />}
        {page === 'offers' && <Offers businesses={directoryData} advertisements={liveOffers} setSelected={setSelected} />}
        {page === 'maintenance' && maintenanceOn && <Maintenance tickets={tickets} onNew={() => setModal('maintenance')} />}
        {page === 'owner' && <OwnerPortal context={accessContext} openListing={(business) => { setEditingBusiness(business || null); setModal('listing'); }} openAd={() => setModal('advertisement')} showToast={showToast} />}
        {page === 'admin' && <AdminPortal context={demoMode ? demoAdminContext : accessContext} maintenanceOn={maintenanceOn} setMaintenanceOn={setMaintenanceOn} showToast={showToast} />}
      </>}
    </main>

    <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><img src="/brand/nargis-logo.png"/><span><b>النرجس</b><small>دليلك المحلي لحياة أقرب</small></span></div><div className="footer-links"><button onClick={() => setModal('about')}>عن التطبيق</button><button onClick={() => setModal('policies')}>الخصوصية والسياسات</button><button onClick={() => setModal('support')}>خدمة العملاء</button></div><span className="copyright">© 2026 مجتمع النرجس</span></div></footer>
    <div className="mobile-tabbar">{nav.filter((item) => maintenanceOn || item.id !== 'maintenance').map(({ id, label, Icon }) => <button key={id} onClick={() => go(id)} className={page === id ? 'active' : ''}><Icon size={20}/><small>{label}</small></button>)}</div>

    {modal && <Modal type={modal} onClose={() => {setModal('');setEditingBusiness(null);}} onRating={sendRating} rating={rating} setRating={setRating} onMaintenance={sendMaintenance} onListing={sendListing} editingBusiness={editingBusiness} onAdSubmit={sendOwnerAd} onAcceptPolicies={acceptRequiredPolicies} session={session} showToast={showToast} setModal={setModal} maintenanceOn={maintenanceOn} setRole={setRole} role={role} go={go} queryFilter={queryFilter} setQueryFilter={setQueryFilter} category={category} setCategory={setCategory} area={area} setArea={setArea} />}
    {!modal && <button className="support-launcher" onClick={() => setModal('support')} aria-label="افتح خدمة العملاء"><MessageCircle size={19}/><span>محتاج مساعدة؟</span></button>}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
    {(demoMode || role === 'admin' || role === 'owner') && <button className="admin-shortcut" title={role === 'owner' ? 'مساحة صاحب النشاط' : 'لوحة الإدارة'} onClick={() => go(role === 'owner' ? 'owner' : 'admin')}><Settings size={15}/></button>}
  </div>;
}

function Discover({ businesses: list, setSelected, category, setCategory, area, setArea, search, setSearch, setPage, setModal, queryFilter, setQueryFilter, saved, onSave }) {
  const hero = businesses[1];
  return <>
    <section className="hero-wrap"><div className="hero-copy"><div className="eyebrow"><span className="pulse"/> نبض الحي <span className="eyebrow-line"/> حكايات محلية</div><h1>كل اللي بتحبه،<br/><em>أقرب مما تتخيّل.</em></h1><p>اكتشف أحلى الأماكن والعروض والخدمات حوالين بيتك في النرجس 1 و2.</p><div className="hero-search"><Search size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بتدور على إيه النهاردة؟"/><kbd>⌘ K</kbd><button aria-label="بحث"><ArrowLeft size={17}/></button></div><div className="hero-meta"><span><MapPin size={14}/> مجتمع النرجس</span><span className="meta-sep"/><span><Building2 size={14}/> 954 عمارة قريبة</span></div></div><div className="hero-art"><div className="hero-blob"/><img className="hero-photo" src={hero.image} alt="أجواء من أحد أنشطة النرجس"/><div className="photo-label"><span className="photo-label-icon"><Coffee size={16}/></span><span><b>روتين صباحي أحلى</b><small>كافيه روزيتا · النرجس 1</small></span><button onClick={() => setSelected(hero)}><ArrowUpRight size={16}/></button></div><div className="floating-note"><Sparkles size={15}/><span>اختيارات محلية<small>منتقاة ليك</small></span></div><span className="hero-scribble">هنا بتحلى الحكاية</span><span className="hero-art-number">01 / 04</span></div></section>
    <div className="page-container">
      <section className="quick-row"><div className="section-intro"><span className="section-kicker">اختار على مزاجك</span><h2>كل مشوار وله حكاية</h2></div><div className="quick-categories">{categories.slice(0, 5).map((c) => { const I = iconFor[c.name] || Store; return <button key={c.name} className={`quick-category tone-${c.tone}`} onClick={() => { setCategory(c.name); setPage('directory'); }}><span><I size={20}/></span>{c.name}</button>; })}<button className="quick-category more-category" onClick={() => setPage('directory')}><span><ArrowLeft size={18}/></span>كل الدليل</button></div></section>
      <section className="section-block"><div className="section-heading"><div><span className="section-kicker">حاجات تستاهل التجربة</span><h2>مختارة ليك <span className="heading-mark">✳</span></h2></div><button className="text-link" onClick={() => setPage('directory')}>شوف كل الأنشطة <ArrowLeft size={16}/></button></div><div className="filter-row"><div className="area-pills">{areas.map((x) => <button onClick={() => setArea(x)} className={area === x ? 'selected' : ''} key={x}>{x}</button>)}</div><button className="filter-button" onClick={() => setModal('filters')}><SlidersHorizontal size={16}/> {queryFilter} <ChevronDown size={14}/></button></div><div className="business-grid">{list.slice(0, 3).map((b, i) => <BusinessCard key={b.id} business={b} setSelected={setSelected} saved={saved.includes(b.id)} onSave={onSave} featured={i === 0}/>)}</div></section>
      <section className="editorial-banner"><div className="editorial-copy"><span className="section-kicker">فرصتك تبقى جزء من الحكاية</span><h2>عندك مكان بتحبه؟<br/><em>خلّي الجيران يعرفوه.</em></h2><p>ضيف نشاطك أو مهنتك الحرة لدليل النرجس ووصّل للناس اللي حواليك.</p><button className="button-light" onClick={() => setModal('listing')}>أضف نشاطك <ArrowLeft size={17}/></button></div><div className="banner-art"><span className="banner-sun"/><img src={businesses[0].image}/><div className="banner-sticker"><Store size={21}/><b>محلي<br/>ومميز</b></div><span className="banner-caption">من قلب النرجس ♡</span></div></section>
      <section className="section-block community-strip"><div className="community-icon"><House size={22}/></div><div><span className="section-kicker">مساحتنا المشتركة</span><h2>الخدمات العامة على رادارك</h2><p>تابع بلاغات صيانة المرافق العامة بسرية تامة.</p></div><button className="button-outline" onClick={() => setPage('maintenance')}>خدمات الصيانة <ArrowLeft size={16}/></button></section>
    </div>
  </>;
}

function BusinessCard({ business: b, setSelected, saved, onSave, featured = false }) {
  return <article className={`business-card ${featured ? 'featured-card' : ''}`} onClick={() => setSelected(b)}><div className="card-image-wrap"><img src={b.image} alt={b.name}/><span className="card-location"><MapPin size={12}/>{b.mall || b.district}</span><button className={`save-button ${saved ? 'saved' : ''}`} onClick={(e) => { e.stopPropagation(); onSave(b.id); }} aria-label="حفظ النشاط"><Bookmark size={16} fill={saved ? 'currentColor' : 'none'}/></button>{b.offer && <span className="card-offer"><Tag size={12}/>{b.offerTag}</span>}</div><div className="card-content"><div className="card-title-row"><div><h3>{b.name}</h3><span className="business-category">{b.category}</span></div>{b.verified && <BadgeCheck className="verified-icon" size={18}/>}</div><p>{b.description}</p><div className="card-bottom"><span className="rating"><Star size={14} fill="currentColor"/>{b.rating}<small>({b.ratingCount})</small></span><span className="open-now"><i/>{b.open ? 'مفتوح الآن' : 'مغلق'}</span><span className="card-arrow"><ArrowLeft size={15}/></span></div></div></article>;
}

function Directory({ businesses: list, setSelected, category, setCategory, area, setArea, search, setSearch, setModal, setQueryFilter, queryFilter, onLoadMore, hasMore, loading }) {
  return <div className="page-container inner-page"><PageHeading kicker="دليلك المحلي" title="أماكن قريبة، ناس بتحب شغلها." description="كل اللي محتاجه حواليك، من المطاعم المفضلة للخدمات اليومية." action={<button className="button-primary" onClick={() => setModal('listing')}><Plus size={17}/> أضف نشاطك</button>}/><div className="directory-toolbar"><div className="search-field"><Search size={18}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم مكان، خدمة، أو كلمة مفتاحية"/></div><button className="filter-button" onClick={() => setModal('filters')}><Filter size={17}/> تصفية النتائج</button></div><div className="area-pills directory-areas">{areas.map((x) => <button onClick={() => setArea(x)} className={area === x ? 'selected' : ''} key={x}>{x}</button>)}</div><div className="category-chips">{['الكل', ...categories.map((c) => c.name)].map((x) => <button key={x} onClick={() => setCategory(x)} className={category === x ? 'selected' : ''}>{x}</button>)}</div><div className="result-meta"><span>{list.length} نشاط محلي</span><button onClick={() => setModal('filters')}><SlidersHorizontal size={15}/> {queryFilter}</button></div><div className="business-grid directory-grid">{list.map((b) => <BusinessCard key={b.id} business={b} setSelected={setSelected} saved={false} onSave={() => {}}/>)}</div>{list.length === 0 && <EmptyState title="مفيش نتائج دلوقتي" body="جرّب تغيّر الفئة أو المنطقة أو كلمة البحث."/>}{hasMore&&<button className="button-outline full-button" onClick={onLoadMore} disabled={loading}>{loading?'جارٍ تحميل أنشطة أخرى…':'عرض المزيد من الأنشطة'}</button>}</div>;
}

function Offers({ businesses: list, advertisements = [], setSelected }) {
  const rows = advertisements.length ? advertisements.map((ad) => {
    const business = Array.isArray(ad.businesses) ? ad.businesses[0] : ad.businesses;
    if (!business) return null;
    return { ...business, offerId:ad.id, offer:ad.title, offerDescription:ad.body, offerTag:ad.category || 'عرض خاص', offerGallery:ad.gallery||[], image:ad.image_url || business.cover_image_url || '/brand/nargis-logo.png' };
  }).filter(Boolean) : isBackendConfigured ? [] : list.filter((b) => b.offer);
  const openBusiness = (row) => { setSelected({ ...row, id:row.id || row.business_id, rating:row.rating || 0, ratingCount:row.ratingCount || 0, phone:row.contact_phone || row.phone, verified:true, open:true, distance:row.mall || row.district, description:row.offerDescription || row.description }); };
  return <div className="page-container inner-page"><PageHeading kicker="عروض الحي" title={<>حاجات حلوة، <em>بسعر أحلى.</em></>} description="عروض محلية من أنشطة النرجس. التفاصيل عند صاحب النشاط مباشرة."/>{rows.length>0&&<div className="offer-feature"><div className="offer-feature-copy"><span className="offer-badge"><Flame size={14}/> عرض الأسبوع</span><h2>{rows[0].offer}<br/>من {rows[0].name}</h2><p>{rows[0].offerDescription || 'لف على العروض الجديدة من الأماكن اللي بتحبها.'}</p><button className="button-primary" onClick={()=>openBusiness(rows[0])}>تفاصيل العرض <ArrowLeft size={16}/></button></div><img src={rows[0].image}/><div className="offer-shape"/></div>}<section id="all-offers" className="section-block"><div className="section-heading"><div><span className="section-kicker">محدّثة من أصحاب الأنشطة</span><h2>عروض شغالة دلوقتي</h2></div></div><div className="offers-list">{rows.map((b)=><button className="offer-row" key={b.offerId||b.id} onClick={()=>openBusiness(b)}><img src={b.image}/><span className="offer-row-main"><small>{b.category} · {b.district||'النرجس'}</small><b>{b.offer}</b><span>{b.name}</span></span><span className="offer-stamp"><Tag size={17}/>{b.offerTag}</span><ChevronLeft/></button>)}{rows.length===0&&<EmptyState title="مفيش عروض منشورة دلوقتي" body="العروض اللي يعتمدها المشرف هتظهر هنا."/>}</div></section></div>;
}

function BusinessDetail({ business: b, onBack, onRate, onToast, onSave, saved }) {
  const destination=b.pin_lat&&b.pin_lng?`${b.pin_lat},${b.pin_lng}`:`${b.name} ${b.mall||b.district||'النرجس'}`;
  const directionsUrl=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return <div className="page-container detail-page"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/> رجوع للدليل</button><div className="detail-grid"><div className="detail-main"><div className="detail-cover"><img src={b.image}/><span className="cover-location"><MapPin size={14}/>{b.mall || b.district}</span><button className={`save-button ${saved ? 'saved' : ''}`} onClick={onSave}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'}/></button></div>{b.gallery?.length>1&&<div className="detail-gallery">{b.gallery.map((url,index)=><img key={`${url}-${index}`} src={url} alt={`${b.name} · صورة ${index+1}`} loading="lazy"/>)}</div>}{b.offerGallery?.length>1&&<div className="detail-gallery offer-gallery">{b.offerGallery.map((url,index)=><img key={`${url}-${index}`} src={url} alt={`${b.offer} · صورة ${index+1}`} loading="lazy"/>)}</div>}<div className="detail-title"><div><div className="detail-category">{b.category} <span>·</span> {b.district}</div><h1>{b.name} {b.verified && <BadgeCheck size={22}/>}</h1><p>{b.description}</p></div><div className="detail-rating"><b><Star size={17} fill="currentColor"/>{b.rating}</b><small>{b.ratingCount} تقييم</small></div></div>{b.offer && <div className="detail-offer"><span><Tag size={19}/></span><div><small>{b.offerTag}</small><b>{b.offer}</b></div><Sparkles size={17}/></div>}<div className="detail-section"><h2>عن المكان</h2><p>{b.description} زورونا في {b.mall || b.district}، ويسعدنا نخدمكم.</p><div className="detail-tags"><span><BadgeCheck size={14}/> نشاط موثّق</span><span><MapPin size={14}/> داخل {b.district}</span></div></div><div className="detail-section"><div className="section-heading"><div><span className="section-kicker">رأيك يهمنا</span><h2>تجارب السكان</h2></div><button className="button-outline" onClick={onRate}>اكتب تقييمك <Star size={15}/></button></div><div className="rating-summary"><b>{b.rating}</b><span><span className="stars">★★★★★</span><small>{b.ratingCount} تقييم من سكان الحي</small></span><p>التعليقات الكتابية خاصة بصاحب النشاط والإدارة فقط.</p></div></div></div><aside className="detail-sidebar"><div className="contact-card"><span className="section-kicker">معلومات الزيارة</span><div className="open-line"><i/> ساعات العمل يحددها النشاط <small>اتصل للتأكد</small></div><div className="address-line"><span><MapPin size={17}/></span><div><b>{b.mall || b.district}</b><small>النرجس، القاهرة الجديدة</small></div></div><a className="button-primary full-button directions-link" href={directionsUrl} target="_blank" rel="noreferrer"><Navigation size={17}/> الاتجاهات</a><a className="contact-link" href={`tel:${b.phone}`}><MessageCircle size={17}/> اتصل بالنشاط <ArrowLeft size={15}/></a><div className="privacy-note"><ShieldCheck size={15}/> ما بنعرضش بيانات السكان أو نشاطهم لأي مستخدم.</div></div><div className="side-note"><Sparkles size={18}/><p><b>مكان محلي موثّق</b><br/>اتأكدنا إن النشاط موجود داخل منطقة النرجس.</p></div></aside></div></div>;
}

function Maintenance({ tickets, onNew }) { return <div className="page-container inner-page"><PageHeading kicker="خدمات المجتمع · مساحة خاصة" title="مرافق الحي، في متابعة أحسن." description="بلاغات المرافق العامة خاصة بك وبفريق الصيانة والإدارة المصرّح لهم فقط." action={<button className="button-primary" onClick={onNew}><Plus size={17}/> بلاغ جديد</button>}/><div className="maintenance-notice"><ShieldCheck size={20}/><div><b>خصوصيتك محفوظة</b><p>السكان لا يرون بلاغات بعضهم أو نشاطهم داخل التطبيق.</p></div></div><section className="section-block"><div className="section-heading"><div><span className="section-kicker">متابعة البلاغات</span><h2>بلاغاتك الأخيرة</h2></div><button className="text-link">كل البلاغات <ArrowLeft size={16}/></button></div><div className="tickets-list">{tickets.map((t) => <div className="ticket-row" key={t.id}><span className="ticket-icon"><Wrench size={18}/></span><div className="ticket-copy"><b>{t.title}</b><small>{t.category} · {t.date} · رقم {t.id}</small></div><span className={`ticket-status ${t.status === 'تم الحل' ? 'done' : ''}`}><i/>{t.status}</span><ChevronLeft size={18}/></div>)}</div></section><div className="maintenance-categories"><span><ZapIcon/> كهرباء السلالم</span><span><Wrench size={17}/> السباكة الخارجية</span><span><Sparkles size={17}/> النظافة العامة</span><span><SproutIcon/> الزراعة والري</span></div></div>; }
function ZapIcon() { return <span className="emoji-icon">ϟ</span>; } function SproutIcon() { return <span className="emoji-icon">❀</span>; }
function MaintenancePaused() { return <div className="page-container paused-wrap"><div className="paused-card"><span className="paused-icon"><Wrench size={25}/></span><span className="section-kicker">خدمات الصيانة</span><h1>الخدمة متوقفة مؤقتًا</h1><p>قسم الصيانة غير متاح حاليًا. البيانات والبلاغات السابقة محفوظة بأمان. جرّب مرة أخرى لاحقًا.</p><span className="maintenance-private"><ShieldCheck size={15}/> بإشراف الإدارة</span></div></div>; }

function OwnerDashboard({ setModal, showToast }) { return <div className="page-container inner-page"><PageHeading kicker="مساحة صاحب النشاط" title="خلّي شغلك دايمًا في الصورة." description="إدارة ملفك، عروضك، وإعلاناتك من مكان واحد." action={<button className="button-primary" onClick={() => setModal('advertisement')}><Plus size={17}/> إضافة إعلان</button>}/><div className="owner-summary"><img src={businesses[1].image}/><div><span className="verified-line"><BadgeCheck size={15}/> نشاط موثّق</span><h2>كافيه روزيتا</h2><p>كافيهات · مول الحياة، النرجس 1</p></div><button className="button-outline" onClick={() => showToast('تم فتح إعدادات ملف النشاط')}>إدارة الملف <ArrowLeft size={15}/></button></div><div className="stats-grid"><StatCard label="مشاهدات الملف" value="1,284" change="↑ 18% عن الشهر الماضي" icon={<Compass/>}/><StatCard label="مشاهدات العروض" value="346" change="آخر 30 يوم" icon={<Tag/>}/><StatCard label="متوسط التقييم" value="4.8" change="86 تقييم · التعليقات خاصة" icon={<Star/>}/></div><div className="owner-columns"><section className="dashboard-panel"><div className="section-heading"><div><span className="section-kicker">حملاتك</span><h2>الإعلانات والعروض</h2></div><button className="text-link" onClick={() => setModal('advertisement')}><Plus size={15}/> إعلان جديد</button></div><div className="ad-row"><span className="ad-thumbnail"><Tag/></span><span><b>مشروبك الثاني علينا</b><small>عرض · كافيه روزيتا</small></span><span className="approval-status">نشط</span><MoreHorizontal size={18}/></div><div className="ad-row"><span className="ad-thumbnail muted"><CalendarDays/></span><span><b>قهوة الصباح</b><small>إعلان · ينتهي ٢٤ أكتوبر</small></span><span className="approval-status review">قيد المراجعة</span><MoreHorizontal size={18}/></div></section><section className="dashboard-panel rating-private"><div className="section-heading"><div><span className="section-kicker">ملاحظة مهمة</span><h2>تقييمات نشاطك</h2></div><span className="privacy-lock"><ShieldCheck size={16}/></span></div><div className="rating-summary"><b>4.8</b><span><span className="stars">★★★★★</span><small>86 تقييم من السكان</small></span></div><p>تظهر لك النجوم والمتوسط فقط. التعليقات الكتابية متاحة لصاحب النشاط والإدارة، وهوية المقيّم للإدارة فقط.</p><button className="text-link" onClick={() => showToast('سيتم توصيلك بالإدارة عبر المحادثة.')}>تواصل مع الإدارة <MessageCircle size={15}/></button></section></div></div>; }
function StatCard({ label, value, change, icon }) { return <div className="stat-card"><span className="stat-icon">{icon}</span><small>{label}</small><b>{value}</b><span>{change}</span></div>; }

function AdminDashboard({ maintenanceOn, setMaintenanceOn, showToast }) { const [tab, setTab] = useState('overview'); return <div className="page-container inner-page admin-page"><PageHeading kicker="الإدارة والتحكم" title="صورة كاملة. تحكم واضح." description="إدارة الأنشطة والإعلانات والحسابات وخصوصية المجتمع من لوحة واحدة." action={<span className="admin-badge"><ShieldCheck size={16}/> مدير رئيسي</span>}/><div className="admin-tabs">{[['overview','نظرة عامة'],['listings','الأنشطة'],['ads','الإعلانات'],['reviews','التقييمات الخاصة'],['users','الحسابات'],['settings','الإعدادات']].map(([id,l]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{l}</button>)}</div><div className="stats-grid admin-stats"><StatCard label="إجمالي الأنشطة" value="128" change="١١٢ نشاطًا موثّقًا" icon={<Store/>}/><StatCard label="طلبات بانتظار المراجعة" value="08" change="٤ إعلانات · ٤ أنشطة" icon={<Clock3/>}/><StatCard label="حسابات نشطة" value="2,430" change="آخر تحديث الآن" icon={<Heart/>}/><StatCard label="مشاهدات هذا الشهر" value="18.6k" change="↑ 12.8%" icon={<ArrowUpRight/>}/></div><div className="admin-columns"><section className="dashboard-panel"><div className="section-heading"><div><span className="section-kicker">إجراءات تحتاج انتباه</span><h2>{tab === 'reviews' ? 'تقييمات خاصة' : 'بانتظار الموافقة'}</h2></div><button className="text-link" onClick={() => setTab('ads')}>عرض الكل <ArrowLeft size={15}/></button></div>{(tab === 'reviews' ? samplePrivateReviews : [{ title: 'مخبز صباح الخير', type: 'نشاط جديد · النرجس 2', status: 'مراجعة بيانات الموقع' }, { title: 'حملة افتتاح مطعم حكاية', type: 'إعلان · ٧ أيام', status: 'بانتظار موافقة المشرف' }, { title: 'محل وردة وريحان', type: 'تعديل بيانات', status: 'مراجعة التغيير' }]).map((item, i) => <div className="admin-queue-row" key={i}><span className="queue-avatar">{item.title?.[0] || item.business[0]}</span><span><b>{item.title || item.business}</b><small>{item.type || `${item.stars} نجوم · ${item.time} · ${item.reviewer}`}</small></span><button className="review-action" onClick={() => showToast(tab === 'reviews' ? 'تم فتح التقييم الخاص للمراجعة.' : 'تمت الموافقة على الطلب.')}>{tab === 'reviews' ? 'عرض خاص' : 'مراجعة'} <ArrowLeft size={14}/></button></div>)}</section><section className="dashboard-panel"><div className="section-heading"><div><span className="section-kicker">التحكم العام</span><h2>إعدادات المنصة</h2></div><Settings size={17}/></div><div className="setting-row"><span><b>الظهور التلقائي للرئيسية</b><small>اختيار الأنشطة الأعلى تقييمًا وتفاعلًا</small></span><Toggle initial={true} onChange={() => showToast('تم تحديث إعداد الظهور التلقائي.')}/></div><div className="setting-row"><span><b>ملف الصيانة</b><small>إخفاء كامل وآمن لقسم الصيانة</small></span><Toggle initial={maintenanceOn} onChange={(val) => { setMaintenanceOn(val); showToast(val ? 'تم تفعيل قسم الصيانة.' : 'تم إخفاء قسم الصيانة مع حفظ البلاغات.'); }}/></div><div className="setting-row"><span><b>الموافقة على الإعلانات</b><small>مراجعة المشرف المختص قبل النشر</small></span><Toggle initial={true}/></div><button className="button-outline full-button" onClick={() => showToast('تم فتح سجل تدقيق تغييرات الإدارة.')}>سجل النشاط والصلاحيات <ArrowLeft size={15}/></button></section></div></div>; }
function Toggle({ initial, onChange }) { const [on, setOn] = useState(initial); return <button aria-pressed={on} className={`toggle ${on ? 'on' : ''}`} onClick={() => { setOn(!on); onChange?.(!on); }}><i/></button>; }

function PageHeading({ kicker, title, description, action }) { return <div className="page-heading"><div><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function EmptyState({ title, body }) { return <div className="empty-state"><Search size={23}/><b>{title}</b><span>{body}</span></div>; }

function ImagePicker({ name = 'images', max = 5, showToast }) {
  const [images, setImages] = useState([]);
  const handleFiles = (event) => {
    const incoming = Array.from(event.target.files || []);
    if (incoming.some((file) => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      showToast('الصور المقبولة JPG أو PNG أو WebP وبحد أقصى 5 ميجابايت للصورة.');
      event.target.value = '';
      return;
    }
    const next = [...images, ...incoming].slice(0, max);
    const transfer = new DataTransfer(); next.forEach((file) => transfer.items.add(file)); event.target.files = transfer.files;
    setImages(next.map((file) => ({ file, url: URL.createObjectURL(file) })));
    if (images.length + incoming.length > max) showToast(`يمكن إضافة ${max} صور كحد أقصى.`);
  };
  const remove = (index) => {
    const next = images.filter((_, i) => i !== index);
    const input = document.getElementById(`image-input-${name}`);
    if (input) { const transfer = new DataTransfer(); next.forEach(({ file }) => transfer.items.add(file)); input.files = transfer.files; }
    URL.revokeObjectURL(images[index].url);
    setImages(next);
  };
  return <div className="image-upload-block span-2"><label className="field-label">صور {name === 'images' && max === 5 ? 'النشاط' : 'العرض'} <span>اختيارية · حتى {max} صور</span></label><label className="image-upload-button" htmlFor={`image-input-${name}`}><ImagePlus size={18}/><span><b>اختار صور من جهازك</b><small>JPG أو PNG أو WebP · 5 ميجابايت للصورة</small></span><input id={`image-input-${name}`} name={name} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles}/></label>{images.length > 0 && <div className="image-preview-list">{images.map((image, index) => <div className="image-preview-item" key={`${image.file.name}-${index}`}><img src={image.url} alt={`معاينة ${index + 1}`}/><button type="button" onClick={() => remove(index)} aria-label="إزالة الصورة"><X size={13}/></button></div>)}</div>}</div>;
}

const policyFallbackBody={
  terms:'التطبيق دليل محلي للأنشطة والعروض ومساحة اختيارية للصيانة العامة. لا يوفر التطبيق إدارة سكنية أو حراسة أو طوارئ. يجب تقديم بيانات صحيحة؛ الأنشطة التجارية يجب أن تكون داخل النرجس 1 أو النرجس 2 وتخضع للمراجعة. للإدارة طلب تعديل أو رفض أو إخفاء إدراج أو إعلان مخالف. استخدم المحتوى والصور التي تملك حق نشرها، ولا تستخدم التطبيق لنشر معلومات مضللة أو مخالفة للقانون.',
  privacy:'يجمع التطبيق بيانات الحساب ورقم الهاتف وبيانات النشاط والتواصل والتقييمات والبلاغات اللازمة لتشغيله. عنوان السكن خاص بالمستخدم والإدارة وفريق الصيانة المخول، ولا تظهر حسابات السكان أو نشاطهم لبعضهم. متوسط النجوم عام، والتعليقات النصية لصاحب النشاط والإدارة، وهوية المقيم للإدارة المخولة. رسائل Grok ترسل إلى xAI لمعالجة الرد ولا يحفظ التطبيق سجل المحادثة. يحق للمستخدم طلب تصحيح أو حذف الحساب، مع الاحتفاظ بما يلزم للأمان أو الالتزامات النظامية.',
  conduct:'احترم خصوصية السكان والأنشطة. لا تنتحل صفة الغير، ولا تسجل نشاطًا خارج المنطقة على أنه داخلها، ولا تنشر صورًا أو علامات دون حق. لا تضع كلمات مرور أو أكواد تحقق أو بيانات دفع في المحادثات. تخضع الإعلانات والأنشطة للمراجعة؛ ويمكن للإدارة إخفاء المحتوى أو تعليق الحساب مع تسجيل الإجراء. بلاغات الصيانة لا تضمن زمن استجابة ولا تغني عن التواصل مع الطوارئ عند الخطر.'
};
function usePolicyDocuments(){const[docs,setDocs]=useState([]);useEffect(()=>{fetchCurrentRequiredPolicies().then((rows)=>setDocs(rows||[])).catch(()=>{});},[]);return docs;}

function ListingModal({ onClose, onSubmit, showToast, business = null }) {
  const [accepted, setAccepted] = useState(false);
  const [coordinates, setCoordinates] = useState(business?.pin_lat && business?.pin_lng ? {lat:business.pin_lat,lng:business.pin_lng} : null);
  const [kind, setKind] = useState(business?.listing_kind || 'business');
  return <ModalShell onClose={onClose}><form onSubmit={(e) => { if (kind === 'business' && !coordinates) { e.preventDefault(); showToast('حدد موقع المنشأة قبل الإرسال.'); } else onSubmit(e); }} className="modal-content listing-modal"><input type="hidden" name="business_id" value={business?.id || ''}/><input type="hidden" name="pin_lat" value={coordinates?.lat ?? ''}/><input type="hidden" name="pin_lng" value={coordinates?.lng ?? ''}/><span className="section-kicker">نمو مع جيرانك</span><h2>{business?'تحديث بيانات نشاطك':'ضيف مكانك لدليل النرجس'}</h2><p className="modal-copy">الأنشطة التجارية لازم تكون داخل النرجس 1 أو 2. موقع المهنة الحرة اختياري. أي تعديل على نشاط منشور يعود للمراجعة قبل ظهوره.</p><div className="form-grid"><label className="field-label">نوع الإدراج<select name="kind" required value={kind === 'freelancer' ? 'مهنة حرة' : 'محل أو نشاط تجاري'} onChange={(e) => setKind(e.target.value === 'مهنة حرة' ? 'freelancer' : 'business')}><option>محل أو نشاط تجاري</option><option>مهنة حرة</option></select></label><label className="field-label">اسم النشاط<input name="name" required defaultValue={business?.name||''} placeholder="اسم المكان أو المهنة"/></label><label className="field-label">التصنيف<select name="category" defaultValue={business?.category||categories[0].name}>{categories.map((c) => <option key={c.name}>{c.name}</option>)}</select></label><label className="field-label">المنطقة<select name="district" disabled={kind === 'freelancer'} defaultValue={business?.district||'النرجس 1'}><option>النرجس 1</option><option>النرجس 2</option></select></label><label className="field-label">المول <span>اختياري</span><select name="mall" disabled={kind === 'freelancer'} defaultValue={business?.mall||''}><option value="">مش داخل مول</option><option>مول الحياة</option><option>مول اللؤلؤة</option></select></label><label className="field-label">رقم التواصل<input name="phone" required type="tel" defaultValue={business?.contact_phone||''} placeholder="01X XXXX XXXX"/></label><label className="field-label">واتساب <span>اختياري</span><input name="whatsapp" type="tel" defaultValue={business?.whatsapp||''} placeholder="01X XXXX XXXX"/></label><div className="pin-field" style={{ display: kind === 'freelancer' ? 'none' : 'flex' }}><span className="pin-icon"><MapPin/></span><span><b>{coordinates ? 'تم تحديد موقع النشاط' : 'حدد موقع المنشأة'}</b><small>{coordinates ? `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)} · سيتحقق المشرف من وقوعه داخل المنشأة` : 'اسمح بالوصول للموقع أثناء وجودك داخل المنشأة'}</small></span><button type="button" onClick={() => { if (!navigator.geolocation) { showToast('المتصفح لا يدعم تحديد الموقع.'); return; } navigator.geolocation.getCurrentPosition((pos) => setCoordinates({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => showToast('تعذر تحديد موقعك. فعّل إذن الموقع وحاول مرة أخرى.'), { enableHighAccuracy: true, timeout: 10000 }); }}>تحديد موقعي <MapPin size={14}/></button></div><label className="field-label span-2">نبذة عن نشاطك<textarea name="description" required defaultValue={business?.description||''} placeholder="قولنا إيه اللي بيميزك…"/></label>{business&&<div className="empty-inline span-2">صور النشاط الحالية محفوظة. أضف صورًا جديدة وسيتم إرفاقها بالطلب بعد تحديث الملف.</div>}<ImagePicker name="images" max={5} showToast={showToast}/><label className="check-field span-2"><input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)}/><span>{kind === 'freelancer' ? 'أؤكد صحة بيانات المهنة الحرة وأوافق على سياسات الإدراج والإعلان.' : 'أؤكد أن بيانات النشاط صحيحة، وأن المحل التجاري داخل النرجس 1 أو 2، وأوافق على سياسات الإدراج والإعلان.'}</span></label></div><button type="submit" className="button-primary full-button">{business?'إرسال التعديل للمراجعة':'إرسال للمراجعة'} <ArrowLeft size={16}/></button><small className="after-submit">مش هننشر بياناتك قبل مراجعة المشرف المختص.</small></form></ModalShell>;
}

function AdvertisementModal({ onClose, onSubmit, showToast }) {
  const [myBusinesses, setMyBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { fetchMyBusinesses().then((rows) => setMyBusinesses(rows || [])).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  const eligible = myBusinesses.filter((business) => business.status === 'approved' && business.account_status === 'active');
  return <ModalShell onClose={onClose}><form onSubmit={onSubmit} className="modal-content"><span className="section-kicker">إعلان داخل التطبيق</span><h2>عرّف الجيران بعرضك</h2><p className="modal-copy">يراجع المشرف المختص الإعلان قبل ظهوره، ويمكنه طلب تعديل أو رفضه مع توضيح السبب.</p>{error && <p className="modal-copy">{error}</p>}{loading ? <LoadingNotice/> : eligible.length === 0 ? <div className="empty-inline">لا يوجد نشاط معتمد على حسابك بعد. أضف نشاطًا وانتظر الموافقة قبل تقديم إعلان.</div> : <><label className="field-label">النشاط المرتبط بالإعلان<select name="business_id" required>{eligible.map((business) => <option value={business.id} key={business.id}>{business.name} · {business.district || 'مهنة حرة'}</option>)}</select></label><label className="field-label">عنوان الإعلان<input name="title" required maxLength="120" placeholder="مثال: عرض الافتتاح"/></label><label className="field-label">تفاصيل الإعلان<textarea name="body" required maxLength="1000" placeholder="اكتب تفاصيل العرض وشروطه…"/></label><label className="field-label">الفئة<select name="category"><option>عرض خاص</option><option>افتتاح</option><option>خدمة جديدة</option><option>موسمي</option></select></label><div className="form-grid"><label className="field-label">يبدأ في<input name="starts_at" type="date"/></label><label className="field-label">ينتهي في<input name="ends_at" type="date"/></label></div><ImagePicker name="images" max={3} showToast={showToast}/><button className="button-primary full-button">إرسال للمراجعة <ArrowLeft size={16}/></button></>}</form></ModalShell>;
}

function LoadingNotice(){return <div className="empty-inline">جارٍ تحميل أنشطتك…</div>;}

function AccountModal({ onClose, showToast, session, role, demoMode, go, setRole }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [accepted, setAccepted] = useState({});
  const [sending, setSending] = useState(false);
  const policyDocs=usePolicyDocuments();
  const required = policies.map((p) => p.id);
  const sendCode = async () => {
    if (!required.every((key) => accepted[key])) { showToast('وافق على السياسات الإلزامية قبل المتابعة.'); return; }
    if (!phone.trim()) { showToast('اكتب رقم الموبايل أولًا.'); return; }
    setSending(true);
    try { const versions=Object.fromEntries(required.map((key)=>[key,policyDocs.find((row)=>row.policy_key===key)?.version||'1.2']));const res = await requestLoginCode(phone.trim(), required, versions); if (res.demo) showToast('وضع معاينة: التسجيل سيعمل بعد ربط Supabase.'); else { setCodeSent(true); showToast('بعتنالك كود التحقق على الموبايل.'); } }
    catch (err) { showToast(err.message || 'تعذر إرسال كود التحقق.'); }
    finally { setSending(false); }
  };
  const verifyCode = async () => { setSending(true); try { const res = await verifyLoginCode(phone.trim(), otp.trim()); showToast(res.demo ? 'وضع معاينة: لا يوجد اتصال بقاعدة البيانات.' : 'تم تسجيل الدخول بنجاح.'); onClose(); } catch (err) { showToast(err.message || 'كود التحقق غير صحيح.'); } finally { setSending(false); } };
  if (session) return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">حسابك في النرجس</span><h2>{session.user.phone || session.user.email}</h2><p className="modal-copy">{role === 'admin' ? 'صلاحية إدارة التطبيق' : role === 'owner' ? 'مساحة صاحب نشاط' : 'حساب ساكن'}</p><button className="button-outline full-button" onClick={async()=>{await supabase.auth.signOut();onClose();showToast('تم تسجيل الخروج بأمان.');}}>تسجيل الخروج</button></div></ModalShell>;
  return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">حسابك ومساحتك</span><h2>أهلًا بيك في النرجس</h2><p className="modal-copy">سجّل دخولك لمتابعة تقييماتك الخاصة وإدارة نشاطك أو بلاغاتك. موافقتك مطلوبة على السياسات الحالية قبل إنشاء الحساب.</p><label className="field-label">رقم الموبايل<input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="01X XXXX XXXX"/></label>{codeSent && <label className="field-label">كود التحقق<input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="اكتب الكود اللي وصلك"/></label>}<div className="consent-box">{policies.map((p) => {const doc=policyDocs.find((row)=>row.policy_key===p.id);return <div className="consent-policy" key={p.id}><label><input type="checkbox" checked={Boolean(accepted[p.id])} onChange={(e) => setAccepted({ ...accepted, [p.id]: e.target.checked })}/><span>{p.label} <small>إلزامية</small></span></label><details><summary>اقرأ السياسة كاملة</summary><p>{doc?.body||policyFallbackBody[p.id]}</p></details></div>;})}<p>العروض والتنبيهات الاختيارية يمكن ضبطها لاحقًا من إعداداتك.</p></div>{codeSent ? <button className="button-primary full-button" disabled={sending || !otp.trim()} onClick={verifyCode}>{sending ? 'جارٍ التحقق…' : 'تأكيد الكود وإنشاء الحساب'} <ArrowLeft size={16}/></button> : <button className="button-primary full-button" disabled={sending} onClick={sendCode}>{sending ? 'جارٍ الإرسال…' : 'متابعة برقم الموبايل'} <ArrowLeft size={16}/></button>}{demoMode && <div className="demo-role-box"><small>وضع معاينة محلي — لا ينشئ حسابًا أو يرسل بيانات</small><button onClick={()=>{onClose();go('discover');}}>متابعة كمقيم</button><button onClick={()=>{setRole('owner');onClose();go('owner');}}>معاينة صاحب نشاط</button><button onClick={()=>{setRole('admin');onClose();go('admin');}}>معاينة الإدارة</button></div>}</div></ModalShell>;
}

function PolicyAcceptanceModal({ onAccept, onClose }) {
  const docs=usePolicyDocuments();
  const [checked,setChecked]=useState(false); const [busy,setBusy]=useState(false);
  return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">موافقة مطلوبة قبل المتابعة</span><h2>تحديث السياسات</h2><p className="modal-copy">تم تحديث سياسة أو أكثر. راجع البنود الحالية ووافق عليها لحفظ النسخ التي قبلتها على حسابك.</p><div className="policy-list">{policies.map((p)=>{const doc=docs.find((row)=>row.policy_key===p.id);return <details key={p.id}><summary>{doc?.title||p.label}<span>إلزامية · {doc?.version||'1.2'}</span></summary><p>{doc?.body||policyFallbackBody[p.id]}</p></details>;})}</div><label className="check-field"><input type="checkbox" checked={checked} onChange={(e)=>setChecked(e.target.checked)}/><span>قرأت ووافقت على السياسات المطلوبة الحالية.</span></label><button className="button-primary full-button" disabled={!checked||busy} onClick={async()=>{setBusy(true);await onAccept();setBusy(false);}}>{busy?'جارٍ الحفظ…':'أوافق وأتابع'} <Check size={16}/></button></div></ModalShell>;
}

function PoliciesModal({onClose}){const docs=usePolicyDocuments();return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">واضحة قبل التسجيل</span><h2>سياسات النرجس</h2><p className="modal-copy">يجب قبول السياسات المطلوبة قبل إنشاء الحساب. التنبيهات التسويقية اختيارية.</p><div className="policy-list">{policies.map((p)=>{const doc=docs.find((row)=>row.policy_key===p.id);return <details key={p.id}><summary>{doc?.title||p.label}<span>إلزامية · {doc?.version||'1.2'}</span></summary><p>{doc?.body||policyFallbackBody[p.id]}</p></details>;})}</div><button className="button-primary full-button" onClick={onClose}>فهمت <Check size={16}/></button></div></ModalShell>;}

function Modal({ type, onClose, onRating, rating, setRating, onMaintenance, onListing, editingBusiness, onAdSubmit, onAcceptPolicies, session, showToast, setModal, maintenanceOn, setRole, role, go,queryFilter,setQueryFilter,category,setCategory,area,setArea }) {
  const titles = { rating: 'شاركنا تجربتك', maintenance: 'بلاغ صيانة جديد', listing: 'ضيف مكانك لدليل النرجس', account: 'أهلًا بيك في النرجس', policies: 'سياسات استخدام النرجس', 'policy-acceptance':'تحديث السياسات المطلوبة', about: 'حكاية النرجس', filters: 'اختار اللي يناسبك', menu: 'القائمة', support: 'خدمة عملاء النرجس' };
  if (type === 'rating') return <ModalShell onClose={onClose}><form onSubmit={onRating} className="modal-content"><span className="section-kicker">رأيك خاص ومحفوظ</span><h2>{titles[type]}</h2><p className="modal-copy">تقييم النجوم يظهر للجميع كمعدل فقط. التعليق يظهر لصاحب النشاط والإدارة، وهويتك لا تظهر إلا للإدارة.</p><div className="rating-picker" dir="ltr">{[1,2,3,4,5].map((n) => <button type="button" key={n} className={n <= rating ? 'selected' : ''} onClick={() => setRating(n)}><Star fill="currentColor"/></button>)}</div><label className="field-label">تعليقك <span>اختياري</span><textarea name="comment" placeholder="إيه أكتر حاجة عجبتك؟" maxLength={600}/></label><button className="button-primary full-button" disabled={!rating}>إرسال التقييم <ArrowLeft size={16}/></button></form></ModalShell>;
  if (type === 'maintenance') return <ModalShell onClose={onClose}><form onSubmit={onMaintenance} className="modal-content"><span className="section-kicker">بلاغ خاص بفريق الصيانة</span><h2>{titles[type]}</h2><p className="modal-copy">يجب تسجيل عنوان السكن واعتماده من الإدارة قبل إرسال البلاغات. العنوان لا يظهر للسكان.</p><div className="form-grid"><label className="field-label">نوع المشكلة<select name="category" required><option>كهرباء وإنارة</option><option>سباكة خارجية</option><option>نظافة عامة</option><option>زراعة وري</option></select></label><label className="field-label">المنطقة<select name="district" required><option>النرجس 1</option><option>النرجس 2</option></select></label><label className="field-label">رقم العمارة<input name="building" type="number" required min="1" max="645" placeholder="من 1 إلى 645"/></label><label className="field-label">رقم الشقة<input name="apartment" type="number" required min="1" max="24" placeholder="من 1 إلى 24"/></label><label className="field-label span-2">وصف المشكلة<textarea name="description" required maxLength="1500" placeholder="اشرح المشكلة ومكانها بالتفصيل…"/></label></div><button className="button-primary full-button">إرسال البلاغ بأمان <ArrowLeft size={16}/></button></form></ModalShell>;
  if (type === 'listing') return <ListingModal onClose={onClose} onSubmit={onListing} business={editingBusiness} showToast={showToast}/>;
  if (type === 'advertisement') return <AdvertisementModal onClose={onClose} onSubmit={onAdSubmit} showToast={showToast}/>;
  if (type === 'account') return <AccountModal onClose={onClose} showToast={showToast} session={session} role={role} demoMode={import.meta.env.DEV && !isBackendConfigured} go={go} setRole={setRole} />;
  if (type === 'policy-acceptance') return <PolicyAcceptanceModal onAccept={onAcceptPolicies} onClose={onClose} />;
  if (type === 'notifications') return <NotificationsModal onClose={onClose} showToast={showToast} session={session} />;
  if (type === 'support') return <SupportChat onClose={onClose} session={session} />;
  if (type === 'policies') return <PoliciesModal onClose={onClose}/>;
  if (type === 'filters') return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">تصفية النتائج</span><h2>{titles[type]}</h2><label className="field-label">ترتيب حسب<select value={queryFilter} onChange={(e)=>setQueryFilter(e.target.value)}><option>تلقائي</option><option>الأحدث</option><option>الأعلى تقييمًا</option><option>العروض أولًا</option></select></label><label className="field-label">الفئة<select value={category} onChange={(e)=>setCategory(e.target.value)}><option>الكل</option>{categories.map((item)=><option key={item.name}>{item.name}</option>)}</select></label><label className="field-label">المنطقة<select value={area} onChange={(e)=>setArea(e.target.value)}>{areas.map((item)=><option key={item}>{item}</option>)}</select></label><button className="button-outline full-button" onClick={()=>{setQueryFilter('تلقائي');setCategory('الكل');setArea('الكل');}}>مسح الفلاتر</button><button className="button-primary full-button" onClick={onClose}>عرض النتائج <ArrowLeft size={16}/></button></div></ModalShell>;
  if (type === 'menu') return <ModalShell onClose={onClose}><div className="modal-content"><h2>{titles[type]}</h2>{nav.filter((item) => maintenanceOn || item.id !== 'maintenance').map((n) => <button className="menu-row" key={n.id} onClick={() => { onClose(); go(n.id); }}><n.Icon size={19}/>{n.label}<ArrowLeft size={15}/></button>)}<button className="menu-row" onClick={() => { onClose(); setTimeout(() => setModal('notifications'), 1); }}><Bell size={19}/>الإشعارات<ArrowLeft size={15}/></button><button className="menu-row" onClick={() => { onClose(); setTimeout(() => go('owner'), 1); }}><BriefcaseBusiness size={19}/>مساحة صاحب النشاط<ArrowLeft size={15}/></button></div></ModalShell>;
  return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">من الحي وإلى الحي</span><h2>{titles[type]}</h2><p className="modal-copy">النرجس دليلك المحلي لاكتشاف المحلات والمطاعم والخدمات القريبة والعروض الجديدة. مجتمع من 954 عمارة يجمعه حب التفاصيل القريبة.</p><div className="about-count"><span><b>954</b><small>عمارة</small></span><span><b>22,896</b><small>شقة</small></span><span><b>2</b><small>منطقة</small></span></div><button className="button-primary full-button" onClick={onClose}>تمام <Check size={16}/></button></div></ModalShell>;
}
function SupportChat({ onClose, session }) {
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'أهلًا بيك في النرجس 🌿 اسألني عن استخدام التطبيق، إضافة نشاطك أو إعلانك، التقييمات، أو بلاغات المرافق العامة.' }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [messages, busy]);
  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || busy) return;
    if (!session || !supabase) { setError('سجّل الدخول بحسابك لاستخدام مساعد خدمة العملاء.'); return; }
    const next = [...messages, { role: 'user', content }];
    setMessages(next); setDraft(''); setError(''); setBusy(true);
    try {
      const {data:authData,error:authError}=await supabase.auth.getSession();
      if(authError||!authData.session?.access_token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
      const response = await fetch('/api/customer-support', { method: 'POST', headers: { 'content-type': 'application/json',authorization:`Bearer ${authData.session.access_token}` }, body: JSON.stringify({ messages: next.slice(-10).map(({ role, content: text }) => ({ role, content: text })) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'تعذر الوصول للمساعد الآن.');
      setMessages((old) => [...old, { role: 'assistant', content: result.answer }]);
    } catch (err) { setError(err.message || 'تعذر الوصول للمساعد الآن.'); }
    finally { setBusy(false); }
  }
  return <ModalShell onClose={onClose}><div className="support-chat modal-content"><div className="support-heading"><span className="support-avatar"><Sparkles size={17}/></span><span><b>مساعد النرجس</b><small><i/> {session?'جاهز يساعدك':'تسجيل الدخول مطلوب'}</small></span></div><div className="support-messages" role="log" aria-live="polite">{messages.map((message,index)=><div key={`${index}-${message.role}`} className={`support-message ${message.role}`}>{message.content}</div>)}{busy&&<div className="support-message assistant support-typing"><i/><i/><i/></div>}<div ref={endRef}/></div>{error&&<div className="support-error" role="status">{error}{!session&&<button onClick={()=>{onClose();window.setTimeout(()=>window.dispatchEvent(new CustomEvent('nargis:open-account')),10);}}>افتح تسجيل الدخول</button>}</div>}{messages.length===1&&<div className="support-suggestions">{['إزاي أضيف نشاطي؟','إزاي أقدم إعلان؟','مين بيشوف تعليقي؟','إزاي أتابع بلاغ الصيانة؟'].map((q)=><button key={q} onClick={()=>sendMessage(q)} disabled={busy}>{q}</button>)}</div>}<form className="support-compose" onSubmit={(event)=>{event.preventDefault();sendMessage();}}><textarea value={draft} onChange={(event)=>setDraft(event.target.value)} maxLength={1200} rows={1} placeholder={session?'اكتب سؤالك هنا…':'سجّل الدخول لبدء المحادثة'} aria-label="اكتب سؤالك لخدمة العملاء"/><button className="button-primary" disabled={busy||!draft.trim()} aria-label="إرسال السؤال"><ArrowLeft size={17}/></button></form><small className="support-privacy">رسالتك تُرسل إلى Grok لتوليد الرد ولا يحفظ التطبيق سجل المحادثة. الحساب الواحد محدود بـ20 رسالة يوميًا ورسالة كل 6 ثوانٍ. لا ترسل كلمة مرور أو كود تحقق أو بيانات سكن.</small></div></ModalShell>;
}
function NotificationsModal({ onClose, showToast, session }) { const [working, setWorking] = useState(false);const[rows,setRows]=useState([]);const[error,setError]=useState('');useEffect(()=>{if(!session)return;fetchMyNotifications().then(setRows).then(()=>markNotificationsRead()).catch((e)=>setError(e.message||'تعذر تحميل الإشعارات.'));},[session?.user?.id]); return <ModalShell onClose={onClose}><div className="modal-content"><span className="section-kicker">خليك قريب من الجديد</span><h2>إشعارات النرجس</h2><p className="modal-copy">فعّل الإشعارات عشان توصلك العروض الجديدة والتنبيهات المهمة حتى والتطبيق مقفول. تقدر توقفها من إعدادات جهازك بأي وقت.</p>{!session?<div className="empty-inline">سجّل الدخول لعرض إشعارات حسابك.</div>:<div className="notification-inbox">{error&&<div className="support-error">{error}</div>}{rows.length?rows.map((item)=><a className={`notification-preview ${item.read_at?'':'unread'}`} href={item.target_url||'/'} key={item.id} onClick={onClose}><span><Bell size={17}/></span><div><b>{item.title}</b><small>{item.body} · {fmtDate(item.created_at)}</small></div></a>):<div className="empty-inline">مفيش إشعارات جديدة دلوقتي.</div>}</div>}<button className="button-primary full-button" disabled={working||!session} onClick={async () => { setWorking(true); try { await enablePushNotifications(); showToast('تم تفعيل إشعارات هذا الجهاز.'); } catch (err) { showToast(err.message || 'تعذر تفعيل الإشعارات.'); } finally { setWorking(false); } }}>{working ? 'جارٍ التفعيل…' : 'فعّل إشعارات هذا الجهاز'} <Bell size={16}/></button><small className="after-submit">تصل الإشعارات عند اعتماد إعلان أو تحديث طلبك. يلزم إعداد مفتاح VAPID وخدمة الإرسال بالخادم.</small></div></ModalShell>; }
function ModalShell({ children, onClose }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal-panel"><button className="modal-close" onClick={onClose} aria-label="إغلاق"><X size={18}/></button>{children}</div></div>; }

export default App;
