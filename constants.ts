
import { CompanySettings, UserProfile, UserRole, SalaryAdvanceRequest, BonusFine, Holiday } from './types';

// Mock Company Location
export const COMPANY_SETTINGS: CompanySettings = {
  name: "Tech Corp Vietnam",
  location: {
    latitude: 10.771595,
    longitude: 106.704386
  },
  allowedRadiusMeters: 100,
  allowedIpPrefix: "113.161",
};

export const MOCK_USER: UserProfile = {
  name: "Nguyễn Văn A",
  id: "EMP001",
  avatar: "https://picsum.photos/id/1005/100/100",
  role: "Admin",
  email: "nguyenvana@example.com",
  baseSalary: 15000000,
  allowance: 1000000,
  insuranceSalary: 5000000,
  workDays: "1,2,3,4,5",
  status: 'ACTIVE'
};

// MOCK_EMPLOYEES is now empty as we fetch from DB
export const MOCK_EMPLOYEES: UserProfile[] = [];

// MOCK FINANCIAL DATA
export const MOCK_ADVANCES: SalaryAdvanceRequest[] = [];

export const MOCK_BONUSES: BonusFine[] = [];

// --- ATTENDANCE RULES ---

export const TIME_RULES = {
  MORNING_START: "08:00",
  MORNING_END: "12:00",
  AFTERNOON_START: "13:30",
  AFTERNOON_END: "17:30",

  // Buffer limits
  LATE_BUFFER_MINUTES: 5, // 08:05, 13:35
  OT_AUTO_TRIGGER_MINUTES: 15, // 12:15, 17:45

  // Rounding (Snap-to-grid)
  SNAP_MIN_MINUTES: 230, // ~3h50
  SNAP_MAX_MINUTES: 250, // ~4h10
  SESSION_FULL_MINUTES: 240, // 4h
};

// Roles that are NOT allowed automatic OT calculation for Lunch/Evening
export const BLOCKED_OT_ROLES = [
  'Nhân Viên Kinh Doanh',
  'Nhân Viên Kế Toán',
  'Nhân Viên Marketing'
];

export const OT_MULTIPLIERS = {
  WEEKDAY: 1.5,
  SUNDAY: 2.0,
  HOLIDAY: 4.0 // Updated to 4.0
};

export const MOCK_HOLIDAYS: Holiday[] = [
  {
    id: 'h1',
    date: new Date(new Date().getFullYear(), 0, 1), // Jan 1st
    name: 'Tết Dương Lịch'
  },
  {
    id: 'h2',
    date: new Date(new Date().getFullYear(), 3, 30), // April 30th
    name: 'Ngày Giải Phóng'
  },
  {
    id: 'h3',
    date: new Date(new Date().getFullYear(), 4, 1), // May 1st
    name: 'Quốc Tế Lao Động'
  }
];
