import { OT_MULTIPLIERS } from '../constants';

// === LUẬT TĂNG CA THEO KHUNG GIỜ ===
// Module thuần: không import React/supabase nên chạy được bằng node để kiểm thử.

/** Khung giờ đêm — làm trong khoảng này hưởng hệ số cao hơn */
export const NIGHT_OT_WINDOW = { start: '22:00', end: '06:00' };
export const NIGHT_OT_MULTIPLIER = 2.0;

export const MAX_OT_RANGE_MINUTES = 360;        // 6 tiếng mỗi khung
export const MAX_HOME_OT_MINUTES_PER_DAY = 360; // 6 tiếng mỗi ngày
export const MAX_HOME_OT_BACKDATE_DAYS = 7;

const MINUTES_PER_DAY = 24 * 60;
const DAY_MINUTES = 480; // 8 tiếng = 1 công

export interface OTSplit {
  dayMinutes: number;   // phần ngoài khung đêm
  nightMinutes: number; // phần trong khung đêm
}

export const EMPTY_SPLIT: OTSplit = { dayMinutes: 0, nightMinutes: 0 };

/** 'HH:mm' → số phút kể từ 00:00. Chuỗi hỏng → null. */
export const toMinuteOfDay = (hhmm?: string | null): number | null => {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

const NIGHT_START_MIN = toMinuteOfDay(NIGHT_OT_WINDOW.start)!; // 1320
const NIGHT_END_MIN = toMinuteOfDay(NIGHT_OT_WINDOW.end)!;     // 360

/**
 * Độ dài khung giờ tính bằng phút.
 * `end <= start` nghĩa là khung vắt qua nửa đêm (21:00 → 01:00 = 240 phút).
 * Giờ trùng nhau trả 0, KHÔNG phải 1440 — người dùng gõ dở chứ không định làm 24 tiếng.
 */
export const rangeMinutes = (start?: string | null, end?: string | null): number => {
  const s = toMinuteOfDay(start);
  const e = toMinuteOfDay(end);
  if (s === null || e === null) return 0;
  if (e === s) return 0;
  return e > s ? e - s : MINUTES_PER_DAY - s + e;
};

/** Phút thứ `abs` (tính từ 00:00 ngày bắt đầu) có nằm trong khung đêm không */
const isNightMinute = (abs: number): boolean => {
  const inDay = ((abs % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  // Khung đêm vắt qua nửa đêm nên là hợp của hai đoạn: [22:00, 24:00) và [00:00, 06:00)
  return inDay >= NIGHT_START_MIN || inDay < NIGHT_END_MIN;
};

/** Tách một khung giờ thành phần ngày / phần đêm. */
export const splitOTRange = (start?: string | null, end?: string | null): OTSplit => {
  const total = rangeMinutes(start, end);
  if (total === 0) return { ...EMPTY_SPLIT };

  const s = toMinuteOfDay(start)!;
  let nightMinutes = 0;
  // Duyệt từng phút: khung tối đa 24 tiếng nên chi phí không đáng kể, đổi lại
  // không phải xử lý tay các trường hợp giao nhau của hai đoạn khung đêm.
  for (let i = 0; i < total; i++) {
    if (isNightMinute(s + i)) nightMinutes++;
  }
  return { dayMinutes: total - nightMinutes, nightMinutes };
};

/** Gộp nhiều khung giờ. */
export const splitOTRanges = (ranges: { start?: string | null; end?: string | null }[]): OTSplit =>
  ranges.reduce<OTSplit>((acc, r) => {
    const s = splitOTRange(r.start, r.end);
    return { dayMinutes: acc.dayMinutes + s.dayMinutes, nightMinutes: acc.nightMinutes + s.nightMinutes };
  }, { ...EMPTY_SPLIT });

/**
 * Hệ số ban đêm = max(hệ số ngày, 2.0).
 * Lấy max chứ không ghi đè cứng: nếu ghi đè thì làm đêm ngày lễ sẽ TỤT từ 4.0
 * xuống 2.0. Còn nhân chồng thì lễ đêm thành 8.0 — một giờ làm bằng một ngày công.
 * Hệ quả: Chủ Nhật (2.0) và ngày lễ (4.0) không đổi một con số nào.
 */
export const nightMultiplier = (dayMultiplier: number): number =>
  Math.max(dayMultiplier, NIGHT_OT_MULTIPLIER);

/** Quy đổi phút tăng ca ra công. CHƯA làm tròn — nơi gọi tự quyết. */
export const convertOTToDays = (split: OTSplit, dayMultiplier: number): number =>
  (split.dayMinutes * dayMultiplier + split.nightMinutes * nightMultiplier(dayMultiplier)) / DAY_MINUTES;

/** Dựng dữ liệu để giải thích cách ra con số cho người dùng. */
export const explainOTConversion = (
  split: OTSplit,
  dayMultiplier: number
): { terms: { minutes: number; multiplier: number }[]; totalMinutes: number; days: number } => {
  const terms: { minutes: number; multiplier: number }[] = [];
  if (split.dayMinutes > 0) terms.push({ minutes: split.dayMinutes, multiplier: dayMultiplier });
  if (split.nightMinutes > 0) terms.push({ minutes: split.nightMinutes, multiplier: nightMultiplier(dayMultiplier) });
  return {
    terms,
    totalMinutes: split.dayMinutes + split.nightMinutes,
    days: convertOTToDays(split, dayMultiplier)
  };
};

// === KIỂM TRA CHỒNG LẤN ===

export interface MinuteRange { from: number; to: number } // phút tuyệt đối, to có thể > 1440

/** Đổi khung 'HH:mm' thành khoảng phút tuyệt đối. Khung hỏng → null. */
export const toMinuteRange = (start?: string | null, end?: string | null): MinuteRange | null => {
  const total = rangeMinutes(start, end);
  if (total === 0) return null;
  const s = toMinuteOfDay(start)!;
  return { from: s, to: s + total };
};

/** Hai khoảng có giao nhau không. Chạm biên (20:00 kết thúc, 20:00 bắt đầu) KHÔNG tính là giao. */
export const rangesOverlap = (a: MinuteRange, b: MinuteRange): boolean =>
  a.from < b.to && b.from < a.to;

/** Khung giờ mới có đụng khung nào trong danh sách đã có không. Trả khung đụng đầu tiên. */
export const findOverlap = (
  candidate: { start?: string | null; end?: string | null },
  existing: { start?: string | null; end?: string | null }[]
): { start?: string | null; end?: string | null } | null => {
  const c = toMinuteRange(candidate.start, candidate.end);
  if (!c) return null;
  for (const e of existing) {
    const r = toMinuteRange(e.start, e.end);
    if (r && rangesOverlap(c, r)) return e;
  }
  return null;
};

export const OT_MULTIPLIER_FOR_DAY = (opts: { isHoliday?: boolean; isSunday?: boolean }): number =>
  opts.isHoliday ? OT_MULTIPLIERS.HOLIDAY : opts.isSunday ? OT_MULTIPLIERS.SUNDAY : OT_MULTIPLIERS.WEEKDAY;

/**
 * Khoảng thời gian trong ngày đã bị GIỜ CHẤM CÔNG chiếm chỗ: từ lần chấm đầu
 * tới lần chấm cuối. Khung khai báo giao với khoảng này là đếm trùng — phần
 * tăng ca trong đó máy đã tự cộng từ giờ chấm công rồi.
 *
 * Dùng cả span thay vì riêng đoạn OT chiều là CỐ Ý: người đang ở công ty thì
 * không thể đồng thời làm ở nhà, nên mọi khung giao với giờ có mặt đều sai.
 * Ngày quên chấm công ra (log cuối là 13:30) thì span hẹp lại, khai bù buổi
 * tối vẫn lọt — đúng ca cần khai bù nhất.
 */
export const attendanceSpan = (times: (string | null | undefined)[]): MinuteRange | null => {
  const mins = times.map(toMinuteOfDay).filter((m): m is number => m !== null);
  if (mins.length < 2) return null; // một lần chấm công không tạo thành khoảng
  const from = Math.min(...mins);
  const to = Math.max(...mins);
  return from === to ? null : { from, to };
};

export interface OTValidationInput {
  /** Ngày khai, 'yyyy-MM-dd' */
  date: string;
  ranges: { start: string; end: string }[];
  /** Khung đã có của CÙNG nhân viên, CÙNG ngày (mọi trạng thái trừ đã từ chối) */
  existingRanges: { start?: string | null; end?: string | null }[];
  /** Giờ chấm công 'HH:mm' của ngày đó */
  attendanceTimes?: (string | null | undefined)[];
  /** Hôm nay, truyền vào để test được */
  today: string; // 'yyyy-MM-dd'
  /** Admin được miễn trần giờ và trần khai bù, KHÔNG được miễn chống đếm trùng */
  isAdmin: boolean;
}

/** Trả về câu thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export const validateOTRanges = (input: OTValidationInput): string | null => {
  const { date, ranges, existingRanges, attendanceTimes = [], today, isAdmin } = input;

  if (!date) return 'Vui lòng chọn ngày tăng ca.';
  if (ranges.length === 0) return 'Vui lòng thêm ít nhất một khung giờ.';

  // Ngày tương lai: chặn cho cả Admin. Tăng ca chưa xảy ra thì chưa khai được.
  if (date > today) return 'Không thể khai tăng ca cho ngày trong tương lai.';

  if (!isAdmin) {
    const limit = new Date(`${today}T00:00:00`);
    limit.setDate(limit.getDate() - MAX_HOME_OT_BACKDATE_DAYS);
    const limitStr = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
    if (date < limitStr) {
      return `Chỉ được khai bù trong vòng ${MAX_HOME_OT_BACKDATE_DAYS} ngày. Ngày cũ hơn vui lòng nhờ Admin tạo đơn hộ.`;
    }
  }

  let totalMinutes = 0;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const nhan = `Khung ${i + 1} (${r.start || '--'}–${r.end || '--'})`;
    if (!r.start || !r.end) return `${nhan}: chưa nhập đủ giờ bắt đầu và kết thúc.`;
    const mins = rangeMinutes(r.start, r.end);
    if (mins === 0) return `${nhan}: giờ kết thúc phải khác giờ bắt đầu.`;
    if (!isAdmin && mins > MAX_OT_RANGE_MINUTES) {
      return `${nhan}: dài ${Math.floor(mins / 60)}h${mins % 60 ? mins % 60 + 'p' : ''}, vượt trần ${MAX_OT_RANGE_MINUTES / 60} tiếng một khung.`;
    }
    totalMinutes += mins;

    // Chồng lấn với các khung khác trong cùng lần nhập
    const dupIdx = ranges.findIndex((o, j) => j !== i && j < i && findOverlap(r, [o]));
    if (dupIdx !== -1) return `${nhan} chồng lấn với khung ${dupIdx + 1} (${ranges[dupIdx].start}–${ranges[dupIdx].end}).`;

    // Chồng lấn với khung đã khai trước đó
    const clash = findOverlap(r, existingRanges);
    if (clash) return `${nhan} chồng lấn với đơn đã có (${clash.start}–${clash.end}) trong cùng ngày.`;

    // Chồng lấn với giờ chấm công → phần đó máy đã tự tính
    const span = attendanceSpan(attendanceTimes);
    const rr = toMinuteRange(r.start, r.end);
    if (span && rr && rangesOverlap(rr, span)) {
      const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return `${nhan} nằm trong khoảng đã chấm công (${hhmm(span.from)}–${hhmm(span.to)}). Phần tăng ca trong khoảng này máy đã tự tính từ giờ chấm công — khai thêm sẽ bị tính hai lần. Nếu cần sửa giờ, dùng chức năng Sửa Chấm Công.`;
    }
  }

  if (!isAdmin && totalMinutes > MAX_HOME_OT_MINUTES_PER_DAY) {
    return `Tổng ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 ? totalMinutes % 60 + 'p' : ''} vượt trần ${MAX_HOME_OT_MINUTES_PER_DAY / 60} tiếng một ngày.`;
  }

  return null;
};
