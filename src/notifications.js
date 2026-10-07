import { supabase } from './supabase';

function decodeVapidKey(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export async function enablePushNotifications() {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('الإشعارات غير مدعومة في هذا المتصفح.');
  if (!supabase) throw new Error('اربط Supabase أولًا لتسجيل جهازك بأمان.');
  if (!vapidPublicKey) throw new Error('أضف مفتاح VAPID العام إلى إعدادات التطبيق أولًا.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('سجّل الدخول قبل تفعيل الإشعارات.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يتم السماح بالإشعارات. يمكنك تفعيلها من إعدادات الجهاز.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(vapidPublicKey) });
  const value = subscription.toJSON();
  const { error: saveError } = await supabase.from('push_subscriptions').upsert({
    user_id: data.user.id,
    endpoint: value.endpoint,
    p256dh: value.keys.p256dh,
    auth_secret: value.keys.auth,
  }, { onConflict: 'user_id,endpoint' });
  if (saveError) throw saveError;
  return true;
}
