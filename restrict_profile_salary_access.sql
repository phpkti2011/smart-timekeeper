-- =====================================================================
-- SIẾT QUYỀN ĐỌC LƯƠNG   ⚠️  FILE NGUY HIỂM NHẤT TRONG DỰ ÁN  ⚠️
--
-- Hiện trạng: App.tsx gọi profiles.select('*') KHÔNG LỌC. Mọi nhân viên đăng
-- nhập đều tải về base_salary, allowance, insurance_salary của CẢ CÔNG TY.
-- Chỉ cần mở DevTools → Network là đọc được. salary_changes và bonuses cũng
-- vậy; requests thì lộ số tiền đơn ứng lương của đồng nghiệp.
--
-- Sau file này: LƯƠNG chỉ chủ hồ sơ và Admin đọc được. DANH BẠ tối thiểu
-- (tên / ảnh / chức vụ / trạng thái / mã NV / ngày sinh / ngày nghỉ việc) vẫn
-- mở cho mọi người đăng nhập qua VIEW employee_directory.
--
-- ⚠️ ĐIỀU KIỆN TIÊN QUYẾT — KHÔNG CHẠY NẾU CHƯA CÓ:
--   Bản app đang chạy phải ĐÃ có nhánh đọc employee_directory (App.tsx
--   fetchAllData, utils/pushNotifications.ts) và hàm refreshCurrentUser.
--   Chạy trước khi deploy code sẽ làm Lịch công ty của nhân viên trống trơn
--   và Admin ngừng nhận thông báo đơn từ.
--
-- ⚠️ CHẠY THEO HAI PHẦN, KHÔNG DÁN CẢ FILE MỘT LẦN:
--   PHẦN A (BƯỚC 0–4) chỉ TẠO THÊM, chưa siết gì. Chạy xong tự kiểm tra
--   trên trình duyệt bằng tài khoản nhân viên thật.
--   PHẦN B (BƯỚC 5–8) mới thực sự đổi policy.
--   Hỏng → dán KHỐI HOÀN TÁC ở cuối file (5 giây, không mất dữ liệu).
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  PHẦN A — CHỈ TẠO THÊM, CHƯA SIẾT GÌ                          ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- BƯỚC 0: NHÌN TRƯỚC KHI SỬA. Chụp màn hình kết quả các câu này và giữ lại —
-- khối hoàn tác cuối file cần biết policy cũ trông ra sao.

-- 0a. RLS đang bật ở bảng nào?
SELECT rel.relname AS bang, rel.relrowsecurity AS rls_dang_bat
FROM   pg_class rel
JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
WHERE  ns.nspname = 'public'
  AND  rel.relname IN ('profiles', 'salary_changes', 'bonuses', 'requests')
ORDER  BY rel.relname;

-- 0b. Toàn bộ policy hiện có trên 4 bảng.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename IN ('profiles', 'salary_changes', 'bonuses', 'requests')
ORDER  BY tablename, cmd, policyname;

-- 0c. Trigger tạo profiles lúc đăng ký có chạy bằng quyền owner không?
-- prosecdef = true là SECURITY DEFINER → siết RLS không ảnh hưởng đăng ký.
-- prosecdef = false → sau PHẦN B phải thử đăng ký tài khoản mới.
SELECT tg.tgname, p.proname, p.prosecdef AS security_definer
FROM   pg_trigger tg
JOIN   pg_proc p ON p.oid = tg.tgfoid
JOIN   pg_class c ON c.oid = tg.tgrelid
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'auth' AND c.relname = 'users' AND NOT tg.tgisinternal;

-- ⚠️ ĐỌC KỸ KẾT QUẢ 0a/0b TRƯỚC KHI ĐI TIẾP:
--   (1) rls_dang_bat = false ở bảng nào → bảng đó ĐANG MỞ TOANG, mọi policy
--       đều vô nghĩa. BƯỚC 5 sẽ bật. Khoảnh khắc bật RLS là lúc nguy hiểm
--       nhất: mọi truy vấn chưa có policy sẽ trả rỗng. Nếu 0a cho thấy RLS
--       đang TẮT ở nhiều bảng khác nữa (attendance_logs, holidays…) thì DỪNG
--       và rà lại toàn bộ trước, đừng chạy tiếp.
--   (2) Policy UPDATE trên `requests` có qual = true (hoặc không có policy
--       nào mà RLS lại tắt) → HÔM NAY một nhân viên mở DevTools đã TỰ DUYỆT
--       được đơn tăng ca / nghỉ phép / ỨNG LƯƠNG của chính mình. Đây là lỗ
--       NẶNG HƠN lộ lương. Vá bằng BƯỚC 7b.
--   (3) Policy SELECT hiện có toàn `true` chứ không có auth.uid() ở đâu →
--       có thể dự án không đi qua Supabase Auth → auth.uid() trả NULL → mọi
--       policy dưới đây khớp 0 người → app chết. DỪNG LẠI, hỏi lại.

-- BƯỚC 1: Hàm kiểm Admin.
-- ⚠️ VÌ SAO PHẢI CÓ HÀM NÀY, KHÔNG VIẾT EXISTS THẲNG TRONG POLICY:
--   Policy ĐẶT TRÊN profiles mà lại SELECT profiles sẽ gây
--   "42P17 infinite recursion detected in policy for relation profiles"
--   và KHOÁ CỨNG TOÀN BỘ APP. Khuôn EXISTS ở add_delete_request_policy.sql
--   chạy được vì policy đó đặt trên `requests`, không phải trên `profiles`.
--   SECURITY DEFINER cho hàm chạy bằng quyền owner ⇒ không kích hoạt RLS
--   ⇒ cắt vòng lặp. SET search_path = public để không bị đánh tráo bảng.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- BƯỚC 2: VIEW danh bạ — 8 cột, cố ý KHÔNG có base_salary / allowance /
-- insurance_salary / used_leave_legacy / email / phone / contract_date.
-- ⚠️ CỐ Ý KHÔNG đặt security_invoker = true. View này PHẢI bỏ qua RLS của
--   profiles thì nhân viên mới đọc được dòng của đồng nghiệp. Supabase
--   Advisor sẽ cảnh báo "security_definer_view" — ĐÓ LÀ CHỦ ĐÍCH, đừng
--   "sửa cho hết warning": sửa là Lịch công ty trống trơn ngay.
--   Bù lại: WHERE auth.uid() IS NOT NULL chặn người chưa đăng nhập, và
--   REVOKE khỏi anon chặn ai cầm anon key trần.
CREATE OR REPLACE VIEW public.employee_directory AS
  SELECT id, name, avatar, role, status, employee_code, date_of_birth, resignation_date
  FROM   public.profiles
  WHERE  auth.uid() IS NOT NULL;

REVOKE ALL ON public.employee_directory FROM PUBLIC, anon;
GRANT SELECT ON public.employee_directory TO authenticated;

COMMENT ON VIEW public.employee_directory IS
  'Danh bạ tối thiểu cho MỌI người đăng nhập, KHÔNG có lương/email/SĐT. Cố ý KHÔNG security_invoker để bỏ qua RLS của profiles (đó là mục đích). Sửa view này thì đọc restrict_profile_salary_access.sql trước.';

-- BƯỚC 3: Kiểm tra PHẦN A.
-- Phải ra ĐÚNG 8 dòng, KHÔNG có base_salary / allowance / insurance_salary / phone / email.
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'employee_directory'
ORDER  BY ordinal_position;

SELECT public.is_admin() AS ban_co_phai_admin;

-- BƯỚC 4: ⛔ DỪNG Ở ĐÂY.
-- Mở trình duyệt, đăng nhập bằng TÀI KHOẢN NHÂN VIÊN THƯỜNG, kiểm:
--   • Lịch công ty vẫn thấy sinh nhật + nghỉ phép đồng nghiệp (app đang đọc
--     employee_directory).
--   • Gửi thử một đơn nghỉ phép → Admin vẫn nhận push.
-- OK rồi mới sang PHẦN B.


-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  PHẦN B — SIẾT THẬT                                           ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- BƯỚC 5: Bật RLS (không sao nếu đã bật).
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonuses        ENABLE ROW LEVEL SECURITY;

-- BƯỚC 6: profiles — gỡ MỌI policy SELECT cũ rồi tạo lại.
-- ⚠️ VÌ SAO PHẢI GỠ: policy PERMISSIVE được OR với nhau. Còn sót một
--   policy `USING (true)` là policy mới của ta VÔ TÁC DỤNG hoàn toàn,
--   mà app vẫn chạy bình thường nên KHÔNG AI BIẾT là chưa siết được gì.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE  polrelid = 'public.profiles'::regclass AND polcmd IN ('r', '*')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.polname);
    RAISE NOTICE 'Đã gỡ policy đọc cũ trên profiles: %', r.polname;
  END LOOP;
END $$;

CREATE POLICY "Own profile or admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- Ghi: CHỈ Admin. Nhân viên KHÔNG BAO GIỜ cần UPDATE profiles — thay đổi đi
-- qua đơn PROFILE và do Admin áp dụng. Mở quyền own-row update là cho nhân
-- viên tự sửa base_salary của chính mình.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE  polrelid = 'public.profiles'::regclass AND polcmd = 'w'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.polname);
    RAISE NOTICE 'Đã gỡ policy ghi cũ trên profiles: %', r.polname;
  END LOOP;
END $$;

CREATE POLICY "Admin can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- BƯỚC 7: salary_changes + bonuses — cùng khuôn "của mình hoặc Admin".
-- Client vốn đã lọc theo userId (salaryCalculator.ts getEffectiveSalaryAttributes,
-- App.tsx myBonuses); màn Admin có is_admin(). Không có đường đọc nào gãy.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE  polrelid = 'public.salary_changes'::regclass AND polcmd IN ('r', '*')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.salary_changes', r.polname);
  END LOOP;
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE  polrelid = 'public.bonuses'::regclass AND polcmd IN ('r', '*')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.bonuses', r.polname);
  END LOOP;
END $$;

CREATE POLICY "Own salary history or admin"
  ON public.salary_changes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Own bonuses or admin"
  ON public.bonuses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- BƯỚC 7b (CHỈ nếu BƯỚC 0b cho thấy UPDATE requests đang mở cho mọi người):
-- Không cho nhân viên tự đổi status đơn của chính mình.
-- Bỏ dấu -- ở 3 dòng dưới để chạy.
-- DROP POLICY IF EXISTS "Admin can update requests" ON public.requests;
-- CREATE POLICY "Admin can update requests" ON public.requests
--   FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- BƯỚC 7c: requests — giấu số tiền ứng lương của đồng nghiệp.
-- Lịch công ty VẪN thấy đơn nghỉ / đổi ngày nghỉ của mọi người (cố ý).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE  polrelid = 'public.requests'::regclass AND polcmd IN ('r', '*')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.requests', r.polname);
    RAISE NOTICE 'Đã gỡ policy đọc cũ trên requests: %', r.polname;
  END LOOP;
END $$;

CREATE POLICY "Requests visible except others advances"
  ON public.requests FOR SELECT TO authenticated
  USING (type <> 'ADVANCE' OR user_id = auth.uid() OR public.is_admin());

-- BƯỚC 8: KIỂM TRA SAU. Đối chiếu với ảnh chụp ở BƯỚC 0b.
SELECT tablename, policyname, cmd, qual
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename IN ('profiles', 'salary_changes', 'bonuses', 'requests')
ORDER  BY tablename, cmd;

-- Rồi làm bảng kiểm tra C trong kế hoạch: đăng nhập nhân viên, DevTools console
--   await supabase.from('profiles').select('id,name,base_salary')   → chỉ 1 dòng
--   await supabase.from('salary_changes').select('*')              → chỉ dòng của mình
--   await supabase.from('profiles').update({base_salary:1}).eq('id', myId).select() → []
-- Tab Lương của chính mình vẫn đúng số; Lịch công ty vẫn đủ tên; đăng ký
-- tài khoản mới vẫn tạo được profile.


-- =====================================================================
-- 🔙 KHỐI HOÀN TÁC — dán khi app hỏng sau PHẦN B. Không mất dữ liệu, chỉ
-- trả policy về "mọi người đăng nhập đọc được tất cả" như trước.
-- VIEW employee_directory và hàm is_admin() để nguyên: chúng vô hại, và app
-- (có nhánh fallback) chạy được với cả hai trạng thái.
-- Bỏ dấu -- ở đầu mỗi dòng rồi chạy.
-- =====================================================================
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.profiles'::regclass AND polcmd IN ('r','*')
--   LOOP EXECUTE format('DROP POLICY %I ON public.profiles', r.polname); END LOOP;
--   FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.salary_changes'::regclass AND polcmd IN ('r','*')
--   LOOP EXECUTE format('DROP POLICY %I ON public.salary_changes', r.polname); END LOOP;
--   FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.bonuses'::regclass AND polcmd IN ('r','*')
--   LOOP EXECUTE format('DROP POLICY %I ON public.bonuses', r.polname); END LOOP;
--   FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.requests'::regclass AND polcmd IN ('r','*')
--   LOOP EXECUTE format('DROP POLICY %I ON public.requests', r.polname); END LOOP;
-- END $$;
-- CREATE POLICY "Anyone authenticated can read profiles"       ON public.profiles       FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Anyone authenticated can read salary_changes" ON public.salary_changes FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Anyone authenticated can read bonuses"        ON public.bonuses        FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Anyone authenticated can read requests"       ON public.requests       FOR SELECT TO authenticated USING (true);
-- -- Nếu BƯỚC 0b cho thấy trước đây có policy UPDATE profiles khác "Admin can update profiles"
-- -- thì tạo lại nó theo ảnh chụp.
