import { addDays, differenceInCalendarDays, endOfWeek, format, isSameDay, isSunday, isValid, startOfDay } from 'date-fns';
import { Holiday, SundayAssignment, SwapRequest, UserProfile, WeekendGroup, WeekendSchedule } from '../types';
import { SWAP_OCCUPYING_STATUSES, dayKeyOf, findOverlappingSwap } from './restDay';
import { isWorkingEmployee } from './employeeFilters';

// === NHÓM LÀM CHỦ NHẬT A/B ===
// Module thuần (không React/supabase), chạy được bằng node — xem scripts/pure.test.ts.
//
// Công ty xếp hai nhóm làm Chủ Nhật luân phiên. Nhóm chỉ là lớp LẬP LỊCH và
// NHẮC VIỆC: ngày làm bù vẫn đi qua đơn SWAP (utils/restDay.ts: nghỉ Thứ 7,
// làm bù Chủ Nhật) nên mọi luật tiền bạc giữ nguyên. Người trong nhóm làm CN
// tuần này mà chưa có đơn APPROVED/PENDING cho tuần đó gọi là "chưa có đơn".
//
// api/daily-report.ts CHÉP TAY hàm sundayGroupFor (serverless không import
// được utils/) — sửa luật luân phiên ở đây thì sửa cả bên đó.

export const WEEKEND_GROUPS: WeekendGroup[] = ['A', 'B'];
export const WEEKEND_GROUP_LABEL: Record<WeekendGroup, string> = { A: 'Nhóm A', B: 'Nhóm B' };
/** settings.key chứa lịch (một bản JSON, xem WeekendSchedule trong types.ts). */
export const WEEKEND_SCHEDULE_KEY = 'weekend_schedule';
/** Số Chủ Nhật hiện trong tab xếp lịch của Admin. */
export const SCHEDULE_HORIZON_WEEKS = 12;
/** Số Chủ Nhật được so sánh để gửi push khi Admin đổi lịch. */
export const PUSH_HORIZON_WEEKS = 8;
/** Gộp tối đa từng này ngày vào một push, còn lại "…". */
const MAX_DATES_PER_PUSH = 4;

/** Lịch trống: chưa có mốc → mọi Chủ Nhật không nhóm nào làm, tính năng im lặng. Đừng mutate. */
export const EMPTY_WEEKEND_SCHEDULE: WeekendSchedule = { version: 1, anchorSunday: null, anchorGroup: 'A', overrides: {} };
export const emptySchedule = (): WeekendSchedule => ({ version: 1, anchorSunday: null, anchorGroup: 'A', overrides: {} });

const fmtShort = (d: Date): string => format(d, 'dd/MM');

const parseKey = (key: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00`); // giờ LOCAL, không phải UTC
  return isValid(d) ? d : null;
};
const isSundayKey = (key: string): boolean => {
  const d = parseKey(key);
  return !!d && isSunday(d);
};
const isGroup = (v: unknown): v is WeekendGroup => v === 'A' || v === 'B';
const isAssignment = (v: unknown): v is SundayAssignment => isGroup(v) || v === 'NONE';

export const otherGroup = (g: WeekendGroup): WeekendGroup => (g === 'A' ? 'B' : 'A');

export const weekendGroupLabel = (g: WeekendGroup | null | undefined): string =>
  g ? WEEKEND_GROUP_LABEL[g] : 'Chưa xếp nhóm';

/**
 * Đọc giá trị từ settings một cách phòng thủ: chấp nhận chuỗi JSON, null, rác;
 * bỏ key không phải Chủ Nhật, giá trị ghim lạ, mốc không phải Chủ Nhật.
 * Không bao giờ ném lỗi — lịch hỏng thì coi như trống, app vẫn chạy.
 */
export const parseWeekendSchedule = (raw: unknown): WeekendSchedule => {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return emptySchedule(); }
  }
  if (!v || typeof v !== 'object') return emptySchedule();
  const o = v as Record<string, unknown>;
  const anchorSunday = typeof o.anchorSunday === 'string' && isSundayKey(o.anchorSunday) ? o.anchorSunday : null;
  const anchorGroup: WeekendGroup = isGroup(o.anchorGroup) ? o.anchorGroup : 'A';
  const overrides: Record<string, SundayAssignment> = {};
  if (o.overrides && typeof o.overrides === 'object') {
    for (const [k, val] of Object.entries(o.overrides as Record<string, unknown>)) {
      if (isSundayKey(k) && isAssignment(val)) overrides[k] = val;
    }
  }
  return { version: 1, anchorSunday, anchorGroup, overrides };
};

// === TUẦN ===
// Tuần = Thứ 2 → Chủ Nhật (cùng quy ước với LeaveAlert). Chủ Nhật hôm nay vẫn
// thuộc "tuần này" — nhân viên còn 7 ngày khai bù sau Chủ Nhật.

export const sundayOfWeek = (d: Date): Date => startOfDay(endOfWeek(d, { weekStartsOn: 1 }));
export const saturdayBefore = (date: Date): Date => addDays(sundayOfWeek(date), -1);
export const sundayLabel = (d: Date): string => `CN ${fmtShort(d)}`;

/** `count` Chủ Nhật kể từ tuần chứa `from` (Chủ Nhật của tuần đó đứng đầu). */
export const upcomingSundays = (from: Date, count: number): Date[] => {
  const first = sundayOfWeek(from);
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(first, 7 * i));
};

// === LỊCH ===

export type SundaySource =
  | 'PIN'    // ghim tay A/B
  | 'AUTO'   // luân phiên từ mốc
  | 'NONE'   // ghim "không nhóm nào làm"
  | 'UNSET'; // chưa có mốc, hoặc trước mốc

export interface SundayResolution {
  group: WeekendGroup | null;
  source: SundaySource;
}

/** Nhóm làm Chủ Nhật của tuần chứa `date`. Ghim thắng luân phiên; trước mốc = không ai. */
export const sundayGroupFor = (date: Date, s: WeekendSchedule): SundayResolution => {
  const sunday = sundayOfWeek(date);
  const pin = s.overrides[dayKeyOf(sunday)];
  if (pin === 'NONE') return { group: null, source: 'NONE' };
  if (pin === 'A' || pin === 'B') return { group: pin, source: 'PIN' };
  const anchor = s.anchorSunday ? parseKey(s.anchorSunday) : null;
  if (!anchor) return { group: null, source: 'UNSET' };
  // differenceInCalendarDays (không chia mili-giây) để không lệch vì đổi giờ / múi giờ.
  const weeks = Math.round(differenceInCalendarDays(sunday, anchor) / 7);
  if (weeks < 0) return { group: null, source: 'UNSET' };
  return { group: weeks % 2 === 0 ? s.anchorGroup : otherGroup(s.anchorGroup), source: 'AUTO' };
};

/** Giá trị luân phiên bỏ qua ghim — để giao diện ghi "Tự động (A)". */
export const autoGroupFor = (date: Date, s: WeekendSchedule): WeekendGroup | null =>
  sundayGroupFor(date, { ...s, overrides: {} }).group;

/** Ghim một Chủ Nhật ('A' | 'B' | 'NONE') hoặc bỏ ghim ('AUTO'). Không mutate `s`. */
export const setSundayGroup = (s: WeekendSchedule, date: Date, value: SundayAssignment | 'AUTO'): WeekendSchedule => {
  const key = dayKeyOf(sundayOfWeek(date));
  const overrides = { ...s.overrides };
  if (value === 'AUTO') delete overrides[key];
  else overrides[key] = value;
  return { ...s, version: 1, overrides };
};

/** Các ghim từ tuần chứa `date` trở đi — giao diện hỏi trước khi startRotation xoá chúng. */
export const pinsFrom = (s: WeekendSchedule, date: Date): string[] => {
  const key = dayKeyOf(sundayOfWeek(date));
  return Object.keys(s.overrides).filter(k => k >= key).sort();
};

/**
 * Bắt đầu luân phiên lại: mốc = Chủ Nhật của tuần chứa `date`, làm nhóm `group`.
 * Xoá ghim từ mốc trở đi (Admin đang xếp lại từ đầu); ghim trước mốc giữ vì là lịch sử.
 */
export const startRotation = (s: WeekendSchedule, date: Date, group: WeekendGroup): WeekendSchedule => {
  const key = dayKeyOf(sundayOfWeek(date));
  const overrides: Record<string, SundayAssignment> = {};
  for (const [k, v] of Object.entries(s.overrides)) if (k < key) overrides[k] = v;
  return { version: 1, anchorSunday: key, anchorGroup: group, overrides };
};

// === THÀNH VIÊN ===

/** Người đang làm việc thuộc nhóm. Nghỉ việc / khoá vẫn giữ cột nhưng không tính. */
export const membersOf = (group: WeekendGroup, employees: UserProfile[]): UserProfile[] =>
  employees.filter(e => e.weekendGroup === group && isWorkingEmployee(e));

/** Người đang làm việc chưa thuộc nhóm nào — cho ô "Thêm nhân viên…". */
export const unassignedWorking = (employees: UserProfile[]): UserProfile[] =>
  employees.filter(e => !e.weekendGroup && isWorkingEmployee(e));

/** Cùng cách đọc workDays với validateSwapRequest: không có Thứ 7 thì đơn đổi bị từ chối. */
export const hasSaturdayInWorkDays = (workDays: string = '1,2,3,4,5,6'): boolean =>
  workDays.split(',').map(x => parseInt(x.trim(), 10)).includes(6);

// === ĐƠN ĐỔI NGÀY NGHỈ CỦA TUẦN ===

/** Đã có đơn APPROVED/PENDING cho tuần chứa `date` (REJECTED không tính). */
export const hasSwapForSunday = (userId: string, date: Date, swaps: SwapRequest[]): boolean =>
  !!findOverlappingSwap(userId, saturdayBefore(date), swaps);

export const membersWithoutSwap = (date: Date, members: UserProfile[], swaps: SwapRequest[]): UserProfile[] =>
  members.filter(m => !hasSwapForSunday(m.id, date, swaps));

/**
 * Đơn còn hiệu lực cho Chủ Nhật đó của người KHÔNG thuộc nhóm làm CN (nhóm cũ
 * sau khi đổi lịch, hoặc người chưa xếp nhóm). Admin cần biết để dọn tay.
 */
export const swapsOfOtherGroup = (
  date: Date,
  group: WeekendGroup | null,
  employees: UserProfile[],
  swaps: SwapRequest[]
): SwapRequest[] => {
  const key = dayKeyOf(sundayOfWeek(date));
  const inGroup = new Set(group ? membersOf(group, employees).map(m => m.id) : []);
  return swaps.filter(sw =>
    SWAP_OCCUPYING_STATUSES.includes(sw.status) && dayKeyOf(sw.workDate) === key && !inGroup.has(sw.userId)
  );
};

// === NHIỆM VỤ CỦA MỘT NHÂN VIÊN ===

export interface SundayDuty {
  sunday: Date;
  saturday: Date;
  group: WeekendGroup;
}

type DutyEmployee = Pick<UserProfile, 'weekendGroup' | 'status' | 'resignationDate'>;

/** Nhóm của NV có làm Chủ Nhật của tuần chứa `today` không. */
export const dutyForWeek = (employee: DutyEmployee, today: Date, s: WeekendSchedule): SundayDuty | null => {
  if (!employee.weekendGroup || !isWorkingEmployee(employee)) return null;
  const sunday = sundayOfWeek(today);
  const { group } = sundayGroupFor(sunday, s);
  if (group !== employee.weekendGroup) return null;
  return { sunday, saturday: saturdayBefore(sunday), group };
};

/** Chủ Nhật làm gần nhất của NV trong `weeks` tuần kể từ tuần chứa `from`. */
export const nextDuty = (employee: DutyEmployee, from: Date, s: WeekendSchedule, weeks = PUSH_HORIZON_WEEKS): SundayDuty | null => {
  for (const sunday of upcomingSundays(from, weeks)) {
    const duty = dutyForWeek(employee, sunday, s);
    if (duty) return duty;
  }
  return null;
};

/** Ngày lễ rơi vào Thứ 7 hoặc Chủ Nhật của tuần → không nhắc, không tạo đơn (6b đã vô hiệu đơn trùng lễ). */
export const findDutyHoliday = (date: Date, holidays: Holiday[]): Holiday | null => {
  const sunday = sundayOfWeek(date);
  const saturday = saturdayBefore(sunday);
  return holidays.find(h => isSameDay(h.date, sunday) || isSameDay(h.date, saturday)) || null;
};

export const describeSundayDuty = (d: SundayDuty): string =>
  `${WEEKEND_GROUP_LABEL[d.group]} làm CN ${fmtShort(d.sunday)} — nghỉ bù T7 ${fmtShort(d.saturday)}`;

// === TÓM TẮT MỘT DÒNG LỊCH (cho tab Admin và footer lịch công ty) ===

export interface SundaySummary extends SundayResolution {
  sunday: Date;
  saturday: Date;
  /** Thành viên đang làm việc của nhóm làm CN đó (rỗng nếu không nhóm nào). */
  members: UserProfile[];
  /** Thành viên chưa có đơn. */
  missing: UserProfile[];
  /** Đơn của người ngoài nhóm (nhóm cũ / chưa xếp). */
  otherSwaps: SwapRequest[];
  holiday: Holiday | null;
}

export const summarizeSunday = (
  date: Date,
  s: WeekendSchedule,
  employees: UserProfile[],
  swaps: SwapRequest[],
  holidays: Holiday[] = []
): SundaySummary => {
  const sunday = sundayOfWeek(date);
  const res = sundayGroupFor(sunday, s);
  const members = res.group ? membersOf(res.group, employees) : [];
  return {
    ...res,
    sunday,
    saturday: saturdayBefore(sunday),
    members,
    missing: membersWithoutSwap(sunday, members, swaps),
    otherSwaps: swapsOfOtherGroup(sunday, res.group, employees, swaps),
    holiday: findDutyHoliday(sunday, holidays)
  };
};

// === ĐỔI LỊCH → AI CẦN BÁO ===

export interface ScheduleChange {
  sunday: Date;
  before: WeekendGroup | null;
  after: WeekendGroup | null;
}

/** Các Chủ Nhật đổi nhóm giữa hai lịch, trong `weeks` tuần kể từ tuần chứa `from`. */
export const diffSchedules = (prev: WeekendSchedule, next: WeekendSchedule, from: Date, weeks = PUSH_HORIZON_WEEKS): ScheduleChange[] =>
  upcomingSundays(from, weeks)
    .map(sunday => ({ sunday, before: sundayGroupFor(sunday, prev).group, after: sundayGroupFor(sunday, next).group }))
    .filter(c => c.before !== c.after);

const listDates = (dates: Date[]): string => {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime()).map(fmtShort);
  return sorted.length > MAX_DATES_PER_PUSH
    ? `${sorted.slice(0, MAX_DATES_PER_PUSH).join(', ')}…`
    : sorted.join(', ');
};

/**
 * Nội dung push cho từng người bị ảnh hưởng: nhóm mới được xếp làm → nhắc làm
 * đơn; nhóm cũ không còn làm → báo. MỘT push mỗi người dù đổi mốc làm 8 tuần
 * cùng đổi. Chỉ người đang làm việc.
 */
export const groupPushMessages = (changes: ScheduleChange[], employees: UserProfile[]): Map<string, string> => {
  const on = new Map<string, Date[]>();
  const off = new Map<string, Date[]>();
  const add = (map: Map<string, Date[]>, id: string, d: Date) => map.set(id, [...(map.get(id) || []), d]);
  for (const c of changes) {
    if (c.after) for (const m of membersOf(c.after, employees)) add(on, m.id, c.sunday);
    if (c.before) for (const m of membersOf(c.before, employees)) add(off, m.id, c.sunday);
  }
  const out = new Map<string, string>();
  for (const id of new Set([...on.keys(), ...off.keys()])) {
    const parts: string[] = [];
    const a = on.get(id);
    if (a?.length) parts.push(`Bạn được xếp làm CN ${listDates(a)} — nhớ làm đơn đổi ngày nghỉ (nghỉ bù Thứ 7 trước đó).`);
    const b = off.get(id);
    if (b?.length) parts.push(`CN ${listDates(b)}: nhóm bạn không còn làm.`);
    out.set(id, parts.join(' '));
  }
  return out;
};
