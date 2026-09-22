
import {
  isSunday,
  differenceInMinutes,
  parse,
  set,
  min,
  max,
  isSameDay,
  isWithinInterval,
  startOfDay,
  endOfDay,
  format
} from 'date-fns';
import { splitOTRange, splitOTRanges, convertOTToDays, nightMultiplier } from './otRules';
import { AttendanceLog, AttendanceType, DailyStats, UserRole, OTBreakdown, OTRequest, LateRequest, LeaveRequest, OverrideLog, Holiday, SwapRequest } from '../types';
import { TIME_RULES, BLOCKED_OT_ROLES, OT_MULTIPLIERS } from '../constants';
import { isPaidLeaveType } from './leaveTypes';
import { resolveRestDay, restDayStatusText } from './restDay';

// Nhãn trạng thái nghỉ theo loại (dùng cho statusText)
const leavePaidLabel = (t: LeaveRequest['leaveType']): string =>
  t === 'PAID' ? 'Có lương' : t === 'SPECIAL' ? 'Chế độ (có lương)' : 'Không lương';

// --- Helper: Convert "HH:mm" string to Date object for a specific day ---
const getTimeOnDate = (date: Date, timeStr: string): Date => {
  return parse(timeStr, 'HH:mm', date);
};

// --- Helper: Calculate minutes worked within a specific window ---
const getOverlapMinutes = (
  actualStart: Date,
  actualEnd: Date,
  windowStart: Date,
  windowEnd: Date
): number => {
  if (actualEnd <= windowStart || actualStart >= windowEnd) return 0;
  const effectiveStart = max([actualStart, windowStart]);
  const effectiveEnd = min([actualEnd, windowEnd]);
  return differenceInMinutes(effectiveEnd, effectiveStart);
};

export const calculateDailyStats = (
  date: Date,
  logs: AttendanceLog[],
  userRole: UserRole,
  holidays: Holiday[] = [], // Changed from isHoliday boolean to list
  approvedLeave: number = 0, // DEPRECATED
  otRequests: OTRequest[] = [],
  lateRequests: LateRequest[] = [],
  leaveRequests: LeaveRequest[] = [],
  override?: OverrideLog, // NEW PARAM
  swapRequests: SwapRequest[] = [] // Đơn đổi ngày nghỉ CỦA CHÍNH nhân viên này (caller lọc, như leaveRequests)
): DailyStats => {
  // Chủ Nhật THEO LỊCH chỉ dùng cho nhãn. Ngày nghỉ tuần THỰC TẾ (sau khi áp đơn
  // đổi ngày nghỉ đã duyệt) mới quyết định tiền: reset công chuẩn, hệ số ×2.0,
  // vô hiệu đơn nghỉ phép. Thứ 7 có đơn đổi → isRest = true; Chủ Nhật có đơn
  // đổi → isRest = false và rơi vào nhánh ngày thường bên dưới. Đơn trùng ngày
  // lễ (thêm sau khi duyệt) bị vô hiệu cả hai ngày — xem isSwapVoidedByHoliday.
  const literalSunday = isSunday(date);
  const restDay = resolveRestDay(date, swapRequests, holidays);
  const isRest = restDay.isRestDay;
  const restFields = {
    isSunday: literalSunday,
    isRestDay: isRest,
    restDayKind: restDay.kind,
    swapRequest: restDay.swap
  };

  const emptyOT: OTBreakdown = {
    earlyMorningMinutes: 0,
    lunchMinutes: 0,
    eveningMinutes: 0,
    sundayMinutes: 0,
    declaredMinutes: 0,
    nightMinutes: 0,
    totalConvertedDays: 0
  };

  // 1. PRIORITY: Holiday
  const holiday = holidays.find(h => isSameDay(h.date, date));

  // === TĂNG CA KHAI THEO KHUNG GIỜ ===
  // Tính MỘT LẦN ở đây rồi dùng chung cho cả 4 đường ra của hàm, vì tăng ca khai
  // báo không phụ thuộc chấm công: nghỉ lễ, nghỉ phép, hay ngày không có log nào
  // (Thứ 7, hôm quên chấm công) thì tối vẫn có thể làm ở nhà.
  const declaredSplit = splitOTRanges(
    otRequests
      .filter(r => isSameDay(r.date, date) && r.status === 'APPROVED' && !!r.otStart && !!r.otEnd)
      .map(r => ({ start: r.otStart, end: r.otEnd }))
  );
  const declaredMinutes = declaredSplit.dayMinutes + declaredSplit.nightMinutes;

  /**
   * Gộp phần tăng ca khai báo vào một breakdown đã dựng sẵn.
   * Không có đơn khai nào thì trả về nguyên bản — ngày bình thường ra số y hệt
   * trước khi có tính năng này.
   */
  const withDeclaredOT = (bd: OTBreakdown, dayMultiplier: number): OTBreakdown => {
    if (declaredMinutes === 0) return bd;
    const extra = convertOTToDays(declaredSplit, dayMultiplier);
    return {
      ...bd,
      declaredMinutes: bd.declaredMinutes + declaredMinutes,
      nightMinutes: bd.nightMinutes + declaredSplit.nightMinutes,
      totalConvertedDays: parseFloat((bd.totalConvertedDays + extra).toFixed(3))
    };
  };

  let partialHolidayOTDays = 0;
  let partialHolidayOTMinutes = 0;

  if (holiday) {
    const isFullHoliday = !holiday.duration || holiday.duration === 'FULL';
    const isMorningHoliday = holiday.duration === 'MORNING';
    const isAfternoonHoliday = holiday.duration === 'AFTERNOON';

    let otHolidayMinutes = 0;

    // Calculate OT for Holiday Portion
    const morningLogs = logs.filter(l =>
      l.type === AttendanceType.IN_MORNING || l.type === AttendanceType.OUT_MORNING
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const afternoonLogs = logs.filter(l =>
      l.type === AttendanceType.IN_AFTERNOON || l.type === AttendanceType.OUT_AFTERNOON
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (isFullHoliday) {
      if (morningLogs.length >= 2) otHolidayMinutes += differenceInMinutes(morningLogs[morningLogs.length - 1].timestamp, morningLogs[0].timestamp);
      if (afternoonLogs.length >= 2) otHolidayMinutes += differenceInMinutes(afternoonLogs[afternoonLogs.length - 1].timestamp, afternoonLogs[0].timestamp);
    } else if (isMorningHoliday) {
      if (morningLogs.length >= 2) otHolidayMinutes += differenceInMinutes(morningLogs[morningLogs.length - 1].timestamp, morningLogs[0].timestamp);
    } else if (isAfternoonHoliday) {
      if (afternoonLogs.length >= 2) otHolidayMinutes += differenceInMinutes(afternoonLogs[afternoonLogs.length - 1].timestamp, afternoonLogs[0].timestamp);
    }

    const convertedOT = (otHolidayMinutes * OT_MULTIPLIERS.HOLIDAY) / 480;

    if (isFullHoliday) {
      return {
        date,
        standardWorkDays: 1.0,
        otBreakdown: withDeclaredOT({
          ...emptyOT,
          sundayMinutes: otHolidayMinutes,
          totalConvertedDays: parseFloat(convertedOT.toFixed(3))
        }, OT_MULTIPLIERS.HOLIDAY),
        isLate: false, isExcused: false, lateMinutes: 0, ...restFields,
        logs: logs, status: 'holiday', statusText: `${holiday.name}`,
        otRequests: [], lateRequest: undefined, leaveRequest: undefined
      };
    } else {
      // Partial Holiday: Store OT for later and filter logs
      partialHolidayOTDays = convertedOT;
      partialHolidayOTMinutes = otHolidayMinutes;

      if (isMorningHoliday) {
        logs = logs.filter(l => !l.type.includes('MORNING'));
      } else if (isAfternoonHoliday) {
        logs = logs.filter(l => !l.type.includes('AFTERNOON'));
      }
    }
  }

  // 2. PRIORITY: Approved Leave Request (Partial Support)
  let activeLeave = leaveRequests.find(req => {
    if (req.status !== 'APPROVED') return false;
    const checkDate = startOfDay(date);
    const start = startOfDay(req.startDate);
    const end = startOfDay(req.endDate);
    return checkDate >= start && checkDate <= end;
  });

  // Ngày nghỉ tuần (Chủ Nhật, hoặc Thứ 7 đã đổi) → không tính ngày nghỉ phép vào
  // ngày đó (hiển thị như ngày nghỉ tuần bình thường, 0 công, không trừ quỹ)
  if (activeLeave && isRest) {
    activeLeave = undefined;
  }

  // If Full Day Leave -> Return Early
  if (activeLeave && (activeLeave.duration === 'FULL' || !isSameDay(activeLeave.startDate, activeLeave.endDate))) {
    return {
      date,
      standardWorkDays: isPaidLeaveType(activeLeave.leaveType) ? 1.0 : 0.0,
      otBreakdown: withDeclaredOT(emptyOT, isRest ? OT_MULTIPLIERS.SUNDAY : OT_MULTIPLIERS.WEEKDAY),
      isLate: false, isExcused: false, lateMinutes: 0, ...restFields, logs: [],
      status: 'leave',
      statusText: `Nghỉ ${leavePaidLabel(activeLeave.leaveType)}`,
      otRequests: [], lateRequest: undefined, leaveRequest: activeLeave
    };
  }

  // If Partial Leave (Morning/Afternoon) -> Continue to process Logs but Adjust Standard Calculation
  // We will handle the "Leave Part" addition at the end of calculation.


  // 3. PRIORITY: Admin Override (NEW)
  // Instead of returning early, we use the override times to generate logs 
  // and let the normal calculation logic run. This ensures OT and Standard Days 
  // are calculated correctly based on the adjusted times.

  let effectiveLogs = [...logs];
  let overrideNote: string | undefined = undefined;
  let isOverride = false;

  if (override) {
    const mockLogs: AttendanceLog[] = [];
    const baseId = `override_${date.getTime()}`;

    if (override.in1) mockLogs.push({ id: baseId + '1', type: AttendanceType.IN_MORNING, timestamp: getTimeOnDate(date, override.in1), location: { lat: 0, lng: 0 }, ip: 'Manual', isValidLocation: true });
    if (override.out1) mockLogs.push({ id: baseId + '2', type: AttendanceType.OUT_MORNING, timestamp: getTimeOnDate(date, override.out1), location: { lat: 0, lng: 0 }, ip: 'Manual', isValidLocation: true });
    if (override.in2) mockLogs.push({ id: baseId + '3', type: AttendanceType.IN_AFTERNOON, timestamp: getTimeOnDate(date, override.in2), location: { lat: 0, lng: 0 }, ip: 'Manual', isValidLocation: true });
    if (override.out2) mockLogs.push({ id: baseId + '4', type: AttendanceType.OUT_AFTERNOON, timestamp: getTimeOnDate(date, override.out2), location: { lat: 0, lng: 0 }, ip: 'Manual', isValidLocation: true });

    effectiveLogs = mockLogs;

    overrideNote = override.note || 'Admin Điều chỉnh';
    isOverride = true;
  }

  // Use effectiveLogs for the rest of processing
  logs = effectiveLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // --- DATA SANITIZATION (Smart Deduplication) ---
  // 1. Deduplicate consecutive same-type logs within 5 minutes
  logs = logs.reduce((acc: AttendanceLog[], curr) => {
    if (acc.length === 0) return [curr];
    const prev = acc[acc.length - 1];

    // Check if same session type (Morning/Afternoon) and same action (IN/OUT/OT)
    // Actually, type includes both (e.g. IN_MORNING). So strict equality check works.
    // We treat OT type as distinct. 
    const isSameType = prev.type === curr.type;
    const diff = differenceInMinutes(curr.timestamp, prev.timestamp);

    if (isSameType && diff < 5) {
      if (curr.type.includes('IN') || curr.type.includes('OT')) { // Treat OT start like IN
        // Keep PREV (First Check-in is valid), ignore CURR
        return acc;
      } else if (curr.type.includes('OUT')) {
        // Keep CURR (Last Check-out is valid), replace PREV
        acc.pop();
        return [...acc, curr];
      }
    }
    return [...acc, curr];
  }, []);

  // 2. Filter Short Sessions (Spam: IN + OUT < 5 mins)
  const filterShortSessions = (sessionLogs: AttendanceLog[]) => {
    const hasIn = sessionLogs.some(l => l.type.includes('IN') || l.type.includes('OT')); // Treat OT as start too
    const hasOut = sessionLogs.some(l => l.type.includes('OUT'));

    if (hasIn && hasOut) {
      const start = sessionLogs[0].timestamp;
      const end = sessionLogs[sessionLogs.length - 1].timestamp;
      if (differenceInMinutes(end, start) < 5) {
        return []; // Duration < 5 mins -> Treat as spam/mistake -> Remove all
      }
    }
    return sessionLogs;
  };

  const currentMorningLogs = logs.filter(l =>
    l.type === AttendanceType.IN_MORNING || l.type === AttendanceType.OUT_MORNING || l.type === AttendanceType.OT_MORNING
  );
  const currentAfternoonLogs = logs.filter(l =>
    l.type === AttendanceType.IN_AFTERNOON || l.type === AttendanceType.OUT_AFTERNOON || l.type === AttendanceType.OT_AFTERNOON
  );

  logs = [
    ...filterShortSessions(currentMorningLogs),
    ...filterShortSessions(currentAfternoonLogs)
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Re-sort just in case

  // If no logs and no leave/holiday -> Absent
  if (logs.length === 0) {
    const now = new Date();
    if (date > now) {
      return {
        date,
        standardWorkDays: 0,
        otBreakdown: emptyOT,
        isLate: false,
        isExcused: false,
        lateMinutes: 0,
        ...restFields,
        logs: [],
        status: 'future'
      };
    }

    return {
      date,
      standardWorkDays: 0,
      // Ngày không có log nào vẫn phải cõng tăng ca khai báo: Thứ 7, hoặc hôm
      // quên chấm công mà tối vẫn làm ở nhà. Giữ status 'absent' để không phá
      // thống kê vắng — các màn hình nhìn totalConvertedDays là đủ.
      otBreakdown: withDeclaredOT(emptyOT, isRest ? OT_MULTIPLIERS.SUNDAY : OT_MULTIPLIERS.WEEKDAY),
      isLate: false,
      isExcused: false,
      lateMinutes: 0,
      ...restFields,
      logs: [],
      status: 'absent',
      // Ngày nghỉ tuần không chấm công thì là "nghỉ", không phải "vắng"
      statusText: isRest ? restDayStatusText(restDay.kind) : 'Vắng',
      otRequests: [],
      lateRequest: undefined
    };
  }

  // 4. PROCESS RAW DATA (Existing Logic)

  const morningStart = getTimeOnDate(date, TIME_RULES.MORNING_START);
  const morningEnd = getTimeOnDate(date, TIME_RULES.MORNING_END);
  const afternoonStart = getTimeOnDate(date, TIME_RULES.AFTERNOON_START);
  const afternoonEnd = getTimeOnDate(date, TIME_RULES.AFTERNOON_END);

  const morningBuffer = TIME_RULES.LATE_BUFFER_MINUTES;
  const morningLateThresh = set(morningStart, { minutes: morningStart.getMinutes() + morningBuffer });

  const afternoonBuffer = TIME_RULES.LATE_BUFFER_MINUTES;
  const afternoonLateThresh = set(afternoonStart, { minutes: afternoonStart.getMinutes() + afternoonBuffer });

  const otAutoBuffer = TIME_RULES.OT_AUTO_TRIGGER_MINUTES;
  const morningOtThresh = set(morningEnd, { minutes: morningEnd.getMinutes() + otAutoBuffer });
  const afternoonOtThresh = set(afternoonEnd, { minutes: afternoonEnd.getMinutes() + otAutoBuffer });

  const morningLogs = logs.filter(l =>
    l.type === AttendanceType.IN_MORNING ||
    l.type === AttendanceType.OUT_MORNING ||
    l.type === AttendanceType.OT_MORNING
  ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const afternoonLogs = logs.filter(l =>
    l.type === AttendanceType.IN_AFTERNOON ||
    l.type === AttendanceType.OUT_AFTERNOON ||
    l.type === AttendanceType.OT_AFTERNOON
  ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let totalStandardMinutes = 0;

  let otEarly = 0;
  let otLunch = 0;
  let otEvening = 0;

  let otEveningEndAt: Date | null = null;
  let isLate = false;
  let totalLateMinutes = 0;

  // --- MORNING CALCULATION ---
  if (morningLogs.length > 0) {
    const firstLog = morningLogs[0];
    const lastLog = morningLogs[morningLogs.length - 1];

    if (firstLog.type === AttendanceType.IN_MORNING) {
      const diff = differenceInMinutes(firstLog.timestamp, morningStart);
      if (diff > morningBuffer) {
        isLate = true;
        totalLateMinutes += diff;
      }
    }

    if (morningLogs.length >= 1) {
      const effectiveIn = firstLog.timestamp;
      const effectiveOut = lastLog.timestamp;

      const worked = getOverlapMinutes(effectiveIn, effectiveOut, morningStart, morningEnd);
      totalStandardMinutes += worked;

      const hasMorningOtRequest = otRequests.some(r =>
        isSameDay(r.date, date) &&
        r.shift === 'MORNING' &&
        r.status === 'APPROVED'
      ) || (!!override); // Implicitly approve if Admin Override exists

      const hasAfternoonOtRequest = otRequests.some(r =>
        isSameDay(r.date, date) &&
        r.shift === 'AFTERNOON' &&
        r.status === 'APPROVED'
      ) || (!!override); // Implicitly approve if Admin Override exists

      // --- LOGIC CHẶN OT (BLACKLIST) & YÊU CẦU ĐƠN (STRICT) ---
      // 1. Nếu thuộc nhóm bị chặn (Kế toán, Marketing...) -> Tuyệt đối KHÔNG tính OT (trừ khi Admin Override thủ công ở bước trên)
      // 2. Nếu không bị chặn -> Chỉ tính OT khi có đơn ĐÃ DUYỆT (APPROVED)

      const isBlockedRole = BLOCKED_OT_ROLES.includes(userRole) && !override; // Bypass block if Admin Override exists

      if (!isBlockedRole) {
        // Only calculate Lunch OT if they were actually present AND have an Approved Morning Request (treating Lunch as extension of Morning for now)
        // Or strictly, usually Lunch OT is rare. Let's allow it ONLY if Morning OT Request exists.
        if (hasMorningOtRequest && effectiveOut > morningOtThresh && effectiveIn < morningEnd) {
          otLunch += differenceInMinutes(effectiveOut, morningEnd);
        }
      }

      if ((firstLog.type === AttendanceType.OT_MORNING || firstLog.type === AttendanceType.IN_MORNING) && firstLog.timestamp < morningStart) {
        const diff = differenceInMinutes(morningStart, firstLog.timestamp);
        // STRICT: Only count Early OT if Request is Approved AND Role is not blocked
        if (override) {
          // Admin Override: Only count if > 15 mins buffer
          if (diff > otAutoBuffer) {
            otEarly += diff;
          }
        } else if (hasMorningOtRequest && !isBlockedRole) {
          otEarly += diff;
        }
      }
    }
  }

  // --- AFTERNOON CALCULATION ---
  if (afternoonLogs.length > 0) {
    const firstLog = afternoonLogs[0];
    const lastLog = afternoonLogs[afternoonLogs.length - 1];

    if (firstLog.type === AttendanceType.IN_AFTERNOON) {
      const diff = differenceInMinutes(firstLog.timestamp, afternoonStart);
      if (diff > afternoonBuffer) {
        // Only count if diff > threshold (e.g. > 5 means 6 onwards)
        isLate = true;
        totalLateMinutes += diff;
      }
    }

    if (afternoonLogs.length >= 1) {
      const effectiveIn = firstLog.timestamp;
      const effectiveOut = lastLog.timestamp;

      const worked = getOverlapMinutes(effectiveIn, effectiveOut, afternoonStart, afternoonEnd);
      totalStandardMinutes += worked;

      const hasAfternoonOtRequest = otRequests.some(r =>
        isSameDay(r.date, date) &&
        r.shift === 'AFTERNOON' &&
        r.status === 'APPROVED'
      ) || (!!override); // Implicitly approve if Admin Override exists

      const isBlockedRole = BLOCKED_OT_ROLES.includes(userRole) && !override; // Bypass block if Admin Override exists

      // LEGACY LOGIC RESTORED:
      // 1. If Blocked Role (Sales/Acct/Mkt): Requires Request or Override.
      // 2. If Allowed Role (Production/Tech...): Automatic if Out > Threshold.
      const isAutoOTAllowed = !isBlockedRole;

      // Evening OT Logic
      if (effectiveOut > afternoonOtThresh) {
        // Giữ lại giờ ra thật để tách phần sau 22:00 — nếu chỉ có số phút thì
        // phải suy ngược, dễ sai khi có nhiều nguồn cộng vào otEvening.
        otEveningEndAt = effectiveOut;
        if (isAutoOTAllowed) {
          // Automatic OT for Allowed Roles
          otEvening += differenceInMinutes(effectiveOut, afternoonEnd);
        } else if (hasAfternoonOtRequest) {
          // Manual/Request OT for Blocked Roles
          otEvening += differenceInMinutes(effectiveOut, afternoonEnd);
        }
      }

      if ((firstLog.type === AttendanceType.OT_AFTERNOON || firstLog.type === AttendanceType.IN_AFTERNOON) && firstLog.timestamp < afternoonStart) {
        const diff = differenceInMinutes(afternoonStart, firstLog.timestamp);
        // STRICT: Only count Early Afternoon OT if Request is Approved AND Role is not blocked
        if (override) {
          // Admin Override: Only count if > 15 mins buffer
          if (diff > otAutoBuffer) {
            otLunch += diff;
          }
        } else if (hasAfternoonOtRequest && !isBlockedRole) {
          otLunch += diff;
        }
      }
    }
  }

  let morningStandard = getOverlapMinutes(
    morningLogs[0]?.timestamp || morningStart,
    morningLogs[morningLogs.length - 1]?.timestamp || morningStart,
    morningStart,
    morningEnd
  );
  if (morningStandard >= TIME_RULES.SNAP_MIN_MINUTES && morningStandard <= TIME_RULES.SNAP_MAX_MINUTES) {
    morningStandard = TIME_RULES.SESSION_FULL_MINUTES;
  }

  let afternoonStandard = getOverlapMinutes(
    afternoonLogs[0]?.timestamp || afternoonStart,
    afternoonLogs[afternoonLogs.length - 1]?.timestamp || afternoonStart,
    afternoonStart,
    afternoonEnd
  );
  if (afternoonStandard >= TIME_RULES.SNAP_MIN_MINUTES && afternoonStandard <= TIME_RULES.SNAP_MAX_MINUTES) {
    afternoonStandard = TIME_RULES.SESSION_FULL_MINUTES;
  }

  let finalStandardDays = (morningStandard + afternoonStandard) / (TIME_RULES.SESSION_FULL_MINUTES * 2);

  // --- MERGE WITH PARTIAL LEAVE ---
  if (activeLeave) {
    const isPaid = isPaidLeaveType(activeLeave.leaveType);
    const leaveValue = isPaid ? 0.5 : 0.0;

    if (activeLeave.duration === 'MORNING') {
      finalStandardDays += leaveValue;
    } else if (activeLeave.duration === 'AFTERNOON') {
      finalStandardDays += leaveValue;
    }
  }

  // --- MERGE WITH PARTIAL HOLIDAY ---
  if (holiday) {
    // If we reached here, it MUST be a partial holiday (Full returns early)
    // Add 0.5 Paid Standard Day
    finalStandardDays += 0.5;

    // Add the calculated OT for the holiday part
    // We need to re-calculate OR pass it down. 
    // Since we filtered logs at start, we lost the holiday logs? 
    // Ah, we filtered `logs` variable, but we should calculate OT *before* filtering.
    // Optimization: Calculate OT at start, store in variable, add here.
    // BUT `convertedOT` variable is local to the block above.
    // Fix: Refactor the top block to output `partialHolidayOT` and `partialHolidayName`.
  }

  if (finalStandardDays > 1.0) finalStandardDays = 1.0;

  // Ngày nghỉ tuần (CN, hoặc T7 đã đổi): công chuẩn = 0, mọi phút dồn vào một rổ ×2.0
  let otSunday = 0;
  if (isRest) {
    const sundayWorkMinutes = morningStandard + afternoonStandard;
    otSunday = sundayWorkMinutes + otEarly + otLunch + otEvening;
    otEarly = 0; otLunch = 0; otEvening = 0;

    finalStandardDays = 0;
  }

  const DAY_MINUTES = 480;
  const regularOTMultiplier = OT_MULTIPLIERS.WEEKDAY;
  const sundayMultiplier = OT_MULTIPLIERS.SUNDAY;

  let convertedOT = 0;
  let autoNightMinutes = 0;

  if (isRest) {
    // Ngày nghỉ tuần KHÔNG cần tách ngày/đêm: hệ số ngày (2.0) đã bằng hệ số đêm,
    // nên công thức cũ cho ra đúng con số. Giữ nguyên để không hồi quy.
    convertedOT += (otSunday * sundayMultiplier) / DAY_MINUTES;
  } else {
    // Chỉ OT chiều mới có thể chạm 22:00. OT sáng sớm (trước 08:00) và OT trưa
    // (12:00–13:30) thì không bao giờ.
    const eveningSplit = (otEvening > 0 && otEveningEndAt)
      ? splitOTRange(
          format(afternoonEnd, 'HH:mm'),
          format(otEveningEndAt, 'HH:mm')
        )
      : { dayMinutes: otEvening, nightMinutes: 0 };

    autoNightMinutes = eveningSplit.nightMinutes;
    const daytimeMinutes = otEarly + otLunch + eveningSplit.dayMinutes;

    convertedOT += (
      daytimeMinutes * regularOTMultiplier +
      eveningSplit.nightMinutes * nightMultiplier(regularOTMultiplier)
    ) / DAY_MINUTES;
  }

  // Add Partial Holiday OT
  convertedOT += partialHolidayOTDays;

  const baseOTBreakdown: OTBreakdown = {
    earlyMorningMinutes: otEarly,
    lunchMinutes: otLunch,
    eveningMinutes: otEvening + partialHolidayOTMinutes, // Display in Evening or separate? Adding to Evening for now or Sunday?
    // Let's add to SundayMinutes for distinct visibility as "Special/Holiday OT"
    sundayMinutes: otSunday + partialHolidayOTMinutes,
    declaredMinutes: 0,
    nightMinutes: autoNightMinutes,
    totalConvertedDays: parseFloat(convertedOT.toFixed(3))
  };

  // Cộng tăng ca khai báo SAU bước reset Chủ Nhật ở trên, nếu không sẽ bị nuốt.
  const finalOTBreakdown = withDeclaredOT(
    baseOTBreakdown,
    isRest ? OT_MULTIPLIERS.SUNDAY : OT_MULTIPLIERS.WEEKDAY
  );

  const relevantLateRequest = lateRequests.find(r => isSameDay(r.date, date));
  const isExcused = isLate && relevantLateRequest?.status === 'APPROVED';

  return {
    date,
    standardWorkDays: parseFloat(finalStandardDays.toFixed(3)),
    otBreakdown: finalOTBreakdown,
    isLate,
    isExcused,
    lateMinutes: totalLateMinutes,
    ...restFields,
    logs,
    otRequests,
    leaveRequest: activeLeave, // Include the partial leave
    isOverride,
    overrideNote: isOverride ? overrideNote : undefined,
    overrideForDay: isOverride ? override : undefined,
    status: activeLeave ? 'leave' : (holiday ? 'holiday' : 'present'),
    statusText: activeLeave
      ? `Nghỉ ${activeLeave.duration === 'MORNING' ? 'Sáng' : 'Chiều'} (${leavePaidLabel(activeLeave.leaveType)})`
      : (holiday
        ? `${holiday.name} (${holiday.duration === 'MORNING' ? 'Sáng' : (holiday.duration === 'AFTERNOON' ? 'Chiều' : 'Cả ngày')})`
        // UI tự hiện badge khi statusText khác 'Đi làm', nên hai ngày của đơn
        // đổi tự có nhãn mà không cần sửa từng màn hình.
        : restDay.kind === 'SWAP_WORK' ? 'Làm bù Chủ Nhật'
          : restDay.kind === 'SWAP_REST' ? 'Đi làm ngày nghỉ bù'
            : 'Đi làm')
  };
};
