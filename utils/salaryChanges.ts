import type { SupabaseClient } from '@supabase/supabase-js';
import { format, isValid, parseISO } from 'date-fns';
import type { SalaryChange } from '../types';

export interface SalaryChangeInput {
  baseSalary: number;
  allowance: number;
  insuranceSalary: number;
  effectiveDate: string;
  reason: string;
}

export const mapSalaryChangeRow = (row: any): SalaryChange => ({
  id: row.id,
  userId: row.user_id,
  baseSalary: Number(row.base_salary),
  allowance: Number(row.allowance),
  insuranceSalary: Number(row.insurance_salary),
  effectiveDate: row.effective_date,
  reason: row.reason,
  createdAt: row.created_at
});

/** Chỉ trả bản ghi đã lưu thật. Không tạo ID tạm hoặc giả lập lưu thành công. */
export const saveSalaryChange = async (
  client: SupabaseClient,
  userId: string,
  input: SalaryChangeInput,
  today = format(new Date(), 'yyyy-MM-dd')
) => {
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) || !isValid(parseISO(input.effectiveDate))) {
    throw new Error('Vui lòng chọn ngày áp dụng hợp lệ.');
  }
  if ([input.baseSalary, input.allowance, input.insuranceSalary].some(n => !Number.isFinite(n) || n < 0)) {
    throw new Error('Các khoản lương phải là số không âm.');
  }
  const { data, error } = await client.from('salary_changes').upsert({
    user_id: userId,
    base_salary: input.baseSalary,
    allowance: input.allowance,
    insurance_salary: input.insuranceSalary,
    effective_date: input.effectiveDate,
    reason: input.reason
  }, { onConflict: 'user_id,effective_date' }).select('*').single();
  if (error) throw error;
  if (!data) throw new Error('Không nhận được xác nhận lưu lịch sử lương. Vui lòng tải lại để kiểm tra.');
  const change = mapSalaryChangeRow(data);

  // Lịch sử và hồ sơ là hai thao tác riêng: nếu bước sau lỗi, báo rõ đã lưu
  // lịch sử để người dùng không nhầm là toàn bộ thay đổi bị huỷ.
  let profileSalary: Pick<SalaryChangeInput, 'baseSalary' | 'allowance' | 'insuranceSalary'> | null = null;
  let profileSyncError: string | null = null;
  if (input.effectiveDate <= today) {
    try {
      // Sửa mốc cũ không được ghi đè mức lương đang áp dụng từ mốc mới hơn.
      const { data: active, error: readError } = await client.from('salary_changes')
        .select('*').eq('user_id', userId).lte('effective_date', today)
        .order('effective_date', { ascending: false }).limit(1).single();
      if (readError) throw readError;
      if (!active) throw new Error('Không đọc được mức lương đang áp dụng.');
      const { data: profile, error: updateError } = await client.from('profiles').update({
        base_salary: active.base_salary,
        allowance: active.allowance,
        insurance_salary: active.insurance_salary
      }).eq('id', userId).select('id').single();
      if (updateError) throw updateError;
      if (!profile) throw new Error('Không cập nhật được hồ sơ nhân viên.');
      profileSalary = {
        baseSalary: Number(active.base_salary),
        allowance: Number(active.allowance),
        insuranceSalary: Number(active.insurance_salary)
      };
    } catch (error: any) {
      profileSyncError = error.message || 'Không cập nhật được hồ sơ nhân viên.';
    }
  }
  return { change, profileSalary, profileSyncError };
};

export const salarySaveErrorMessage = (error: { code?: string; message?: string }): string =>
  error.code === '42501' || /row-level security/i.test(error.message || '')
    ? 'Cơ sở dữ liệu từ chối quyền lưu lịch sử lương. Vui lòng kiểm tra tài khoản Admin và quyền thêm/sửa trên bảng salary_changes trong Supabase. Dữ liệu nhập vẫn được giữ để thử lại.'
    : `Lỗi lưu thay đổi lương: ${error.message || 'Không thể kết nối máy chủ.'}`;
