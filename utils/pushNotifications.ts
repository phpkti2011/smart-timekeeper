import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function registerPushSubscription(userId: string): Promise<boolean> {
  console.log('[PUSH] Starting registration, VAPID key:', VAPID_PUBLIC_KEY ? 'SET (' + VAPID_PUBLIC_KEY.substring(0, 10) + '...)' : 'EMPTY');

  if (!VAPID_PUBLIC_KEY) {
    console.error('[PUSH] VAPID_PUBLIC_KEY not configured!');
    return false;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.error('[PUSH] Push notifications not supported by browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[PUSH] Permission:', permission);
    if (permission !== 'granted') return false;

    console.log('[PUSH] Registering service worker...');
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    console.log('[PUSH] Service worker ready');

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log('[PUSH] Creating new subscription...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    console.log('[PUSH] Subscription endpoint:', subscription.endpoint.substring(0, 50) + '...');

    const subJson = subscription.toJSON();

    console.log('[PUSH] Saving to Supabase for user:', userId);
    const { data, error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }, { onConflict: 'user_id,endpoint' });

    if (error) {
      console.error('[PUSH] Supabase save FAILED:', error);
      return false;
    }
    console.log('[PUSH] Saved successfully!', data);
    return true;
  } catch (err) {
    console.error('[PUSH] Registration FAILED:', err);
    return false;
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    const apiSecret = import.meta.env.VITE_PUSH_API_SECRET || '';
    await fetch('/api/send-push-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiSecret ? { 'Authorization': `Bearer ${apiSecret}` } : {})
      },
      body: JSON.stringify({ userId, title, body, url })
    });
  } catch (err) {
    console.error('Failed to send push notification:', err);
  }
}

export async function sendPushToAdmins(
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'Admin')
      .eq('status', 'ACTIVE');

    if (admins) {
      for (const admin of admins) {
        sendPushToUser(admin.id, title, body, url);
      }
    }
  } catch (err) {
    console.error('Failed to send push to admins:', err);
  }
}

export async function sendPushToManagers(
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['Admin', 'Manager'])
      .eq('status', 'ACTIVE');

    if (managers) {
      for (const mgr of managers) {
        sendPushToUser(mgr.id, title, body, url);
      }
    }
  } catch (err) {
    console.error('Failed to send push to managers:', err);
  }
}
