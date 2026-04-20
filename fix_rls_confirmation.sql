-- FILE: fix_rls_confirmation.sql
-- CẬP NHẬT 3: Bỏ định danh "public" và dấu ngoặc kép để tránh lỗi không tìm thấy bảng
-- (Hệ thống sẽ tự nhận diện bảng trong schema mặc định)

-- 1. Xóa policy cũ
DROP POLICY IF EXISTS "Allow employees to insert salary confirmation" ON bonuses;

-- 2. Tạo Policy mới (dựa trên Email)
CREATE POLICY "Allow employees to insert salary confirmation"
ON bonuses
FOR INSERT
WITH CHECK (
  -- Kiểm tra Email
  (SELECT email FROM employees WHERE id = user_id) = auth.jwt() ->> 'email'
  
  -- Điều kiện loại và lý do
  AND type = 'BONUS'
  AND reason LIKE 'CONFIRMATION:%'
);

-- 3. Mở quyền đọc bảng employees (nếu chưa có)
-- Dùng DO block để tránh lỗi nếu policy đã tồn tại
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'employees' 
        AND policyname = 'Enable read access for all users'
    ) THEN
        CREATE POLICY "Enable read access for all users" ON employees FOR SELECT USING (true);
    END IF;
END
$$;
