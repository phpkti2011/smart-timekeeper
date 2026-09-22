import { addDays, differenceInMonths, eachDayOfInterval, isSameDay, isSunday, startOfDay, startOfYear } from 'date-fns';
import { Holiday, LeaveRequest, LeaveType, RequestStatus, UserProfile } from '../types';

// === LUẬT PHÉP NĂM ===
// Quỹ tích luỹ 1 ngày cho mỗi tháng làm việc, tối đa 12 ngày, tự reset về 0 ngày 01/01.
// Mỗi tháng chỉ được DÙNG tối đa 2 ngày phép năm (chỉ áp cho PAID, nghỉ chế độ được miễn trừ).
export const LEAVE_DAYS_PER_MONTH = 1;
export const LEAVE_MAX_DAYS_PER_YEAR = 12;
export const MONTHLY_PAID_LEAVE_QUOTA = 2;

/**
 * Ngày nghỉ tuần: mặc định Chủ Nhật. Nhân viên có đơn đổi ngày nghỉ đã duyệt thì
 * truyền predicate từ utils/restDay (makeRestDayPredicate) để Thứ 7 đã đổi không
 * trừ phép còn Chủ Nhật đã đổi thì có. Mọi hàm đếm ngày phép dưới đây nhận cùng
 * một predicate để con số ở mọi màn hình khớp với attendanceCalculator.
 */
export type RestDayPredicate = (d: Date) => boolean;
const defaultRestDay: RestDayPredicate = isSunday;

// Ngày kết thúc để kỳ nghỉ phủ đúng `workingDays` ngày làm việc (bỏ qua ngày nghỉ tuần)
export const deriveLeaveEndDate = (start: Date, workingDays: number, isRestDay: RestDayPredicate = defaultRestDay): Date => {
  let counted = 0;
  let cursor = start;
  let end = start;
  while (counted < workingDays) {
    if (!isRestDay(cursor)) {
      counted++;
      end = cursor;
    }
    if (counted < workingDays) cursor = addDays(cursor, 1);
  }
  return end;
};

/**
 * CÔNG TY có trả lương ngày đó không → quyết định `standardWorkDays` và tiền lương.
 *
 * Danh sách TRẮNG chứ không phải `t !== 'UNPAID'`: viết theo kiểu loại trừ thì mỗi
 * lần thêm một loại nghỉ mới, loại đó mặc định được trả lương — đúng cái bẫy khiến
 * thai sản 6 tháng suýt được trả song song với tiền BHXH.
 */
export const isPaidLeaveType = (t: LeaveType): boolean => t === 'PAID' || t === 'SPECIAL';

/** Nghỉ do BHXH chi trả: công ty trả 0 đồng nhưng KHÔNG phải nghỉ không lương. */
export const isInsuranceLeaveType = (t: LeaveType): boolean => t === 'INSURANCE';

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  PAID: 'Phép năm',
  SPECIAL: 'Nghỉ chế độ (có lương)',
  INSURANCE: 'Nghỉ chế độ (BHXH chi trả)',
  UNPAID: 'Không lương',
};

/** Ai trả tiền — câu ngắn để hiển thị cho người dùng. */
export const LEAVE_PAYER_TEXT: Record<LeaveType, string> = {
  PAID: 'Công ty trả nguyên lương, trừ vào quỹ phép năm',
  SPECIAL: 'Công ty trả nguyên lương, không trừ quỹ phép năm',
  INSURANCE: 'BHXH chi trả, công ty không tính lương những ngày này',
  UNPAID: 'Không hưởng lương, không trừ quỹ phép năm',
};

// Nhãn ngắn cho câu tường thuật ("có lương"/"không lương")
export const isPaidText = (t: LeaveType): string =>
  t === 'INSURANCE' ? 'BHXH trả' : isPaidLeaveType(t) ? 'có lương' : 'không lương';

export const getLeaveBadgeClass = (t: LeaveType): string =>
  t === 'PAID'
    ? 'bg-green-50 text-green-600 border-green-200'
    : t === 'SPECIAL'
      ? 'bg-teal-50 text-teal-600 border-teal-200'
      : t === 'INSURANCE'
        ? 'bg-sky-50 text-sky-600 border-sky-200'
        : 'bg-gray-100 text-gray-500 border-gray-200';

// Nhãn/màu trạng thái đơn — dùng chung cho mọi màn hiển thị đơn từ
export const getRequestStatusClass = (status: RequestStatus): string => {
  switch (status) {
    case 'APPROVED': return 'text-green-600 bg-green-50 border-green-200';
    case 'REJECTED': return 'text-red-600 bg-red-50 border-red-200';
    default: return 'text-orange-600 bg-orange-50 border-orange-200';
  }
};

export const getRequestStatusText = (status: RequestStatus): string => {
  switch (status) {
    case 'APPROVED': return 'Đã duyệt';
    case 'REJECTED': return 'Từ chối';
    default: return 'Chờ duyệt';
  }
};

// === TÍNH QUỸ PHÉP ===
// Tất cả màn hình đều dùng chung các hàm dưới đây. Không lưu số dư trong DB:
// phép còn lại luôn được tính lại từ đơn đã duyệt nên không bao giờ lệch.

// Ngày lễ cả ngày → đã được trả lương như ngày lễ, không trừ vào quỹ phép
const findFullHoliday = (date: Date, holidays: Holiday[]): Holiday | undefined => {
  const h = holidays.find(x => isSameDay(new Date(x.date), date));
  return h && (!h.duration || h.duration === 'FULL') ? h : undefined;
};

const isFullHoliday = (date: Date, holidays: Holiday[]): boolean =>
  !!findFullHoliday(date, holidays);

// Bóc tách số ngày của 1 đơn để giải thích vì sao trừ ít hơn số ngày lịch
export interface LeaveDayBreakdown {
  calendarDays: number;    // tổng số ngày trong khoảng (kể cả CN và lễ)
  sundayDays: number;      // số ngày nghỉ tuần bị bỏ (Chủ Nhật, hoặc Thứ 7 đã đổi)
  holidayDays: number;     // số ngày lễ bị bỏ (không trùng Chủ Nhật, tránh đếm 2 lần)
  holidayNames: string[];
  countedDays: number;     // số ngày thực bị trừ quỹ
  isHalfDay: boolean;      // đơn 1 ngày nghỉ nửa buổi
  isCrossYear: boolean;    // đơn vắt qua 2 năm
}

// Bỏ Chủ Nhật và ngày lễ để khớp attendanceCalculator (những ngày đó không tính
// công nên cũng không trừ phép). Đây là nguồn công thức duy nhất — countLeaveDays
// gọi lại hàm này để con số và phần giải thích không bao giờ lệch nhau.
export const explainLeaveDays = (
  req: Pick<LeaveRequest, 'startDate' | 'endDate' | 'duration'>,
  holidays: Holiday[] = [],
  isRestDay: RestDayPredicate = defaultRestDay
): LeaveDayBreakdown => {
  const start = startOfDay(new Date(req.startDate));
  const end = startOfDay(new Date(req.endDate));

  const empty: LeaveDayBreakdown = {
    calendarDays: 0, sundayDays: 0, holidayDays: 0, holidayNames: [],
    countedDays: 0, isHalfDay: false, isCrossYear: false
  };
  if (end < start) return empty;

  const isCrossYear = start.getFullYear() !== end.getFullYear();

  // Đơn 1 ngày: nửa buổi = 0.5 công
  if (isSameDay(start, end)) {
    const holiday = findFullHoliday(start, holidays);
    if (isRestDay(start)) {
      return { ...empty, calendarDays: 1, sundayDays: 1 };
    }
    if (holiday) {
      return { ...empty, calendarDays: 1, holidayDays: 1, holidayNames: [holiday.name] };
    }
    return {
      ...empty,
      calendarDays: 1,
      countedDays: req.duration === 'FULL' ? 1 : 0.5,
      isHalfDay: req.duration !== 'FULL'
    };
  }

  // Đơn nhiều ngày luôn là nghỉ cả ngày (khớp attendanceCalculator)
  const days = eachDayOfInterval({ start, end });
  let sundayDays = 0;
  let countedDays = 0;
  const holidayNames: string[] = [];

  days.forEach(d => {
    if (isRestDay(d)) {
      sundayDays++;
      return;
    }
    const holiday = findFullHoliday(d, holidays);
    if (holiday) {
      holidayNames.push(holiday.name);
      return;
    }
    countedDays++;
  });

  return {
    calendarDays: days.length,
    sundayDays,
    holidayDays: holidayNames.length,
    holidayNames,
    countedDays,
    isHalfDay: false,
    isCrossYear
  };
};

// Số ngày phép thực bị trừ của 1 đơn
export const countLeaveDays = (
  req: Pick<LeaveRequest, 'startDate' | 'endDate' | 'duration'>,
  holidays: Holiday[] = [],
  isRestDay: RestDayPredicate = defaultRestDay
): number => explainLeaveDays(req, holidays, isRestDay).countedDays;

// === KHỬ TRÙNG NGÀY GIỮA CÁC ĐƠN ===
// Nhiều đơn có thể phủ lên cùng một ngày (nhập trùng, hoặc sửa đơn bằng cách tạo
// đơn mới). Cộng theo ĐƠN thì ngày chồng bị đếm nhiều lần; cộng theo NGÀY mới đúng.

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Các ngày một đơn THỰC SỰ chiếm: 'yyyy-MM-dd' → phần công (0.5 hoặc 1).
 * Chủ Nhật và ngày lễ cả ngày không có mặt vì chúng không trừ phép.
 *
 * Dùng chung đúng bộ luật với explainLeaveDays — sửa luật thì sửa ở cả hai, hoặc
 * tốt hơn là để explainLeaveDays gọi vào đây.
 */
export const leaveDayMap = (
  req: Pick<LeaveRequest, 'startDate' | 'endDate' | 'duration'>,
  holidays: Holiday[] = [],
  isRestDay: RestDayPredicate = defaultRestDay
): Map<string, number> => {
  const map = new Map<string, number>();
  const start = startOfDay(new Date(req.startDate));
  const end = startOfDay(new Date(req.endDate));
  if (end < start) return map;

  if (isSameDay(start, end)) {
    if (isRestDay(start) || isFullHoliday(start, holidays)) return map;
    map.set(dayKey(start), req.duration === 'FULL' ? 1 : 0.5);
    return map;
  }

  // Đơn nhiều ngày luôn là nghỉ cả ngày (khớp attendanceCalculator)
  eachDayOfInterval({ start, end }).forEach(d => {
    if (isRestDay(d) || isFullHoliday(d, holidays)) return;
    map.set(dayKey(d), 1);
  });
  return map;
};

/**
 * Gộp nhiều đơn thành một bản đồ ngày duy nhất. Ngày bị nhiều đơn phủ thì lấy
 * phần LỚN NHẤT: nghỉ nửa buổi rồi lại có đơn cả ngày thì ngày đó là 1.0, không
 * phải 1.5. Nửa buổi sáng + nửa buổi chiều vẫn ra 0.5 — hạn chế đã biết, chấp
 * nhận được vì trừ thiếu 0.5 an toàn hơn trừ thừa, và ca này rất hiếm.
 */
export const mergeLeaveDayMaps = (
  requests: Pick<LeaveRequest, 'startDate' | 'endDate' | 'duration'>[],
  holidays: Holiday[] = [],
  isRestDay: RestDayPredicate = defaultRestDay
): Map<string, number> => {
  const merged = new Map<string, number>();
  requests.forEach(req => {
    leaveDayMap(req, holidays, isRestDay).forEach((phan, key) => {
      merged.set(key, Math.max(merged.get(key) || 0, phan));
    });
  });
  return merged;
};

export const sumDayMap = (map: Map<string, number>): number => {
  let s = 0;
  map.forEach(v => { s += v; });
  return s;
};

/** Số ngày phép thực tế của một nhóm đơn, đã khử ngày chồng nhau. */
export const countDistinctLeaveDays = (
  requests: Pick<LeaveRequest, 'startDate' | 'endDate' | 'duration'>[],
  holidays: Holiday[] = [],
  isRestDay: RestDayPredicate = defaultRestDay
): number => sumDayMap(mergeLeaveDayMaps(requests, holidays, isRestDay));

/**
 * Số ngày LỊCH của một nhóm đơn, đã khử ngày trùng — KỂ CẢ Chủ Nhật và ngày lễ.
 * Khác countDistinctLeaveDays: hàm kia đếm ngày bị trừ phép, hàm này đếm độ dài
 * kỳ nghỉ theo lịch. Cột "Ngày lịch" ở màn lịch sử dùng hàm này.
 */
export const countDistinctCalendarDays = (
  requests: Pick<LeaveRequest, 'startDate' | 'endDate'>[]
): number => {
  const ngay = new Set<string>();
  requests.forEach(req => {
    const start = startOfDay(new Date(req.startDate));
    const end = startOfDay(new Date(req.endDate));
    if (end < start) return;
    eachDayOfInterval({ start, end }).forEach(d => ngay.add(dayKey(d)));
  });
  return ngay.size;
};

/** Trạng thái đơn được coi là ĐANG CHIẾM ngày. Đơn bị từ chối thì không. */
const OCCUPYING_STATUSES: RequestStatus[] = ['APPROVED', 'PENDING'];

/**
 * Đơn đã có nào chồng ngày với khoảng đang xin. Không có → null.
 *
 * Chỉ so những ngày THỰC SỰ trừ phép, nên xin nghỉ đè đúng vào Chủ Nhật hay ngày
 * lễ của đơn cũ thì không bị coi là chồng lấn.
 */
export const findOverlappingLeave = (
  userId: string,
  range: Pick<LeaveRequest, 'startDate' | 'endDate' | 'duration'>,
  existing: LeaveRequest[],
  opts: { holidays?: Holiday[]; excludeId?: string; isRestDay?: RestDayPredicate } = {}
): LeaveRequest | null => {
  const holidays = opts.holidays || [];
  const isRestDay = opts.isRestDay || defaultRestDay;
  const wanted = leaveDayMap(range, holidays, isRestDay);
  if (wanted.size === 0) return null;

  for (const req of existing) {
    if (req.userId !== userId) continue;
    if (opts.excludeId && req.id === opts.excludeId) continue;
    if (!OCCUPYING_STATUSES.includes(req.status)) continue;

    const taken = leaveDayMap(req, holidays, isRestDay);
    for (const key of wanted.keys()) {
      if (taken.has(key)) return req;
    }
  }
  return null;
};

export const OFFICIAL_CONTRACT = 'Hợp đồng chính thức';

/**
 * Chỉ hợp đồng chính thức mới được tích luỹ phép năm — thử việc, Part-time,
 * CTV thì không.
 *
 * contractType rỗng = hồ sơ cũ chưa nhập, coi như chính thức để khớp với cách
 * App.tsx map `contract_type || 'Hợp đồng chính thức'`. Cố ý fail-open để dữ
 * liệu cũ không bị cắt phép oan.
 */
export const accruesAnnualLeave = (emp: Pick<UserProfile, 'contractType'>): boolean =>
  !emp.contractType || emp.contractType === OFFICIAL_CONTRACT;

// JS parse chuỗi 'YYYY-MM-DD' thành nửa đêm UTC = 07:00 giờ VN. Với mốc kỷ niệm
// hàng tháng thì 7 tiếng đó đủ làm ngày tròn tháng bị trễ mất một ngày, và kết
// quả còn đổi theo giờ trong ngày lúc Admin mở máy. Luôn quy về nửa đêm địa phương.
const parseLocalDate = (value: string | Date): Date =>
  startOfDay(typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value));

// Quỹ phép tích luỹ của NĂM HIỆN TẠI.
//
// Phải làm ĐỦ TRÒN 1 tháng mới được 1 ngày phép — tính theo ngày kỷ niệm chứ
// không theo tháng dương lịch. Ký chính thức 25/08 thì 25/09 mới có ngày đầu
// tiên. (Công thức cũ đếm tháng dương lịch nên ký 31/12 là ngay hôm đó đã có
// 1 ngày, còn ký 25/08 xem ngày 12/09 đã ra 2 ngày.)
//
// Nhận cả object nhân viên chứ không chỉ ngày: nếu để contractType là tham số
// tuỳ chọn thì chỗ nào quên truyền sẽ âm thầm cấp phép trở lại.
export const getAccruedLeaveThisYear = (
  emp: Pick<UserProfile, 'contractDate' | 'officialContractDate' | 'contractType' | 'resignationDate'>,
  opts: { asOf?: Date } = {}
): number => {
  if (!accruesAnnualLeave(emp)) return 0;

  // Mốc tích luỹ là ngày ký HĐ chính thức. Chưa nhập thì lùi về ngày vào làm
  // để hồ sơ cũ (chỉ có một ô ngày) không bị mất sạch phép.
  const startRaw = emp.officialContractDate || emp.contractDate;
  if (!startRaw) return 0;
  const accrualStart = parseLocalDate(startRaw);

  const asOf = startOfDay(opts.asOf || new Date());

  // Nghỉ việc rồi thì dừng tích luỹ tại ngày nghỉ
  const effectiveAsOf = emp.resignationDate
    ? new Date(Math.min(asOf.getTime(), parseLocalDate(emp.resignationDate).getTime()))
    : asOf;

  // Số tháng tròn đã hoàn thành, trừ đi phần đã hoàn thành TRƯỚC 01/01 năm nay
  // → chính là cơ chế reset đầu năm, diễn đạt theo mốc kỷ niệm.
  // Mốc so sánh là 31/12 năm trước, KHÔNG phải 01/01 năm nay: người có ngày kỷ
  // niệm rơi đúng 01/01 mà lấy mốc 01/01 thì tháng đó bị tính sang năm cũ, làm
  // người làm đủ năm chỉ được 11 ngày thay vì 12.
  const endOfLastYear = addDays(startOfYear(asOf), -1);

  const totalCompleted = differenceInMonths(effectiveAsOf, accrualStart);
  const completedBeforeYear = Math.max(0, differenceInMonths(endOfLastYear, accrualStart));
  const months = totalCompleted - completedBeforeYear;

  return Math.max(0, Math.min(months * LEAVE_DAYS_PER_MONTH, LEAVE_MAX_DAYS_PER_YEAR));
};

// Một đơn nghỉ kèm phần bóc tách số ngày — dùng cho màn xem lịch sử phép
export interface LeaveUsageEntry {
  request: LeaveRequest;
  breakdown: LeaveDayBreakdown;
  deductsQuota: boolean;  // chỉ phép năm đã duyệt mới trừ quỹ
  deductedDays: number;   // deductsQuota ? breakdown.countedDays : 0
  /**
   * Phần NGÀY MỚI đơn này đóng góp — đã trừ đi những ngày các đơn trước đó
   * (cũ hơn) đã chiếm. Tổng quỹ đã dùng phải cộng trường NÀY, không phải
   * `deductedDays`, nếu không đơn nhập trùng sẽ ăn quỹ nhiều lần.
   *
   * `newDeductedDays < deductedDays` nghĩa là đơn có ngày chồng đơn trước.
   */
  newDeductedDays: number;
  /** Số ngày của đơn này đã bị đơn cũ hơn chiếm trước. 0 = không trùng ai. */
  overlapDays: number;
}

// Đơn nghỉ của 1 nhân viên trong 1 năm, cũ nhất trước.
// Điều kiện lọc theo năm nằm DUY NHẤT ở đây để bảng chi tiết và con số tổng
// không bao giờ trôi dạt khỏi nhau.
export const getLeaveEntriesForYear = (
  userId: string,
  leaveRequests: LeaveRequest[],
  opts: {
    asOf?: Date;
    holidays?: Holiday[];
    leaveTypes?: LeaveType[];       // mặc định: tất cả
    statuses?: RequestStatus[];     // mặc định: chỉ APPROVED
    isRestDay?: RestDayPredicate;   // mặc định: Chủ Nhật
  } = {}
): LeaveUsageEntry[] => {
  const year = (opts.asOf || new Date()).getFullYear();
  const statuses = opts.statuses || ['APPROVED'];
  const isRestDay = opts.isRestDay || defaultRestDay;

  return leaveRequests
    .filter(req =>
      req.userId === userId &&
      statuses.includes(req.status) &&
      (!opts.leaveTypes || opts.leaveTypes.includes(req.leaveType)) &&
      new Date(req.startDate).getFullYear() === year
    )
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map((request, i, all) => {
      const breakdown = explainLeaveDays(request, opts.holidays, isRestDay);
      const deductsQuota = request.leaveType === 'PAID' && request.status === 'APPROVED';
      const deductedDays = deductsQuota ? breakdown.countedDays : 0;

      // Ngày nào của đơn này đã bị một đơn CŨ HƠN chiếm trước. Duyệt theo thứ tự
      // đã sắp (cũ trước) nên đơn đầu tiên phủ một ngày luôn là đơn giữ ngày đó.
      const thisDays = leaveDayMap(request, opts.holidays, isRestDay);
      const earlier = mergeLeaveDayMaps(all.slice(0, i), opts.holidays, isRestDay);

      let overlap = 0;
      thisDays.forEach((phan, key) => {
        const daCo = earlier.get(key) || 0;
        if (daCo > 0) overlap += Math.min(phan, daCo);
      });

      return {
        request,
        breakdown,
        deductsQuota,
        deductedDays,
        overlapDays: parseFloat(overlap.toFixed(2)),
        newDeductedDays: deductsQuota
          ? Math.max(0, parseFloat((breakdown.countedDays - overlap).toFixed(2)))
          : 0
      };
    });
};

// Tổng ngày phép năm (PAID) đã duyệt trong năm
export const getPaidLeaveUsedThisYear = (
  userId: string,
  leaveRequests: LeaveRequest[],
  opts: { asOf?: Date; holidays?: Holiday[]; isRestDay?: RestDayPredicate } = {}
): number =>
  getLeaveEntriesForYear(userId, leaveRequests, {
    ...opts,
    leaveTypes: ['PAID'],
    statuses: ['APPROVED']
    // Cộng newDeductedDays chứ KHÔNG phải deductedDays: hai đơn phủ lên cùng một
    // ngày (nhập trùng, hoặc sửa đơn bằng cách tạo đơn mới) sẽ ăn quỹ hai lần.
  }).reduce((sum, entry) => sum + entry.newDeductedDays, 0);

// Phép còn lại = quỹ tích luỹ − đã dùng trên hệ thống − đã dùng cũ (nhập tay).
// KHÔNG kẹp về 0: số âm cho Admin thấy nhân viên đã nghỉ vượt quỹ.
export const getRemainingLeave = (
  user: Pick<UserProfile, 'id' | 'contractDate' | 'officialContractDate' | 'contractType' | 'usedLeaveLegacy' | 'resignationDate'>,
  leaveRequests: LeaveRequest[],
  opts: { asOf?: Date; holidays?: Holiday[]; isRestDay?: RestDayPredicate } = {}
): number => {
  const accrued = getAccruedLeaveThisYear(user, { asOf: opts.asOf });
  const used = getPaidLeaveUsedThisYear(user.id, leaveRequests, opts);
  return accrued - used - (user.usedLeaveLegacy || 0);
};

// Số ngày phép năm đã dùng trong 1 tháng — dùng cho trần MONTHLY_PAID_LEAVE_QUOTA.
// Tính cả APPROVED lẫn PENDING để không lách quota bằng cách gửi nhiều đơn cùng lúc.
export const getPaidLeaveUsedThisMonth = (
  userId: string,
  leaveRequests: LeaveRequest[],
  targetMonth: Date = new Date(),
  holidays: Holiday[] = [],
  isRestDay: RestDayPredicate = defaultRestDay
): number => {
  const donTrongThang = leaveRequests
    .filter(req => {
      const start = new Date(req.startDate);
      return req.userId === userId &&
        (req.status === 'APPROVED' || req.status === 'PENDING') &&
        req.leaveType === 'PAID' &&
        start.getFullYear() === targetMonth.getFullYear() &&
        start.getMonth() === targetMonth.getMonth();
    });

  // Gộp thành bản đồ NGÀY rồi mới đếm: cộng theo đơn thì hai đơn trùng ngày sẽ
  // ăn trần tháng hai lần, chặn oan người còn quyền nghỉ.
  return sumDayMap(mergeLeaveDayMaps(donTrongThang, holidays, isRestDay));
};

// === DANH MỤC NGHỈ CHẾ ĐỘ ===
// Mỗi lý do tự khai AI TRẢ LƯƠNG. Loại nghỉ lưu vào đơn lấy từ đây chứ không phải
// từ tab người dùng bấm — nếu không thì thai sản sẽ bị công ty trả lương chồng lên
// tiền BHXH.

export interface SpecialLeaveReason {
  value: string;
  /** Số ngày theo quy định. null = tuỳ trường hợp, Admin tự nhập. */
  suggestedDays: number | null;
  leaveType: LeaveType;
  /** Căn cứ, hiện ngay dưới ô chọn để Admin đối chiếu */
  basis: string;
  /** Nhóm để gom trong danh sách thả xuống */
  group: 'Hiếu hỉ' | 'Thai sản (BHXH)' | 'Không hưởng lương' | 'Khác';
}

export const SPECIAL_LEAVE_REASONS: SpecialLeaveReason[] = [
  // --- Điều 115 khoản 1: công ty trả nguyên lương ---
  { value: 'Nghỉ cưới (bản thân)', suggestedDays: 3, leaveType: 'SPECIAL', group: 'Hiếu hỉ', basis: 'Điều 115.1 BLLĐ — 3 ngày hưởng nguyên lương' },
  { value: 'Nghỉ cưới con', suggestedDays: 1, leaveType: 'SPECIAL', group: 'Hiếu hỉ', basis: 'Điều 115.1 BLLĐ — 1 ngày hưởng nguyên lương' },
  { value: 'Nghỉ tang cha/mẹ (hai bên), vợ/chồng, con', suggestedDays: 3, leaveType: 'SPECIAL', group: 'Hiếu hỉ', basis: 'Điều 115.1 BLLĐ — 3 ngày hưởng nguyên lương' },

  // --- Chế độ BHXH: công ty KHÔNG trả lương những ngày này ---
  { value: 'Nghỉ thai sản (sinh con)', suggestedDays: null, leaveType: 'INSURANCE', group: 'Thai sản (BHXH)', basis: 'Luật BHXH — 6 tháng, BHXH chi trả. Nhập số ngày làm việc thực tế của kỳ nghỉ.' },
  { value: 'Nghỉ khám thai', suggestedDays: 1, leaveType: 'INSURANCE', group: 'Thai sản (BHXH)', basis: 'Luật BHXH — 5 lần, mỗi lần 1 ngày, BHXH chi trả' },
  { value: 'Nghỉ sẩy thai / nạo, hút thai', suggestedDays: null, leaveType: 'INSURANCE', group: 'Thai sản (BHXH)', basis: 'Luật BHXH — theo tuổi thai, BHXH chi trả' },
  { value: 'Nghỉ do vợ sinh con (lao động nam)', suggestedDays: 5, leaveType: 'INSURANCE', group: 'Thai sản (BHXH)', basis: 'Luật BHXH — 5 đến 14 ngày tuỳ trường hợp, BHXH chi trả' },

  // --- Điều 115 khoản 2: nghỉ 1 ngày không hưởng lương ---
  { value: 'Nghỉ tang ông bà nội/ngoại, anh/chị/em ruột', suggestedDays: 1, leaveType: 'UNPAID', group: 'Không hưởng lương', basis: 'Điều 115.2 BLLĐ — 1 ngày, không hưởng lương' },
  { value: 'Nghỉ cưới của cha/mẹ', suggestedDays: 1, leaveType: 'UNPAID', group: 'Không hưởng lương', basis: 'Điều 115.2 BLLĐ — 1 ngày, không hưởng lương' },
  { value: 'Nghỉ cưới anh/chị/em ruột', suggestedDays: 1, leaveType: 'UNPAID', group: 'Không hưởng lương', basis: 'Điều 115.2 BLLĐ — 1 ngày, không hưởng lương' },

  { value: 'Khác', suggestedDays: null, leaveType: 'SPECIAL', group: 'Khác', basis: 'Công ty trả nguyên lương. Nhập rõ lý do bên dưới.' },
];

/** Thứ tự nhóm trong danh sách thả xuống */
export const SPECIAL_LEAVE_GROUPS: SpecialLeaveReason['group'][] =
  ['Hiếu hỉ', 'Thai sản (BHXH)', 'Không hưởng lương', 'Khác'];

export const findSpecialLeaveReason = (value: string): SpecialLeaveReason | undefined =>
  SPECIAL_LEAVE_REASONS.find(r => r.value === value);

/** Loại nghỉ thực tế của một lý do chế độ. Không tìm thấy → SPECIAL (giữ hành vi cũ). */
export const leaveTypeForSpecialReason = (value: string): LeaveType =>
  findSpecialLeaveReason(value)?.leaveType || 'SPECIAL';
