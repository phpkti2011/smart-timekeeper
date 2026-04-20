import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUSH_API_SECRET = process.env.PUSH_API_SECRET || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@smarttimekeeper.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  if (PUSH_API_SECRET) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${PUSH_API_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { userId, title, body, url } = req.body;
  if (!userId || !title) {
    return res.status(400).json({ error: 'Missing userId or title' });
  }

  // Fetch all subscriptions for this user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (error || !subscriptions?.length) {
    return res.status(200).json({ sent: 0, reason: 'No subscriptions found' });
  }

  const payload = JSON.stringify({ title, body, url: url || '/' });
  let sent = 0;
  const staleEndpoints: string[] = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        payload
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        staleEndpoints.push(sub.endpoint);
      }
      console.error(`Push failed for ${sub.endpoint}:`, err.statusCode);
    }
  }

  // Cleanup stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', staleEndpoints);
  }

  return res.status(200).json({ sent, total: subscriptions.length, cleaned: staleEndpoints.length });
}
