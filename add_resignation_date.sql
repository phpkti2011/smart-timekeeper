-- Add resignation_date column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resignation_date DATE DEFAULT NULL;
