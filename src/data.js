export const areas = ['الكل', 'النرجس 1', 'النرجس 2'];

export const categories = [
  { name: 'مطاعم', icon: 'Utensils', tone: 'rose' },
  { name: 'كافيهات', icon: 'Coffee', tone: 'amber' },
  { name: 'مخبوزات', icon: 'Croissant', tone: 'mint' },
  { name: 'صيدليات', icon: 'Pill', tone: 'plum' },
  { name: 'سوبر ماركت', icon: 'ShoppingBasket', tone: 'gold' },
  { name: 'خدمات ومهن', icon: 'Wrench', tone: 'teal' },
  { name: 'عناية وجمال', icon: 'Sparkles', tone: 'pink' },
];

export const businesses = [
  {
    id: 'bake-1', name: 'مخبز وحلويات ريحانة', category: 'مخبوزات', district: 'النرجس 1', mall: null,
    rating: 4.9, ratingCount: 142, distance: '٤ دقائق', open: true, verified: true,
    description: 'مخبوزات طازجة وحلويات معمولة بحب كل يوم. اسأل عن مخبوزات الصباح.',
    offer: 'خصم ١٥٪ لسكان النرجس', offerTag: 'عرض اليوم', phone: '+201000000001',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuArFou-Y-svZhUIzt0OIESmVlkwDod1b5sDiCa5bvstj8jaAnHG7MRUH-6ReBV6wJWkLpjSmGIlmxko_rXGrp1i0Nth5sWKCdhzsa15bSDOTPeTDvIK7-PWZMEihflirJ-noPJXWy4P3YWgTR5oED9ItOlGnsRObGFuIQY4-1vpJDAcHVWLzvjF0-hwsFW1kltZruyIiMOjVcZCUrlI-QO4JfiR4zIGY8A3XqGfY0eoX615tleiM2h_',
  },
  {
    id: 'cafe-1', name: 'كافيه روزيتا', category: 'كافيهات', district: 'النرجس 1', mall: 'مول الحياة',
    rating: 4.8, ratingCount: 86, distance: 'داخل مول الحياة', open: true, verified: true,
    description: 'قهوة مختصة، فطار هادي، وحلويات يومية في قلب المول.',
    offer: 'مشروبك الثاني علينا', offerTag: 'عرض مميز', phone: '+201000000002',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkB__Qo9OgM79tMNuczCwCmsopRlHKHNhKiNwWnlHfDPBah5i-U6nEK-J1U_ZwcUNUWCyf54gto5RUBOFHKKtN4LCNAztFJ7HOxvjhxL1dy1FZiTkyisDw0cY8b6q-8iJyQslsltOfqxuOx3MM59LNuaK-Gnwxu_itdLUB7Jr5DKU5v8TwI_aWXosjrbQspKTH6WSOxppbEF1OdtUTjnzUMy1SShpIbOqoWTQxusAPPEOTaenK9ODw',
  },
  {
    id: 'pharm-1', name: 'صيدلية النرجس الحديثة', category: 'صيدليات', district: 'النرجس 2', mall: null,
    rating: 4.7, ratingCount: 119, distance: '٦ دقائق', open: true, verified: true,
    description: 'رعاية قريبة منك، واستشارات دوائية وخدمة توصيل داخل النرجس.',
    offer: 'توصيل مجاني للطلبات', offerTag: 'خدمة قريبة', phone: '+201000000003',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCKaTZ9ih40e32O1i9IXDoG9qKgG1nTg1DwYJtYJ08DNbJte_vSiZG1_0u6A8NHDFKOhUPH5bye9jZl8c3Dv_k1r0ATEcjVwbAeHe3gmpNx_x7v-bDMht1Dyb7RgXik2rjzvHGkquQvfD-ZoQBkbA_CdDHjCoG80byLGkndl_p0rsjenZWB25mHEbAdD8vPa3r-LcIMiZJgD8wDTAuwsZfEAu0dcxXpkbkLGbPjQuaq8oD1LzRmQ2SA',
  },
  {
    id: 'food-1', name: 'بيت الشاورما', category: 'مطاعم', district: 'النرجس 2', mall: 'مول اللؤلؤة',
    rating: 4.6, ratingCount: 203, distance: 'داخل مول اللؤلؤة', open: true, verified: true,
    description: 'وجبات شرقية طازجة وجلسات عائلية في أجواء مريحة.',
    offer: 'وجبة العيلة بسعر خاص', offerTag: 'الأكثر طلبًا', phone: '+201000000004',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCz_8Em-S8mqXHpdj5y2hiBEvYrkqHctvg_-vVxgxa7GSQbp-sCNa_qSSGSkb6lVWGiIvB7sCjEBeHCqVdFRK04yzok6inXW6iidV5LfA0iPFMEF1dAFWFhSMO5BUHdRV3RA-IPG5Vkxdu_hudQuqATUCH2gkCue2HM-fwHB4A-eOUb4P-aS1o95YljYNheSlDlBtGLsmGGR4i-xGquHEHoTgN-4nvxfZyAcJHOwVENGjTcCBlGiohV',
  },
  {
    id: 'market-1', name: 'ماركت بيتنا', category: 'سوبر ماركت', district: 'النرجس 1', mall: null,
    rating: 4.5, ratingCount: 77, distance: '٣ دقائق', open: true, verified: true,
    description: 'احتياجات البيت اليومية من مكان قريب وسهل الوصول.',
    offer: 'خصومات على منتجات مختارة', offerTag: 'تسوق قريب', phone: '+201000000005',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA3GCI8ZsaVNrgAj8e3Mo2DYwtcQotj4hfiASYtQhSGFOZos0Cm9KoCsNdoB-D6cAwAhZuEdc45OGrTGLLTQGfD-3J2C33b9R9A3CZscs7J0Skcg25R4GULBtKc1orFzyxrzOauF5t9XTIDg3s9mtCnv6cQ0K89LSUUEikKp7cqn-W0be1rRiWsiJJrTv7TU4rDvAeWL2kqlfyuBl9iSmtxAlB8seUe5fC5qC8a_kxXpf3zzNPL7_fU',
  },
  {
    id: 'florist-1', name: 'وردة وريحان', category: 'عناية وجمال', district: 'النرجس 2', mall: null,
    rating: 4.9, ratingCount: 51, distance: '٥ دقائق', open: true, verified: true,
    description: 'تنسيقات زهور وهدايا صغيرة للمناسبات والبيت.',
    offer: 'تنسيق هدية بدون رسوم', offerTag: 'هدية لك', phone: '+201000000006',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsNnVxSNZVoOvLcO0AwHQsbCeEkKtwyVPUA_LKvSoXpnOK_lXILytCO9c142qqOQtJdqN5NcQ-6TbM8rWpER0KzsS98KhAgokc3cmDOogKQunBUg7nIV2ZwoGg0hg29Ujd37vyhBAdF5kHAONIO9IqD32XMCpP2oiRIQOeW0LMCPohr_oJZ291cuxUFnGB2XNFuAtE2TWe1wOndPGm0yR0ISTN9CBVlqo1Z',
  },
];

export const samplePrivateReviews = [
  { business: 'مخبز وحلويات ريحانة', stars: 5, comment: 'الخبز طازة والخدمة سريعة، ياريت العرض يبقى طول الأسبوع.', reviewer: 'م. أ.', time: 'منذ ساعتين' },
  { business: 'كافيه روزيتا', stars: 4, comment: 'المكان لطيف جدًا، وقت الانتظار كان طويل شوية.', reviewer: 'س. م.', time: 'أمس' },
];

export const initialTickets = [
  { id: 'NR-2048', title: 'إضاءة السلم · الدور الثالث', category: 'كهرباء وإنارة', status: 'قيد المتابعة', date: 'اليوم · 10:24 ص' },
  { id: 'NR-2031', title: 'تسريب في ماسورة خارجية', category: 'سباكة عامة', status: 'تم الحل', date: 'أمس · 6:10 م' },
];

export const policies = [
  { id: 'terms', label: 'شروط استخدام التطبيق', required: true },
  { id: 'privacy', label: 'سياسة الخصوصية واستخدام البيانات', required: true },
  { id: 'conduct', label: 'قواعد الاستخدام والتعامل', required: true },
];
