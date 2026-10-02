-- Chỉ đọc, không sửa đơn hoặc quyền. Chạy trong Supabase > SQL Editor.
-- 1. Đơn nghỉ mới nhất: đối chiếu tên nhân viên, ngày nghỉ và trạng thái.
SELECT r.id, p.name AS nhan_vien, r.created_at, r.start_date, r.end_date,
       r.leave_type, r.status, r.reason
FROM public.requests r
LEFT JOIN public.profiles p ON p.id = r.user_id
WHERE r.type = 'LEAVE'
ORDER BY r.created_at DESC
LIMIT 50;

-- 2. Ràng buộc loại nghỉ phải cho phép INSURANCE để lưu đơn thai sản.
SELECT conname, pg_get_constraintdef(oid) AS dinh_nghia
FROM pg_constraint
WHERE conrelid = 'public.requests'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%leave_type%';

-- 3. Quyền: nhân viên gửi đơn của mình; Admin đọc và duyệt đơn.
SELECT policyname, cmd, roles, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'requests'
ORDER BY cmd, policyname;

-- Không có dòng ở kết quả 1: đơn chưa được lưu, cần kiểm tra lỗi lúc Gửi đơn.
-- Có dòng PENDING nhưng Admin không thấy: kiểm tra tài khoản, SELECT policy
-- và dùng nút Tải lại trong Duyệt đơn. Không tắt RLS để xử lý.
-- Có dòng APPROVED/REJECTED: đơn nằm ở Lịch sử, theo tháng bắt đầu nghỉ.
