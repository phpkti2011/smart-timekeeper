-- FILE: fix_rls_v5.sql
-- CẬP NHẬT 5: Thêm "public." vào trước tên bảng employees để tránh lỗi không tìm thấy.

SET search_path TO public;

DO $$
BEGIN
    -- 1. Kiểm tra bảng 'bonuses'
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bonuses') THEN
        
        -- 2. Xóa policy cũ
        DROP POLICY IF EXISTS "Allow employees to insert salary confirmation" ON "public"."bonuses";

        -- 3. Tạo policy mới với tên bảng đầy đủ (public.employees)
        EXECUTE '
            CREATE POLICY "Allow employees to insert salary confirmation"
            ON "public"."bonuses"
            FOR INSERT
            WITH CHECK (
                -- QUAN TRỌNG: Thêm public. vào trước employees
                (SELECT email FROM public.employees WHERE id = user_id) = auth.jwt() ->> ''email''
                AND type = ''BONUS''
                AND reason LIKE ''CONFIRMATION:%''
            )
        ';
        
        RAISE NOTICE 'Đã cập nhật Policy thành công (V5)!';
        
    ELSE
        RAISE EXCEPTION 'Không tìm thấy bảng "bonuses" (public).';
    END IF;
END
$$;
