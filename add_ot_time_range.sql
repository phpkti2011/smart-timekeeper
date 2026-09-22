-- Khung giờ và nơi làm cho đơn tăng ca.
--
-- Đơn CŨ (ba cột đều NULL / 'OFFICE') giữ nguyên hành vi: chỉ là cờ mở khoá,
-- số phút vẫn suy từ giờ chấm công. Chỉ đơn CÓ ĐỦ ot_start và ot_end mới được
-- tính phút theo khung giờ khai.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS ot_start    TEXT DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS ot_end      TEXT DEFAULT NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS ot_location TEXT DEFAULT 'OFFICE';

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_ot_location_check;
ALTER TABLE requests ADD CONSTRAINT requests_ot_location_check
  CHECK (ot_location IS NULL OR ot_location IN ('OFFICE', 'HOME'));

COMMENT ON COLUMN requests.ot_start IS
  'Giờ bắt đầu tăng ca, chuỗi HH:mm giờ địa phương. NULL = đơn cũ, tính phút theo giờ chấm công.';
COMMENT ON COLUMN requests.ot_end IS
  'Giờ kết thúc, chuỗi HH:mm. Nếu ot_end <= ot_start thì khung vắt qua nửa đêm; toàn bộ phút vẫn thuộc ngày date.';
COMMENT ON COLUMN requests.ot_location IS
  'OFFICE = tại công ty. HOME = tại nhà. Chỉ để hiển thị và đối chiếu — nguồn tính phút do ot_start/ot_end quyết định.';

-- Dùng TEXT chứ không phải TIME: PostgREST trả cột TIME dạng '19:00:00', mà
-- date-fns parse(...,'HH:mm') sẽ cho Invalid Date IM LẶNG → NaN phút → NaN lương.
-- Chuỗi HH:mm cũng khớp thẳng với <input type="time"> và với attendance_overrides.in1.

-- LƯU Ý trước khi chạy: thiết kế cho phép NHIỀU đơn tăng ca cùng một ngày
-- (mỗi khung giờ một dòng). Nếu bảng requests đang có UNIQUE index trên
-- (user_id, date, type) thì phải gỡ, nếu không insert khung thứ hai sẽ lỗi.
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'requests';
