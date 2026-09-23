-- =====================================================================
-- BẢNG push_subscriptions (Web Push Notifications)
-- Chạy trên Supabase → SQL Editor. CHẠY LẠI ĐƯỢC NHIỀU LẦN.
--
-- Mỗi thiết bị đã bật thông báo là một dòng (một người có thể nhiều thiết bị).
-- Nhân viên tự ghi/đọc/xoá dòng của mình; server (service_role) đọc hết để gửi
-- push và xoá endpoint chết — xem utils/pushNotifications.ts,
-- api/send-push-notification.ts, api/daily-report.ts.
--
-- Bản cũ của file này dùng CREATE POLICY trần nên chạy lần hai là lỗi
-- "42710: policy ... already exists" — nay đã DROP trước khi tạo.
--
-- ⚠️ QUAN TRỌNG (Supabase đổi từ 30/10): bảng MỚI tạo trong schema public
-- không còn được tự động cấp quyền Data API. Không có khối GRANT ở BƯỚC 4 thì
-- bảng này KHÔNG gọi được qua supabase-js (lỗi "permission denied") ở project
-- mới, preview branch, hoặc sau "supabase db reset" → nút bật thông báo và
-- push buổi sáng của cron CHẾT IM LẶNG. Bảng đã có sẵn thì grant cũ giữ nguyên,
-- chạy lại khối này cũng không hại gì.
-- =====================================================================

-- BƯỚC 0: Xem hiện trạng (chạy lần đầu thì rỗng hết, bình thường).
SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'push_subscriptions'
ORDER  BY cmd, policyname;

SELECT grantee, privilege_type
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public' AND table_name = 'push_subscriptions'
ORDER  BY grantee, privilege_type;

-- BƯỚC 1: Bảng.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Thiết bị đã bật thông báo đẩy. Một người nhiều thiết bị = nhiều dòng. Server dùng service_role để gửi push và dọn endpoint chết (HTTP 410/404).';

-- BƯỚC 2: RLS (chạy lại không sao nếu đã bật).
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- BƯỚC 3: Policy — mỗi người chỉ đụng được dòng của chính mình.
-- DROP trước để chạy lại được; đây chính là chỗ bản cũ báo lỗi 42710.
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can read own subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ⚠️ Policy UPDATE này bản cũ THIẾU. Client ghi bằng
--   .upsert({...}, { onConflict: 'user_id,endpoint' })
-- tức INSERT ... ON CONFLICT DO UPDATE. Không có policy UPDATE thì người dùng
-- bật lại thông báo trên CÙNG một thiết bị (trình duyệt cấp endpoint cũ) sẽ bị
-- chặn im lặng, tưởng là bật rồi mà không nhận được push.
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Service role (server) tự động bỏ qua RLS, không cần policy riêng.

-- BƯỚC 4: Cấp quyền Data API — bắt buộc với bảng tạo mới từ 30/10.
-- KHÔNG cấp cho anon: endpoint push gắn với user_id, người chưa đăng nhập
-- không có việc gì ở đây. RLS ở BƯỚC 3 mới là thứ giới hạn từng dòng; GRANT
-- chỉ mở cửa bảng cho PostgREST.
REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;

-- BƯỚC 5: KIỂM TRA LẠI — phải thấy 4 policy (SELECT/INSERT/UPDATE/DELETE) và
-- quyền của authenticated + service_role, KHÔNG có dòng nào của anon.
SELECT policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'push_subscriptions'
ORDER  BY cmd, policyname;

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS quyen
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public' AND table_name = 'push_subscriptions'
GROUP  BY grantee
ORDER  BY grantee;
