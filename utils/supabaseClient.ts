
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

console.log("DEBUG CHECK ENV:", {
    rawUrl: import.meta.env.VITE_SUPABASE_URL,
    finalUrl: supabaseUrl,
    isDev: import.meta.env.DEV
});

export const isConfigured = supabaseUrl !== 'https://placeholder.supabase.co';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.error("Lỗi: Thiếu thông tin kết nối Supabase. Hãy kiểm tra biến môi trường!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
