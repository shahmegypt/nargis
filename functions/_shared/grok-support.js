const SYSTEM_PROMPT = `أنت مساعد خدمة العملاء داخل تطبيق «النرجس»، دليل الأنشطة والعروض المحلي لسكان النرجس 1 والنرجس 2.
تحدث بالعربية المصرية الواضحة والمهذبة، باختصار وبروح ودودة. استخدم المعلومات التالية فقط كحقائق مؤكدة:
- التطبيق لاكتشاف المحلات والمطاعم والخدمات والعروض المحلية، ويمكن لصاحب النشاط تقديم طلب إدراج وإعلان يخضع لمراجعة الإدارة.
- الأنشطة التجارية يجب أن تكون داخل النرجس 1 أو النرجس 2، ويُراجع موقعها قبل النشر. موقع المهنة الحرة اختياري.
- تقييم النجوم يظهر كمعدل عام. التعليق النصي لصاحب النشاط والإدارة فقط، وهوية المقيّم للإدارة فقط.
- بلاغات الصيانة تخص المرافق العامة (إنارة السلالم، السباكة الخارجية والبلاعات، النظافة العامة، الزراعة والري)، وتظهر للمبلّغ والفريق المخوّل فقط.
- لا يوجد في التطبيق حراسة أو بوابات أو إدارة كومباوند. لا تخترع مواعيد أو أسعار أو حالة طلب أو بيانات نشاط غير معروضة لك.
إذا لم تعرف الإجابة، قل ذلك بوضوح واشرح المسار المناسب داخل التطبيق. لا تطلب كلمة مرور أو كود تحقق أو رقم شقة أو بيانات دفع. لا تطلب تفاصيل شخصية؛ وجّه المستخدم لعدم مشاركتها في المحادثة. لا تدّعِ أنك أنشأت بلاغًا أو تواصلت مع الإدارة. إذا كانت المشكلة عاجلة أو تتعلق بخطر مباشر، وجّه المستخدم للتواصل مع الطوارئ والجهات المختصة محليًا.`;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function handleSupportRequest(request, env = {}) {
  if (request.method !== 'POST') return json({ error: 'الطريقة غير مدعومة.' }, 405);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 16000) return json({ error: 'المحادثة طويلة جدًا. ابدأ محادثة جديدة.' }, 413);
  if (!env.GROK_API_KEY) return json({ error: 'خدمة العملاء الذكية غير مهيأة بعد. أضف مفتاح Grok إلى أسرار الخادم.' }, 503);

  let payload;
  try {
    if (!request.body) return json({ error: 'أرسل رسالة لخدمة العملاء.' }, 400);
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16000) { await reader.cancel(); return json({ error: 'المحادثة طويلة جدًا. ابدأ محادثة جديدة.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ error: 'تعذر قراءة الرسالة.' }, 400); }
  if (!Array.isArray(payload?.messages) || payload.messages.length < 1 || payload.messages.length > 12) {
    return json({ error: 'أرسل من رسالة إلى 12 رسالة في المحادثة.' }, 400);
  }
  const messages = [];
  let totalLength = 0;
  for (const item of payload.messages) {
    if (!['user', 'assistant'].includes(item?.role) || typeof item.content !== 'string') return json({ error: 'تنسيق الرسائل غير صحيح.' }, 400);
    const content = item.content.trim();
    if (!content || content.length > 1200) return json({ error: 'كل رسالة يجب أن تكون أقل من 1200 حرف.' }, 400);
    totalLength += content.length;
    if (totalLength > 7000) return json({ error: 'المحادثة طويلة جدًا. ابدأ محادثة جديدة.' }, 413);
    messages.push({ role: item.role, content });
  }
  if (messages[messages.length - 1].role !== 'user') return json({ error: 'أرسل رسالة جديدة أولًا.' }, 400);

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: 'سجّل الدخول لاستخدام مساعد خدمة العملاء.' }, 401);
  }
  const authHeaders = { authorization, apikey:env.SUPABASE_PUBLISHABLE_KEY };
  try {
    const identity = await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/auth/v1/user`, { headers:authHeaders });
    if (!identity.ok) return json({ error: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.' }, 401);
    const quota = await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/consume_support_quota`, {
      method:'POST', headers:{...authHeaders,'content-type':'application/json'}, body:'{}',
    });
    if (!quota.ok) {
      console.error(JSON.stringify({event:'support_quota_check_failed',status:quota.status}));
      return json({error:'تعذر التحقق من حد استخدام خدمة العملاء. جرّب لاحقًا.'},503);
    }
    if ((await quota.json()) !== true) return json({error:'وصلت للحد المؤقت لمساعد خدمة العملاء. انتظر قليلًا وحاول مرة أخرى.'},429);
  } catch {
    return json({error:'تعذر التحقق من جلسة الدخول الآن.'},503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GROK_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.GROK_MODEL || 'grok-4.7',
        instructions: SYSTEM_PROMPT,
        input: messages,
        temperature: 0.4,
        max_output_tokens: 500,
        store: false,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      console.error(JSON.stringify({ event: 'grok_support_upstream_error', status: upstream.status }));
      return json({ error: upstream.status === 429 ? 'في ضغط على خدمة العملاء الآن. جرّب بعد قليل.' : 'تعذر الحصول على رد الآن. جرّب مرة أخرى بعد قليل.' }, 502);
    }
    const result = await upstream.json();
    const answer = result?.output_text || result?.output
      ?.flatMap((item) => item?.content || [])
      .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
    if (typeof answer !== 'string' || !answer.trim()) return json({ error: 'وصل رد غير مكتمل. جرّب مرة أخرى.' }, 502);
    return json({ answer: answer.trim() });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    console.error(JSON.stringify({ event: timedOut ? 'grok_support_timeout' : 'grok_support_request_failed' }));
    return json({ error: timedOut ? 'استغرق الرد وقتًا طويلًا. جرّب مرة أخرى.' : 'تعذر الاتصال بخدمة العملاء الآن.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
