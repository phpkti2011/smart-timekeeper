
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
  password?: string; // Replaced managerEmail
  baseSalary?: number;
  allowance?: number;
  workDays?: string; // e.g., "1,2,3,4,5,6"
  contractType?: 'Hợp đồng chính thức' | 'Hợp đồng thử việc' | 'Part-time' | 'CTV';
  contractDate?: string; // ISO Date string YYYY-MM-DD
  leaveBalance?: number;
  insuranceSalary?: number;
  lastLeaveIncrementDate?: Date; // Track when we last added monthly leave
  usedLeaveLegacy?: number; // Manually entered used leave
  resignationDate?: string | null; // ISO Date YYYY-MM-DD, null = still working
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
}

export interface OTRequest extends BaseRequestInfo {
  id: string;
  date: Date;
  shift: 'MORNING' | 'AFTERNOON';
  reason: string;
  status: RequestStatus;
}

export interface LateRequest extends BaseRequestInfo {
  id: string;
  date: Date;
  reason: string;
  status: RequestStatus;
  minutesLate: number;
}

// --- LEAVE TYPES ---
export type LeaveType = 'PAID' | 'UNPAID';
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

export interface DailyStats {
  date: Date;
  standardWorkDays: number; // 0, 0.5, or 1.0
  otBreakdown: OTBreakdown;
  isLate: boolean;
  isExcused: boolean; // True if late but approved
  lateMinutes: number;
  isSunday: boolean;
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
