import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaveDuration, LeaveType, RequestStatus, UserRole } from '../types';

export interface LeaveSubmission {
  startDate: string;
  endDate: string;
  type: LeaveType;
  duration: LeaveDuration;
  reason: string;
}

/** Chỉ trả dòng đã được máy chủ xác nhận; nhân viên luôn gửi ở trạng thái chờ duyệt. */
export const persistLeaveRequest = async (
  client: SupabaseClient,
  actor: { id: string; role: UserRole },
  targetId: string,
  input: LeaveSubmission,
  adminCreatesRequest: boolean
) => {
  if (targetId !== actor.id && actor.role !== 'Admin') {
    throw new Error('Bạn chỉ được gửi đơn cho chính mình.');
  }
  const { data, error } = await client.from('requests').insert({
    user_id: targetId,
    type: 'LEAVE',
    start_date: new Date(input.startDate).toISOString(),
    end_date: new Date(input.endDate).toISOString(),
    leave_type: input.type,
    leave_duration: input.duration,
    reason: input.reason,
    status: actor.role === 'Admin' && adminCreatesRequest ? 'APPROVED' : 'PENDING'
  }).select('*').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Máy chủ chưa xác nhận đơn. Vui lòng tải lại lịch sử để kiểm tra trước khi gửi lại.');
  return data;
};

export const leaveSubmitErrorMessage = (error: { code?: string; message?: string }): string => {
  const detail = error.message || 'Không kết nối được máy chủ.';
  if (error.code === '42501' || /row-level security/i.test(detail)) {
    return 'Không gửi được đơn vì cơ sở dữ liệu từ chối quyền truy cập. Vui lòng báo Admin kiểm tra quyền gửi và đọc đơn trên bảng requests. Nội dung nhập vẫn được giữ.\n\nChi tiết: ' + detail;
  }
  if (error.code === '23514' && /leave_type/i.test(detail)) {
    return 'Không gửi được đơn vì cơ sở dữ liệu chưa chấp nhận loại nghỉ này. Admin cần kiểm tra và chạy add_insurance_leave_type.sql trên Supabase, sau đó bạn gửi lại đơn.\n\nChi tiết: ' + detail;
  }
  return 'Chưa xác nhận gửi đơn thành công. Nội dung nhập vẫn được giữ; hãy kiểm tra lịch sử trước khi thử lại.\n\nChi tiết: ' + detail;
};

// === ĐỔI TRẠNG THÁI ĐƠN (duyệt / từ chối / hoàn duyệt) — dùng chung cho MỌI loại đơn ===

export type RequestKind = 'OT' | 'LATE' | 'LEAVE' | 'ADVANCE' | 'SWAP' | 'PROFILE';

/**
 * Payload ghi khi đổi trạng thái. processed_at = giờ xử lý; hoàn duyệt về PENDING
 * thì xoá về NULL để dòng "Duyệt lúc" biến mất. Cột processed_at cần
 * add_processed_at.sql — thiếu thì PostgREST trả PGRST204.
 */
export const requestStatusPatch = (status: RequestStatus, reason?: string | null, now: Date = new Date()) => ({
  status,
  rejection_reason: reason || null,
  processed_at: status === 'PENDING' ? null : now.toISOString()
});

/**
 * Đổi trạng thái một đơn và CHỈ trả về khi máy chủ xác nhận có dòng được ghi.
 * RLS chặn thì Postgres không báo lỗi mà lặng lẽ cập nhật 0 dòng — không có
 * .select() thì app tưởng đã duyệt xong, tải lại mới thấy đơn vẫn chờ.
 * `type` (tuỳ chọn) khoá đúng loại đơn để không ghi nhầm id của loại khác.
 */
export const updateRequestStatus = async (
  client: SupabaseClient,
  id: string,
  status: RequestStatus,
  reason?: string | null,
  type?: RequestKind
) => {
  let query = client.from('requests').update(requestStatusPatch(status, reason)).eq('id', id);
  if (type) query = query.eq('type', type);
  const { data, error } = await query.select('*');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Máy chủ không xác nhận cập nhật đơn (không có quyền, hoặc đơn không còn). Vui lòng tải lại danh sách đơn.');
  }
  return data[0];
};

export const requestStatusErrorMessage = (error: { code?: string; message?: string }): string => {
  const detail = error.message || 'Không kết nối được máy chủ.';
  if ((error.code === 'PGRST204' || error.code === '42703') && /processed_at/i.test(detail)) {
    return 'Cơ sở dữ liệu chưa có cột processed_at (giờ xử lý đơn). Admin cần chạy add_processed_at.sql trên Supabase → SQL Editor, đợi ~1 phút rồi bấm lại.\n\nChi tiết: ' + detail;
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(detail)) {
    return 'Cơ sở dữ liệu từ chối quyền cập nhật đơn. Vui lòng báo Admin kiểm tra policy UPDATE trên bảng requests (fix_requests_write_policies.sql).\n\nChi tiết: ' + detail;
  }
  return 'Không cập nhật được đơn. Vui lòng tải lại danh sách rồi thử lại.\n\nChi tiết: ' + detail;
};

/** Không bỏ sót đơn chờ duyệt cũ hoặc đơn nằm sau giới hạn trả dòng của máy chủ. */
export const fetchRecentAndPendingRequests = async (client: SupabaseClient, cutoffISO: string) => {
  const rows: any[] = [];
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from('requests').select('*')
      .or(`created_at.gte.${cutoffISO},status.eq.PENDING`)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data) throw new Error('Không nhận được danh sách đơn từ máy chủ.');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
};
