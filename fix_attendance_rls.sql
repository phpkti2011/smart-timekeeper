-- ============================================
-- FIX RLS cho bảng attendance_logs
-- Chạy file này trong Supabase SQL Editor
-- ============================================

-- 1. Xem policy hiện tại (để debug)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'attendance_logs';

-- 2. Xóa các policy cũ nếu có (tránh conflict)
DROP POLICY IF EXISTS "Users can insert own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Users can view own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Admins can view all attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Admins can insert attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Allow insert attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Allow select attendance" ON attendance_logs;

-- 3. Đảm bảo RLS được bật
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Nhân viên tự INSERT log của mình
CREATE POLICY "Users can insert own attendance"
ON attendance_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 5. Policy: Nhân viên chỉ xem log của mình
CREATE POLICY "Users can view own attendance"
ON attendance_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 6. Policy: Admin xem TẤT CẢ log
CREATE POLICY "Admins can view all attendance"
ON attendance_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'Admin'
  )
);

-- 7. Policy: Admin INSERT log cho bất kỳ nhân viên nào
CREATE POLICY "Admins can insert attendance"
ON attendance_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'Admin'
  )
);

-- 8. Policy: Admin UPDATE log
CREATE POLICY "Admins can update attendance"
ON attendance_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'Admin'
  )
);

-- 9. Policy: Admin DELETE log
CREATE POLICY "Admins can delete attendance"
ON attendance_logs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'Admin'
  )
);

-- 10. Kiểm tra lại sau khi tạo
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'attendance_logs'
ORDER BY cmd;
