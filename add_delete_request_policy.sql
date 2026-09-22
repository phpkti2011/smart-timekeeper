-- =====================================================================
-- CẤP QUYỀN XOÁ ĐƠN TỪ CHO ADMIN
-- Chạy trên Supabase → SQL Editor.
--
-- Vì sao cần: nút "Xoá đơn" mới thêm gọi DELETE trên bảng public.requests.
-- Trước đây phần mềm CHƯA BAO GIỜ xoá dòng nào ở bảng này (chỉ select / insert /
-- update status), nên rất có thể chưa có policy DELETE nào. Thiếu policy thì
-- Postgres KHÔNG báo lỗi — nó chỉ lặng lẽ xoá 0 dòng. Phần mềm đã bắt được ca
-- này (kiểm mảng trả về rỗng) và sẽ nhắc chạy đúng file này.
--
-- Chưa chạy file này thì mọi thứ khác vẫn hoạt động bình thường, chỉ riêng nút
-- xoá là không làm gì.
-- =====================================================================

-- BƯỚC 1: Xem bảng requests có bật RLS không và đang có policy nào.
SELECT rel.relname AS bang, rel.relrowsecurity AS rls_dang_bat
FROM   pg_class rel
JOIN   pg_namespace ns ON ns.oid = rel.relnamespace
WHERE  ns.nspname = 'public' AND rel.relname = 'requests';

SELECT polname AS ten_policy,
       CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                   ELSE 'ALL' END AS lenh
FROM   pg_policy
WHERE  polrelid = 'public.requests'::regclass
ORDER  BY lenh, polname;

-- Nếu BƯỚC 1 cho `rls_dang_bat = false` thì KHÔNG cần chạy tiếp — không có RLS
-- thì lệnh xoá đã chạy được rồi. Lúc đó nút xoá hỏng là vì lý do khác.

-- =====================================================================
-- BƯỚC 2: Tạo policy cho phép Admin xoá đơn.
--
-- Điều kiện: người đang đăng nhập phải có role = 'Admin' trong bảng profiles.
-- KHÔNG mở cho mọi người đăng nhập — đơn từ là chứng từ tính lương.
-- =====================================================================
DROP POLICY IF EXISTS "Admin can delete requests" ON public.requests;

CREATE POLICY "Admin can delete requests"
  ON public.requests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Admin'
    )
  );

-- BƯỚC 3: Kiểm tra lại — phải thấy dòng có lenh = 'DELETE'.
SELECT polname AS ten_policy,
       CASE polcmd WHEN 'd' THEN 'DELETE' ELSE polcmd::text END AS lenh
FROM   pg_policy
WHERE  polrelid = 'public.requests'::regclass AND polcmd = 'd';

-- =====================================================================
-- GHI CHÚ: nếu phần mềm KHÔNG đăng nhập qua Supabase Auth (auth.uid() trả NULL)
-- thì policy trên sẽ không khớp ai cả và nút xoá vẫn im lặng.
--
-- Kiểm tra bằng cách so cách các policy SELECT/INSERT hiện có đang viết ra sao
-- (xem kết quả BƯỚC 1). Nếu chúng dùng `USING (true)` thay vì `auth.uid()`,
-- nghĩa là dự án không dùng Supabase Auth — khi đó thay policy trên bằng:
--
--   DROP POLICY IF EXISTS "Admin can delete requests" ON public.requests;
--   CREATE POLICY "Anyone can delete requests"
--     ON public.requests FOR DELETE TO anon, authenticated USING (true);
--
-- Lúc đó quyền xoá chỉ còn được chặn ở tầng phần mềm (chỉ Admin thấy nút).
-- Yếu hơn, nhưng đúng bằng mức bảo vệ mà các bảng khác trong dự án đang có.
-- =====================================================================
