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
import { calculateMonthlySalary, getVirtualBirthdayBonus } from '../utils/salaryCalculator';
import { countLeaveDays, leaveDayMap, findOverlappingLeave } from '../utils/leaveTypes';
import {
  normalizeName, normalizePhone, validateName, validateDateOfBirth, validatePhone, warnPhonePrefix,
  validateAvatarUrl, buildProfileChanges, describeProfileChanges, validateProfileRequest,
  applyProfileChanges, revertProfileChanges, patchToColumns, mapProfileRow, toProfileRow,
  computeCoverCrop, PROFILE_DEFAULT_REASON
} from '../utils/profileChange';
import { mapDirectoryRow, mapFullProfileRow } from '../utils/employeeFilters';
import { AttendanceLog, AttendanceType, Holiday, LeaveRequest, SwapRequest, UserProfile, ProfileChangeRequest, ProfileChangeSet } from '../types';

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

// ==================== ĐỔI THÔNG TIN CÁ NHÂN ====================
const PEMP: UserProfile = { ...EMP, dateOfBirth: '1995-03-02', phone: '0912345678', avatar: 'https://old.example/a.jpg', contractDate: '2020-01-01' };
const TODAY = '2025-11-05';

const mkProfileReq = (changes: ProfileChangeSet, status: ProfileChangeRequest['status'] = 'PENDING', id = 'p1'): ProfileChangeRequest => ({
  id, userId: 'u1', userName: EMP.name, userAvatar: '', userRole: EMP.role,
  date: D(TODAY), changes, reason: PROFILE_DEFAULT_REASON, status, createdAt: new Date(`${TODAY}T14:30:00`)
});

test('normalizeName / normalizePhone', () => {
  assert.equal(normalizeName('  Nguyễn   Văn  An '), 'Nguyễn Văn An');
  assert.equal(normalizePhone('+84 912 345 678'), '0912345678');
  assert.equal(normalizePhone('0084912345678'), '0912345678');
  assert.equal(normalizePhone('84912345678'), '0912345678');
  assert.equal(normalizePhone('091.234.5678'), '0912345678');
  assert.equal(normalizePhone('(091) 234-5678'), '0912345678');
});

test('validateName: từng luật', () => {
  assert.match(validateName('')!, /không được để trống/);
  assert.match(validateName('An')!, /ít nhất 2 từ/);
  assert.match(validateName('Nguyễn Văn An 123')!, /chỉ gồm chữ cái/);
  assert.match(validateName('A'.repeat(30) + ' ' + 'B'.repeat(30))!, /quá dài/);
  assert.equal(validateName('Nguyễn Văn An'), null);
  assert.equal(validateName("Nguyễn O'Brien-Lê"), null);
});

test('validateDateOfBirth: từng luật', () => {
  const o = { today: TODAY, contractDate: '2020-01-01' };
  assert.match(validateDateOfBirth('', o)!, /không được để trống/);
  assert.match(validateDateOfBirth('abc', o)!, /không hợp lệ/);
  assert.match(validateDateOfBirth('2025-11-06', o)!, /quá khứ/);
  assert.match(validateDateOfBirth('2025-11-05', o)!, /quá khứ/);
  assert.match(validateDateOfBirth('2011-01-01', o)!, /14 tuổi/);   // chưa đủ 15
  assert.equal(validateDateOfBirth('2010-11-05', o), null);          // đúng 15 tuổi hôm nay (biên)
  assert.match(validateDateOfBirth('1949-01-01', o)!, /76 tuổi/);
  assert.match(validateDateOfBirth('1995-03-02', { today: TODAY, contractDate: '1990-01-01' })!, /trước ngày vào làm/);
  assert.equal(validateDateOfBirth('1995-03-02', o), null);
});

test('validatePhone / warnPhonePrefix', () => {
  assert.equal(validatePhone(''), null);                               // rỗng = xoá số, hợp lệ
  assert.match(validatePhone('091234567')!, /đúng 10 chữ số, hiện 9/);
  assert.match(validatePhone('09123456789')!, /đúng 10 chữ số, hiện 11/);
  assert.match(validatePhone('912345678a')!, /chỉ gồm chữ số/);
  assert.match(validatePhone('1912345678')!, /bắt đầu bằng 0/);
  assert.equal(validatePhone('+84 912 345 678'), null);
  assert.equal(validatePhone('02838123456'), null);                    // số bàn 11 số
  assert.equal(warnPhonePrefix('0912345678'), null);
  assert.equal(warnPhonePrefix('0328123456'), null);
  assert.equal(warnPhonePrefix('02838123456'), null);
  assert.match(warnPhonePrefix('0612345678')!, /Đầu số 061x/);        // cảnh báo, không chặn
});

test('validateAvatarUrl: chỉ nhận https', () => {
  assert.equal(validateAvatarUrl('https://x.supabase.co/storage/v1/object/public/avatars/u/pending-1.jpg'), null);
  assert.match(validateAvatarUrl('http://x.example/a.jpg')!, /không hợp lệ/);
  assert.match(validateAvatarUrl('javascript:alert(1)')!, /không hợp lệ/);
  assert.match(validateAvatarUrl('')!, /không hợp lệ/);
});

test('buildProfileChanges: chỉ giữ trường THỰC SỰ đổi', () => {
  const same = buildProfileChanges(PEMP, { name: PEMP.name, dateOfBirth: '1995-03-02', phone: '0912345678', avatar: PEMP.avatar });
  assert.deepEqual(same, {});
  // đổi mỗi khoảng trắng trong tên / định dạng SĐT → không phải thay đổi
  const ws = buildProfileChanges(PEMP, { name: '  Nguyễn   Văn  Test ', dateOfBirth: '1995-03-02', phone: '+84 912 345 678', avatar: PEMP.avatar });
  assert.deepEqual(ws, {});
  const c = buildProfileChanges(PEMP, { name: 'Nguyễn Văn An', dateOfBirth: '1995-03-20', phone: '', avatar: 'https://new.example/b.jpg', avatarPath: 'u1/pending-1.jpg' });
  assert.deepEqual(c.name, { old: PEMP.name, new: 'Nguyễn Văn An' });
  assert.deepEqual(c.dateOfBirth, { old: '1995-03-02', new: '1995-03-20' });
  assert.deepEqual(c.phone, { old: '0912345678', new: null });       // xoá trắng ≠ không đổi
  assert.deepEqual(c.avatar, { old: PEMP.avatar, new: 'https://new.example/b.jpg', newPath: 'u1/pending-1.jpg' });
});

test('describeProfileChanges: "A → B", ngày dd/MM/yyyy, null hiện "Chưa có"', () => {
  const lines = describeProfileChanges({
    name: { old: 'A B', new: 'A C' },
    dateOfBirth: { old: null, new: '1995-03-20' },
    phone: { old: '0912345678', new: null },
    avatar: { old: null, new: 'https://x/y.jpg' }
  });
  assert.deepEqual(lines, [
    'Họ tên: A B → A C',
    'Ngày sinh: Chưa có → 20/03/1995',
    'Số điện thoại: 0912345678 → Chưa có',
    'Ảnh đại diện: Chưa có → ảnh mới'
  ]);
});

test('validateProfileRequest: hợp lệ, không có thay đổi, đã có đơn PENDING, excludeId, chuyển tiếp lỗi từng trường', () => {
  const base = { userId: 'u1', today: TODAY, contractDate: '2020-01-01', existingRequests: [] as ProfileChangeRequest[] };
  const c: ProfileChangeSet = { name: { old: 'A B', new: 'Nguyễn Văn An' } };
  assert.equal(validateProfileRequest({ ...base, changes: c }), null);
  assert.match(validateProfileRequest({ ...base, changes: {} })!, /Chưa có thay đổi/);
  const pending = mkProfileReq({ phone: { old: null, new: '0912345678' } });
  assert.match(validateProfileRequest({ ...base, changes: c, existingRequests: [pending] })!, /đang có một đề nghị/);
  assert.equal(validateProfileRequest({ ...base, changes: c, existingRequests: [pending], excludeId: 'p1' }), null);
  // Đơn APPROVED / REJECTED không chiếm chỗ
  assert.equal(validateProfileRequest({ ...base, changes: c, existingRequests: [mkProfileReq(c, 'APPROVED'), mkProfileReq(c, 'REJECTED', 'p2')] }), null);
  assert.match(validateProfileRequest({ ...base, changes: { name: { old: 'A B', new: 'An' } } })!, /ít nhất 2 từ/);
  assert.match(validateProfileRequest({ ...base, changes: { dateOfBirth: { old: null, new: null } } })!, /không được để trống/);
  assert.equal(validateProfileRequest({ ...base, changes: { phone: { old: '0912345678', new: null } } }), null); // xoá số là hợp lệ
});

test('applyProfileChanges: idempotent, bỏ qua trường đã trùng; patchToColumns đổi sang snake_case', () => {
  const c: ProfileChangeSet = { name: { old: PEMP.name, new: 'Nguyễn Văn An' }, phone: { old: '0912345678', new: '0987654321' } };
  const first = applyProfileChanges(PEMP, c);
  assert.deepEqual(first.patch, { name: 'Nguyễn Văn An', phone: '0987654321' });
  assert.deepEqual(first.skipped, []);
  const second = applyProfileChanges({ ...PEMP, ...first.patch }, c);   // duyệt lần hai
  assert.deepEqual(second.patch, {});
  assert.deepEqual(second.skipped, ['name', 'phone']);
  assert.deepEqual(
    patchToColumns({ name: 'X', dateOfBirth: '1990-01-01', phone: null, avatar: 'u' }),
    { name: 'X', date_of_birth: '1990-01-01', phone: null, avatar: 'u' }
  );
});

test('revertProfileChanges: trả giá trị cũ; trường đã bị sửa tiếp thì bỏ qua', () => {
  const c: ProfileChangeSet = { name: { old: PEMP.name, new: 'Nguyễn Văn An' }, phone: { old: '0912345678', new: '0987654321' } };
  const applied = { ...PEMP, name: 'Nguyễn Văn An', phone: '0987654321' };
  const r1 = revertProfileChanges(applied, c);
  assert.deepEqual(r1.patch, { name: PEMP.name, phone: '0912345678' });
  assert.deepEqual(r1.skipped, []);
  const edited = { ...applied, phone: '0900000000' };                    // Admin sửa tiếp SĐT sau khi duyệt
  const r2 = revertProfileChanges(edited, c);
  assert.deepEqual(r2.patch, { name: PEMP.name });
  assert.deepEqual(r2.skipped, ['phone']);
});

test('toProfileRow / mapProfileRow: ghi và đọc lại khớp nhau; chịu được JSON dạng chuỗi, null, khoá lạ', () => {
  const c: ProfileChangeSet = { name: { old: 'A B', new: 'A C' }, avatar: { old: null, new: 'https://x/y.jpg', newPath: 'u1/pending-1.jpg' } };
  const row = toProfileRow('u1', c, '  ', 'PENDING', TODAY);
  assert.equal(row.type, 'PROFILE');
  assert.equal(row.date, TODAY);
  assert.equal(row.reason, PROFILE_DEFAULT_REASON);
  assert.deepEqual(row.profile_changes, c);
  const back = mapProfileRow({ ...row, id: 7, created_at: null, rejection_reason: null }, [{ id: 'u1', name: 'A', avatar: '', role: EMP.role }]);
  assert.equal(back.id, '7');
  assert.deepEqual(back.changes, c);
  assert.equal(format(back.date, 'yyyy-MM-dd'), TODAY);
  assert.equal(back.userName, 'A');
  const fromString = mapProfileRow({ ...row, id: 8, profile_changes: JSON.stringify(c) }, []);
  assert.deepEqual(fromString.changes, c);
  const fromNull = mapProfileRow({ ...row, id: 9, profile_changes: null }, []);
  assert.deepEqual(fromNull.changes, {});
  const junk = mapProfileRow({ ...row, id: 10, profile_changes: { name: { old: 'a', new: 'b' }, hacker: { old: 1, new: 2 }, phone: 'not-an-object' } }, []);
  assert.deepEqual(Object.keys(junk.changes), ['name']);
});

test('getVirtualBirthdayBonus: đổi ngày sinh làm thưởng nhảy sang tháng khác', () => {
  const emp = { ...PEMP, contractDate: '2020-01-01' };
  const cuT3 = getVirtualBirthdayBonus({ ...emp, dateOfBirth: '1995-03-02' }, D('2026-03-01'));
  const cuT4 = getVirtualBirthdayBonus({ ...emp, dateOfBirth: '1995-03-02' }, D('2026-04-01'));
  const moiT4 = getVirtualBirthdayBonus({ ...emp, dateOfBirth: '1995-04-20' }, D('2026-04-01'));
  const moiT3 = getVirtualBirthdayBonus({ ...emp, dateOfBirth: '1995-04-20' }, D('2026-03-01'));
  assert.ok(cuT3 && cuT3.amount > 0);
  assert.equal(cuT4, null);
  assert.ok(moiT4 && moiT4.amount > 0);
  assert.equal(moiT3, null);
  assert.equal(cuT3!.amount, moiT4!.amount);                            // cùng thâm niên → cùng mức
  assert.equal(getVirtualBirthdayBonus({ ...emp, dateOfBirth: null }, D('2026-03-01')), null); // chính là bug cũ ở màn Lương
});

test('computeCoverCrop: cắt vuông căn giữa; ảnh nhỏ hơn đích thì không phóng to', () => {
  assert.deepEqual(computeCoverCrop(1200, 800, 512), { sx: 200, sy: 0, sw: 800, sh: 800, dw: 512, dh: 512 });
  assert.deepEqual(computeCoverCrop(800, 1200, 512), { sx: 0, sy: 200, sw: 800, sh: 800, dw: 512, dh: 512 });
  assert.deepEqual(computeCoverCrop(300, 300, 512), { sx: 0, sy: 0, sw: 300, sh: 300, dw: 300, dh: 300 });
});

test('mapDirectoryRow: KHÔNG có lương (undefined, không phải 0), gắn cờ isDirectoryOnly', () => {
  const d = mapDirectoryRow({ id: 'u2', name: 'B', avatar: null, role: 'Nhân Viên Sản Xuất', status: 'ACTIVE', employee_code: 'NV2', date_of_birth: '1990-01-01', resignation_date: null, base_salary: 99 });
  assert.equal(d.isDirectoryOnly, true);
  assert.equal(d.baseSalary, undefined);
  assert.equal(d.allowance, undefined);
  assert.equal(d.insuranceSalary, undefined);
  assert.equal(d.phone, undefined);
  assert.equal(d.email, undefined);
  assert.equal(d.avatar, '');
  assert.equal(d.dateOfBirth, '1990-01-01');
});

test('mapFullProfileRow: nạp đủ dateOfBirth / employeeCode / phone, ưu tiên email đăng nhập', () => {
  const f = mapFullProfileRow(
    { id: 'u1', name: 'A', avatar: '', role: 'Admin', email: 'db@x', phone: '0912345678', base_salary: 26000000, date_of_birth: '1995-03-02', employee_code: 'NV1' },
    { email: 'auth@x', avatarUrl: 'https://meta/a.png' }
  );
  assert.equal(f.dateOfBirth, '1995-03-02');
  assert.equal(f.employeeCode, 'NV1');
  assert.equal(f.phone, '0912345678');
  assert.equal(f.email, 'auth@x');
  assert.equal(f.avatar, 'https://meta/a.png');
  assert.equal(f.baseSalary, 26000000);
  assert.equal(f.isDirectoryOnly, undefined);
});

test('chống tái phát: map dòng danh bạ bằng mapper ĐẦY ĐỦ rồi spread lên currentUser sẽ XOÁ lương', () => {
  const me = mapFullProfileRow({ id: 'u1', name: 'A', role: 'Nhân Viên Sản Xuất', base_salary: 26000000 });
  const dirRow = { id: 'u1', name: 'A', role: 'Nhân Viên Sản Xuất' };   // dòng employee_directory: không có base_salary
  const wrong = { ...me, ...mapFullProfileRow(dirRow) };                // cách cũ: key baseSalary có mặt với undefined → ghi đè
  assert.equal(wrong.baseSalary, undefined);
  const right = { ...me, ...mapDirectoryRow(dirRow) };                   // mapDirectoryRow KHÔNG tạo key lương → không ghi đè
  assert.equal(right.baseSalary, 26000000);
});
