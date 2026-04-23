
import {
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSunday,
  isFuture,
  isSameMonth,
  differenceInYears,
  format,
  differenceInMonths,
  differenceInDays,
  subMonths,
} from 'date-fns';
import {
  AttendanceLog,
  OTRequest,
  LateRequest,
  UserProfile,
  SalaryAdvanceRequest,
  BonusFine,
  MonthlySalaryReport,

  Holiday,
  OverrideLog,
  SalaryChange,
  LeaveRequest
} from '../types';
import { calculateDailyStats } from './attendanceCalculator';

// Helper to determine the effective salary attributes based on history
// Returns the salary configuration that was active on the target date.
export const getEffectiveSalaryAttributes = (
  employee: UserProfile,
  date: Date,
  salaryHistory: SalaryChange[]
): { baseSalary: number; allowance: number; insuranceSalary: number } => {
  if (!salaryHistory || salaryHistory.length === 0) {
    return {
      baseSalary: employee.baseSalary || 0,
      allowance: employee.allowance || 0,
      insuranceSalary: employee.insuranceSalary || 0
    };
  }

  // 1. Find changes effective on or before the target date
  // We use the END of the target month to be generous, or START?
  // Usually salary applies for the whole month.
  // Logic: "Effective Date" means it starts applying from that day.
  // If effective date is 15th Jan, does it apply to whole Jan? Or pro-rated?
  // Constraint: Simple version -> Wins if effective <= EndOfMonth.
  // User asked for "apply from set time".
  // Let's assume standard practice: Valid for the month if valid at start/end.
  // Safer: Check against `endOfMonth(date)`.
  const validChanges = salaryHistory.filter(h =>
    h.userId === employee.id && new Date(h.effectiveDate) <= endOfMonth(date)
  );

  // 2. Sort by date desc (latest first)
  validChanges.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  if (validChanges.length > 0) {
    const active = validChanges[0];
    return {
      baseSalary: Number(active.baseSalary),
      allowance: Number(active.allowance),
      insuranceSalary: Number(active.insuranceSalary)
    };
  }

  return {
    baseSalary: employee.baseSalary || 0,
    allowance: employee.allowance || 0,
    insuranceSalary: employee.insuranceSalary || 0
  };
};

// Helper to check if a date is a working day based on employee's workDays string "1,2,3,4,5,6"
// 0=Sun, 1=Mon, ..., 6=Sat
const isWorkingDay = (date: Date, workDaysStr: string = "1,2,3,4,5,6"): boolean => {
  const day = date.getDay(); // 0-6
  // Map JS Date day (0=Sun, 1=Mon) to our string format (1=Mon, ..., 7=Sun)
  let customDay = day === 0 ? 7 : day;

  return workDaysStr.split(',').map(s => parseInt(s.trim())).includes(customDay);
};

// Helper to calculate late count for a specific month
// Used for consecutive late penalty calculation and user notification
export const getLateCountForMonth = (
  targetMonth: Date,
  logs: AttendanceLog[],
  lateRequests: LateRequest[],
  overrides: OverrideLog[],
  holidays: Holiday[],
  employee: UserProfile,
  leaveRequests: LeaveRequest[]
): number => {
  const start = startOfMonth(targetMonth);
  const end = endOfMonth(targetMonth);
  const allDays = eachDayOfInterval({ start, end });

  let lateCount = 0;

  allDays.forEach(day => {
    if (isFuture(day) && !isSameDay(day, new Date())) return;

    const dayLogs = logs.filter(l => isSameDay(l.timestamp, day));
    const dayOtReqs: OTRequest[] = []; // Not needed for late count
    const dayLateReqs = lateRequests.filter(r => isSameDay(r.date, day));
    const override = overrides.find(o => isSameDay(o.date, day));

    const stats = calculateDailyStats(
      day,
      dayLogs,
      employee.role,
      holidays,
      0,
      dayOtReqs,
      dayLateReqs,
      leaveRequests,
      override
    );

    if (stats.isLate && !stats.isExcused) {
      lateCount++;
    }
  });

  return lateCount;
};


export const calculateRemainingLeave = (
  contractDateStr: string,
  userId: string,
  leaveRequests: LeaveRequest[] = [],
  usedLegacy: number = 0,
  isCumulative: boolean = false
): number => {
  if (!contractDateStr) return 0;

  const contractDate = new Date(contractDateStr);
  const now = new Date();

  const currentYear = now.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);

  // Cumulative: Count from Contract Date. Yearly: Count from Start of Year (or Contract if later)
  const effectiveStartDate = isCumulative
    ? contractDate
    : (contractDate < startOfYear ? startOfYear : contractDate);

  const monthsWorked = Math.max(0, differenceInMonths(now, effectiveStartDate) + (contractDate < startOfYear && !isCumulative ? 0 : 0));
  // Note: logic refined for monthly accrual. 
  // If cumulative: diff(now, contract). 
  // If yearly: diff(now, yearStart).

  const usedDays = leaveRequests
    .filter(req => {
      const isUser = req.userId === userId;
      const isApproved = req.status === 'APPROVED';
      const isPaid = req.leaveType === 'PAID';
      const isCurrentYear = req.startDate.getFullYear() === currentYear;

      // Cumulative: Ignore year check
      return isUser && isApproved && isPaid && (isCumulative || isCurrentYear);
    })
    .reduce((sum, req) => {
      const days = req.duration === 'FULL' ? differenceInDays(req.endDate, req.startDate) + 1 : 0.5;
      return sum + days;
    }, 0);

  const remaining = monthsWorked - usedDays - usedLegacy;
  return Math.max(0, remaining);
};

export const checkAndIncrementLeaveBalance = (employee: UserProfile): UserProfile => {
  const today = new Date();
  // If lastLeaveIncrementDate is missing (mock data), we initialize it to today 
  // without incrementing to prevent incrementing on every page reload.
  // In a real app with persistence, this logic would check against the DB value.
  const lastIncrement = employee.lastLeaveIncrementDate ? new Date(employee.lastLeaveIncrementDate) : undefined;

  if (!lastIncrement) {
    return {
      ...employee,
      lastLeaveIncrementDate: today
    };
  }

  // Check if current month is different from last increment month
  // This simple logic runs once per session load.
  const isNewMonth =
    today.getMonth() !== lastIncrement.getMonth() ||
    today.getFullYear() !== lastIncrement.getFullYear();

  if (isNewMonth) {
    // Only reset for official contracts
    // NEW POLICY: Reset to exactly 1 day per month (no accumulation)
    if (employee.contractType === 'Hợp đồng chính thức') {
      return {
        ...employee,
        leaveBalance: 1, // Reset to 1, not +1 (no accumulation)
        lastLeaveIncrementDate: today
      };
    }
    // Update date even if not eligible to avoid checking again
    return {
      ...employee,
      lastLeaveIncrementDate: today
    };
  }

  return employee;
};

/**
 * Calculate total PAID leave days used in a specific month (APPROVED + PENDING)
 * Used for the 1-day-per-month limit policy
 * Counts both APPROVED and PENDING to prevent quota bypass
 */
export const getPaidLeaveUsedThisMonth = (
  userId: string,
  leaveRequests: LeaveRequest[],
  targetMonth: Date = new Date()
): number => {
  return leaveRequests
    .filter(req => {
      const isUser = req.userId === userId;
      const isActiveRequest = req.status === 'APPROVED' || req.status === 'PENDING';
      const isPaid = req.leaveType === 'PAID';
      // Check if leave falls within target month
      const leaveDate = new Date(req.startDate);
      const isInMonth = isSameMonth(leaveDate, targetMonth);

      return isUser && isActiveRequest && isPaid && isInMonth;
    })
    .reduce((sum, req) => {
      const dayDiff = differenceInDays(new Date(req.endDate), new Date(req.startDate)) + 1;
      const days = dayDiff === 1 && req.duration !== 'FULL' ? 0.5 : dayDiff;
      return sum + days;
    }, 0);
};

// Helper to check for birthday bonus eligibility
export const getVirtualBirthdayBonus = (
  employee: UserProfile,
  targetDate: Date
): BonusFine | null => {
  if (!employee.dateOfBirth || !employee.contractDate) return null;

  const dob = new Date(employee.dateOfBirth);

  // Check if target month matches birthday month
  if (!isSameMonth(targetDate, dob)) return null;

  // Check tenure >= 1 year
  // We compare the target month (or specifically the birthday in that year) against contract date
  const contractDate = new Date(employee.contractDate);
  const yearsOfService = differenceInYears(endOfMonth(targetDate), contractDate); // Use end of month to be generous? Or start? usually "at time of birthday".
  // Let's use strict comparison against the actual birthday in the current year?
  // Simply: differenceInYears(targetDate, contractDate) is rough.
  // Better: >= 1 year.
  if (yearsOfService < 1) return null;

  let amount = 0;
  let tierLabel = '';

  if (yearsOfService >= 5) {
    amount = 300000;
    tierLabel = '> 5 năm';
  } else if (yearsOfService >= 2) {
    amount = 200000;
    tierLabel = '2-5 năm';
  } else {
    amount = 100000;
    tierLabel = '1 năm';
  }

  return {
    id: `virtual-birthday-${employee.id}-${format(targetDate, 'yyyy-MM')}`,
    userId: employee.id,
    date: new Date(targetDate.getFullYear(), dob.getMonth(), dob.getDate()), // The actual birthday date in current year
    amount: amount,
    type: 'BONUS',
    reason: `Thưởng sinh nhật (Thâm niên ${tierLabel}) 🎂`
  };
};

// Helper to round to nearest 1000 VND
const roundToThousands = (amount: number): number => {
  return Math.round(amount / 1000) * 1000;
};

export const calculateMonthlySalary = (
  targetDate: Date,
  logs: AttendanceLog[],
  otRequests: OTRequest[],
  lateRequests: LateRequest[],
  advances: SalaryAdvanceRequest[],
  bonusesFines: BonusFine[], // All bonuses for this user, need filtering
  employee: UserProfile,
  overrides: OverrideLog[] = [],
  holidays: Holiday[] = [],
  salaryChanges: SalaryChange[] = [],
  leaveRequests: LeaveRequest[] = [], // NEW: Leave Requests
  generateMockDataForPast: boolean = false
): MonthlySalaryReport => {
  const start = startOfMonth(targetDate);
  const end = endOfMonth(targetDate);
  const allDays = eachDayOfInterval({ start, end });

  // --- AUTOMATIC BONUSES ---
  // Inject Birthday Bonus if eligible (only if not resigned before birthday)
  const birthdayBonus = getVirtualBirthdayBonus(employee, targetDate);
  let effectiveBonuses = [...bonusesFines];
  if (birthdayBonus) {
    // Skip birthday bonus if employee resigned before the bonus date
    const resignDate = employee.resignationDate ? new Date(employee.resignationDate) : null;
    if (!resignDate || new Date(birthdayBonus.date) <= resignDate) {
      effectiveBonuses.push(birthdayBonus);
    }
  }

  const workDaysStr = employee.workDays || "1,2,3,4,5,6";

  // 0. Get Effective Salary Attributes (Debugging)
  const { baseSalary, allowance } = getEffectiveSalaryAttributes(employee, targetDate, salaryChanges);
  console.log(`[CalcSalary] ${employee.name} | Month: ${format(targetDate, 'MM/yyyy')}`);
  console.log(` - Profile Base: ${employee.baseSalary} | History Count: ${salaryChanges?.length}`);
  console.log(` - Effective Base: ${baseSalary} | Allowance: ${allowance}`);

  // 1. Calculate Standard Days in Month (CongChuan)
  // Công chuẩn tháng = đếm tất cả ngày làm việc trong tháng (T2-T7, trừ CN)
  // Không trừ ngày sau nghỉ việc — lương/ngày luôn chia cho công chuẩn cả tháng
  const employeeResignDate = employee.resignationDate ? new Date(employee.resignationDate) : null;
  let standardDaysInMonth = 0;
  allDays.forEach(day => {
    if (isWorkingDay(day, workDaysStr)) {
      standardDaysInMonth++;
    }
  });

  // Avoid division by zero
  if (standardDaysInMonth === 0) standardDaysInMonth = 26;

  let totalActualWorkDays = 0;
  let totalRealWorkDays = 0;
  let totalPaidLeaveDays = 0;
  let totalConvertedOTDays = 0;
  let totalLateCount = 0;

  // 2. Pre-group data by date for O(1) lookup instead of O(n) filter per day
  const logsByDate = new Map<string, typeof logs>();
  logs.forEach(l => {
    const key = format(l.timestamp, 'yyyy-MM-dd');
    if (!logsByDate.has(key)) logsByDate.set(key, []);
    logsByDate.get(key)!.push(l);
  });
  const otReqsByDate = new Map<string, typeof otRequests>();
  otRequests.forEach(r => {
    const key = format(r.date, 'yyyy-MM-dd');
    if (!otReqsByDate.has(key)) otReqsByDate.set(key, []);
    otReqsByDate.get(key)!.push(r);
  });
  const lateReqsByDate = new Map<string, typeof lateRequests>();
  lateRequests.forEach(r => {
    const key = format(r.date, 'yyyy-MM-dd');
    if (!lateReqsByDate.has(key)) lateReqsByDate.set(key, []);
    lateReqsByDate.get(key)!.push(r);
  });
  const overridesByDate = new Map<string, (typeof overrides)[0]>();
  overrides.forEach(o => {
    overridesByDate.set(format(o.date, 'yyyy-MM-dd'), o);
  });

  // Aggregate Daily Stats
  allDays.forEach(day => {
    // If future, skip
    if (isFuture(day) && !isSameDay(day, new Date())) return;

    // If employee resigned, skip all days AFTER resignation date
    if (employeeResignDate && day > employeeResignDate) return;

    // O(1) lookup instead of O(n) filter
    const dayKey = format(day, 'yyyy-MM-dd');
    const dayLogs = logsByDate.get(dayKey) || [];
    const dayOtReqs = otReqsByDate.get(dayKey) || [];
    const dayLateReqs = lateReqsByDate.get(dayKey) || [];
    const override = overridesByDate.get(dayKey);

    // Calculate Stats
    const stats = calculateDailyStats(
      day,
      dayLogs,
      employee.role,
      holidays,
      0, // approvedLeave placeholder
      dayOtReqs,
      dayLateReqs,
      leaveRequests, // Pass actual leave requests
      override
    );

    // Aggregate
    if (!stats.isSunday) {
      totalActualWorkDays += stats.standardWorkDays;

      // Split Real vs Leave
      if (stats.status === 'leave' && stats.leaveRequest?.leaveType === 'PAID') {
        // Chỉ cộng đúng phần nghỉ phép (0.5 nếu nửa ngày, 1.0 nếu cả ngày)
        // KHÔNG cộng cả standardWorkDays vì có thể bao gồm phần đi làm thực tế (vd: nghỉ chiều, sáng đi làm)
        const leavePortion = stats.leaveRequest.duration === 'FULL' ? 1.0 : 0.5;
        totalPaidLeaveDays += leavePortion;
        // Phần đi làm còn lại tính vào Real Work Days
        const workPortion = stats.standardWorkDays - leavePortion;
        if (workPortion > 0) {
          totalRealWorkDays += workPortion;
        }
      } else if (stats.status === 'holiday') {
        // Holiday counts as paid leave equivalent usually, or separate?
        // Usually Paid Holiday = Paid Leave in generic sense, but let's keep it in "Real" or separate?
        // "Real Work" implies presence. Holiday is paid absence.
        // Let's count Holiday as Paid Leave for this visual breakdown, or Keep it in Real?
        // User asked to separate "Công nghỉ phép". Holiday is "Công Lễ".
        // Let's put Holiday in Paid Leave bucket for now or create another?
        // Simpler: If status is 'holiday', add to Paid Leave Days?
        // Or just keep it in Actual Work but not Real Work?
        // Let's assume User mainly cares about APPROVED LEAVE.
        // For now, if Holiday -> Add to Paid Leave Days to separate it from "Real Work".
        totalPaidLeaveDays += stats.standardWorkDays;
      } else {
        totalRealWorkDays += stats.standardWorkDays;
      }
    }
    totalConvertedOTDays += stats.otBreakdown.totalConvertedDays;

    if (stats.isLate && !stats.isExcused) {
      totalLateCount++;
    }
  });

  // ROUNDING STEP: Ensure calculation matches the 2-decimal display
  // This "WYSIWYG" approach prevents confusion when users manually check based on displayed numbers.
  totalActualWorkDays = Math.round(totalActualWorkDays * 100) / 100;
  totalRealWorkDays = Math.round(totalRealWorkDays * 100) / 100;
  totalPaidLeaveDays = Math.round(totalPaidLeaveDays * 100) / 100;
  totalConvertedOTDays = Math.round(totalConvertedOTDays * 100) / 100;

  // 3. Calculate Rates (USING HISTORY)
  const effectiveAttributes = getEffectiveSalaryAttributes(employee, targetDate, salaryChanges);

  const salaryPerDay = effectiveAttributes.baseSalary / standardDaysInMonth;
  const allowancePerDay = effectiveAttributes.allowance / standardDaysInMonth;

  // 4. Calculate Income
  // 4. Calculate Income
  const rawGrossSalary = salaryPerDay * (totalActualWorkDays + totalConvertedOTDays);
  const rawGrossAllowance = allowancePerDay * totalActualWorkDays; // Allowance usually strictly on standard days

  const grossSalary = roundToThousands(rawGrossSalary);
  const grossAllowance = roundToThousands(rawGrossAllowance);

  // Bonuses (Filter by month + resignation date)
  let totalBonus = 0;
  let otherFines = 0;
  const resignationDate = employee.resignationDate ? new Date(employee.resignationDate) : null;

  effectiveBonuses.forEach(bf => {
    if (isSameMonth(bf.date, targetDate)) {
      if (bf.type === 'BONUS') {
        // Skip bonuses after resignation date
        if (resignationDate && new Date(bf.date) > resignationDate) {
          return; // Don't count this bonus
        }
        totalBonus += Math.abs(bf.amount);
      } else {
        otherFines += Math.abs(bf.amount);
      }
    }
  });

  // Apply rounding to accumulated bonuses/fines
  totalBonus = roundToThousands(totalBonus);
  otherFines = roundToThousands(otherFines);

  // 5. Calculate Deductions

  // Late Penalty Tier (Updated Feb 2026)
  // Lần 1: Nhắc nhở. Lần 2: 20% phụ cấp. Lần 3: 50% phụ cấp. Lần 4: 100% phụ cấp.
  let latePenalty = 0;

  if (totalLateCount === 1) {
    latePenalty = 0; // Nhắc nhở
  } else if (totalLateCount === 2) {
    latePenalty = grossAllowance * 0.2; // Trừ 20% phụ cấp 1 tháng
  } else if (totalLateCount === 3) {
    latePenalty = grossAllowance * 0.5; // Trừ 50% phụ cấp 1 tháng
  } else if (totalLateCount >= 4) {
    latePenalty = grossAllowance; // Trừ 100% phụ cấp 1 tháng
  }

  // --- Consecutive late months check (for warnings/flags, not auto-deduction) ---
  // 3 tháng liên tiếp có trễ (≥2 lần/tháng) → cắt thưởng lễ (admin handles manually)
  // 6 tháng liên tiếp có trễ (≥2 lần/tháng) → họp BGĐ (admin handles manually)
  const prevMonths = Array.from({ length: 5 }, (_, i) => subMonths(targetDate, i + 1));
  const prevMonthLateCounts = prevMonths.map(m =>
    getLateCountForMonth(m, logs, lateRequests, overrides, holidays, employee, leaveRequests)
  );

  const currentHasLate = totalLateCount >= 2;
  const consecutiveLateMonths = currentHasLate
    ? 1 + prevMonthLateCounts.findIndex(c => c < 2)
    : 0;
  // If findIndex returns -1 (all months have late), consecutiveLateMonths = 1 + (-1) = 0 → fix:
  const actualConsecutive = currentHasLate
    ? (prevMonthLateCounts.every(c => c >= 2) ? prevMonthLateCounts.length + 1 : consecutiveLateMonths)
    : 0;

  const isConsecutive3Months = actualConsecutive >= 3;
  const isConsecutive6Months = actualConsecutive >= 6;

  if (isConsecutive6Months) {
    console.warn(`[CẢNH BÁO] ${employee.name}: 6 tháng liên tiếp có đi trễ → Cần họp BGĐ xử lý!`);
  } else if (isConsecutive3Months) {
    console.warn(`[CẢNH BÁO] ${employee.name}: 3 tháng liên tiếp có đi trễ → Cắt thưởng lễ trong năm!`);
  }

  // Cap Penalty at Gross Allowance (cannot deduct more than earned)
  if (latePenalty > grossAllowance) {
    latePenalty = grossAllowance;
  }

  latePenalty = roundToThousands(latePenalty);

  // Insurance
  const insuranceDeduction = roundToThousands(effectiveAttributes.insuranceSalary * 0.105); // 10.5% (Using History)



  // Advances (Sum only Approved Advances for the target month)
  let totalAdvances = 0;
  advances.forEach(adv => {
    if (adv.status === 'APPROVED' && isSameMonth(adv.date, targetDate)) {
      totalAdvances += adv.amount;
    }
  });

  // 6. Final Net
  const totalIncome = grossSalary + grossAllowance + totalBonus;
  const totalDeductions = latePenalty + insuranceDeduction + totalAdvances + otherFines;
  const netSalary = totalIncome - totalDeductions;

  return {
    month: start,
    standardDaysInMonth,
    totalActualWorkDays,
    totalRealWorkDays,
    totalPaidLeaveDays,
    totalConvertedOTDays,
    totalLateCount,
    salaryPerDay,
    allowancePerDay,
    grossSalary,
    grossAllowance,
    totalBonus,
    latePenalty,
    insuranceDeduction,
    totalAdvances,
    otherFines,
    netSalary,

    // Effective Rates
    effectiveBaseSalary: effectiveAttributes.baseSalary,
    effectiveAllowance: effectiveAttributes.allowance,
    effectiveInsuranceSalary: effectiveAttributes.insuranceSalary,

    // Consecutive Late Warnings
    isConsecutive3Months,
    isConsecutive6Months
  };
};