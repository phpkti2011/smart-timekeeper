import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// === CONFIG ===
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
// Dùng service_role để bypass RLS (server-side cần đọc tất cả logs của mọi user)
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Push nhắc nhóm làm CN: gửi thẳng bằng web-push (cùng VAPID với
// api/send-push-notification.ts) thay vì tự gọi HTTP vào endpoint đó —
// domain *.vercel.app có thể bị Deployment Protection chặn.
const PUSH_READY = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_READY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@smarttimekeeper.com',
    process.env.VAPID_PUBLIC_KEY || '',
    process.env.VAPID_PRIVATE_KEY || ''
  );
}

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

async function sendTelegram(text: string): Promise<{ ok: boolean; status: number; body: string }> {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, status: 0, body: 'Missing BOT_TOKEN or CHAT_ID env var' };
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
}

// Trả về ngày làm việc gần nhất trước hôm nay (bỏ qua Chủ Nhật)
function getLastWorkingDay(): Date {
  let d = getVNDate(-1);
  while (d.getDay() === 0) {
    d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d;
}

// Cột DATE trả 'yyyy-MM-dd'; cột timestamptz thì cắt 10 ký tự đầu (UTC) — khớp
// cửa sổ truy vấn log theo ngày UTC bên dưới.
const ymd = (v: any): string => (v ? String(v).slice(0, 10) : '');

// === NHÓM LÀM CHỦ NHẬT A/B ===
// CHÉP TAY từ utils/weekendGroups.ts (serverless không import được utils/):
// ghim thắng luân phiên; trước mốc = không ai; sau mốc xen kẽ theo tuần chẵn/lẻ.
// Sửa luật bên đó thì sửa cả đây.
type WeekendGroup = 'A' | 'B';

interface WeekendReminder {
  configured: boolean;                      // đã có lịch (mốc hoặc ghim) chưa
  sunday: string | null;                    // 'yyyy-MM-dd' Chủ Nhật sắp tới
  group: WeekendGroup | null;               // nhóm làm CN đó
  holiday: boolean;                         // T7 hoặc CN trùng lễ → không nhắc
  members: { id: string; name: string }[];  // thành viên đang làm việc
  missing: { id: string; name: string }[];  // chưa có đơn đổi ngày nghỉ
}
const EMPTY_REMINDER: WeekendReminder = { configured: false, sunday: null, group: null, holiday: false, members: [], missing: [] };

const isoToUtcMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const shiftIso = (iso: string, days: number) => new Date(isoToUtcMs(iso) + days * 86400000).toISOString().slice(0, 10);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function sundayGroupFor(sundayISO: string, schedule: any): WeekendGroup | null {
  const pin = schedule?.overrides?.[sundayISO];
  if (pin === 'NONE') return null;
  if (pin === 'A' || pin === 'B') return pin;
  const anchor = typeof schedule?.anchorSunday === 'string' ? schedule.anchorSunday : null;
  if (!anchor) return null;
  const anchorGroup: WeekendGroup = schedule?.anchorGroup === 'B' ? 'B' : 'A';
  const weeks = Math.round((isoToUtcMs(sundayISO) - isoToUtcMs(anchor)) / (7 * 86400000));
  if (weeks < 0) return null;
  return weeks % 2 === 0 ? anchorGroup : (anchorGroup === 'A' ? 'B' : 'A');
}

/**
 * Ai trong nhóm làm CN sắp tới chưa có đơn đổi ngày nghỉ. Truy vấn TÁCH RIÊNG
 * (settings, profiles.weekend_group, holidays): chưa chạy add_weekend_groups.sql
 * thì chỉ mất mục này, báo cáo còn lại vẫn gửi.
 */
async function buildWeekendReminder(employees: any[], swapRows: any[], today: Date): Promise<WeekendReminder> {
  try {
    const { data: setting, error } = await supabase
      .from('settings').select('value').eq('key', 'weekend_schedule').maybeSingle();
    if (error) return EMPTY_REMINDER;
    let schedule: any = setting?.value ?? null;
    if (typeof schedule === 'string') {
      try { schedule = JSON.parse(schedule); } catch { schedule = null; }
    }
    const configured = !!schedule && (!!schedule.anchorSunday || Object.keys(schedule.overrides || {}).length > 0);
    if (!configured) return EMPTY_REMINDER;

    // Cron chạy T2–T7 nên CN sắp tới luôn ở phía trước; chạy tay đúng Chủ Nhật thì lấy hôm nay.
    const dow = today.getDay();
    const sundayISO = formatDateISO(getVNDate(dow === 0 ? 0 : 7 - dow));
    const saturdayISO = shiftIso(sundayISO, -1);
    const group = sundayGroupFor(sundayISO, schedule);
    if (!group) return { ...EMPTY_REMINDER, configured: true, sunday: sundayISO };

    const { data: hol } = await supabase.from('holidays').select('date');
    const holiday = (hol || []).some((h: any) => ymd(h.date) === sundayISO || ymd(h.date) === saturdayISO);

    const { data: groupRows, error: gErr } = await supabase
      .from('profiles').select('id').eq('weekend_group', group);
    if (gErr) return { ...EMPTY_REMINDER, configured: true, sunday: sundayISO, group, holiday };
    const ids = new Set((groupRows || []).map((r: any) => r.id));
    // `employees` đã lọc ACTIVE; loại thêm người đã nghỉ việc
    const members = employees
      .filter((e: any) => ids.has(e.id) && !e.resignation_date)
      .map((e: any) => ({ id: e.id, name: e.name }));
    // Đã có đơn = APPROVED hoặc PENDING có swap_work_date đúng CN đó (swapRows đã lọc 2 status này)
    const hasSwap = (uid: string) => swapRows.some((s: any) => s.user_id === uid && ymd(s.swap_work_date) === sundayISO);
    const missing = holiday ? [] : members.filter(m => !hasSwap(m.id));
    return { configured: true, sunday: sundayISO, group, holiday, members, missing };
  } catch (err) {
    console.error('Weekend reminder error:', err);
    return EMPTY_REMINDER;
  }
}

async function pushToUser(userId: string, title: string, body: string): Promise<{ sent: number; failed: number }> {
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
  if (!subs?.length) return { sent: 0, failed: 0 };
  const payload = JSON.stringify({ title, body, url: '/' });
  let sent = 0;
  let failed = 0;
  const stale: string[] = [];
  await Promise.allSettled(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err: any) {
      failed++;
      if (err?.statusCode === 410 || err?.statusCode === 404) stale.push(sub.endpoint);
    }
  }));
  if (stale.length > 0) {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', stale);
  }
  return { sent, failed };
}

/** Push nhắc từng người chưa có đơn. Song song (Promise.allSettled) — hàm Vercel Hobby chỉ có 10 giây. */
async function sendWeekendReminders(r: WeekendReminder): Promise<{ pushSent: number; pushFailed: number; skipped?: string }> {
  if (!r.sunday || !r.group || r.holiday || r.missing.length === 0) return { pushSent: 0, pushFailed: 0 };
  if (!PUSH_READY) return { pushSent: 0, pushFailed: 0, skipped: 'Thiếu VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' };
  const title = '🔁 Nhắc làm đơn đổi ngày nghỉ';
  const body = `CN ${ddmm(r.sunday)} nhóm ${r.group} đi làm (nghỉ bù T7 ${ddmm(shiftIso(r.sunday, -1))}). Bạn chưa có đơn đổi ngày nghỉ — chưa có đơn thì Thứ 7 vẫn tính là ngày làm việc.`;
  const results = await Promise.allSettled(r.missing.map(m => pushToUser(m.id, title, body)));
  let pushSent = 0;
  let pushFailed = 0;
  for (const res of results) {
    if (res.status === 'fulfilled') { pushSent += res.value.sent; pushFailed += res.value.failed; }
    else pushFailed++;
  }
  return { pushSent, pushFailed };
}

// === MAIN LOGIC ===
async function generateReport(): Promise<{ text: string; reminders: WeekendReminder }> {
  const yesterday = getLastWorkingDay();
  const today = getVNDate(0);
  const tomorrow = getVNDate(1);
  const weekEnd = getVNDate(7);

  const yesterdayISO = formatDateISO(yesterday);
  const todayISO = formatDateISO(today);
  const tomorrowISO = formatDateISO(tomorrow);
  const weekEndISO = formatDateISO(weekEnd);

  // Sáng Thứ 2: getLastWorkingDay trả về Thứ 7. Chủ Nhật vừa qua chỉ được báo
  // cho RIÊNG nhân viên có đơn đổi ngày nghỉ (làm bù CN) đã duyệt.
  const prevCalendarDay = getVNDate(-1);
  const swapSundayISO = prevCalendarDay.getDay() === 0 ? formatDateISO(prevCalendarDay) : null;

  // Giờ hiện tại VN (theo phút) — dùng để check ca đã đến giờ chưa
  const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  const currentMins = nowVN.getUTCHours() * 60 + nowVN.getUTCMinutes();

  // Helper: ca làm việc đã qua giờ kết thúc chưa (chỉ quan trọng cho dữ liệu ngày hôm nay)
  const isShiftPassed = (shiftEndMins: number, dateStr: string): boolean => {
    if (dateStr < todayISO) return true; // Ngày trong quá khứ → ca luôn đã qua
    if (dateStr > todayISO) return false; // Ngày tương lai → chưa qua
    return currentMins >= shiftEndMins; // Hôm nay → so giờ hiện tại
  };

  // Các flag time-aware cho một ngày báo cáo
  const buildFlags = (dateStr: string) => ({
    morningIn: isShiftPassed(timeToMinutes(8, 30), dateStr),
    morningOut: isShiftPassed(timeToMinutes(12, 30), dateStr),
    afterIn: isShiftPassed(timeToMinutes(14, 0), dateStr),
    afterOut: isShiftPassed(timeToMinutes(18, 0), dateStr),
  });

  // 1. Fetch employees
  const { data: employees } = await supabase
    .from('profiles')
    .select('id, name, role, status, work_days, resignation_date')
    .eq('status', 'ACTIVE');

  if (!employees || employees.length === 0) {
    return { text: '📋 Không có nhân viên nào trong hệ thống.', reminders: EMPTY_REMINDER };
  }

  // 2. Fetch attendance logs cho ngày báo cáo (và Chủ Nhật làm bù, nếu có).
  // Thứ 7 < Chủ Nhật nên cửa sổ là [T7, CN]; không có CN thì chỉ một ngày.
  const firstISO = yesterdayISO;
  const lastISO = swapSundayISO ?? yesterdayISO;

  const { data: logs } = await supabase
    .from('attendance_logs')
    .select('*')
    .gte('timestamp', `${firstISO}T00:00:00.000Z`)
    .lte('timestamp', `${lastISO}T23:59:59.999Z`);

  // 3. Fetch leave requests (approved + pending)
  const { data: leaveRequests } = await supabase
    .from('requests')
    .select('*')
    .eq('type', 'LEAVE')
    .in('status', ['APPROVED', 'PENDING']);

  // 3b. Đơn đổi ngày nghỉ (nghỉ T7 = cột date, làm bù CN = cột swap_work_date).
  // Một đơn nằm gọn trong một tuần nên ±8 ngày quanh hôm nay là đủ.
  // Giữ đồng bộ với utils/restDay.ts. File này chạy trên serverless nên không
  // import từ đó được, phải chép tay luật: chỉ đơn APPROVED có hiệu lực.
  const { data: swapRows } = await supabase
    .from('requests')
    .select('user_id, date, swap_work_date, status')
    .eq('type', 'SWAP')
    .in('status', ['APPROVED', 'PENDING'])
    .gte('date', formatDateISO(getVNDate(-8)))
    .lte('date', weekEndISO);

  const approvedSwaps = (swapRows || []).filter((s: any) => s.status === 'APPROVED');
  const isSwapRestDay = (uid: string, d: string) =>
    approvedSwaps.some((s: any) => s.user_id === uid && ymd(s.date) === d);
  const isSwapWorkDay = (uid: string, d: string) =>
    approvedSwaps.some((s: any) => s.user_id === uid && ymd(s.swap_work_date) === d);

  // 4. Fetch overrides cho các ngày báo cáo
  const { data: overrides } = await supabase
    .from('attendance_overrides')
    .select('*')
    .in('date', swapSundayISO ? [yesterdayISO, swapSundayISO] : [yesterdayISO]);

  // === ANALYZE ===

  const lateList: string[] = [];
  const missingList: string[] = [];
  const absentList: string[] = []; // Nghỉ không phép
  const otList: string[] = [];
  const leaveThisWeek: string[] = [];
  const leaveTomorrow: string[] = [];
  const swapThisWeek: string[] = [];

  const MORNING_START = timeToMinutes(8, 0);
  const AFTERNOON_START = timeToMinutes(13, 30);
  const MORNING_END = timeToMinutes(12, 0);
  const AFTERNOON_END = timeToMinutes(17, 30);
  const LATE_BUFFER = 5; // 5 phút buffer

  // Các ngày cần phân tích: ngày làm việc gần nhất cho mọi người; thêm Chủ Nhật
  // vừa qua cho riêng NV có đơn làm bù CN (mọi ca của ngày đó đều đã kết thúc).
  const reportDays = [
    { iso: yesterdayISO, dow: yesterday.getDay(), swapWorkersOnly: false, suffix: '', flags: buildFlags(yesterdayISO) },
    ...(swapSundayISO
      ? [{ iso: swapSundayISO, dow: 0, swapWorkersOnly: true, suffix: ' (làm bù Chủ Nhật)', flags: buildFlags(swapSundayISO) }]
      : [])
  ];

  const logDayISO = (l: any): string => ymd(l.timestamp);

  for (const rd of reportDays) {
    const dateISO = rd.iso;
    const { morningIn: MORNING_IN_PASSED, morningOut: MORNING_OUT_PASSED, afterIn: AFTER_IN_PASSED, afterOut: AFTER_OUT_PASSED } = rd.flags;

    for (const emp of employees) {
      if (emp.role === 'Admin') continue;

      // Skip NV đã nghỉ việc trước ngày báo cáo
      if (emp.resignation_date) {
        const resignDateStr = emp.resignation_date.split('T')[0];
        if (dateISO > resignDateStr) continue;
      }

      // Chủ Nhật vừa qua chỉ xét NV có đơn làm bù CN đã duyệt
      if (rd.swapWorkersOnly && !isSwapWorkDay(emp.id, dateISO)) continue;

      const empLogs = (logs || []).filter((l: any) => l.user_id === emp.id && logDayISO(l) === dateISO);
      const empOverride = (overrides || []).find((o: any) => o.user_id === emp.id && ymd(o.date) === dateISO);

      // Skip if has override (Admin đã điều chỉnh)
      if (empOverride) continue;

      // Check if this is a working day for this employee
      const workDaysStr = emp.work_days || '1,2,3,4,5,6';
      const workDays = workDaysStr.split(',').map(Number);
      // Convert JS dow (0=Sun) to our format (1=Mon, 7=Sun)
      const mappedDow = rd.dow === 0 ? 7 : rd.dow;
      const scheduledOff = !workDays.includes(mappedDow);
      // Thứ 7 đã đổi thành ngày nghỉ bù → bỏ qua như Chủ Nhật.
      // Ngày nghỉ theo lịch thì bỏ qua, TRỪ khi hôm đó là Chủ Nhật làm bù.
      if (isSwapRestDay(emp.id, dateISO)) continue;
      if (scheduledOff && !isSwapWorkDay(emp.id, dateISO)) continue;

      const ten = `${emp.name}${rd.suffix}`;

      // Check leave for this day
      const onLeave = (leaveRequests || []).some((lr: any) => {
        if (lr.user_id !== emp.id || lr.status !== 'APPROVED') return false;
        const start = lr.start_date?.split('T')[0];
        const end = lr.end_date?.split('T')[0];
        return start <= dateISO && end >= dateISO && lr.leave_duration === 'FULL';
      });
      if (onLeave) continue;

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
          lateList.push(`  • ${ten} - Trễ ${lateBy} phút (ca sáng)`);
        }
      }
      if (inAfternoon) {
        const t = parseTime(inAfternoon.timestamp);
        const mins = timeToMinutes(t.hours, t.minutes);
        if (mins > AFTERNOON_START + LATE_BUFFER) {
          const lateBy = mins - AFTERNOON_START;
          lateList.push(`  • ${ten} - Trễ ${lateBy} phút (ca chiều)`);
        }
      }

      // === MISSING CHECK-IN/OUT ===
      const missing: string[] = [];
      const hasAnyLog = empLogs.length > 0;

      if (!hasAnyLog) {
        // Chưa qua giờ vào sáng → không thể kết luận "vắng cả ngày" hay "không chấm công" → bỏ qua
        if (!MORNING_IN_PASSED) {
          // Skip: ca sáng chưa đến giờ kết thúc, đợi
        } else {
          // Không có log nào cả ngày → kiểm tra có đơn nghỉ (PENDING) không
          const hasPendingLeave = (leaveRequests || []).some((lr: any) => {
            if (lr.user_id !== emp.id) return false;
            const start = lr.start_date?.split('T')[0];
            const end = lr.end_date?.split('T')[0];
            return start <= dateISO && end >= dateISO;
          });

          if (hasPendingLeave) {
            missingList.push(`  • ${ten} - Không chấm công (có đơn nghỉ chờ duyệt ⏳)`);
          } else {
            absentList.push(`  • ${ten} - <b>Vắng cả ngày, không có đơn nghỉ phép</b>`);
          }
        }
      } else {
        // Chỉ flag missing cho các ca đã đến giờ kết thúc
        if (MORNING_IN_PASSED && !inMorning && outMorning) missing.push('Vào sáng');
        if (MORNING_OUT_PASSED && inMorning && !outMorning) missing.push('Ra sáng');
        if (AFTER_IN_PASSED && !inAfternoon && outAfternoon) missing.push('Vào chiều');
        if (AFTER_OUT_PASSED && inAfternoon && !outAfternoon) missing.push('Ra chiều');

        // Có ca sáng nhưng không có ca chiều → có thể nghỉ nửa ngày
        // Chỉ check nếu ca chiều đã qua giờ vào (hoặc ra)
        if (AFTER_IN_PASSED && (inMorning || outMorning) && !inAfternoon && !outAfternoon) {
          const halfLeaveAfternoon = (leaveRequests || []).some((lr: any) =>
            lr.user_id === emp.id && lr.status === 'APPROVED' &&
            lr.start_date?.split('T')[0] <= dateISO &&
            lr.end_date?.split('T')[0] >= dateISO &&
            lr.leave_duration === 'AFTERNOON'
          );
          if (!halfLeaveAfternoon) missing.push('Vào chiều + Ra chiều');
        }
        if (MORNING_IN_PASSED && !inMorning && !outMorning && (inAfternoon || outAfternoon)) {
          const halfLeaveMorning = (leaveRequests || []).some((lr: any) =>
            lr.user_id === emp.id && lr.status === 'APPROVED' &&
            lr.start_date?.split('T')[0] <= dateISO &&
            lr.end_date?.split('T')[0] >= dateISO &&
            lr.leave_duration === 'MORNING'
          );
          if (!halfLeaveMorning) missing.push('Vào sáng + Ra sáng');
        }

        if (missing.length > 0) {
          missingList.push(`  • ${ten} - Thiếu: ${missing.join(', ')}`);
        }
      }

      // === OT CHECK ===
      if (otMorning) {
        const t = parseTime(otMorning.timestamp);
        const earlyMinutes = MORNING_START - timeToMinutes(t.hours, t.minutes);
        if (earlyMinutes > 0) {
          otList.push(`  • ${ten} - OT sáng sớm ${earlyMinutes} phút`);
        }
      }
      if (otAfternoon || (outAfternoon && !otAfternoon)) {
        // Check evening OT
        const outLog = outAfternoon;
        if (outLog) {
          const t = parseTime(outLog.timestamp);
          const overtimeMinutes = timeToMinutes(t.hours, t.minutes) - AFTERNOON_END;
          if (overtimeMinutes > 15) {
            otList.push(`  • ${ten} - OT chiều tối ${overtimeMinutes} phút`);
          }
        }
      }
    }
  }

  // === LEAVE THIS WEEK & TOMORROW ===
  for (const emp of employees) {
    if (emp.role === 'Admin') continue;

    // Skip NV đã nghỉ việc
    if (emp.resignation_date) {
      const resignDateStr = emp.resignation_date.split('T')[0];
      if (yesterdayISO > resignDateStr) continue;
    }

    const empLeaves = (leaveRequests || []).filter((lr: any) =>
      lr.user_id === emp.id && (lr.status === 'APPROVED' || lr.status === 'PENDING')
    );

    for (const lr of empLeaves) {
      const startDate = lr.start_date?.split('T')[0];
      const endDate = lr.end_date?.split('T')[0];
      if (!startDate || !endDate) continue;

      const statusLabel = lr.status === 'PENDING' ? ' ⏳' : '';
      // Giữ đồng bộ với LEAVE_TYPE_LABEL trong utils/leaveTypes.ts. File này chạy
      // trên serverless nên không import từ đó được, phải chép tay.
      const typeLabel = lr.leave_type === 'UNPAID' ? 'không lương'
        : lr.leave_type === 'SPECIAL' ? 'nghỉ chế độ (có lương)'
          : lr.leave_type === 'INSURANCE' ? 'nghỉ chế độ (BHXH chi trả)' : 'có lương';
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

  // === ĐỔI NGÀY NGHỈ TUẦN NÀY ===
  // Đơn có Chủ Nhật làm bù từ hôm nay trở đi (đơn đã qua hẳn thì không nhắc nữa)
  for (const s of (swapRows || [])) {
    const restISO = ymd(s.date);
    const workISO = ymd(s.swap_work_date);
    if (!restISO || !workISO) continue;
    if (workISO < todayISO || restISO > weekEndISO) continue;
    const emp = employees.find((e: any) => e.id === s.user_id);
    if (!emp || emp.role === 'Admin') continue;
    const statusLabel = s.status === 'PENDING' ? ' ⏳' : '';
    swapThisWeek.push(`  • ${emp.name} - nghỉ T7 ${formatDate(new Date(restISO))}, làm bù CN ${formatDate(new Date(workISO))}${statusLabel}`);
  }

  // === NHÓM LÀM CHỦ NHẬT A/B ===
  const weekend = await buildWeekendReminder(employees, swapRows || [], today);

  // === BUILD MESSAGE ===
  const sections: string[] = [];

  sections.push(`📋 <b>BÁO CÁO NGÀY ${formatDate(today)}</b>`);
  sections.push(`📆 Dữ liệu ngày: <b>${formatDate(yesterday)}</b>${swapSundayISO ? ` (+ CN ${formatDate(prevCalendarDay)} cho NV làm bù)` : ''}`);
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

  // Swap rest day this week — chỉ hiện khi có, để báo cáo không dài thêm
  if (swapThisWeek.length > 0) {
    sections.push('');
    sections.push(`🔁 <b>ĐỔI NGÀY NGHỈ TUẦN NÀY (nghỉ T7, làm bù CN)</b>`);
    sections.push([...new Set(swapThisWeek)].join('\n'));
  }

  // Nhóm làm Chủ Nhật — chỉ khi đã xếp lịch (mục 6d PHAN_MEM_QUY_CACH.md)
  if (weekend.configured && weekend.sunday) {
    sections.push('');
    const cn = ddmm(weekend.sunday);
    if (!weekend.group) {
      sections.push(`📆 <b>NHÓM LÀM CN ${cn}</b>: không nhóm nào làm`);
    } else if (weekend.holiday) {
      sections.push(`📆 <b>NHÓM LÀM CN ${cn}</b>: Nhóm ${weekend.group} — trùng ngày lễ, không cần đơn`);
    } else {
      sections.push(`📆 <b>NHÓM LÀM CN ${cn}</b>: Nhóm ${weekend.group} (${weekend.members.length} người)`);
      sections.push(weekend.missing.length > 0
        ? `  ⚠️ Chưa làm đơn đổi ngày nghỉ: ${weekend.missing.map(m => m.name).join(', ')}`
        : '  ✅ Tất cả đã có đơn đổi ngày nghỉ');
    }
  }

  sections.push('');
  sections.push('⏳ = Chờ duyệt');

  return { text: sections.join('\n'), reminders: weekend };
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

  const envCheck = {
    hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
    hasChatId: !!process.env.TELEGRAM_CHAT_ID,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasVapid: PUSH_READY,
  };

  try {
    const { text: report, reminders } = await generateReport();

    // Split if message too long (Telegram limit: 4096 chars)
    let results: Array<{ ok: boolean; status: number; body: string }> = [];
    if (report.length > 4000) {
      const mid = report.lastIndexOf('\n\n', 2000);
      results.push(await sendTelegram(report.substring(0, mid)));
      results.push(await sendTelegram(report.substring(mid)));
    } else {
      results.push(await sendTelegram(report));
    }

    const allOk = results.every(r => r.ok);
    if (!allOk) {
      const failed = results.find(r => !r.ok)!;
      return res.status(500).json({
        error: 'Telegram send failed',
        telegramStatus: failed.status,
        telegramBody: failed.body,
        env: envCheck,
        reportLength: report.length,
      });
    }

    // Push nhắc người chưa có đơn — SAU Telegram, để lỗi push không chặn báo cáo
    const pushResult = await sendWeekendReminders(reminders);

    return res.status(200).json({
      success: true,
      message: 'Report sent to Telegram',
      timestamp: new Date().toISOString(),
      reportLength: report.length,
      weekendReminder: {
        sunday: reminders.sunday,
        group: reminders.group,
        holiday: reminders.holiday,
        members: reminders.members.length,
        missing: reminders.missing.length,
        ...pushResult,
      },
      env: envCheck,
    });
  } catch (error: any) {
    console.error('Daily report error:', error);
    return res.status(500).json({
      error: error.message || 'Internal error',
      stack: error.stack,
      env: envCheck,
    });
  }
}
