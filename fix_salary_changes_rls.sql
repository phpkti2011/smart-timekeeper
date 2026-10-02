-- Chạy trong SQL Editor của đúng dự án Supabase.
-- Khôi phục quyền thêm/sửa lịch sử lương cho tài khoản có role = 'Admin'.
-- Không sửa số tiền, không tắt RLS, không cấp quyền ghi lương cho nhân viên.
-- Deploy Vercel không tự chạy file SQL này.

-- Kết quả đầu tiên giúp đối chiếu quyền hiện tại trước khi sửa.
SELECT policyname, cmd, roles, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'salary_changes'
ORDER BY cmd, policyname;

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Thiếu hàm public.is_admin(). Cần kiểm tra thiết lập phân quyền Admin trước.';
  END IF;
END $$;

ALTER TABLE public.salary_changes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.salary_changes TO authenticated;

DROP POLICY IF EXISTS "Admin can read salary changes" ON public.salary_changes;
CREATE POLICY "Admin can read salary changes"
  ON public.salary_changes FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert salary changes" ON public.salary_changes;
CREATE POLICY "Admin can insert salary changes"
  ON public.salary_changes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update salary changes" ON public.salary_changes;
CREATE POLICY "Admin can update salary changes"
  ON public.salary_changes FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;

SELECT policyname, cmd, roles, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'salary_changes'
ORDER BY cmd, policyname;

-- Kiểm tra sau khi chạy:
-- 1. Đăng nhập bằng Admin, tải lại app, mở lịch sử Khoa và Phương Anh.
-- 2. Lưu mức lương/ngày áp dụng thực tế cần cập nhật; tải lại để kiểm tra còn lưu.
-- 3. Nếu vẫn lỗi: đối chiếu role tài khoản đăng nhập và các policy RESTRICTIVE
--    trong kết quả trên. Không tắt RLS hoặc đổi USING/WITH CHECK thành true.
-- Lưu ý: is_admin() trong SQL Editor thường là false vì không có phiên Auth
-- của người dùng ứng dụng; không dùng kết quả đó để kết luận Admin bị mất quyền.
