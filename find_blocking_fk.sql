-- ====================================================================
-- TÌM TẤT CẢ FOREIGN KEY tham chiếu đến auth.users
-- (Dùng pg_catalog để tìm cross-schema chính xác hơn)
-- ====================================================================

SELECT
  n.nspname || '.' || c.relname AS bang_co_fk,
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
ORDER BY n.nspname, c.relname;
