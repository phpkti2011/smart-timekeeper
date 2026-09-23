-- =====================================================================
-- THÊM LOẠI ĐƠN 'PROFILE' (nhân viên đề nghị sửa thông tin cá nhân)
-- Chạy trên Supabase → SQL Editor TRƯỚC KHI deploy bản mới.
--
-- Nhân viên đề nghị sửa 4 trường: họ tên, ngày sinh, số điện thoại, ảnh đại
-- diện. Đơn chỉ là ĐỀ NGHỊ — Admin duyệt thì App mới ghi vào bảng profiles.
-- Nội dung nằm ở cột JSONB mới profile_changes, chứa CẢ giá trị cũ lẫn mới:
--   {"name":{"old":"Nguyễn Văn A","new":"Nguyễn Văn An"},
--    "dateOfBirth":{"old":"1995-03-02","new":"1995-03-20"},
--    "phone":{"old":null,"new":"0912345678"},
--    "avatar":{"old":"https://…","new":"https://…/pending-1.jpg","newPath":"<uid>/pending-1.jpg"}}
-- Lưu "old" để (1) màn duyệt hiện được mũi tên A → B mà không phải tra bảng
-- profiles, (2) hoàn tác được đơn đã duyệt.
--
-- Vì sao cần chạy:
--   1. CHECK constraint trên requests.type đang chỉ cho 5 giá trị
--      ('OT','LATE','LEAVE','ADVANCE','SWAP'). Không nới thì mọi đơn PROFILE
--      bị CSDL từ chối IM LẶNG → app báo "0 dòng được ghi".
--   2. Cần cột requests.profile_changes và cột profiles.phone (chưa từng có).
--   3. Mỗi nhân viên chỉ được một đơn PROFILE đang chờ → unique index.
--   4. Số điện thoại không được trùng giữa hai nhân viên → unique index.
--   5. Nhân viên cần quyền tự HUỶ đơn PROFILE chờ duyệt của mình (policy DELETE).
--
-- File này CHỈ THÊM, không sửa gì có sẵn. Bản app cũ bỏ qua type='PROFILE'.
-- =====================================================================

-- BƯỚC 0: Xem hiện có những giá trị type nào. Nếu có giá trị lạ ngoài
-- OT/LATE/LEAVE/ADVANCE/SWAP thì BƯỚC 2 sẽ lỗi — xử lý dữ liệu đó trước.
SELECT type, COUNT(*) AS so_don
FROM   public.requests
GROUP  BY type
ORDER  BY so_don DESC;

-- BƯỚC 1: Xem ràng buộc đang có trên cột type (loại trừ leave_type, cột khác).
SELECT con.conname AS ten_rang_buoc,
       pg_get_constraintdef(con.oid) AS dinh_nghia
FROM   pg_constraint con
JOIN   pg_class rel ON rel.oid = con.conrelid
JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
WHERE  rel.relname = 'requests'
  AND  ns.nspname = 'public'
  AND  con.contype = 'c'
  AND  pg_get_constraintdef(con.oid) ILIKE '%type%'
  AND  pg_get_constraintdef(con.oid) NOT ILIKE '%leave_type%'
  AND  pg_get_constraintdef(con.oid) NOT ILIKE '%jsonb_typeof%';

-- BƯỚC 2: Gỡ mọi CHECK trên type theo NỘI DUNG (tên do Postgres tự đặt), rồi
-- tạo lại cho đủ sáu giá trị.
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
      AND  pg_get_constraintdef(con.oid) NOT ILIKE '%jsonb_typeof%'
  LOOP
    EXECUTE format('ALTER TABLE public.requests DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Đã gỡ ràng buộc cũ: %', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.requests
  ADD CONSTRAINT requests_type_check
  CHECK (type IN ('OT', 'LATE', 'LEAVE', 'ADVANCE', 'SWAP', 'PROFILE'));

-- BƯỚC 3: Cột nội dung đề nghị. JSONB để sau này thêm trường (CCCD, địa chỉ)
-- không cần migration. Lưới an toàn hình dạng: phải là object.
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS profile_changes JSONB DEFAULT NULL;

COMMENT ON COLUMN public.requests.profile_changes IS
  'Chỉ đơn type=PROFILE: {"<trường>":{"old":…,"new":…}}. Trường không đổi thì KHÔNG có mặt. avatar có thêm newPath = đường dẫn object trên Storage.';

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_profile_changes_shape;
ALTER TABLE public.requests ADD CONSTRAINT requests_profile_changes_shape
  CHECK (profile_changes IS NULL OR jsonb_typeof(profile_changes) = 'object');

-- BƯỚC 4: Cột số điện thoại. TEXT chứ không phải số: 0912345678 lưu kiểu số sẽ
-- mất số 0 đầu. Không đặt CHECK regex ở DB — đầu số VN đổi theo giấy phép,
-- luật để ở tầng app (utils/profileChange.ts), DB chỉ lo tính duy nhất.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.phone IS
  'Số di động, chuẩn hoá về dạng 10 số bắt đầu bằng 0 (0912345678). NULL = chưa khai. App luôn ghi dạng đã chuẩn hoá để unique index có nghĩa.';

-- Hai người không được cùng số. Partial index: nhiều người CÙNG chưa khai (NULL) vẫn OK.
-- Cột mới toanh (toàn NULL) nên tạo index không thể lỗi; chỉ va chạm về sau
-- và khi đó app dịch mã 23505 sang tiếng Việt.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- BƯỚC 5: Mỗi người tối đa MỘT đơn PROFILE đang chờ. Đơn đã duyệt / bị từ
-- chối KHÔNG chiếm chỗ nên gửi lại được ngay. App cũng chặn ở tầng validate;
-- index này là lưới an toàn khi ai đó vượt mặt app bằng DevTools.
CREATE UNIQUE INDEX IF NOT EXISTS requests_profile_one_pending
  ON public.requests (user_id)
  WHERE type = 'PROFILE' AND status = 'PENDING';

-- BƯỚC 6: Cho nhân viên TỰ HUỶ đơn PROFILE chờ duyệt của mình.
-- Bó hẹp đúng type='PROFILE' AND status='PENDING' AND user_id=auth.uid():
-- KHÔNG mở cho đơn nghỉ phép / tăng ca — đó là chứng từ tính lương, xoá được
-- thì mất dấu vết. Đơn đã duyệt cũng không tự xoá được.
DROP POLICY IF EXISTS "Users can delete own pending profile requests" ON public.requests;
CREATE POLICY "Users can delete own pending profile requests"
  ON public.requests
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND type = 'PROFILE' AND status = 'PENDING');

-- BƯỚC 7: KIỂM TRA LẠI — phải thấy đủ SÁU giá trị, HAI cột mới, HAI index, MỘT policy.
SELECT pg_get_constraintdef(con.oid) AS dinh_nghia_moi
FROM   pg_constraint con
JOIN   pg_class rel ON rel.oid = con.conrelid
WHERE  rel.relname = 'requests'
  AND  con.conname = 'requests_type_check';

SELECT table_name, column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  ((table_name = 'requests' AND column_name = 'profile_changes')
     OR (table_name = 'profiles' AND column_name = 'phone'));

SELECT indexname
FROM   pg_indexes
WHERE  indexname IN ('requests_profile_one_pending', 'profiles_phone_unique');

SELECT policyname, cmd
FROM   pg_policies
WHERE  tablename = 'requests' AND policyname = 'Users can delete own pending profile requests';

-- LƯU Ý NẾU APP BÁO "0 DÒNG ĐƯỢC GHI" khi gửi đề nghị:
--   Policy INSERT trên requests đang chặn. Kiểm:
--   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'requests';
--   Nếu policy INSERT có điều kiện theo `type` thì phải nới thêm 'PROFILE'.
-- LƯU Ý NẾU NÚT "HUỶ ĐỀ NGHỊ" KHÔNG LÀM GÌ:
--   Policy DELETE ở BƯỚC 6 chưa chạy, hoặc dự án không dùng Supabase Auth
--   (auth.uid() trả NULL) — xem ghi chú cuối add_delete_request_policy.sql.
