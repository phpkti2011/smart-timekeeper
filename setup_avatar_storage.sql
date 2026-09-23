-- =====================================================================
-- KHO ẢNH ĐẠI DIỆN (Supabase Storage, bucket `avatars`)
-- Chạy trên Supabase → SQL Editor. Chạy lại được nhiều lần (idempotent).
--
-- Bucket PUBLIC, không phải private. Vì sao:
--   - profiles.avatar là chuỗi URL được nhét thẳng vào <img src> ở 8 chỗ.
--     Bucket private buộc phải ký URL (bất đồng bộ, có hạn dùng) ở cả 8 chỗ.
--   - Ảnh hiện tại đã công khai sẵn (ui-avatars.com, picsum.photos).
--   - Đường dẫn chứa UUID + timestamp, không đoán được; chỉ ai có link mới xem.
--
-- Quy ước đặt tên:  avatars/{auth.uid()}/pending-{ts}.jpg  (chờ duyệt)
--                   avatars/{auth.uid()}/{ts}.jpg          (đã duyệt / Admin đặt)
-- Thư mục cấp 1 là auth.uid() → policy dùng khuôn chuẩn của Supabase.
--
-- Cần hàm public.is_admin() (tạo ở restrict_profile_salary_access.sql PHẦN A).
-- File này định nghĩa lại hàm đó (CREATE OR REPLACE, cùng nội dung) để chạy
-- được độc lập, thứ tự nào cũng được.
-- =====================================================================

-- BƯỚC 0: Xem bucket đang có.
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;

-- BƯỚC 1: Hàm kiểm Admin (giống hệt restrict_profile_salary_access.sql).
-- SECURITY DEFINER để không kích hoạt RLS của profiles khi policy gọi vào.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- BƯỚC 2: Tạo bucket. Ảnh sau nén luôn < 100 KB; 2 MB là lưới an toàn.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- BƯỚC 3: Policy trên storage.objects. Gỡ cũ rồi tạo lại để chạy lại được.
DROP POLICY IF EXISTS "avatars: public read"             ON storage.objects;
DROP POLICY IF EXISTS "avatars: own folder insert"       ON storage.objects;
DROP POLICY IF EXISTS "avatars: own folder or admin update" ON storage.objects;
DROP POLICY IF EXISTS "avatars: own folder or admin delete" ON storage.objects;

-- Ai có link đều xem được (bucket public).
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Nhân viên tải ảnh vào ĐÚNG thư mục của mình; Admin tải vào thư mục bất kỳ
-- (đổi ảnh hộ nhân viên trong tab Nhân sự).
CREATE POLICY "avatars: own folder insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

CREATE POLICY "avatars: own folder or admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

-- Xoá ảnh pending khi huỷ / từ chối đơn. Admin xoá được của mọi người.
CREATE POLICY "avatars: own folder or admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

-- BƯỚC 4: Kiểm tra lại — 1 bucket public, 4 policy.
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'avatars';
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars:%'
ORDER BY cmd;

-- =====================================================================
-- DỌN ẢNH pending-* MỒ CÔI (chạy tay khi cần, không có cron)
-- Ảnh pending bình thường bị xoá ngay khi đơn được duyệt / từ chối / huỷ.
-- Còn sót chỉ khi mạng đứt đúng lúc đó. Liệt kê trước, xoá bằng Dashboard.
-- =====================================================================
-- SELECT name, created_at, (metadata->>'size')::int AS bytes
-- FROM   storage.objects
-- WHERE  bucket_id = 'avatars' AND name LIKE '%/pending-%'
--   AND  created_at < now() - interval '7 days'
-- ORDER  BY created_at;
