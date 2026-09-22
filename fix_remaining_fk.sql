-- ====================================================================
-- FIX 2 BẢNG CÒN LẠI: overrides và payroll_details
-- ====================================================================
-- 2 bảng này có FK đến auth.users(id) nhưng KHÔNG có ON DELETE CASCADE
-- → Đây là thủ phạm chặn xóa user.
-- ====================================================================

-- BƯỚC 1: Dọn dữ liệu mồ côi
DELETE FROM public.overrides
  WHERE user_id NOT IN (SELECT id FROM auth.users);

DELETE FROM public.payroll_details
  WHERE user_id NOT IN (SELECT id FROM auth.users);

-- BƯỚC 2: Thêm CASCADE cho overrides
ALTER TABLE public.overrides
  DROP CONSTRAINT IF EXISTS overrides_user_id_fkey;
ALTER TABLE public.overrides
  ADD CONSTRAINT overrides_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- BƯỚC 3: Thêm CASCADE cho payroll_details
ALTER TABLE public.payroll_details
  DROP CONSTRAINT IF EXISTS payroll_details_user_id_fkey;
ALTER TABLE public.payroll_details
  ADD CONSTRAINT payroll_details_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- BƯỚC 4: Kiểm tra lại
SELECT
  n.nspname || '.' || c.relname AS bang,
  con.conname AS ten_constraint,
  pg_get_constraintdef(con.oid) AS dinh_nghia_fk
FROM pg_constraint con
JOIN pg_class c ON con.conrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_class fc ON con.confrelid = fc.oid
JOIN pg_namespace fn ON fc.relnamespace = fn.oid
WHERE con.contype = 'f'
  AND fn.nspname = 'auth'
  AND fc.relname = 'users'
  AND n.nspname = 'public'
ORDER BY c.relname;
