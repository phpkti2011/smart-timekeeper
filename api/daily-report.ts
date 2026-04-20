import { createClient } from '@supabase/supabase-js';

// === CONFIG ===
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === HELPERS ===
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getVNDate(offsetDays = 0): Date {
  const now = new Date();
  // UTC+7
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setDate(vn.getDate() + offsetDays);
  vn.setHours(0, 0, 0, 0);
  return vn;
}

function parseTime(timestamp: string): { hours: number; minutes: number } {
  const d = new Date(timestamp);
  // Convert to VN time
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return { hours: vn.getUTCHours(), minutes: vn.getUTCMinutes() };
}

function timeToMinutes(h: number, m: number): number {
  return h * 60 + m;
}

async function sendTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

// === MAIN LOGIC ===
async function generateReport(): Promise<string> {
  const yesterday = getVNDate(-1);
  const today = getVNDate(0);
  const tomorrow = getVNDate(1);
  const weekEnd = getVNDate(7);

  const yesterdayISO = formatDateISO(yesterday);
  const tomorrowISO = formatDateISO(tomorrow);
  const weekEndISO = formatDateISO(weekEnd);

  // 1. Fetch employees
  const { data: employees } = await supabase
    .from('profiles')
    .select('id, name, role, status, work_days')
    .eq('status', 'ACTIVE');

  if (!employees || employees.length === 0) {
    return '📋 Không có nhân viên nào trong hệ thống.';
  }

  // 2. Fetch yesterday's attendance logs
  const startOfYesterday = `${yesterdayISO}T00:00:00.000Z`;
  const endOfYesterday = `${yesterdayISO}T23:59:59.999Z`;

  const { data: logs } = await supabase
    .from('attendance_logs')
    .select('*')
    .gte('timestamp', startOfYesterday)
    .lte('timestamp', endOfYesterday);

  // 3. Fetch leave requests (approved + pending)
  const { data: leaveRequests } = await supabase
    .from('requests')
    .select('*')
    .eq('type', 'LEAVE')
    .in('status', ['APPROVED', 'PENDING']);

  // 4. Fetch overrides for yesterday
  const { data: overrides } = await supabase
    .from('attendance_overrides')
    .select('*')
    .eq('date', yesterdayISO);

  // === ANALYZE ===

  const lateList: string[] = [];
  const missingList: string[] = [];
  const absentList: string[] = []; // Nghỉ không phép
  const otList: string[] = [];
  const leaveThisWeek: string[] = [];
  const leaveTomorrow: string[] = [];

  const MORNING_START = timeToMinutes(8, 0);
  const AFTERNOON_START = timeToMinutes(13, 30);
  const MORNING_END = timeToMinutes(12, 0);
  const AFTERNOON_END = timeToMinutes(17, 30);
  const LATE_BUFFER = 5; // 5 phút buffer

  for (const emp of employees) {
    if (emp.role === 'Admin') continue;

    const empLogs = (logs || []).filter((l: any) => l.user_id === emp.id);
    const empOverride = (overrides || []).find((o: any) => o.user_id === emp.id);

    // Skip if has override (Admin đã điều chỉnh)
    if (empOverride) continue;

    // Check if yesterday is a working day for this employee
    const yesterdayDow = yesterday.getDay(); // 0=Sun
    const workDaysStr = emp.work_days || '1,2,3,4,5,6';
    const workDays = workDaysStr.split(',').map(Number);
    // Convert JS dow (0=Sun) to our format (1=Mon, 7=Sun)
    const mappedDow = yesterdayDow === 0 ? 7 : yesterdayDow;
    if (!workDays.includes(mappedDow)) continue;

    // Check leave for yesterday
    const onLeaveYesterday = (leaveRequests || []).some((lr: any) => {
      if (lr.user_id !== emp.id || lr.status !== 'APPROVED') return false;
      const start = lr.start_date?.split('T')[0];
      const end = lr.end_date?.split('T')[0];
      return start <= yesterdayISO && end >= yesterdayISO && lr.leave_duration === 'FULL';
    });
    if (onLeaveYesterday) continue;

    // Group logs by type
    const getLog = (type: string) => empLogs.find((l: any) => l.type === type);

    const inMorning = getLog('Vào sáng');
    const outMorning = getLog('Ra sáng');
    const inAfternoon = getLog('Vào chiều');
    const outAfternoon = getLog('Ra chiều');
    const otMorning = getLog('Tăng ca sáng');
    const otAfternoon = getLog('Tăng ca chiều');

    // === LATE CHECK ===
    if (inMorning) {
      const t = parseTime(inMorning.timestamp);
      const mins = timeToMinutes(t.hours, t.minutes);
      if (mins > MORNING_START + LATE_BUFFER) {
        const lateBy = mins - MORNING_START;
        lateList.push(`  • ${emp.name} - Trễ ${lateBy} phút (ca sáng)`);
      }
    }
    if (inAfternoon) {
      const t = parseTime(inAfternoon.timestamp);
      const mins = timeToMinutes(t.hours, t.minutes);
      if (mins > AFTERNOON_START + LATE_BUFFER) {
        const lateBy = mins - AFTERNOON_START;
        lateList.push(`  • ${emp.name} - Trễ ${lateBy} phút (ca chiều)`);
      }
    }

    // === MISSING CHECK-IN/OUT ===
    const missing: string[] = [];
    const hasAnyLog = empLogs.length > 0;

    if (!hasAnyLog) {
      // Không có log nào cả ngày → kiểm tra có đơn nghỉ (PENDING) không
      const hasPendingLeave = (leaveRequests || []).some((lr: any) => {
        if (lr.user_id !== emp.id) return false;
        const start = lr.start_date?.split('T')[0];
        const end = lr.end_date?.split('T')[0];
        return start <= yesterdayISO && end >= yesterdayISO;
      });

      if (hasPendingLeave) {
        missingList.push(`  • ${emp.name} - Không chấm công (có đơn nghỉ chờ duyệt ⏳)`);
      } else {
        absentList.push(`  • ${emp.name} - <b>Vắng cả ngày, không có đơn nghỉ phép</b>`);
      }
    } else {
      if (inMorning && !outMorning) missing.push('Ra sáng');
      if (!inMorning && outMorning) missing.push('Vào sáng');
      if (inAfternoon && !outAfternoon) missing.push('Ra chiều');
      if (!inAfternoon && outAfternoon) missing.push('Vào chiều');
      // Có ca sáng nhưng không có ca chiều (và ngược lại) - có thể nghỉ nửa ngày
      if ((inMorning || outMorning) && !inAfternoon && !outAfternoon) {
        // Check if half-day leave afternoon
        const halfLeaveAfternoon = (leaveRequests || []).some((lr: any) =>
          lr.user_id === emp.id && lr.status === 'APPROVED' &&
          lr.start_date?.split('T')[0] <= yesterdayISO &&
          lr.end_date?.split('T')[0] >= yesterdayISO &&
          lr.leave_duration === 'AFTERNOON'
        );
        if (!halfLeaveAfternoon) missing.push('Vào chiều + Ra chiều');
      }
      if (!inMorning && !outMorning && (inAfternoon || outAfternoon)) {
        const halfLeaveMorning = (leaveRequests || []).some((lr: any) =>
          lr.user_id === emp.id && lr.status === 'APPROVED' &&
          lr.start_date?.split('T')[0] <= yesterdayISO &&
          lr.end_date?.split('T')[0] >= yesterdayISO &&
          lr.leave_duration === 'MORNING'
        );
        if (!halfLeaveMorning) missing.push('Vào sáng + Ra sáng');
      }

      if (missing.length > 0) {
        missingList.push(`  • ${emp.name} - Thiếu: ${missing.join(', ')}`);
      }
    }

    // === OT CHECK ===
    if (otMorning) {
      const t = parseTime(otMorning.timestamp);
      const earlyMinutes = MORNING_START - timeToMinutes(t.hours, t.minutes);
      if (earlyMinutes > 0) {
        otList.push(`  • ${emp.name} - OT sáng sớm ${earlyMinutes} phút`);
      }
    }
    if (otAfternoon || (outAfternoon && !otAfternoon)) {
      // Check evening OT
      const outLog = outAfternoon;
      if (outLog) {
        const t = parseTime(outLog.timestamp);
        const overtimeMinutes = timeToMinutes(t.hours, t.minutes) - AFTERNOON_END;
        if (overtimeMinutes > 15) {
          otList.push(`  • ${emp.name} - OT chiều tối ${overtimeMinutes} phút`);
        }
      }
    }
  }

  // === LEAVE THIS WEEK & TOMORROW ===
  for (const emp of employees) {
    if (emp.role === 'Admin') continue;

    const empLeaves = (leaveRequests || []).filter((lr: any) =>
      lr.user_id === emp.id && (lr.status === 'APPROVED' || lr.status === 'PENDING')
    );

    for (const lr of empLeaves) {
      const startDate = lr.start_date?.split('T')[0];
      const endDate = lr.end_date?.split('T')[0];
      if (!startDate || !endDate) continue;

      const statusLabel = lr.status === 'PENDING' ? ' ⏳' : '';
      const typeLabel = lr.leave_type === 'PAID' ? 'có lương' : 'không lương';
      const durationLabel = lr.leave_duration === 'MORNING' ? ', nửa sáng'
        : lr.leave_duration === 'AFTERNOON' ? ', nửa chiều' : '';

      // Tomorrow
      if (startDate <= tomorrowISO && endDate >= tomorrowISO) {
        leaveTomorrow.push(`  • ${emp.name} - ${typeLabel}${durationLabel}${statusLabel}`);
      }

      // This week (next 7 days, excluding tomorrow which is shown separately)
      if (startDate <= weekEndISO && endDate >= formatDateISO(today)) {
        const displayStart = startDate > formatDateISO(today) ? startDate : formatDateISO(today);
        const sd = new Date(startDate);
        const ed = new Date(endDate);
        const rangeStr = startDate === endDate
          ? formatDate(sd)
          : `${formatDate(sd)} - ${formatDate(ed)}`;
        leaveThisWeek.push(`  • ${emp.name} - ${rangeStr} (${typeLabel}${durationLabel})${statusLabel}`);
      }
    }
  }

  // === BUILD MESSAGE ===
  const sections: string[] = [];

  sections.push(`📋 <b>BÁO CÁO NGÀY ${formatDate(today)}</b>`);
  sections.push(`📆 Dữ liệu ngày: <b>${formatDate(yesterday)}</b>`);
  sections.push('');

  // Absent (nghỉ không phép) — hiển thị đầu tiên vì nghiêm trọng nhất
  if (absentList.length > 0) {
    sections.push(`🚫 <b>NGHỈ KHÔNG PHÉP (${absentList.length})</b>`);
    sections.push(absentList.join('\n'));
    sections.push('');
  }

  // Late
  sections.push(`🔴 <b>ĐI TRỄ (${lateList.length})</b>`);
  if (lateList.length > 0) {
    sections.push(lateList.join('\n'));
  } else {
    sections.push('  ✅ Không có ai đi trễ');
  }
  sections.push('');

  // Missing
  sections.push(`⚠️ <b>QUÊN CHẤM CÔNG / THIẾU LOG (${missingList.length})</b>`);
  if (missingList.length > 0) {
    sections.push(missingList.join('\n'));
  } else {
    sections.push('  ✅ Tất cả đều đầy đủ');
  }
  sections.push('');

  // OT
  sections.push(`⏰ <b>TĂNG CA (${otList.length})</b>`);
  if (otList.length > 0) {
    sections.push(otList.join('\n'));
  } else {
    sections.push('  Không có');
  }
  sections.push('');

  // Leave tomorrow
  sections.push(`📅 <b>NGHỈ PHÉP NGÀY MAI (${formatDate(tomorrow)})</b>`);
  if (leaveTomorrow.length > 0) {
    sections.push(leaveTomorrow.join('\n'));
  } else {
    sections.push('  Không có');
  }
  sections.push('');

  // Leave this week
  sections.push(`🗓 <b>NGHỈ PHÉP TUẦN NÀY (7 ngày tới)</b>`);
  if (leaveThisWeek.length > 0) {
    // Deduplicate
    const unique = [...new Set(leaveThisWeek)];
    sections.push(unique.join('\n'));
  } else {
    sections.push('  Không có');
  }

  sections.push('');
  sections.push('⏳ = Chờ duyệt');

  return sections.join('\n');
}

// === VERCEL HANDLER ===
export default async function handler(req: any, res: any) {
  // Security: Check cron secret or allow manual trigger
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  // Allow: Vercel Cron (has authorization header) OR manual with ?key=
  const queryKey = req.query?.key;
  const isAuthorized = (cronSecret && authHeader === `Bearer ${cronSecret}`)
    || (cronSecret && queryKey === cronSecret)
    || !cronSecret; // If no secret set, allow all (dev mode)

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const report = await generateReport();

    // Split if message too long (Telegram limit: 4096 chars)
    if (report.length > 4000) {
      const mid = report.lastIndexOf('\n\n', 2000);
      await sendTelegram(report.substring(0, mid));
      await sendTelegram(report.substring(mid));
    } else {
      await sendTelegram(report);
    }

    return res.status(200).json({
      success: true,
      message: 'Report sent to Telegram',
      timestamp: new Date().toISOString(),
      reportLength: report.length,
    });
  } catch (error: any) {
    console.error('Daily report error:', error);
    return res.status(500).json({
      error: error.message || 'Internal error',
    });
  }
}
