-- =====================================================================
-- THÊM CỘT requests.processed_at (giờ Admin duyệt / từ chối đơn)
-- Chạy trên Supabase → SQL Editor. CHẠY LẠI ĐƯỢC NHIỀU LẦN. CHẠY TRƯỚC KHI DEPLOY.
--
-- Vì sao cần chạy:
--   App đọc processed_at từ lâu (mapper nào cũng có `r.processed_at ? … : undefined`,
--   màn Duyệt đơn và Lịch sử nghỉ phép có sẵn dòng "Duyệt lúc") nhưng cột này
--   CHƯA BAO GIỜ TỒN TẠI trong CSDL — đọc cột thiếu chỉ ra undefined nên không ai
--   biết. Đến khi đơn Đổi thông tin GHI processed_at lúc duyệt thì PostgREST từ
--   chối (PGRST204 "Could not find the 'processed_at' column of 'requests'"):
--   hồ sơ đã ghi xong nhưng đơn không đóng được, Admin thấy đơn vẫn ở Chờ duyệt.
--
-- Từ bản này, MỌI loại đơn (nghỉ phép, tăng ca, đi trễ, ứng lương, đổi ngày nghỉ,
-- đổi thông tin) đều ghi processed_at khi duyệt/từ chối và xoá về NULL khi hoàn
-- duyệt (utils/requestPersistence.ts → updateRequestStatus). Thiếu cột thì mọi
-- nút Duyệt/Từ chối báo lỗi nêu đúng tên file này — không hỏng dữ liệu, nhưng
-- Admin bị kẹt. Nên chạy file này TRƯỚC khi push code.
--
-- KHÔNG backfill đơn cũ: không biết giờ xử lý thật. NULL = chưa xử lý hoặc đơn
-- xử lý trước khi có cột; UI ẩn dòng "Duyệt lúc" khi NULL.
-- =====================================================================

-- BƯỚC 0: Xem hiện trạng. Lần đầu sẽ KHÔNG có dòng processed_at.
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'requests'
ORDER  BY ordinal_position;

-- BƯỚC 1: Thêm cột. TIMESTAMPTZ để khớp created_at và cách app ghi
-- (new Date().toISOString(), có múi giờ).
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.requests.processed_at IS
  'Giờ Admin duyệt hoặc từ chối đơn (app ghi lúc đổi status; hoàn duyệt về PENDING thì xoá về NULL). NULL = chưa xử lý, hoặc đơn xử lý trước khi có cột này.';

-- BƯỚC 2: Nhắc PostgREST nạp lại sơ đồ. Supabase thường tự làm sau DDL; gửi
-- thêm cho chắc, vô hại nếu đã nạp.
NOTIFY pgrst, 'reload schema';

-- BƯỚC 3: KIỂM TRA LẠI — phải thấy đúng 1 dòng processed_at kiểu
-- "timestamp with time zone".
SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'requests'
  AND  column_name = 'processed_at';

-- Sau khi chạy: vào Duyệt đơn, bấm Duyệt đơn Đổi thông tin đang chờ → đơn phải
-- sang tab Đã xử lý và có dòng "Duyệt lúc". Nếu vẫn báo "chưa có cột
-- processed_at" thì đợi ~1 phút cho schema cache nạp lại rồi bấm lại.
