import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (!dispatchSecret || request.headers.get("x-nargis-push-secret") !== dispatchSecret) return json({ error: "unauthorized" }, 401);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 32_000) return json({ error: "payload too large" }, 413);

  let event: any;
  try {
    const reader=request.body?.getReader();
    if(!reader)return json({error:"invalid payload"},400);
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32_000){await reader.cancel();return json({error:"payload too large"},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    event=JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ error: "invalid payload" }, 400); }
  const notification = event?.record;
  if (event?.type !== "INSERT" || event?.table !== "user_notifications" || typeof notification?.id !== "string" || typeof notification?.user_id !== "string") {
    return json({ ignored: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@nargis.app";
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) return json({ error: "push sender is not configured" }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const { data: subscriptions, error } = await admin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_secret")
    .eq("user_id", notification.user_id)
    .limit(25);
  if (error) {
    console.error("push_subscription_lookup_failed", error.message);
    return json({ error: "subscription lookup failed" }, 500);
  }

  const payload = JSON.stringify({
    title: String(notification.title || "النرجس").slice(0, 100),
    body: String(notification.body || "لديك تحديث جديد.").slice(0, 180),
    url: typeof notification.target_url === "string" && notification.target_url.startsWith("/") ? notification.target_url : "/",
    tag: String(notification.id),
  });
  const expired: string[] = [];
  let delivered = 0;
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
      }, payload, { TTL: 3600, urgency: "normal" });
      delivered += 1;
    } catch (error) {
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) expired.push(subscription.id);
      else console.error("web_push_delivery_failed", status || "unknown");
    }
  }
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return json({ delivered, expired: expired.length });
});
