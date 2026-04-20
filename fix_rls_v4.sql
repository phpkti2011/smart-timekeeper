-- FILE: fix_rls_v4.sql
-- CẬP NHẬT 4: Thiết lập schema rõ ràng và kiểm tra tồn tại để sửa lỗi "relation does not exist"

SET search_path TO public;

DO $$
BEGIN
    -- 1. Kiểm tra bảng 'bonuses' có tồn tại không
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bonuses') THEN
        
        -- 2. Xóa policy cũ
        DROP POLICY IF EXISTS "Allow employees to insert salary confirmation" ON "bonuses";

        -- 3. Tạo policy mới
        -- Dùng SQL động để đảm bảo chạy đúng schema
        EXECUTE '
            CREATE POLICY "Allow employees to insert salary confirmation"
            ON "bonuses"
            FOR INSERT
            WITH CHECK (
                (SELECT email FROM employees WHERE id = user_id) = auth.jwt() ->> ''email''
                AND type = ''BONUS''
                AND reason LIKE ''CONFIRMATION:%''
            )
        ';
        
        RAISE NOTICE 'Đã cập nhật Policy thành công cho bảng bonuses!';
        
    ELSE
        -- Nếu không tìm thấy
        RAISE EXCEPTION 'Không tìm thấy bảng "bonuses" trong schema public. Vui lòng kiểm tra lại tên bảng (viết hoa/thường?) trong Table Editor.';
    END IF;
END
$$;
