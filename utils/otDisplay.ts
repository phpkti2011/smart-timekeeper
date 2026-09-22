import { OTBreakdown, OTRequest } from '../types';
import { explainOTConversion, OTSplit } from './otRules';

// Dựng chuỗi giải thích tăng ca. Cả Lịch Sử Tháng lẫn Chi Tiết Nhân Viên đều
// gọi vào đây — hai màn đó vốn có hai bản sao gần giống nhau và đã trôi dạt.

/** Tổng phút tăng ca. `nightMinutes` KHÔNG có mặt: nó là tập con, cộng vào là đếm trùng. */
export const totalOTMinutes = (bd: OTBreakdown): number =>
  bd.earlyMorningMinutes + bd.lunchMinutes + bd.eveningMinutes + bd.sundayMinutes + bd.declaredMinutes;

/** Tách tổng phút thành phần ngày / phần đêm để quy đổi. */
export const breakdownToSplit = (bd: OTBreakdown): OTSplit => {
  const total = totalOTMinutes(bd);
  const night = Math.min(bd.nightMinutes, total);
  return { dayMinutes: total - night, nightMinutes: night };
};

/**
 * Dòng công thức. Không có phút đêm thì in y hệt bản cũ (`330 / 60 / 8 x 1.5`);
 * có phút đêm thì tách số hạng, vì một hệ số duy nhất sẽ nói sai.
 */
export const formatOTFormula = (bd: OTBreakdown, dayMultiplier: number): string => {
  const split = breakdownToSplit(bd);
  const cong = bd.totalConvertedDays.toFixed(3);
  if (split.nightMinutes === 0) {
    return `${split.dayMinutes} phút / 60 / 8 x ${dayMultiplier} = ${cong} công`;
  }
  const terms = explainOTConversion(split, dayMultiplier).terms
    .map(t => `${t.minutes}p × ${t.multiplier}`)
    .join(' + ');
  return `(${terms}) / 480 = ${cong} công`;
};

/** '19:00–20:00, 20:30–21:30' — lấy thẳng từ đơn, không suy ngược bằng addMinutes. */
export const formatDeclaredRanges = (requests: OTRequest[]): string =>
  requests
    .filter(r => r.status === 'APPROVED' && !!r.otStart && !!r.otEnd)
    .map(r => `${r.otStart}–${r.otEnd}`)
    .join(', ');

export const OT_LOCATION_LABEL: Record<string, string> = {
  OFFICE: 'tại công ty',
  HOME: 'tại nhà'
};
