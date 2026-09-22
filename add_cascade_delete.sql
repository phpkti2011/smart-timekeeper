-- ====================================================================
-- THÊM ON DELETE CASCADE CHO TẤT CẢ FOREIGN KEY LIÊN QUAN ĐẾN USER
-- ====================================================================
-- Chạy file này trên Supabase SQL Editor để có thể xóa user
-- mà tự động xóa luôn dữ liệu liên quan ở các bảng khác.
-- ====================================================================

-- ====================================================================
-- BƯỚC 1: DỌN DỮ LIỆU MỒ CÔI (orphan records)
-- ====================================================================
-- Xóa các record có user_id không tồn tại trong profiles
-- (do user đã bị xóa thủ công trước đây)

DELETE FROM attendance_logs WHERE user_id NOT IN (SELECT id FROM profiles);
DELETE FROM requests WHERE user_id NOT IN (SELECT id FROM profiles);
DELETE FROM bonuses WHERE user_id NOT IN (SELECT id FROM profiles);
DELETE FROM attendance_overrides WHERE user_id NOT IN (SELECT id FROM profiles);
DELETE FROM salary_changes WHERE user_id NOT IN (SELECT id FROM profiles);

-- Xóa profiles không có auth user tương ứng (nếu có)
DELETE FROM profiles WHERE id NOT IN (SELECT id FROM auth.users);

-- ====================================================================
-- BƯỚC 2: THÊM ON DELETE CASCADE
-- ====================================================================

-- 1. profiles → auth.users
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. attendance_logs → profiles
ALTER TABLE attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_user_id_fkey;
ALTER TABLE attendance_logs
  ADD CONSTRAINT attendance_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. requests → profiles
ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_user_id_fkey;
ALTER TABLE requests
  ADD CONSTRAINT requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. bonuses → profiles
ALTER TABLE bonuses
  DROP CONSTRAINT IF EXISTS bonuses_user_id_fkey;
ALTER TABLE bonuses
  ADD CONSTRAINT bonuses_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 5. attendance_overrides → profiles
ALTER TABLE attendance_overrides
  DROP CONSTRAINT IF EXISTS attendance_overrides_user_id_fkey;
ALTER TABLE attendance_overrides
  ADD CONSTRAINT attendance_overrides_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 6. salary_changes → profiles
ALTER TABLE salary_changes
  DROP CONSTRAINT IF EXISTS salary_changes_user_id_fkey;
ALTER TABLE salary_changes
  ADD CONSTRAINT salary_changes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ====================================================================
-- BƯỚC 3: KIỂM TRA — các FK phải có "delete_rule = CASCADE"
-- ====================================================================
SELECT
  tc.table_name,
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND (tc.constraint_name LIKE '%user_id_fkey%' OR tc.constraint_name = 'profiles_id_fkey')
ORDER BY tc.table_name;
