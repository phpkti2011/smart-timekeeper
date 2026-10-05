-- =====================================================================
-- CẤP QUYỀN XOÁ MỐC LỊCH SỬ LƯƠNG CHO ADMIN (public.salary_changes)
-- Chạy trên Supabase → SQL Editor. CHẠY LẠI ĐƯỢC NHIỀU LẦN.
--
-- VÌ SAO CẦN:
--   App có nút "Xoá mốc lịch sử lương" (App.tsx handleDeleteSalaryChange) nhưng
--   bảng salary_changes KHÔNG có policy DELETE nào — phát hiện bằng BƯỚC 9 của
--   fix_bonuses_write_policies.sql ngày 05/10/2026 (cột "xoa" = 0).
--   Thiếu policy DELETE thì Postgres KHÔNG báo lỗi, chỉ lặng lẽ xoá 0 dòng. Admin
--   bấm xoá → thấy "Đã xóa bản ghi lịch sử lương." → F5 là mốc đó quay lại.
--
--   Đây là lần thứ TƯ của cùng một gốc: restrict_profile_salary_access.sql BƯỚC 7
--   gỡ mọi policy có polcmd IN ('r','*') — '*' là FOR ALL, gộp cả đọc lẫn ghi —
--   rồi chỉ cấp lại INSERT + UPDATE cho salary_changes (dòng 213-221), quên DELETE.
--   (Ba lần trước: requests, salary_changes INSERT/UPDATE, rồi bonuses.)
--
-- AI ĐƯỢC XOÁ: chỉ Admin (profiles.role = 'Admin'). Lịch sử lương là căn cứ tính
--   lương ngược về quá khứ, nhân viên không được đụng tới — kể cả dòng của mình.
-- =====================================================================

-- BƯỚC 1: Xem hiện trạng. Trước khi chạy sẽ KHÔNG có dòng nào có lenh = 'DELETE'.
SELECT polname AS ten_policy,
       CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                   ELSE 'ALL' END AS lenh
FROM   pg_policy
WHERE  polrelid = 'public.salary_changes'::regclass
ORDER  BY lenh, polname;

-- BƯỚC 2: Chặn đầu vào — cần hàm is_admin() (restrict_profile_salary_access.sql PHẦN A).
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Thiếu public.is_admin(); chạy PHẦN A của restrict_profile_salary_access.sql trước.';
  END IF;
END $$;

-- BƯỚC 3: Cấp quyền. GRANT ở lớp ngoài, policy lọc dòng ở lớp trong — thiếu vế nào
-- cũng chặn. fix_salary_changes_rls.sql trước đây chỉ GRANT SELECT, INSERT, UPDATE.
GRANT DELETE ON public.salary_changes TO authenticated;

DROP POLICY IF EXISTS "Admin can delete salary changes" ON public.salary_changes;
CREATE POLICY "Admin can delete salary changes"
  ON public.salary_changes FOR DELETE TO authenticated
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

-- BƯỚC 4: KIỂM TRA LẠI — phải thấy ĐÚNG 1 dòng "Admin can delete salary changes".
-- Lưu ý: Supabase SQL Editor chỉ hiện kết quả của câu lệnh CUỐI khi chạy cả file.
-- Muốn xem riêng kết quả một bước thì bôi đen câu đó rồi bấm Run.
SELECT polname AS ten_policy,
       CASE polcmd WHEN 'd' THEN 'DELETE' ELSE polcmd::text END AS lenh
FROM   pg_policy
WHERE  polrelid = 'public.salary_changes'::regclass AND polcmd = 'd';

-- Sau khi chạy: vào hồ sơ một nhân viên → mục Lịch sử lương → xoá một mốc →
-- F5 phải mất hẳn. Nếu báo "KHÔNG XOÁ ĐƯỢC MỐC LỊCH SỬ LƯƠNG" thì file này chưa chạy.

-- =====================================================================
-- 🔙 KHỐI HOÀN TÁC
-- =====================================================================
-- DROP POLICY IF EXISTS "Admin can delete salary changes" ON public.salary_changes;
-- REVOKE DELETE ON public.salary_changes FROM authenticated;
-- NOTIFY pgrst, 'reload schema';
