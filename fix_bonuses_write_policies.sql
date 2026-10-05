-- =====================================================================
-- MỞ LẠI QUYỀN GHI BẢNG bonuses (thưởng / phạt)
-- Chạy trên Supabase → SQL Editor. CHẠY LẠI ĐƯỢC NHIỀU LẦN.
--
-- TRIỆU CHỨNG:
--   Admin bấm "Lưu Danh Sách" ở màn Nhập Thưởng Hàng Loạt →
--   "new row violates row-level security policy for table bonuses" (mã 42501).
--   Sửa và xoá thưởng thì KHÔNG báo lỗi nhưng cũng KHÔNG ăn: tải lại là về như cũ.
--   Nút "Hoàn chốt lương" của Admin báo thành công nhưng nhãn "Đã chốt" quay lại sau F5.
--
-- VÌ SAO HỎNG:
--   restrict_profile_salary_access.sql (PHẦN B, BƯỚC 7, dòng 199-204) gỡ MỌI policy
--   của bonuses có polcmd IN ('r','*'). Ký tự '*' là FOR ALL — mà policy ALL gộp cả
--   đọc lẫn ghi, nên GỠ POLICY ĐỌC LÀ GỠ LUÔN QUYỀN GHI. Sau đó file chỉ tạo lại đúng
--   một policy đọc "Own bonuses or admin" (dòng 223-225).
--   Cùng lỗi này đã xảy ra với salary_changes và requests, và đã được vá ngay trong
--   file đó (dòng 213-221 và 245-261) — riêng bonuses nằm giữa hai đoạn vá mà bị quên.
--   Quyền đọc còn nguyên nên mọi màn hình lương vẫn đúng số, vì vậy không ai phát hiện
--   cho tới lần nhập thưởng đầu tiên sau khi siết quyền.
--
-- FILE NÀY LÀM GÌ:
--   Cấp lại quyền ghi cho Admin (thêm / sửa / xoá) và chừa đúng một đường cho nhân
--   viên: tự chèn dòng "xác nhận chốt lương" của chính mình. KHÔNG đụng tới policy đọc
--   "Own bonuses or admin" — việc chặn lộ lương giữ nguyên.
--
-- QUYỀN SAU KHI CHẠY:
--   | Thao tác trên bonuses          | Admin     | 7 vai trò còn lại     |
--   |--------------------------------|-----------|-----------------------|
--   | Đọc                            | mọi người | chỉ dòng của mình     |
--   | Thêm thưởng / phạt             | có        | KHÔNG                 |
--   | Thêm dòng xác nhận chốt lương  | có        | có, chỉ của chính mình|
--   | Sửa                            | có        | KHÔNG                 |
--   | Xoá / hoàn chốt lương          | có        | KHÔNG, đã chốt là chốt|
--
--   Admin = profiles.role = 'Admin' (so chuỗi chính xác, phân biệt hoa thường).
--   Trong 8 vai trò của app, CHỈ 'Admin' là đặc quyền: 'Quản Lý Sản Xuất' và
--   'Nhân Viên Kế Toán' nghe như cấp quản lý nhưng với CSDL vẫn là nhân viên thường.
--   Cần thêm người nhập thưởng thì ĐẶT ROLE 'Admin' cho họ — mở policy theo vai trò
--   khác là vô ích vì giao diện cũng khoá hai tab đó sau isAdmin.
-- =====================================================================

-- BƯỚC 0: Chụp hiện trạng. Trước khi chạy thường chỉ thấy ĐÚNG 1 dòng:
-- "Own bonuses or admin" (SELECT). Không có dòng INSERT/UPDATE/DELETE nào.
SELECT policyname, cmd, roles, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'bonuses'
ORDER  BY cmd, policyname;

BEGIN;

-- BƯỚC 1: Chặn đầu vào. Thiếu hàm này thì mọi policy dưới đây vô nghĩa.
-- Hàm được tạo ở restrict_profile_salary_access.sql PHẦN A (dòng 81-89).
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Thiếu public.is_admin(); chạy PHẦN A của restrict_profile_salary_access.sql trước.';
  END IF;
END $$;

ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

-- BƯỚC 2: Quyền bảng. Repo chưa từng có GRANT nào cho bonuses, trong khi
-- salary_changes và requests đều đã được cấp. RLS chỉ lọc dòng SAU KHI đã qua
-- lớp quyền bảng này, nên thiếu GRANT là chặn từ vòng ngoài.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonuses TO authenticated;

-- BƯỚC 3: Gỡ policy cũ đã mục.
-- "Allow employees to insert salary confirmation" (bản cuối ở fix_rls_v5.sql) trỏ vào
-- bảng public.employees — app không còn dùng bảng này (nay là profiles) — và thiếu
-- mệnh đề TO nên đang áp cho cả anon. Giữ lại chỉ sinh lỗi khó đoán.
-- BƯỚC 6 dưới đây dựng lại đúng chức năng đó trên auth.uid().
DROP POLICY IF EXISTS "Allow employees to insert salary confirmation" ON public.bonuses;

-- BƯỚC 4: Admin thêm thưởng / phạt cho bất kỳ ai.
DROP POLICY IF EXISTS "Admin can insert bonuses" ON public.bonuses;
CREATE POLICY "Admin can insert bonuses"
  ON public.bonuses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- BƯỚC 5: Admin sửa và xoá.
-- DELETE là thứ nút "Hoàn chốt lương" ở tab Lương cần: hoàn chốt = xoá dòng
-- CONFIRMATION của nhân viên đó. Thiếu policy này thì nút báo thành công giả.
DROP POLICY IF EXISTS "Admin can update bonuses" ON public.bonuses;
CREATE POLICY "Admin can update bonuses"
  ON public.bonuses FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can delete bonuses" ON public.bonuses;
CREATE POLICY "Admin can delete bonuses"
  ON public.bonuses FOR DELETE TO authenticated
  USING (public.is_admin());

-- BƯỚC 6: Đường DUY NHẤT để nhân viên thường ghi vào bảng này — dòng "xác nhận
-- chốt lương" của chính mình (App.tsx handleConfirmSalary gửi amount 0, type BONUS,
-- reason 'CONFIRMATION: Salary Month MM/yyyy').
-- Bốn điều kiện ràng cùng lúc nên không lách thành thưởng tiền được:
--   user_id = auth.uid()         → không ghi hộ người khác
--   amount = 0                   → không ra tiền
--   type = 'BONUS'               → không tạo dòng phạt
--   reason LIKE 'CONFIRMATION:%' → đúng loại dòng xác nhận
-- Hai policy INSERT (bước 4 và bước 6) được PostgreSQL ghép bằng OR: Admin vẫn chèn
-- được mọi dòng, nhân viên chỉ lọt đúng dòng xác nhận của mình.
-- CỐ Ý KHÔNG cấp DELETE cho nhân viên: đã xác nhận chốt lương là chốt, chỉ Admin
-- hoàn tác được (qua policy ở BƯỚC 5).
DROP POLICY IF EXISTS "Own salary confirmation" ON public.bonuses;
CREATE POLICY "Own salary confirmation"
  ON public.bonuses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND amount = 0
    AND type   = 'BONUS'
    AND reason LIKE 'CONFIRMATION:%'
  );

COMMIT;

-- BƯỚC 7: Nhắc PostgREST nạp lại sơ đồ. Supabase thường tự làm; gửi thêm cho chắc.
NOTIFY pgrst, 'reload schema';

-- BƯỚC 8: KIỂM TRA LẠI — phải thấy ĐÚNG 5 dòng:
--   DELETE  Admin can delete bonuses
--   INSERT  Admin can insert bonuses
--   INSERT  Own salary confirmation
--   SELECT  Own bonuses or admin      ← của file cũ, phải còn nguyên
--   UPDATE  Admin can update bonuses
SELECT policyname, cmd, roles, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'bonuses'
ORDER  BY cmd, policyname;

-- BƯỚC 9: QUÉT CÁC BẢNG CÒN LẠI — chỉ đọc, không sửa gì.
-- Cùng lỗi này đã xảy ra 3 lần (salary_changes, requests, rồi bonuses). Bảng nào có
-- số ở cột "doc" mà để trống "them"/"sua"/"xoa" là ứng viên hỏng tiếp theo: đọc vẫn
-- chạy nên không ai thấy, tới lúc nhập liệu mới lộ. Đọc kết quả rồi báo lại.
SELECT c.relname AS bang,
       count(p.polname) FILTER (WHERE p.polcmd IN ('r','*')) AS doc,
       count(p.polname) FILTER (WHERE p.polcmd IN ('a','*')) AS them,
       count(p.polname) FILTER (WHERE p.polcmd IN ('w','*')) AS sua,
       count(p.polname) FILTER (WHERE p.polcmd IN ('d','*')) AS xoa
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
LEFT   JOIN pg_policy p ON p.polrelid = c.oid
WHERE  n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
GROUP  BY c.relname
ORDER  BY c.relname;

-- Sau khi chạy, kiểm tra trên app:
--   1. Admin → Nhập Thưởng Hàng Loạt → Lưu Danh Sách: hết báo lỗi, F5 vẫn còn.
--   2. Admin → sửa một lô thưởng: tổng phải là tổng MỚI, không cộng dồn lô cũ.
--   3. Nhân viên → Xác nhận chốt lương: chạy được.
--   4. Admin → nhãn "Đã chốt" → Hoàn chốt ngay: F5 xong nhãn phải mất hẳn.

-- =====================================================================
-- 🔙 KHỐI HOÀN TÁC — dán khi cần trả bonuses về đúng trạng thái trước file này.
-- Không mất dữ liệu, chỉ gỡ quyền ghi (và app sẽ hỏng lại y như cũ).
-- =====================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "Admin can insert bonuses"  ON public.bonuses;
--   DROP POLICY IF EXISTS "Admin can update bonuses"  ON public.bonuses;
--   DROP POLICY IF EXISTS "Admin can delete bonuses"  ON public.bonuses;
--   DROP POLICY IF EXISTS "Own salary confirmation"   ON public.bonuses;
--   REVOKE INSERT, UPDATE, DELETE ON public.bonuses FROM authenticated;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
