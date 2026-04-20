-- FILE: fix_rls_simple.sql
-- CẬP NHẬT: Sửa lỗi cú pháp (bỏ lệnh RAISE thừa)

-- 1. Xóa policy cũ
DROP POLICY IF EXISTS "Allow employees to insert salary confirmation" ON "bonuses";

-- 2. Tạo Policy đơn giản
CREATE POLICY "Allow employees to insert salary confirmation"
ON "bonuses"
FOR INSERT
WITH CHECK (
  -- Kiểm tra trực tiếp: Người dùng chỉ được tạo bản ghi cho chính mình (ID trùng khớp)
  -- Ép kiểu về text để đảm bảo so sánh được với mọi loại dữ liệu (UUID or Text)
  user_id::text = auth.uid()::text
  
  -- VÀ loại phải là BONUS
  AND type = 'BONUS'
  
  -- VÀ lý do phải là xác nhận lương
  AND reason LIKE 'CONFIRMATION:%'
);

-- (Không dùng lệnh in thông báo nữa để tránh lỗi cú pháp)
