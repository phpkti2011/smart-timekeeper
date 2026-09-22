// Kiểm thử các module THUẦN (không React/supabase) bằng node:test.
// Chạy: npm run test:pure  (esbuild bundle → node --test)
//
// Tập trung vào đơn đổi ngày nghỉ (nghỉ T7, làm bù CN): phân loại ngày, luật
// validate, tính công ngày, tính lương tháng và đếm ngày phép. Dùng các tháng
// năm 2025 (đã qua) vì calculator bỏ qua ngày tương lai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  resolveRestDay, validateSwapRequest, findOverlappingSwap, findSwapBlockingLeave,
  pairedSunday, isSwapVoidedByHoliday, makeRestDayPredicate, toSwapRow, mapSwapRow, SWAP_DEFAULT_REASON
} from '../utils/restDay';
import { calculateDailyStats } from '../utils/attendanceCalculator';
import { calculateMonthlySalary } from '../utils/salaryCalculator';
import { countLeaveDays, leaveDayMap, findOverlappingLeave } from '../utils/leaveTypes';
import { AttendanceLog, AttendanceType, Holiday, LeaveRequest, SwapRequest, UserProfile } from '../types';

// calculateMonthlySalary in ra console.log debug — tắt cho gọn
console.log = () => { };

// === DỮ LIỆU MẪU ===
const EMP: UserProfile = {
  id: 'u1', name: 'Nguyễn Văn Test', avatar: '', role: 'Nhân Viên Sản Xuất',
  baseSalary: 26_000_000, allowance: 0, insuranceSalary: 0,
  workDays: '1,2,3,4,5,6', contractType: 'Hợp đồng chính thức', contractDate: '2024-01-01'
};

const D = (iso: string) => new Date(`${iso}T00:00:00`);

const mkSwap = (restIso: string, status: SwapRequest['status'] = 'APPROVED', id = 's1'): SwapRequest => ({
  id, userId: 'u1', userName: EMP.name, userAvatar: '', userRole: EMP.role,
  restDate: D(restIso), workDate: pairedSunday(D(restIso)), reason: SWAP_DEFAULT_REASON, status
});

const mkLeave = (startIso: string, endIso: string, status: LeaveRequest['status'] = 'APPROVED', id = 'l1'): LeaveRequest => ({
  id, userId: 'u1', userName: EMP.name, userAvatar: '', userRole: EMP.role,
  startDate: D(startIso), endDate: D(endIso), leaveType: 'PAID', duration: 'FULL', reason: 'x', status
});

const mkLog = (iso: string, hhmm: string, type: AttendanceType): AttendanceLog => ({
  id: `${iso}-${hhmm}-${type}`, userId: 'u1', type, timestamp: new Date(`${iso}T${hhmm}:00`),
  location: { lat: 0, lng: 0 }, ip: 'test', isValidLocation: true
});

const fullDay = (iso: string, outAfternoon = '17:30'): AttendanceLog[] => [
  mkLog(iso, '08:00', AttendanceType.IN_MORNING),
  mkLog(iso, '12:00', AttendanceType.OUT_MORNING),
  mkLog(iso, '13:30', AttendanceType.IN_AFTERNOON),
  mkLog(iso, outAfternoon, AttendanceType.OUT_AFTERNOON)
];

/** Log đủ ca cho mọi ngày T2–T7 trong tháng, trừ `skip`, cộng thêm `extra` (VD: Chủ Nhật). */
const monthLogs = (monthIso: string, opts: { skip?: string[]; extra?: string[] } = {}): AttendanceLog[] => {
  const m = D(monthIso);
  const days = eachDayOfInterval({ start: startOfMonth(m), end: endOfMonth(m) });
  const out: AttendanceLog[] = [];
  days.forEach(d => {
    const iso = format(d, 'yyyy-MM-dd');
    if (d.getDay() !== 0 && !(opts.skip || []).includes(iso)) out.push(...fullDay(iso));
  });
  (opts.extra || []).forEach(iso => out.push(...fullDay(iso)));
  return out;
};

const salary = (monthIso: string, logs: AttendanceLog[], swaps: SwapRequest[] = [], leaves: LeaveRequest[] = [], holidays: Holiday[] = []) =>
  calculateMonthlySalary(D(monthIso), logs, [], [], [], [], EMP, [], holidays, [], leaves, swaps);

const daily = (iso: string, logs: AttendanceLog[], swaps: SwapRequest[] = [], leaves: LeaveRequest[] = [], holidays: Holiday[] = []) =>
  calculateDailyStats(D(iso), logs, EMP.role, holidays, 0, [], [], leaves, undefined, swaps);

// Tuần mẫu: T7 08/11/2025 ↔ CN 09/11/2025. Tháng 11/2025 có 5 Chủ Nhật → 25 ngày T2–T7.
const SAT = '2025-11-08';
const SUN = '2025-11-09';
const NOV = '2025-11-01';
const SWAP = mkSwap(SAT);

// === resolveRestDay ===
test('resolveRestDay: không có đơn → chỉ Chủ Nhật là ngày nghỉ', () => {
  assert.deepEqual(resolveRestDay(D(SAT), []), { isRestDay: false, kind: 'WORKDAY' });
  assert.deepEqual(resolveRestDay(D(SUN), []), { isRestDay: true, kind: 'SUNDAY' });
});

test('resolveRestDay: đơn APPROVED đổi T7 thành nghỉ, CN thành làm', () => {
  const sat = resolveRestDay(D(SAT), [SWAP]);
  const sun = resolveRestDay(D(SUN), [SWAP]);
  assert.equal(sat.isRestDay, true); assert.equal(sat.kind, 'SWAP_REST'); assert.equal(sat.swap?.id, 's1');
  assert.equal(sun.isRestDay, false); assert.equal(sun.kind, 'SWAP_WORK');
  // Ngày khác trong tuần không ảnh hưởng
  assert.equal(resolveRestDay(D('2025-11-07'), [SWAP]).kind, 'WORKDAY');
});

test('resolveRestDay: đơn PENDING / REJECTED không có hiệu lực', () => {
  assert.equal(resolveRestDay(D(SAT), [mkSwap(SAT, 'PENDING')]).kind, 'WORKDAY');
  assert.equal(resolveRestDay(D(SUN), [mkSwap(SAT, 'REJECTED')]).kind, 'SUNDAY');
});

test('resolveRestDay: ngày lễ thêm sau khi duyệt vô hiệu cả hai ngày', () => {
  const hol: Holiday[] = [{ id: 'h', date: D(SAT), name: 'Lễ', duration: 'FULL' }];
  assert.equal(isSwapVoidedByHoliday(SWAP, hol), true);
  assert.equal(resolveRestDay(D(SAT), [SWAP], hol).kind, 'WORKDAY');
  assert.equal(resolveRestDay(D(SUN), [SWAP], hol).kind, 'SUNDAY');
});

test('pairedSunday: luôn là ngày hôm sau của Thứ 7', () => {
  assert.equal(format(pairedSunday(D(SAT)), 'yyyy-MM-dd'), SUN);
  assert.equal(format(pairedSunday(D('2025-05-31')), 'yyyy-MM-dd'), '2025-06-01');
});

// === validateSwapRequest ===
const baseInput = {
  userId: 'u1', restDate: SAT, today: '2025-11-05', isAdmin: false,
  workDays: '1,2,3,4,5,6', holidays: [] as Holiday[], existingSwaps: [] as SwapRequest[], leaveRequests: [] as LeaveRequest[]
};

test('validateSwapRequest: hợp lệ → null', () => {
  assert.equal(validateSwapRequest(baseInput), null);
});

test('validateSwapRequest: từng luật', () => {
  assert.match(validateSwapRequest({ ...baseInput, restDate: '' })!, /Thứ 7 muốn nghỉ/);
  assert.match(validateSwapRequest({ ...baseInput, restDate: SUN })!, /phải là Thứ 7/);
  assert.match(validateSwapRequest({ ...baseInput, restDate: '2025-11-07' })!, /phải là Thứ 7/);
  assert.match(validateSwapRequest({ ...baseInput, workDays: '1,2,3,4,5' })!, /không thuộc lịch làm việc/);
  assert.match(validateSwapRequest({ ...baseInput, holidays: [{ id: 'h', date: D(SAT), name: 'Lễ X' }] })!, /trùng ngày lễ "Lễ X"/);
  assert.match(validateSwapRequest({ ...baseInput, holidays: [{ id: 'h', date: D(SUN), name: 'Lễ Y' }] })!, /Chủ Nhật .* trùng ngày lễ "Lễ Y"/);
  // Khai muộn: CN 09/11, hôm nay 17/11 = 8 ngày sau → NV bị chặn, Admin thì qua
  assert.match(validateSwapRequest({ ...baseInput, today: '2025-11-17' })!, /trong vòng 7 ngày/);
  assert.equal(validateSwapRequest({ ...baseInput, today: '2025-11-16' }), null);
  assert.equal(validateSwapRequest({ ...baseInput, today: '2025-11-17', isAdmin: true }), null);
  // Quá xa
  assert.match(validateSwapRequest({ ...baseInput, restDate: '2027-01-02', today: '2025-11-05' })!, /quá xa/);
  // Trùng tuần (đơn cũ PENDING cũng chiếm chỗ), chặn cả Admin
  assert.match(validateSwapRequest({ ...baseInput, existingSwaps: [mkSwap(SAT, 'PENDING')] })!, /đã có đơn đổi ngày nghỉ/);
  assert.match(validateSwapRequest({ ...baseInput, isAdmin: true, existingSwaps: [SWAP] })!, /đã có đơn đổi ngày nghỉ/);
  // Đơn bị từ chối không chiếm chỗ; duyệt lại chính đơn đó (excludeId) cũng không tự chặn mình
  assert.equal(validateSwapRequest({ ...baseInput, existingSwaps: [mkSwap(SAT, 'REJECTED')] }), null);
  assert.equal(validateSwapRequest({ ...baseInput, existingSwaps: [SWAP], excludeId: 's1' }), null);
  // Nghỉ phép phủ T7 / CN
  assert.match(validateSwapRequest({ ...baseInput, leaveRequests: [mkLeave('2025-11-07', SAT)] })!, /Thứ 7 .* đã nằm trong đơn nghỉ phép/);
  assert.match(validateSwapRequest({ ...baseInput, leaveRequests: [mkLeave(SUN, '2025-11-10', 'PENDING')] })!, /Chủ Nhật .* đang nằm trong kỳ nghỉ phép/);
});

test('findOverlappingSwap / findSwapBlockingLeave', () => {
  assert.equal(findOverlappingSwap('u1', D(SAT), [SWAP])?.id, 's1');
  assert.equal(findOverlappingSwap('u2', D(SAT), [SWAP]), null);
  assert.equal(findOverlappingSwap('u1', D('2025-11-15'), [SWAP]), null);
  // Nghỉ phép phủ T7 nghỉ bù → chặn; chỉ phủ CN → không chặn (CN đã đổi thì nghỉ phép hợp lệ)
  assert.equal(findSwapBlockingLeave('u1', { startDate: D('2025-11-06'), endDate: D(SAT) }, [SWAP])?.id, 's1');
  assert.equal(findSwapBlockingLeave('u1', { startDate: D(SUN), endDate: D('2025-11-10') }, [SWAP]), null);
});

test('toSwapRow / mapSwapRow: ghi và đọc lại khớp nhau', () => {
  const row = toSwapRow('u1', D(SAT), 'lý do', 'PENDING');
  assert.deepEqual(row, { user_id: 'u1', type: 'SWAP', date: SAT, swap_work_date: SUN, reason: 'lý do', status: 'PENDING' });
  const back = mapSwapRow({ ...row, id: 42, created_at: null }, [{ id: 'u1', name: 'A', avatar: '', role: EMP.role }]);
  assert.equal(back.id, '42');
  assert.equal(format(back.restDate, 'yyyy-MM-dd'), SAT);
  assert.equal(format(back.workDate, 'yyyy-MM-dd'), SUN);
});

// === calculateDailyStats ===
test('daily: T7 đã đổi có chấm công → công chuẩn 0, mọi phút ×2 (giống Chủ Nhật)', () => {
  const s = daily(SAT, fullDay(SAT), [SWAP]);
  assert.equal(s.isSunday, false);
  assert.equal(s.isRestDay, true);
  assert.equal(s.restDayKind, 'SWAP_REST');
  assert.equal(s.standardWorkDays, 0);
  assert.equal(s.otBreakdown.sundayMinutes, 480);
  assert.equal(s.otBreakdown.totalConvertedDays, 2);
  assert.equal(s.statusText, 'Đi làm ngày nghỉ bù');
  // Đối chứng: cùng log ấy trên Chủ Nhật thật ra đúng con số
  const sun = daily(SUN, fullDay(SUN), []);
  assert.equal(sun.otBreakdown.totalConvertedDays, 2);
});

test('daily: CN đã đổi có chấm công → công chuẩn 1.0, không OT', () => {
  const s = daily(SUN, fullDay(SUN), [SWAP]);
  assert.equal(s.isSunday, true);
  assert.equal(s.isRestDay, false);
  assert.equal(s.restDayKind, 'SWAP_WORK');
  assert.equal(s.standardWorkDays, 1);
  assert.equal(s.otBreakdown.totalConvertedDays, 0);
  assert.equal(s.statusText, 'Làm bù Chủ Nhật');
});

test('daily: không chấm công — T7 đã đổi là "nghỉ bù", CN đã đổi là "Vắng"', () => {
  const sat = daily(SAT, [], [SWAP]);
  assert.equal(sat.status, 'absent');
  assert.equal(sat.statusText, 'Nghỉ bù (đổi Chủ Nhật)');
  const sun = daily(SUN, [], [SWAP]);
  assert.equal(sun.status, 'absent');
  assert.equal(sun.statusText, 'Vắng');
  // Không có đơn thì Chủ Nhật trống là "Chủ Nhật - Nghỉ"
  assert.equal(daily(SUN, [], []).statusText, 'Chủ Nhật - Nghỉ');
});

test('daily: nghỉ phép trên CN đã đổi thì có hiệu lực; trên CN thường thì bị bỏ', () => {
  const leave = [mkLeave(SUN, SUN)];
  assert.equal(daily(SUN, [], [], leave).status, 'absent');      // CN thường: đơn nghỉ vô hiệu
  const s = daily(SUN, [], [SWAP], leave);
  assert.equal(s.status, 'leave');
  assert.equal(s.standardWorkDays, 1);
});

// === calculateMonthlySalary (11/2025: 25 ngày T2–T7 → 1.040.000đ/công) ===
test('salary A: không đơn, T7 làm, CN nghỉ → 25/25, 26.000.000', () => {
  const r = salary(NOV, monthLogs(NOV));
  assert.equal(r.standardDaysInMonth, 25);
  assert.equal(r.totalActualWorkDays, 25);
  assert.equal(r.totalConvertedOTDays, 0);
  assert.equal(r.grossSalary, 26_000_000);
});

test('salary B: không đơn, làm cả T7 lẫn CN → OT 2.0, 28.080.000', () => {
  const r = salary(NOV, monthLogs(NOV, { extra: [SUN] }));
  assert.equal(r.totalActualWorkDays, 25);
  assert.equal(r.totalConvertedOTDays, 2);
  assert.equal(r.grossSalary, 28_080_000);
});

test('salary C: đơn duyệt, làm cả T7 lẫn CN → đối xứng với B', () => {
  const r = salary(NOV, monthLogs(NOV, { extra: [SUN] }), [SWAP]);
  assert.equal(r.standardDaysInMonth, 25);   // −1 T7 +1 CN
  assert.equal(r.totalActualWorkDays, 25);   // 24 ngày thường + CN
  assert.equal(r.totalConvertedOTDays, 2);   // T7 ×2
  assert.equal(r.grossSalary, 28_080_000);
});

test('salary D: đơn duyệt, nghỉ T7, làm CN → như A', () => {
  const r = salary(NOV, monthLogs(NOV, { skip: [SAT], extra: [SUN] }), [SWAP]);
  assert.equal(r.standardDaysInMonth, 25);
  assert.equal(r.totalActualWorkDays, 25);
  assert.equal(r.totalConvertedOTDays, 0);
  assert.equal(r.grossSalary, 26_000_000);
});

test('salary E: đơn duyệt, cả hai ngày không làm → thiếu 1 công', () => {
  const r = salary(NOV, monthLogs(NOV, { skip: [SAT] }), [SWAP]);
  assert.equal(r.totalActualWorkDays, 24);
  assert.equal(r.grossSalary, 24_960_000);
});

test('salary H: đơn duyệt + nghỉ phép có lương cả ngày CN → vẫn đủ công', () => {
  const leave = [mkLeave(SUN, SUN)];
  const r = salary(NOV, monthLogs(NOV, { skip: [SAT] }), [SWAP], leave);
  assert.equal(r.totalActualWorkDays, 25);
  assert.equal(r.totalPaidLeaveDays, 1);
  assert.equal(r.grossSalary, 26_000_000);
  // Đếm ngày phép: có predicate mới thấy ngày CN đã đổi
  assert.equal(countLeaveDays(leave[0], []), 0);
  assert.equal(countLeaveDays(leave[0], [], makeRestDayPredicate([SWAP])), 1);
});

test('salary J/K: đơn PENDING hoặc REJECTED → tính như không có đơn (= B)', () => {
  const logs = monthLogs(NOV, { extra: [SUN] });
  for (const st of ['PENDING', 'REJECTED'] as const) {
    const r = salary(NOV, logs, [mkSwap(SAT, st)]);
    assert.equal(r.standardDaysInMonth, 25);
    assert.equal(r.totalConvertedOTDays, 2);
    assert.equal(r.grossSalary, 28_080_000);
  }
});

test('salary: đơn của NV khác lọt vào không ảnh hưởng', () => {
  const other = { ...mkSwap(SAT), userId: 'u2' };
  const r = salary(NOV, monthLogs(NOV), [other]);
  assert.equal(r.totalActualWorkDays, 25);
  assert.equal(r.totalConvertedOTDays, 0);
});

// === Vắt tháng: T7 31/05/2025 ↔ CN 01/06/2025 (T5: 27 ngày T2–T7, T6: 25) ===
const MAY = '2025-05-01', JUN = '2025-06-01';
const XSAT = '2025-05-31', XSUN = '2025-06-01';
const XSWAP = mkSwap(XSAT, 'APPROVED', 'sx');

test('salary L: vắt tháng, làm đủ → đủ công cả hai tháng', () => {
  const may = salary(MAY, monthLogs(MAY, { skip: [XSAT] }), [XSWAP]);
  const jun = salary(JUN, monthLogs(JUN, { extra: [XSUN] }), [XSWAP]);
  assert.equal(may.standardDaysInMonth, 26); assert.equal(may.totalActualWorkDays, 26); assert.equal(may.grossSalary, 26_000_000);
  assert.equal(jun.standardDaysInMonth, 26); assert.equal(jun.totalActualWorkDays, 26); assert.equal(jun.grossSalary, 26_000_000);
});

test('salary L2: vắt tháng, không đi làm CN 01/06 → thiếu công rơi vào tháng 6', () => {
  const may = salary(MAY, monthLogs(MAY, { skip: [XSAT] }), [XSWAP]);
  const jun = salary(JUN, monthLogs(JUN), [XSWAP]);
  assert.equal(may.grossSalary, 26_000_000);
  assert.equal(jun.standardDaysInMonth, 26); assert.equal(jun.totalActualWorkDays, 25); assert.equal(jun.grossSalary, 25_000_000);
});

test('salary L3: vắt tháng nhưng đơn PENDING → mẫu số theo lịch (27 / 25)', () => {
  const pending = mkSwap(XSAT, 'PENDING', 'sx');
  assert.equal(salary(MAY, monthLogs(MAY), [pending]).standardDaysInMonth, 27);
  assert.equal(salary(JUN, monthLogs(JUN), [pending]).standardDaysInMonth, 25);
});

// === leaveTypes với predicate ===
test('leaveDayMap / findOverlappingLeave: T7 đã đổi không trừ phép, CN đã đổi thì có', () => {
  const pred = makeRestDayPredicate([SWAP]);
  const range = { startDate: D('2025-11-07'), endDate: D('2025-11-10'), duration: 'FULL' as const };
  assert.deepEqual([...leaveDayMap(range, []).keys()], ['2025-11-07', '2025-11-08', '2025-11-10']);
  assert.deepEqual([...leaveDayMap(range, [], pred).keys()], ['2025-11-07', '2025-11-09', '2025-11-10']);
  // Đơn cũ chỉ phủ CN đã đổi → có predicate mới thấy trùng
  const old = mkLeave(SUN, SUN, 'APPROVED', 'old');
  assert.equal(findOverlappingLeave('u1', { startDate: D(SUN), endDate: D(SUN), duration: 'FULL' }, [old], {}), null);
  assert.equal(findOverlappingLeave('u1', { startDate: D(SUN), endDate: D(SUN), duration: 'FULL' }, [old], { isRestDay: pred })?.id, 'old');
});
