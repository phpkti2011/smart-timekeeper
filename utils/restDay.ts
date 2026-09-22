import { addDays, format, isSameDay, isSaturday, isSunday, isValid, startOfDay } from 'date-fns';
import { Holiday, LeaveRequest, RequestStatus, RestDayKind, SwapRequest, UserRole } from '../types';
import { parseRequestDate } from './dateInput';

// === LUẬT ĐỔI NGÀY NGHỈ HÀNG TUẦN ===
// Module thuần: không import React/supabase/leaveTypes (leaveTypes import ngược
// lại module này để lấy predicate ngày nghỉ tuần) nên chạy được bằng node.
//
// Mặc định Chủ Nhật là ngày nghỉ tuần. Đơn SWAP đã duyệt đổi ngày nghỉ tuần
// sang Thứ 7 cùng tuần: Thứ 7 thành ngày nghỉ (chấm công thì ×2.0 như Chủ Nhật),
// Chủ Nhật ngay sau thành ngày làm việc thường (công chuẩn 1.0, OT ×1.5).

/** NV chỉ được gửi đơn trong vòng N ngày sau Chủ Nhật làm bù. Admin không giới hạn. */
export const MAX_SWAP_BACKDATE_DAYS = 7; // cùng giá trị MAX_HOME_OT_BACKDATE_DAYS, cố ý là hằng riêng
/** Chặn gõ nhầm năm: Thứ 7 xa hơn mốc này so với hôm nay thì từ chối. */
export const MAX_SWAP_FUTURE_DAYS = 366;

/** Đơn còn "chiếm chỗ" tuần đó: đã duyệt hoặc đang chờ. Đơn từ chối không chiếm. */
export const SWAP_OCCUPYING_STATUSES: RequestStatus[] = ['APPROVED', 'PENDING'];

export const SWAP_TYPE_LABEL = 'Đổi ngày nghỉ';

/**
 * Đổi ngày nghỉ là do CÔNG TY xếp lịch làm Chủ Nhật, nhân viên chỉ gửi đơn để
 * công ty xác nhận — nên form không có ô lý do. Cột `reason` của bảng requests
 * vẫn được điền sẵn câu này để các màn hình dùng chung (duyệt đơn, lịch sử,
 * báo cáo Telegram) không phải xử lý chuỗi rỗng.
 */
export const SWAP_DEFAULT_REASON = 'Đổi ngày nghỉ theo yêu cầu công ty';

export const dayKeyOf = (d: Date): string => format(d, 'yyyy-MM-dd');

/** Chủ Nhật ghép với một Thứ 7: luôn là ngày hôm sau. */
export const pairedSunday = (saturday: Date): Date => addDays(startOfDay(saturday), 1);

const fmtVN = (d: Date): string => format(d, 'dd/MM/yyyy');
const fmtShort = (d: Date): string => format(d, 'dd/MM');

// === PHÂN LOẠI NGÀY ===

export interface RestDayResolution {
  /** true cho SUNDAY và SWAP_REST — mọi quyết định về TIỀN nhìn vào đây */
  isRestDay: boolean;
  kind: RestDayKind;
  /** Đơn APPROVED còn hiệu lực chạm ngày này (SWAP_REST / SWAP_WORK) */
  swap?: SwapRequest;
}

/**
 * Ngày lễ rơi vào một trong hai ngày của đơn (thêm SAU khi duyệt) thì đơn vô
 * hiệu cả hai ngày, trở về như không có đơn. Không vô hiệu thì ngày lễ trên
 * Thứ 7 đã đổi bị cổng `!isRestDay` ở salaryCalculator gạt mất 1.0 công lễ.
 */
export const isSwapVoidedByHoliday = (swap: SwapRequest, holidays: Holiday[]): boolean =>
  holidays.some(h => isSameDay(h.date, swap.restDate) || isSameDay(h.date, swap.workDate));

export const findSwapForDate = (
  date: Date,
  swaps: SwapRequest[],
  opts: { statuses?: RequestStatus[]; holidays?: Holiday[]; userId?: string } = {}
): { swap: SwapRequest; role: 'REST' | 'WORK' } | null => {
  const statuses = opts.statuses ?? ['APPROVED'];
  for (const s of swaps) {
    if (!statuses.includes(s.status)) continue;
    if (opts.userId && s.userId !== opts.userId) continue;
    if (opts.holidays && opts.holidays.length > 0 && isSwapVoidedByHoliday(s, opts.holidays)) continue;
    if (isSameDay(s.restDate, date)) return { swap: s, role: 'REST' };
    if (isSameDay(s.workDate, date)) return { swap: s, role: 'WORK' };
  }
  return null;
};

/**
 * Thay cho `isSunday(date)` ở mọi chỗ tính tiền.
 * `swaps` là đơn CỦA CHÍNH nhân viên đang tính (caller lọc, như leaveRequests).
 */
export const resolveRestDay = (
  date: Date,
  swaps: SwapRequest[] = [],
  holidays: Holiday[] = []
): RestDayResolution => {
  const hit = swaps.length > 0 ? findSwapForDate(date, swaps, { holidays }) : null;
  if (hit?.role === 'REST') return { isRestDay: true, kind: 'SWAP_REST', swap: hit.swap };
  if (hit?.role === 'WORK') return { isRestDay: false, kind: 'SWAP_WORK', swap: hit.swap };
  return isSunday(date)
    ? { isRestDay: true, kind: 'SUNDAY' }
    : { isRestDay: false, kind: 'WORKDAY' };
};

/** Predicate cho utils/leaveTypes.ts (đếm ngày phép bỏ qua ngày nghỉ tuần). */
export const makeRestDayPredicate = (
  swaps: SwapRequest[],
  holidays: Holiday[] = []
): ((d: Date) => boolean) =>
  (d: Date) => resolveRestDay(d, swaps, holidays).isRestDay;

// === CHỐNG TRÙNG ===

/** Đơn còn hiệu lực của cùng nhân viên trong cùng tuần (cùng Chủ Nhật). */
export const findOverlappingSwap = (
  userId: string,
  restDate: Date,
  existing: SwapRequest[],
  opts: { excludeId?: string } = {}
): SwapRequest | null => {
  const key = dayKeyOf(pairedSunday(restDate));
  return existing.find(s =>
    s.userId === userId &&
    s.id !== opts.excludeId &&
    SWAP_OCCUPYING_STATUSES.includes(s.status) &&
    dayKeyOf(s.workDate) === key
  ) || null;
};

/**
 * Đơn nghỉ phép (đã duyệt / chờ duyệt) phủ lên một ngày theo LỊCH, không qua
 * leaveDayMap: leaveDayMap bỏ ngày nghỉ tuần nên với Thứ 7 đã đổi sẽ không
 * bao giờ thấy trùng. Nghỉ nửa ngày cũng tính là trùng.
 */
export const findLeaveCoveringDay = (
  userId: string,
  day: Date,
  leaves: LeaveRequest[],
  opts: { excludeId?: string } = {}
): LeaveRequest | null => {
  const d = startOfDay(day);
  return leaves.find(l =>
    l.userId === userId &&
    l.id !== opts.excludeId &&
    SWAP_OCCUPYING_STATUSES.includes(l.status) &&
    d >= startOfDay(l.startDate) && d <= startOfDay(l.endDate)
  ) || null;
};

/**
 * Chiều ngược lại: đơn nghỉ phép MỚI có phủ lên Thứ 7 nghỉ bù của đơn đổi nào
 * không. Chỉ xét restDate — nghỉ phép trên Chủ Nhật đã đổi là hợp lệ (trừ quỹ
 * như ngày thường).
 */
export const findSwapBlockingLeave = (
  userId: string,
  range: { startDate: Date; endDate: Date },
  swaps: SwapRequest[],
  opts: { excludeId?: string } = {}
): SwapRequest | null => {
  const from = startOfDay(range.startDate);
  const to = startOfDay(range.endDate);
  return swaps.find(s =>
    s.userId === userId &&
    s.id !== opts.excludeId &&
    SWAP_OCCUPYING_STATUSES.includes(s.status) &&
    startOfDay(s.restDate) >= from && startOfDay(s.restDate) <= to
  ) || null;
};

// === VALIDATE ===

export interface SwapValidationInput {
  userId: string;
  /** Thứ 7 muốn nghỉ, 'yyyy-MM-dd' (từ <input type="date">) */
  restDate: string;
  /** Hôm nay 'yyyy-MM-dd', truyền vào để test được */
  today: string;
  /** Admin được miễn trần khai bù, KHÔNG được miễn trùng dữ liệu */
  isAdmin: boolean;
  /** employee.workDays, mặc định '1,2,3,4,5,6' (1=T2 … 6=T7, 7=CN) */
  workDays?: string;
  holidays: Holiday[];
  /** Toàn bộ đơn đổi (mọi nhân viên) — hàm tự lọc theo userId */
  existingSwaps: SwapRequest[];
  /** Toàn bộ đơn nghỉ phép — hàm tự lọc theo userId */
  leaveRequests: LeaveRequest[];
  /** Khi duyệt lại chính đơn này thì bỏ nó ra khỏi kiểm tra trùng */
  excludeId?: string;
}

const statusVN = (s: RequestStatus): string =>
  s === 'APPROVED' ? 'Đã duyệt' : s === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt';

const isoToDate = (iso: string): Date | null => {
  if (!iso || iso.length !== 10) return null;
  const d = new Date(`${iso}T00:00:00`);
  return isValid(d) ? d : null;
};

const shiftIso = (iso: string, days: number): string => dayKeyOf(addDays(isoToDate(iso)!, days));

/** Trả về câu thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export const validateSwapRequest = (input: SwapValidationInput): string | null => {
  const {
    userId, restDate, today, isAdmin,
    workDays = '1,2,3,4,5,6', holidays, existingSwaps, leaveRequests, excludeId
  } = input;

  if (!restDate) return 'Vui lòng chọn Thứ 7 muốn nghỉ.';

  const rest = isoToDate(restDate);
  if (!rest) return 'Ngày không hợp lệ.';
  if (!isSaturday(rest)) {
    return 'Ngày nghỉ bù phải là Thứ 7. Chủ Nhật vốn đã là ngày nghỉ, các ngày khác trong tuần không đổi được.';
  }
  const work = pairedSunday(rest);

  // Thứ 7 phải là ngày làm việc theo lịch của NV — nếu không thì "đổi" là vô nghĩa
  const workDayNums = workDays.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  if (!workDayNums.includes(6)) {
    return `Thứ 7 không thuộc lịch làm việc (${workDays}) của nhân viên — ngày này vốn đã nghỉ, không cần đổi.`;
  }

  const holidayOnRest = holidays.find(h => isSameDay(h.date, rest));
  if (holidayOnRest) {
    return `Thứ 7 ${fmtShort(rest)} trùng ngày lễ "${holidayOnRest.name}" — ngày lễ đã được nghỉ hưởng lương, không cần đổi.`;
  }
  const holidayOnWork = holidays.find(h => isSameDay(h.date, work));
  if (holidayOnWork) {
    return `Chủ Nhật ${fmtShort(work)} trùng ngày lễ "${holidayOnWork.name}" — không thể đổi thành ngày làm việc thường.`;
  }

  // Trần khai bù chỉ áp cho NV. So chuỗi ISO là đủ vì cùng định dạng yyyy-MM-dd.
  if (!isAdmin && today) {
    const workIso = dayKeyOf(work);
    const limitIso = shiftIso(today, -MAX_SWAP_BACKDATE_DAYS);
    if (workIso < limitIso) {
      return `Chỉ được gửi đơn đổi ngày nghỉ trong vòng ${MAX_SWAP_BACKDATE_DAYS} ngày sau Chủ Nhật làm bù. Đơn cũ hơn vui lòng nhờ Admin tạo hộ.`;
    }
  }
  if (today && restDate > shiftIso(today, MAX_SWAP_FUTURE_DAYS)) {
    return 'Ngày nghỉ bù quá xa (hơn 1 năm). Kiểm tra lại năm.';
  }

  // Trùng dữ liệu: chặn cả Admin
  const dupSwap = findOverlappingSwap(userId, rest, existingSwaps, { excludeId });
  if (dupSwap) {
    const monday = addDays(dupSwap.workDate, -6);
    return `Tuần ${fmtShort(monday)} – ${fmtShort(dupSwap.workDate)} đã có đơn đổi ngày nghỉ (${statusVN(dupSwap.status)}). Mỗi tuần chỉ đổi được một lần. Nếu đơn cũ sai, huỷ đơn đó trong mục Duyệt Đơn rồi tạo lại.`;
  }

  const leaveOnRest = findLeaveCoveringDay(userId, rest, leaveRequests);
  if (leaveOnRest) {
    return `Thứ 7 ${fmtShort(rest)} đã nằm trong đơn nghỉ phép (${fmtShort(leaveOnRest.startDate)} – ${fmtShort(leaveOnRest.endDate)}, ${statusVN(leaveOnRest.status)}). Đã nghỉ phép thì không cần đổi ngày nghỉ — muốn đổi, huỷ đơn nghỉ trước.`;
  }
  const leaveOnWork = findLeaveCoveringDay(userId, work, leaveRequests);
  if (leaveOnWork) {
    return `Chủ Nhật ${fmtShort(work)} đang nằm trong kỳ nghỉ phép (${fmtShort(leaveOnWork.startDate)} – ${fmtShort(leaveOnWork.endDate)}, ${statusVN(leaveOnWork.status)}) — không thể vừa nghỉ phép vừa đi làm bù.`;
  }

  return null;
};

// === NHÃN HIỂN THỊ ===

/** Nhãn cho ngày nghỉ tuần KHÔNG chấm công. */
export const restDayStatusText = (kind: RestDayKind): string =>
  kind === 'SUNDAY' ? 'Chủ Nhật - Nghỉ'
    : kind === 'SWAP_REST' ? 'Nghỉ bù (đổi Chủ Nhật)'
      : kind === 'SWAP_WORK' ? 'Làm bù Chủ Nhật'
        : '';

/** Nhãn cho ngày nghỉ tuần CÓ chấm công (hưởng ×2). */
export const restDayWorkedText = (kind: RestDayKind): string =>
  kind === 'SWAP_REST' ? 'Làm ngày nghỉ bù (×2)'
    : kind === 'SUNDAY' ? 'Làm Chủ Nhật'
      : '';

/** Nhãn dòng phút trong bảng chi tiết tăng ca. */
export const restDayMinutesLabel = (kind: RestDayKind): string =>
  kind === 'SWAP_REST' ? 'Làm ngày nghỉ bù (đổi CN)' : 'Làm việc Chủ Nhật';

export const describeSwap = (s: SwapRequest): string =>
  `Nghỉ Thứ 7 ${fmtVN(s.restDate)}, làm bù Chủ Nhật ${fmtVN(s.workDate)}`;

export const describeSwapShort = (s: SwapRequest): string =>
  `Nghỉ T7 ${fmtShort(s.restDate)} → Làm CN ${fmtShort(s.workDate)}`;

// === MAP DÒNG DB ===

type ProfileLike = { id: string; name?: string; avatar?: string; role?: UserRole };

/** Map 1 dòng bảng `requests` (type='SWAP') sang SwapRequest. Theo mẫu mapLeaveRow. */
export const mapSwapRow = (r: any, profiles: ProfileLike[] = []): SwapRequest => {
  const user = profiles.find(p => p.id === r.user_id);
  const restDate = parseRequestDate(r.date);
  return {
    userId: r.user_id,
    userName: user?.name || 'Unknown',
    userAvatar: user?.avatar || '',
    userRole: (user?.role || 'Employee') as UserRole,
    createdAt: r.created_at ? new Date(r.created_at) : undefined,
    processedAt: r.processed_at ? new Date(r.processed_at) : undefined,
    id: String(r.id),
    restDate,
    // Dòng thiếu swap_work_date (không nên có) thì suy từ Thứ 7 để không ra Invalid Date
    workDate: r.swap_work_date ? parseRequestDate(r.swap_work_date) : pairedSunday(restDate),
    reason: r.reason || '',
    status: r.status,
    rejectionReason: r.rejection_reason ?? null
  };
};

/** Payload insert. Luôn là chuỗi ngày thuần 'yyyy-MM-dd' để khỏi lệch múi giờ. */
export const toSwapRow = (
  userId: string,
  restDate: Date,
  reason: string,
  status: RequestStatus
) => ({
  user_id: userId,
  type: 'SWAP',
  date: dayKeyOf(restDate),
  swap_work_date: dayKeyOf(pairedSunday(restDate)),
  reason,
  status
});
