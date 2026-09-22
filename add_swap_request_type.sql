-- =====================================================================
-- THÊM LOẠI ĐƠN 'SWAP' (đổi ngày nghỉ hàng tuần: nghỉ Thứ 7, làm bù Chủ Nhật)
-- Chạy trên Supabase → SQL Editor TRƯỚC KHI deploy bản mới.
--
-- Một đơn SWAP đã duyệt làm cho, với RIÊNG nhân viên đó:
--   - Thứ 7 (cột `date`)                → ngày nghỉ tuần: công chuẩn 0, chấm công thì ×2.0
--   - Chủ Nhật ngay sau (cột `swap_work_date`) → ngày làm việc thường: công chuẩn 1.0, OT ×1.5
--
-- Vì sao cần chạy:
--   1. Cột requests.type có thể đang có CHECK constraint chỉ cho phép
--      ('OT','LATE','LEAVE','ADVANCE'). Nếu vậy mọi đơn SWAP bị CSDL từ chối
--      IM LẶNG ở tầng RLS/constraint → app báo "0 dòng được ghi".
--   2. Cần cột mới swap_work_date để lưu Chủ Nhật làm bù.
--   3. Mỗi nhân viên mỗi tuần chỉ một đơn còn hiệu lực → unique index một phần.
-- =====================================================================

-- BƯỚC 0: Xem hiện có những giá trị type nào. Nếu có giá trị lạ ngoài
-- OT/LATE/LEAVE/ADVANCE thì BƯỚC 2 sẽ lỗi — xử lý dữ liệu đó trước.
SELECT type, COUNT(*) AS so_don
FROM   public.requests
GROUP  BY type
ORDER  BY so_don DESC;

-- BƯỚC 1: Xem hiện đang có ràng buộc nào trên cột type.
-- Loại trừ leave_type và ot_location vì đó là ràng buộc của cột khác.
SELECT con.conname AS ten_rang_buoc,
       pg_get_constraintdef(con.oid) AS dinh_nghia
FROM   pg_constraint con
JOIN   pg_class rel ON rel.oid = con.conrelid
JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
WHERE  rel.relname = 'requests'
  AND  ns.nspname = 'public'
  AND  con.contype = 'c'
  AND  pg_get_constraintdef(con.oid) ILIKE '%type%'
  AND  pg_get_constraintdef(con.oid) NOT ILIKE '%leave_type%';

-- BƯỚC 2: Gỡ mọi CHECK constraint trên cột type (theo nội dung, không theo tên
-- vì tên do Postgres tự đặt), rồi tạo lại cho đủ năm giá trị.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM   pg_constraint con
    JOIN   pg_class rel ON rel.oid = con.conrelid
    JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE  rel.relname = 'requests'
      AND  ns.nspname = 'public'
      AND  con.contype = 'c'
      AND  pg_get_constraintdef(con.oid) ILIKE '%type%'
      AND  pg_get_constraintdef(con.oid) NOT ILIKE '%leave_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.requests DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Đã gỡ ràng buộc cũ: %', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.requests
  ADD CONSTRAINT requests_type_check
  CHECK (type IN ('OT', 'LATE', 'LEAVE', 'ADVANCE', 'SWAP'));

-- BƯỚC 3: Cột Chủ Nhật làm bù. Dùng DATE (PostgREST trả 'yyyy-MM-dd', app đọc
-- bằng parseRequestDate). KHÔNG dùng TIMESTAMP để khỏi lệch múi giờ.
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS swap_work_date DATE DEFAULT NULL;

COMMENT ON COLUMN public.requests.swap_work_date IS
  'Chỉ đơn type=SWAP: Chủ Nhật đi làm bù (= cột date + 1 ngày). Cột date của đơn SWAP là Thứ 7 nghỉ bù.';

-- BƯỚC 4: Mỗi nhân viên, mỗi tuần (định danh bằng Chủ Nhật) chỉ một đơn còn
-- hiệu lực (APPROVED/PENDING). Đơn REJECTED không chiếm chỗ nên tạo lại được.
-- App cũng chặn ở tầng validate; index này là lưới an toàn cuối cùng.
CREATE UNIQUE INDEX IF NOT EXISTS requests_swap_one_per_week
  ON public.requests (user_id, swap_work_date)
  WHERE type = 'SWAP' AND status IN ('APPROVED', 'PENDING');

-- BƯỚC 5: Kiểm tra lại — phải thấy đủ năm giá trị và cột mới.
SELECT pg_get_constraintdef(con.oid) AS dinh_nghia_moi
FROM   pg_constraint con
JOIN   pg_class rel ON rel.oid = con.conrelid
WHERE  rel.relname = 'requests'
  AND  con.conname = 'requests_type_check';

SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'requests' AND column_name = 'swap_work_date';

SELECT indexname, indexdef
FROM   pg_indexes
WHERE  tablename = 'requests' AND indexname = 'requests_swap_one_per_week';

-- LƯU Ý RLS: các policy SELECT/INSERT/UPDATE hiện có trên public.requests
-- không lọc theo type nên áp dụng luôn cho đơn SWAP. Policy DELETE cho Admin
-- đã có từ add_delete_request_policy.sql. Nếu app báo "0 dòng được ghi" sau
-- khi chạy file này, kiểm tra:
--   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'requests';
