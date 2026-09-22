import { LeaveRequest, UserRole } from '../types';
import { supabase } from './supabaseClient';

// Chấp nhận cả bản ghi profile thô từ Supabase lẫn UserProfile đã map —
// 4 trường dùng tới (id/name/avatar/role) trùng tên ở cả hai dạng.
type ProfileLike = { id: string; name?: string; avatar?: string; role?: UserRole };

// Map 1 dòng bảng `requests` (type='LEAVE') sang LeaveRequest.
// Tách ra khỏi App.tsx để màn xem lịch sử phép dùng chung, tránh map lệch trường.
export const mapLeaveRow = (r: any, profiles: ProfileLike[] = []): LeaveRequest => {
  const user = profiles.find(p => p.id === r.user_id);
  return {
    userId: r.user_id,
    userName: user?.name || 'Unknown',
    userAvatar: user?.avatar || '',
    userRole: (user?.role || 'Employee') as UserRole,
    createdAt: r.created_at ? new Date(r.created_at) : undefined,
    processedAt: r.processed_at ? new Date(r.processed_at) : undefined,
    id: r.id,
    startDate: new Date(r.start_date),
    endDate: new Date(r.end_date),
    leaveType: r.leave_type,
    duration: r.leave_duration,
    reason: r.reason,
    status: r.status,
    rejectionReason: r.rejection_reason || null
  };
};

// Đơn nghỉ của 1 nhân viên trong 1 năm. App chỉ nạp sẵn đơn của năm hiện tại,
// nên xem lịch sử năm cũ phải query riêng.
export const fetchLeaveRequestsByYear = async (
  userId: string,
  year: number,
  profiles: ProfileLike[] = []
): Promise<LeaveRequest[]> => {
  // Dùng toISOString() giống đường nạp trong App.tsx để biên năm nhất quán múi giờ
  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();

  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'LEAVE')
    .gte('start_date', from)
    .lt('start_date', to)
    .order('start_date', { ascending: true });

  if (error) throw error;

  // Lọc lại theo năm ở client để khớp tuyệt đối với getLeaveEntriesForYear
  return (data || [])
    .map(r => mapLeaveRow(r, profiles))
    .filter(req => req.startDate.getFullYear() === year);
};
