-- FILE: check_tables.sql
-- Chạy lệnh này để xem tên chính xác của các bảng trong database
-- (Kết quả sẽ hiện ra tên bảng thực tế, ví dụ: bonuses, Bonus, public.bonuses...)

SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name ILIKE '%bonus%' 
   OR table_name ILIKE '%employee%';
