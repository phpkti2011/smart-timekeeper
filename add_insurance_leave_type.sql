-- =====================================================================
-- THÊM LOẠI NGHỈ 'INSURANCE' (nghỉ chế độ do BHXH chi trả)
-- Chạy trên Supabase → SQL Editor TRƯỚC KHI deploy bản mới.
--
-- Vì sao cần: cột requests.leave_type có thể đang có CHECK constraint chỉ
-- cho phép ('PAID','UNPAID','SPECIAL'). Nếu vậy, mọi đơn thai sản / khám thai
-- sẽ bị CSDL từ chối khi lưu.
--
-- Bốn giá trị sau khi chạy:
--   PAID      — phép năm, trừ quỹ, công ty trả lương
--   SPECIAL   — nghỉ chế độ công ty trả nguyên lương (cưới, tang - Điều 115.1)
--   INSURANCE — nghỉ chế độ BHXH chi trả (thai sản, khám thai, vợ sinh con)
--               CÔNG TY TRẢ 0 ĐỒNG những ngày này
--   UNPAID    — nghỉ không hưởng lương (Điều 115.2, việc riêng)
-- =====================================================================

-- BƯỚC 1: Xem hiện đang có ràng buộc nào trên leave_type.
-- Chạy riêng câu này trước để biết mình sắp đụng vào cái gì.
SELECT con.conname AS ten_rang_buoc,
       pg_get_constraintdef(con.oid) AS dinh_nghia
FROM   pg_constraint con
JOIN   pg_class rel ON rel.oid = con.conrelid
JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
WHERE  rel.relname = 'requests'
  AND  ns.nspname = 'public'
  AND  con.contype = 'c'
  AND  pg_get_constraintdef(con.oid) ILIKE '%leave_type%';

-- BƯỚC 2: Gỡ mọi CHECK constraint có nhắc tới leave_type, rồi tạo lại cho đủ
-- bốn giá trị. Gỡ theo nội dung chứ không theo tên vì tên do Postgres tự đặt,
-- mỗi cơ sở dữ liệu một khác.
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
      AND  pg_get_constraintdef(con.oid) ILIKE '%leave_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.requests DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Đã gỡ ràng buộc cũ: %', r.conname;
  END LOOP;
END $$;

-- Cho phép NULL vì đơn OT / Trễ / Ứng lương không có leave_type.
ALTER TABLE public.requests
  ADD CONSTRAINT requests_leave_type_check
  CHECK (leave_type IS NULL OR leave_type IN ('PAID', 'UNPAID', 'SPECIAL', 'INSURANCE'));

-- BƯỚC 3: Kiểm tra lại — phải thấy đủ bốn giá trị trong định nghĩa mới.
SELECT pg_get_constraintdef(con.oid) AS dinh_nghia_moi
FROM   pg_constraint con
JOIN   pg_class rel ON rel.oid = con.conrelid
WHERE  rel.relname = 'requests'
  AND  con.conname = 'requests_leave_type_check';

-- BƯỚC 4: Đếm đơn theo từng loại để đối chiếu sau khi dùng một thời gian.
-- Trước khi dùng tính năng mới, INSURANCE phải bằng 0.
SELECT COALESCE(leave_type, '(không phải đơn nghỉ)') AS loai, COUNT(*) AS so_don
FROM   public.requests
GROUP  BY leave_type
ORDER  BY so_don DESC;

-- =====================================================================
-- BƯỚC 5 (QUAN TRỌNG): rà soát đơn THAI SẢN ĐÃ NHẬP TỪ TRƯỚC.
--
-- Những đơn đó đang lưu leave_type = 'SPECIAL' nên CÔNG TY VẪN ĐANG TRẢ LƯƠNG
-- cho các ngày thai sản. Chạy câu dưới để xem có đơn nào như vậy không.
-- =====================================================================
-- Bang nhan vien cua du an nay la public.profiles (KHONG phai public.users --
-- Supabase chi co auth.users, va requests.user_id tro toi profiles(id)).
--
-- LIET KE TAT CA don SPECIAL chu khong loc theo tu khoa: so don nay rat it (vai
-- don), ma loc bang ILIKE se lot nhung don ghi ly do khong dau hoac viet tat.
-- Cot `nghi_ngo_thai_san` chi la GOI Y de mat luot nhanh, van phai doc cot reason.
SELECT r.id,
       p.name AS nhan_vien,
       r.start_date,
       r.end_date,
       r.reason,
       r.status,
       (r.reason ILIKE '%thai%' OR r.reason ILIKE '%sinh con%'
        OR r.reason ILIKE '%thai s%' OR r.reason ILIKE '%san%') AS nghi_ngo_thai_san
FROM   public.requests r
LEFT   JOIN public.profiles p ON p.id = r.user_id
WHERE  r.type = 'LEAVE'
  AND  r.leave_type = 'SPECIAL'
ORDER  BY r.start_date DESC;

-- Nếu BƯỚC 5 ra kết quả và anh muốn chuyển chúng sang BHXH chi trả, BỎ DẤU
-- COMMENT ở câu dưới rồi chạy. ĐỌC KỸ danh sách ở BƯỚC 5 trước — câu này làm
-- LƯƠNG NHỮNG THÁNG ĐÓ GIẢM XUỐNG, và tháng đã chốt lương thì phải mở khoá,
-- tính lại, rồi chốt lại. Nếu công ty đã trả rồi thì cân nhắc để nguyên.
--
-- UPDATE public.requests
-- SET    leave_type = 'INSURANCE'
-- WHERE  id IN ( ... điền đúng các id lấy từ BƯỚC 5 ... );
