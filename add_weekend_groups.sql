-- =====================================================================
-- NHÓM LÀM CHỦ NHẬT A/B: cột profiles.weekend_group + siết ghi bảng settings
-- Chạy trên Supabase → SQL Editor TRƯỚC KHI deploy bản mới.
--
-- Tính năng: Admin xếp nhân viên vào nhóm A/B, chọn nhóm nào làm Chủ Nhật nào
-- (luân phiên từ một Chủ Nhật mốc, ghim tay từng tuần). Lịch lưu ở
-- settings.key = 'weekend_schedule' (một bản JSON). Người trong nhóm làm CN
-- tuần này được nhắc làm đơn đổi ngày nghỉ (nghỉ T7, làm bù CN —
-- add_swap_request_type.sql). KHÔNG có luật tiền mới.
--
-- Vì sao cần chạy:
--   1. Cột profiles.weekend_group chưa có → Admin không xếp nhóm được, và
--      payload sửa nhân viên (nay có weekend_group) sẽ bị từ chối.
--   2. Bảng settings hiện KHÔNG có file SQL nào trong repo định nghĩa policy.
--      Nếu ghi đang mở cho mọi người đăng nhập thì nhân viên tự đổi được lịch
--      (và cả toạ độ GPS công ty) bằng DevTools. BƯỚC 3 siết về Admin.
--   3. View employee_directory (nếu đã tạo bởi restrict_profile_salary_access.sql)
--      cần thêm cột weekend_group để nhân viên thấy nhóm của đồng nghiệp.
--   4. Đưa settings vào publication realtime để lịch mới hiện ngay trên máy khác.
-- Chạy lại được nhiều lần (IF NOT EXISTS / DROP IF EXISTS).
-- =====================================================================

-- BƯỚC 0: NHÌN TRƯỚC KHI SỬA. Chụp màn hình kết quả để đối chiếu với BƯỚC 6.
-- 0a. Cột đã có chưa?
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'profiles' AND column_name = 'weekend_group';

-- 0b. RLS của settings đang bật chưa, và có những policy nào?
SELECT relname AS bang, relrowsecurity AS rls_bat
FROM   pg_class
WHERE  oid = 'public.settings'::regclass;

SELECT policyname, cmd, roles, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'settings'
ORDER  BY cmd, policyname;
-- Đọc: KHÔNG có dòng nào và rls_bat = false → ai đăng nhập cũng ghi được.
--      Có policy INSERT/UPDATE với with_check = 'true' → cũng vậy.
--      BƯỚC 3 bên dưới xử lý cả hai trường hợp.

-- 0c. settings đã nằm trong publication realtime chưa?
SELECT pubname, tablename
FROM   pg_publication_tables
WHERE  schemaname = 'public' AND tablename = 'settings';

-- BƯỚC 1: Cột nhóm. TEXT + CHECK thay vì ENUM để sau này thêm nhóm C không phải ALTER TYPE.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekend_group TEXT DEFAULT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_weekend_group_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_weekend_group_check
  CHECK (weekend_group IS NULL OR weekend_group IN ('A', 'B'));

COMMENT ON COLUMN public.profiles.weekend_group IS
  'Nhóm làm Chủ Nhật luân phiên: A | B | NULL (chưa xếp). Chỉ Admin sửa. Nhóm nào làm CN nào nằm ở settings.key = weekend_schedule. Xem utils/weekendGroups.ts.';

-- BƯỚC 2: Hàm kiểm Admin — chép nguyên văn từ restrict_profile_salary_access.sql
-- (CREATE OR REPLACE, cùng thân hàm) để file này chạy được dù file kia đã chạy
-- hay chưa. SECURITY DEFINER để policy không tự đọc profiles (tránh 42P17).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- BƯỚC 3: Siết ghi bảng settings về Admin. Mọi người đăng nhập vẫn ĐỌC được
-- (app cần GPS/IP và lịch nhóm). Upsert = INSERT … ON CONFLICT DO UPDATE nên
-- cần CẢ policy INSERT lẫn UPDATE.
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 3a. Gỡ MỌI policy ghi cũ rồi tạo lại — còn sót một policy USING (true) là
-- policy mới vô tác dụng mà không ai biết.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public' AND tablename = 'settings'
      AND  cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.settings', p.policyname);
    RAISE NOTICE 'Đã gỡ policy ghi cũ: %', p.policyname;
  END LOOP;
END $$;

-- 3b. Đọc: mọi người đăng nhập.
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.settings;
CREATE POLICY "Authenticated can read settings"
  ON public.settings FOR SELECT TO authenticated
  USING (true);

-- 3c. Ghi: chỉ Admin.
DROP POLICY IF EXISTS "Admin can insert settings" ON public.settings;
CREATE POLICY "Admin can insert settings"
  ON public.settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update settings" ON public.settings;
CREATE POLICY "Admin can update settings"
  ON public.settings FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can delete settings" ON public.settings;
CREATE POLICY "Admin can delete settings"
  ON public.settings FOR DELETE TO authenticated
  USING (public.is_admin());

-- BƯỚC 4: Nếu view employee_directory ĐÃ tồn tại (restrict_profile_salary_access.sql
-- đã chạy) → tạo lại với 8 cột cũ + weekend_group Ở CUỐI. CREATE OR REPLACE VIEW
-- chỉ cho phép NỐI cột cuối, không cho đổi thứ tự. Chưa có view thì bỏ qua —
-- restrict_profile_salary_access.sql tự đưa cột này vào khi chạy sau.
-- ⚠️ Vẫn CỐ Ý KHÔNG security_invoker (xem ghi chú ở file kia).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'employee_directory') THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.employee_directory AS
        SELECT id, name, avatar, role, status, employee_code, date_of_birth, resignation_date, weekend_group
        FROM   public.profiles
        WHERE  auth.uid() IS NOT NULL
    $v$;
    RAISE NOTICE 'Đã thêm weekend_group vào view employee_directory';
  ELSE
    RAISE NOTICE 'Chưa có view employee_directory — bỏ qua BƯỚC 4';
  END IF;
END $$;

-- BƯỚC 5: Realtime cho settings (lịch mới hiện ngay trên máy nhân viên đang mở app).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE  pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
    RAISE NOTICE 'Đã thêm settings vào supabase_realtime';
  END IF;
END $$;

-- BƯỚC 6: KIỂM TRA LẠI — phải thấy: 1 cột, 1 CHECK, rls_bat = true, 4 policy
-- settings (1 SELECT + 3 ghi dùng is_admin()), view có weekend_group (nếu có
-- view), settings trong publication.
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'profiles' AND column_name = 'weekend_group';

SELECT conname, pg_get_constraintdef(oid) AS dinh_nghia
FROM   pg_constraint
WHERE  conrelid = 'public.profiles'::regclass AND conname = 'profiles_weekend_group_check';

SELECT relrowsecurity AS rls_bat FROM pg_class WHERE oid = 'public.settings'::regclass;

SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'settings'
ORDER  BY cmd, policyname;

SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'employee_directory'
ORDER  BY ordinal_position;

SELECT pubname, tablename
FROM   pg_publication_tables
WHERE  schemaname = 'public' AND tablename = 'settings';

-- =====================================================================
-- HOÀN TÁC (chỉ khi cần): sau BƯỚC 3 Admin không lưu được GPS/IP hoặc lịch
-- (ví dụ is_admin() trả false vì role trong profiles không đúng 'Admin').
-- Bỏ dấu -- rồi chạy: mở lại ghi cho mọi người đăng nhập như trước, giữ
-- nguyên cột, view và realtime. Không mất dữ liệu.
-- =====================================================================
-- DROP POLICY IF EXISTS "Admin can insert settings" ON public.settings;
-- DROP POLICY IF EXISTS "Admin can update settings" ON public.settings;
-- DROP POLICY IF EXISTS "Admin can delete settings" ON public.settings;
-- CREATE POLICY "Authenticated can write settings" ON public.settings
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
