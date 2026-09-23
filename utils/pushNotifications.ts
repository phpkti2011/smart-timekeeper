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

/**
 * Danh sách id Admin đang hoạt động — người nhận thông báo khi có đơn mới.
 *
 * Đọc từ VIEW employee_directory chứ không phải bảng profiles: hàm này do
 * NHÂN VIÊN THƯỜNG gọi lúc gửi đơn, mà sau khi siết RLS họ chỉ còn đọc được
 * dòng profiles của chính mình → lọc role='Admin' sẽ trả rỗng và Admin
 * ngừng nhận thông báo IM LẶNG. View chưa tồn tại (chưa chạy
 * restrict_profile_salary_access.sql) thì lùi về profiles.
 *
 * status NULL = hồ sơ cũ chưa có cột này, vẫn coi là đang hoạt động.
 * resignation_date NULL = chưa nghỉ việc.
 */
async function activeAdminIds(): Promise<string[]> {
  const pick = (rows: { id: string }[] | null) => (rows || []).map(r => r.id);

  const { data, error } = await supabase
    .from('employee_directory')
    .select('id')
    .eq('role', 'Admin')
    .or('status.eq.ACTIVE,status.is.null')
    .is('resignation_date', null);
  if (!error) return pick(data);

  const fb = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'Admin')
    .or('status.eq.ACTIVE,status.is.null')
    .is('resignation_date', null);
  return pick(fb.data);
}

/** Gửi cho mọi Admin đang hoạt động. Chỉ Admin — Quản Lý Sản Xuất không duyệt được đơn nào. */
export async function sendPushToAdmins(
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    for (const id of await activeAdminIds()) {
      sendPushToUser(id, title, body, url);
    }
  } catch (err) {
    console.error('Failed to send push to admins:', err);
  }
}

/**
 * Tên cũ, giữ để không phải sửa 7 chỗ gọi. Trước đây lọc ['Admin','Manager']
 * nhưng 'Manager' không phải giá trị trong UserRole nên thực tế chỉ Admin nhận;
 * nay gọi thẳng sendPushToAdmins cho đúng với thực tế.
 */
export const sendPushToManagers = sendPushToAdmins;
