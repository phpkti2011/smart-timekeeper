
export enum AttendanceType {
  OT_MORNING = 'Tăng ca sáng',
  IN_MORNING = 'Vào sáng',
  OUT_MORNING = 'Ra sáng',
  OT_AFTERNOON = 'Tăng ca chiều',
  IN_AFTERNOON = 'Vào chiều',
  OUT_AFTERNOON = 'Ra chiều',
}

export interface AttendanceLog {
  id: string;
  userId?: string; // Added for mapping from Supabase
  type: AttendanceType;
  timestamp: Date;
  location: {
    lat: number;
    lng: number;
  };
  ip: string;
  isValidLocation: boolean;
  note?: string;
}

export interface OverrideLog {
  id: string;
  userId: string;
  date: Date;
  in1: string; // "08:00"
  out1: string;
  in2: string;
  out2: string;
  workDays: number; // Manual calculated work unit (e.g. 1.0)
  note: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface CompanySettings {
  name: string;
  location: Coordinates;
  allowedRadiusMeters: number;
  allowedIpPrefix?: string;
}

export type UserRole =
  | 'Admin'
  | 'Nhân Viên Kinh Doanh'
  | 'Nhân Viên Sản Xuất'
  | 'Nhân Viên Bình File'
  | 'Nhân Viên Thiết Kế'
  | 'Nhân Viên Kế Toán'
  | 'Nhân Viên Marketing'
  | 'Quản Lý Sản Xuất';

export type UserStatus = 'ACTIVE' | 'PENDING' | 'LOCKED';

export interface UserProfile {
  name: string;
  id: string;
  employeeCode?: string; // Custom ID like NV001
  avatar: string;
  role: UserRole;
  status?: UserStatus; // New field for account approval
  // Extended HR Fields
  dateOfBirth?: string | null; // ISO Date YYYY-MM-DD
  email?: string;
  phone?: string | null; // Số di động, chuẩn hoá 10 số bắt đầu bằng 0. NULL = chưa khai.
  weekendGroup?: WeekendGroup | null; // Nhóm làm Chủ Nhật luân phiên (cột profiles.weekend_group). NULL = chưa xếp.
  password?: string; // Replaced managerEmail
  baseSalary?: number;
  allowance?: number;
  workDays?: string; // e.g., "1,2,3,4,5,6"
  contractType?: 'Hợp đồng chính thức' | 'Hợp đồng thử việc' | 'Part-time' | 'CTV';
  contractDate?: string; // Ngày vào làm / bắt đầu thử việc — mốc tính công và thâm niên
  officialContractDate?: string | null; // Ngày ký HĐ chính thức — mốc tích luỹ phép năm
  insuranceSalary?: number;
  usedLeaveLegacy?: number; // Manually entered used leave
  resignationDate?: string | null; // ISO Date YYYY-MM-DD, null = still working
  /**
   * Hồ sơ RÚT GỌN từ view employee_directory: không có lương, email, số điện
   * thoại. Nhân viên thường chỉ nhận dạng này cho đồng nghiệp. KHÔNG BAO GIỜ
   * đưa hồ sơ dạng này vào calculateMonthlySalary.
   */
  isDirectoryOnly?: boolean;
}

export interface SalaryChange {
  id: string;
  userId: string;
  baseSalary: number;
  allowance: number;
  insuranceSalary: number;
  effectiveDate: string; // ISO Date YYYY-MM-DD
  reason?: string;
  createdAt?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'PENDING';

}

export interface OTBreakdown {
  earlyMorningMinutes: number;
  lunchMinutes: number;
  eveningMinutes: number;
  sundayMinutes: number;
  /** Phút tăng ca khai theo khung giờ. Là MỘT BUCKET RIÊNG — cộng vào tổng phút. */
  declaredMinutes: number;
  /**
   * Phút rơi vào khung đêm 22:00–06:00. Là TẬP CON của các bucket trên,
   * KHÔNG phải số hạng — cộng nó vào tổng là đếm trùng.
   */
  nightMinutes: number;
  totalConvertedDays: number; // The "0.275 công" value
}

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BaseRequestInfo {
  userId: string;
  userName: string;
  userAvatar: string;
  userRole: UserRole;
  createdAt?: Date; // Added
  processedAt?: Date; // Added
  rejectionReason?: string | null;
}

export type OTLocation = 'OFFICE' | 'HOME';

export interface OTRequest extends BaseRequestInfo {
  id: string;
  date: Date;
  shift: 'MORNING' | 'AFTERNOON';
  reason: string;
  status: RequestStatus;
  // Khung giờ khai báo. CÓ ĐỦ cả hai thì số phút lấy theo khung giờ này;
  // thiếu (đơn cũ) thì đơn chỉ là cờ mở khoá, phút suy từ giờ chấm công.
  otStart?: string | null;   // 'HH:mm'
  otEnd?: string | null;     // 'HH:mm'; <= otStart nghĩa là vắt qua nửa đêm
  otLocation?: OTLocation;   // thiếu = OFFICE
}

export interface LateRequest extends BaseRequestInfo {
  id: string;
  date: Date;
  reason: string;
  status: RequestStatus;
  minutesLate: number;
}

// --- LEAVE TYPES ---
/**
 * PAID     — phép năm, trừ quỹ, công ty trả lương.
 * SPECIAL  — nghỉ chế độ công ty trả nguyên lương (cưới, tang — Điều 115 khoản 1).
 * INSURANCE— nghỉ chế độ do BHXH chi trả (thai sản, khám thai, vợ sinh con).
 *            Công ty trả 0 đồng nhưng KHÔNG phải nghỉ không lương và KHÔNG phải vắng.
 * UNPAID   — nghỉ không hưởng lương (việc riêng, Điều 115 khoản 2).
 */
export type LeaveType = 'PAID' | 'UNPAID' | 'SPECIAL' | 'INSURANCE';
export type LeaveDuration = 'FULL' | 'MORNING' | 'AFTERNOON';

export interface LeaveRequest extends BaseRequestInfo {
  id: string;
  startDate: Date;
  endDate: Date;
  leaveType: LeaveType;
  duration: LeaveDuration; // Applies if start==end (1 day), else assumed full
  reason: string;
  status: RequestStatus;
}

export interface Holiday {
  id: string;
  date: Date;
  name: string;
  duration?: 'FULL' | 'MORNING' | 'AFTERNOON'; // Added duration
}

// --- ĐỔI NGÀY NGHỈ HÀNG TUẦN ---
/**
 * Ngày nghỉ tuần mặc định là Chủ Nhật. Một đơn SWAP đã duyệt đổi ngày nghỉ tuần
 * của RIÊNG nhân viên đó sang Thứ 7 cùng tuần:
 *   - restDate (Thứ 7)  → ngày nghỉ tuần: công chuẩn 0, chấm công thì mọi phút ×2.0
 *   - workDate (CN sau) → ngày làm việc thường: công chuẩn 1.0, OT ×1.5
 * Chỉ đơn APPROVED có hiệu lực. Xem utils/restDay.ts.
 */
export type RestDayKind =
  | 'SUNDAY'     // Chủ Nhật theo lịch, không có đơn đổi
  | 'SWAP_REST'  // Thứ 7 đã đổi thành ngày nghỉ tuần
  | 'SWAP_WORK'  // Chủ Nhật đã đổi thành ngày làm việc
  | 'WORKDAY';   // Ngày làm việc bình thường

export interface SwapRequest extends BaseRequestInfo {
  id: string;
  restDate: Date;   // Thứ 7 nghỉ bù (cột requests.date)
  workDate: Date;   // Chủ Nhật làm bù = restDate + 1 (cột requests.swap_work_date)
  reason: string;
  status: RequestStatus;
}

// --- NHÓM LÀM CHỦ NHẬT (A/B) ---
/**
 * Công ty xếp hai nhóm làm Chủ Nhật luân phiên. Nhóm chỉ là lớp LẬP LỊCH +
 * NHẮC VIỆC: ngày làm bù vẫn đi qua đơn SWAP ở trên, không có luật tiền riêng.
 * Xem utils/weekendGroups.ts.
 */
export type WeekendGroup = 'A' | 'B';

/** Giá trị ghim cho một Chủ Nhật: nhóm A/B, hoặc NONE = không nhóm nào làm. */
export type SundayAssignment = WeekendGroup | 'NONE';

/**
 * Lịch Chủ Nhật, lưu nguyên một bản JSON ở settings.key = 'weekend_schedule'.
 * - anchorSunday: Chủ Nhật mốc ('yyyy-MM-dd'), làm nhóm anchorGroup; các Chủ Nhật
 *   SAU mốc xen kẽ A/B. Trước mốc = không nhóm nào (mốc là ngày bắt đầu).
 * - overrides: ghim tay từng Chủ Nhật, thắng luân phiên. Lưu tường minh kể cả
 *   khi trùng luân phiên, để đổi mốc sau này ghim vẫn giữ.
 */
export interface WeekendSchedule {
  version: 1;
  anchorSunday: string | null;
  anchorGroup: WeekendGroup;
  overrides: Record<string, SundayAssignment>;
}

// --- ĐỔI THÔNG TIN CÁ NHÂN ---
/**
 * Nhân viên ĐỀ NGHỊ sửa 4 trường; Admin duyệt thì App mới ghi vào profiles.
 * Nội dung nằm ở cột JSONB requests.profile_changes: mỗi trường có đổi là một
 * entry {old, new}. Lưu "old" để màn duyệt hiện "A → B" và để hoàn tác được.
 * Xem utils/profileChange.ts.
 */
export type ProfileField = 'name' | 'dateOfBirth' | 'phone' | 'avatar';

export interface ProfileFieldChange {
  old: string | null;
  new: string | null;
  /** Chỉ avatar: đường dẫn object trên Storage (uid/pending-ts.jpg) để xoá khi từ chối. */
  newPath?: string;
}

/** Trường không đổi thì KHÔNG có mặt (khác với new = null nghĩa là xoá trắng). */
export type ProfileChangeSet = Partial<Record<ProfileField, ProfileFieldChange>>;

export interface ProfileChangeRequest extends BaseRequestInfo {
  id: string;
  date: Date;              // requests.date — ngày gửi, để sắp xếp / lọc tháng
  changes: ProfileChangeSet;
  reason: string;
  status: RequestStatus;
}

export interface DailyStats {
  date: Date;
  standardWorkDays: number; // 0, 0.5, or 1.0
  otBreakdown: OTBreakdown;
  isLate: boolean;
  isExcused: boolean; // True if late but approved
  lateMinutes: number;
  /**
   * Chủ Nhật THEO LỊCH — chỉ dùng cho nhãn/màu cột. Mọi quyết định về TIỀN
   * (reset công chuẩn, hệ số ×2, gộp công tháng) phải nhìn isRestDay.
   */
  isSunday: boolean;
  /** Ngày nghỉ tuần THỰC TẾ sau khi áp đơn đổi ngày nghỉ đã duyệt. */
  isRestDay: boolean;
  restDayKind: RestDayKind;
  swapRequest?: SwapRequest; // Đơn đổi đã duyệt chạm ngày này (nếu có)
  logs: AttendanceLog[];
  status: 'present' | 'absent' | 'leave' | 'holiday' | 'future';
  statusText?: string;
  otRequests?: OTRequest[];
  lateRequest?: LateRequest;
  leaveRequest?: LeaveRequest; // Linked leave request

  // Override support
  isOverride?: boolean;
  overrideNote?: string;
  overrideForDay?: OverrideLog;
}

// --- SALARY TYPES ---

export interface SalaryAdvanceRequest extends BaseRequestInfo {
  id: string;
  date: Date;
  amount: number;
  reason: string;
  status: RequestStatus;
}

export interface BonusFine {
  id: string;
  userId: string; // Link to specific employee
  date: Date;
  amount: number; // Absolute value
  type: 'BONUS' | 'PENALTY' | 'SALARY_CONFIRM';
  reason: string;
  createdAt?: Date; // Added for grouping bulk history
}

export interface MonthlySalaryReport {
  month: Date;
  standardDaysInMonth: number; // CongChuan (e.g. 26)

  // Work Performance
  totalActualWorkDays: number; // TongCong (Real + Leave)
  totalRealWorkDays: number; // NEW: Only Worked Days
  totalPaidLeaveDays: number; // NEW: Paid Leave Days
  totalConvertedOTDays: number; // TongCongOT_QuyDoi
  totalLateCount: number;

  // Calculated Rates
  salaryPerDay: number;
  allowancePerDay: number;

  // Income Components
  grossSalary: number; // LuongTheoCong
  grossAllowance: number; // PhuCapTheoCong
  totalBonus: number; // ThuongThem

  // Deductions
  latePenalty: number; // TienTruPhuCap
  insuranceDeduction: number; // 10.5%
  totalAdvances: number; // TruUngLuong
  otherFines: number; // TruPhatKhac

  // Final
  netSalary: number; // ThucLanh

  // Effective Rates (Snapshot for UI/Audit)
  effectiveBaseSalary: number;
  effectiveAllowance: number;
  effectiveInsuranceSalary: number;

  // Consecutive Late Warnings
  isConsecutive3Months?: boolean; // 3 tháng liên tiếp có trễ → cắt thưởng lễ
  isConsecutive6Months?: boolean; // 6 tháng liên tiếp có trễ → họp BGĐ
}
// --- PAYROLL LOCKING TYPES ---

export interface PayrollPeriod {
  id: string;
  month: string; // ISO Date string for start of month
  status: 'LOCKED' | 'OPEN';
  totalAmount: number;
  createdAt: string;
  details?: PayrollDetail[]; // Optional join
}

export interface PayrollDetail {
  id: string;
  periodId: string;
  userId: string;
  userName: string;
  userRole: string;
  department?: string;

  standardWorkDays: number;
  totalActualWorkDays: number;
  totalConvertedOTDays: number;

  grossSalary: number;
  grossAllowance: number;
  totalBonus: number;
  totalDeductions: number;
  netSalary: number;

  detailsJson: MonthlySalaryReport; // Full report snapshot
}
