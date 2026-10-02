-- Chạy toàn bộ file trong Supabase > SQL Editor của dự án Chấm công.
-- Sửa tình trạng bảng requests chỉ có SELECT/DELETE, thiếu INSERT/UPDATE.
-- Không tạo, xoá hoặc đổi trạng thái bất kỳ đơn hiện có nào.
-- Nhân viên: chỉ thêm đơn của chính mình, trạng thái PENDING.
-- Admin: được tạo đơn hộ và cập nhật trạng thái duyệt/từ chối.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Thiếu public.is_admin(); cần kiểm tra thiết lập tài khoản Admin.';
  END IF;
END $$;

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.requests TO authenticated;

DROP POLICY IF EXISTS "Users can submit own pending requests" ON public.requests;
CREATE POLICY "Users can submit own pending requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'PENDING');

DROP POLICY IF EXISTS "Admin can insert requests" ON public.requests;
CREATE POLICY "Admin can insert requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update requests" ON public.requests;
CREATE POLICY "Admin can update requests"
  ON public.requests FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;

-- Sau khi chạy, phải thấy thêm 2 dòng INSERT và 1 dòng UPDATE.
-- Các quyền SELECT/DELETE hiện có vẫn được giữ nguyên.
SELECT policyname, cmd, roles, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'requests'
ORDER BY cmd, policyname;

-- Nhân viên tải lại trang, gửi lại đơn chưa lưu, rồi tải lại Lịch sử:
-- đơn phải vẫn còn với trạng thái Chờ duyệt.
-- Admin vào Duyệt đơn > Tải lại > Chờ duyệt > Nghỉ phép để kiểm tra.
-- Nếu phát sinh lỗi requests_leave_type_check, cần chạy riêng
-- add_insurance_leave_type.sql để cho phép loại INSURANCE (nghỉ BHXH).
