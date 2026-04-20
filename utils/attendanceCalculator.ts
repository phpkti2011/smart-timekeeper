
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
  endOfDay
} from 'date-fns';
import { AttendanceLog, AttendanceType, DailyStats, UserRole, OTBreakdown, OTRequest, LateRequest, LeaveRequest, OverrideLog, Holiday } from '../types';
import { TIME_RULES, BLOCKED_OT_ROLES, OT_MULTIPLIERS } from '../constants';

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
  override?: OverrideLog // NEW PARAM
): DailyStats => {
  const isSun = isSunday(date);

  const emptyOT: OTBreakdown = {
    earlyMorningMinutes: 0,
    lunchMinutes: 0,
    eveningMinutes: 0,
    sundayMinutes: 0,
    totalConvertedDays: 0
  };

  // 1. PRIORITY: Holiday
  const holiday = holidays.find(h => isSameDay(h.date, date));

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
        otBreakdown: {
          ...emptyOT,
          sundayMinutes: otHolidayMinutes,
          totalConvertedDays: parseFloat(convertedOT.toFixed(3))
        },
        isLate: false, isExcused: false, lateMinutes: 0, isSunday: isSun,
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
  const activeLeave = leaveRequests.find(req => {
    if (req.status !== 'APPROVED') return false;
    const checkDate = startOfDay(date);
    const start = startOfDay(req.startDate);
    const end = startOfDay(req.endDate);
    return checkDate >= start && checkDate <= end;
  });

  // If Full Day Leave -> Return Early
  if (activeLeave && (activeLeave.duration === 'FULL' || !isSameDay(activeLeave.startDate, activeLeave.endDate))) {
    return {
      date,
      standardWorkDays: activeLeave.leaveType === 'PAID' ? 1.0 : 0.0,
      otBreakdown: emptyOT,
      isLate: false, isExcused: false, lateMinutes: 0, isSunday: isSun, logs: [],
      status: 'leave',
      statusText: activeLeave.leaveType === 'PAID' ? 'Nghỉ có lương' : 'Nghỉ không lương',
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
        isSunday: isSun,
        logs: [],
        status: 'future'
      };
    }

    return {
      date,
      standardWorkDays: 0,
      otBreakdown: emptyOT,
      isLate: false,
      isExcused: false,
      lateMinutes: 0,
      isSunday: isSun,
      logs: [],
      status: 'absent',
      statusText: 'Vắng',
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
    const isPaid = activeLeave.leaveType === 'PAID';
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

  let otSunday = 0;
  if (isSun) {
    const sundayWorkMinutes = morningStandard + afternoonStandard;
    otSunday = sundayWorkMinutes + otEarly + otLunch + otEvening;
    otEarly = 0; otLunch = 0; otEvening = 0;

    finalStandardDays = 0;
  }

  const DAY_MINUTES = 480;
  const regularOTMultiplier = OT_MULTIPLIERS.WEEKDAY;
  const sundayMultiplier = OT_MULTIPLIERS.SUNDAY;

  let convertedOT = 0;
  if (isSun) {
    convertedOT += (otSunday * sundayMultiplier) / DAY_MINUTES;
  } else {
    const totalRegularOT = otEarly + otLunch + otEvening;
    convertedOT += (totalRegularOT * regularOTMultiplier) / DAY_MINUTES;
  }

  // Add Partial Holiday OT
  convertedOT += partialHolidayOTDays;

  const finalOTBreakdown: OTBreakdown = {
    earlyMorningMinutes: otEarly,
    lunchMinutes: otLunch,
    eveningMinutes: otEvening + partialHolidayOTMinutes, // Display in Evening or separate? Adding to Evening for now or Sunday?
    // Let's add to SundayMinutes for distinct visibility as "Special/Holiday OT"
    sundayMinutes: otSunday + partialHolidayOTMinutes,
    totalConvertedDays: parseFloat(convertedOT.toFixed(3))
  };

  const relevantLateRequest = lateRequests.find(r => isSameDay(r.date, date));
  const isExcused = isLate && relevantLateRequest?.status === 'APPROVED';

  return {
    date,
    standardWorkDays: parseFloat(finalStandardDays.toFixed(3)),
    otBreakdown: finalOTBreakdown,
    isLate,
    isExcused,
    lateMinutes: totalLateMinutes,
    isSunday: isSun,
    logs,
    otRequests,
    leaveRequest: activeLeave, // Include the partial leave
    isOverride,
    overrideNote: isOverride ? overrideNote : undefined,
    overrideForDay: isOverride ? override : undefined,
    status: activeLeave ? 'leave' : (holiday ? 'holiday' : 'present'),
    statusText: activeLeave
      ? `Nghỉ ${activeLeave.duration === 'MORNING' ? 'Sáng' : 'Chiều'} (${activeLeave.leaveType === 'PAID' ? 'Có lương' : 'Không lương'})`
      : (holiday
        ? `${holiday.name} (${holiday.duration === 'MORNING' ? 'Sáng' : (holiday.duration === 'AFTERNOON' ? 'Chiều' : 'Cả ngày')})`
        : 'Đi làm')
  };
};
