-- Ngày ký hợp đồng chính thức — mốc tích luỹ phép năm.
-- Khác với contract_date là ngày vào làm / bắt đầu thử việc (mốc tính công và thâm niên).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS official_contract_date DATE DEFAULT NULL;

COMMENT ON COLUMN profiles.official_contract_date IS 'Ngày ký HĐ chính thức. Mốc tích luỹ phép năm (đủ tròn 1 tháng được 1 ngày). Để trống nếu chưa lên chính thức; khi đó hệ thống tạm dùng contract_date.';
