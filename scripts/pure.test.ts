// Kiểm thử các module THUẦN (không React/supabase) bằng node:test.
// Chạy: npm run test:pure  (esbuild bundle → node --test)
//
// Tập trung vào đơn đổi ngày nghỉ (nghỉ T7, làm bù CN): phân loại ngày, luật
// validate, tính công ngày, tính lương tháng và đếm ngày phép. Dùng các tháng
// năm 2025 (đã qua) vì calculator bỏ qua ngày tương lai.
import { test } from 'node:test';
import { saveSalaryChange, salarySaveErrorMessage } from '../utils/salaryChanges';
import {
  persistLeaveRequest, leaveSubmitErrorMessage, fetchRecentAndPendingRequests, LeaveSubmission,
  requestStatusPatch, updateRequestStatus, requestStatusErrorMessage
} from '../utils/requestPersistence';
import assert from 'node:assert/strict';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  resolveRestDay, validateSwapRequest, findOverlappingSwap, findSwapBlockingLeave,
  pairedSunday, isSwapVoidedByHoliday, makeRestDayPredicate, toSwapRow, mapSwapRow, SWAP_DEFAULT_REASON, dayKeyOf
} from '../utils/restDay';
import {
  parseWeekendSchedule, sundayGroupFor, autoGroupFor, setSundayGroup, startRotation, pinsFrom,
  sundayOfWeek, saturdayBefore, upcomingSundays, membersOf, unassignedWorking, hasSaturdayInWorkDays,
  hasSwapForSunday, membersWithoutSwap, swapsOfOtherGroup, dutyForWeek, nextDuty, diffSchedules,
  groupPushMessages, findDutyHoliday, summarizeSunday, describeSundayDuty, EMPTY_WEEKEND_SCHEDULE
} from '../utils/weekendGroups';
import { calculateDailyStats } from '../utils/attendanceCalculator';
import { calculateMonthlySalary, getVirtualBirthdayBonus } from '../utils/salaryCalculator';
import { countLeaveDays, leaveDayMap, findOverlappingLeave, maternityLeaveFromReturnDate, MATERNITY_LEAVE_REASON, explainLeaveDays } from '../utils/leaveTypes';
import {
  normalizeName, normalizePhone, validateName, validateDateOfBirth, validatePhone, warnPhonePrefix,
  validateAvatarUrl, buildProfileChanges, describeProfileChanges, validateProfileRequest,
  applyProfileChanges, revertProfileChanges, patchToColumns, mapProfileRow, toProfileRow,
  computeCoverCrop, PROFILE_DEFAULT_REASON
} from '../utils/profileChange';
import { mapDirectoryRow, mapFullProfileRow } from '../utils/employeeFilters';
import { reminderBlockReason, buildSalaryReminder, classifyPushResult, summarizeReminder } from '../utils/salaryReminder';
import { AttendanceLog, AttendanceType, Holiday, LeaveRequest, SwapRequest, UserProfile, ProfileChangeRequest, ProfileChangeSet, WeekendSchedule } from '../types';

// calculateMonthlySalary in ra console.log debug — tắt cho gọn
console.log = () => { };

// === DỮ LIỆU MẪU ===
const EMP: UserProfile = {
  id: 'u1', name: 'Nguyễn Văn Test', avatar: '', role: 'Nhân Viên Sản Xuất',
  baseSalary: 26_000_000, allowance: 0, insuranceSalary: 0,
  workDays: '1,2,3,4,5,6', contractType: 'Hợp đồng chính thức', contractDate: '2024-01-01'
};

const D = (iso: string) => new Date(`${iso}T00:00:00`);

test('Gửi đơn thai sản: nhân viên chờ duyệt, giữ khoảng nghỉ sang năm sau và ID máy chủ', async () => {
  let payload: any;
  const client: any = { from: () => ({ insert: (row: any) => {
    payload = row;
    return { select: () => ({ single: async () => ({ data: { ...row, id: 'stored-leave' }, error: null }) }) };
  } }) };
  const input: LeaveSubmission = { startDate: '2026-10-01', endDate: '2027-03-31', type: 'INSURANCE', duration: 'FULL', reason: MATERNITY_LEAVE_REASON };
  const saved = await persistLeaveRequest(client, { id: 'employee', role: EMP.role }, 'employee', input, true);
  assert.equal(saved.id, 'stored-leave');
  assert.equal(payload.status, 'PENDING');
  assert.equal(payload.leave_type, 'INSURANCE');
  assert.equal(payload.end_date.slice(0, 10), '2027-03-31');
  await assert.rejects(persistLeaveRequest(client, { id: 'employee', role: EMP.role }, 'someone-else', input, false));
  await persistLeaveRequest(client, { id: 'admin', role: 'Admin' }, 'employee', input, true);
  assert.equal(payload.status, 'APPROVED');
});

test('Gửi đơn: lỗi ràng buộc/RLS hoặc không có xác nhận không được coi là thành công', async () => {
  const input: LeaveSubmission = { startDate: '2026-10-01', endDate: '2027-03-31', type: 'INSURANCE', duration: 'FULL', reason: MATERNITY_LEAVE_REASON };
  for (const error of [
    { code: '23514', message: 'violates check constraint requests_leave_type_check' },
    { code: '42501', message: 'row-level security policy' }, null
  ]) {
    const client: any = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error }) }) }) }) };
    await assert.rejects(persistLeaveRequest(client, { id: 'employee', role: EMP.role }, 'employee', input, false));
  }
  assert.match(leaveSubmitErrorMessage({ code: '23514', message: 'requests_leave_type_check' }), /add_insurance_leave_type.sql/);
  assert.match(leaveSubmitErrorMessage({ code: '42501' }), /quyền truy cập/);
});

test('Đổi trạng thái đơn: ghi processed_at khi duyệt/từ chối, xoá khi hoàn duyệt', () => {
  const now = new Date('2026-10-02T03:47:00.000Z');
  assert.deepEqual(requestStatusPatch('APPROVED', '', now),
    { status: 'APPROVED', rejection_reason: null, processed_at: '2026-10-02T03:47:00.000Z' });
  assert.deepEqual(requestStatusPatch('REJECTED', 'Thiếu giấy tờ', now),
    { status: 'REJECTED', rejection_reason: 'Thiếu giấy tờ', processed_at: '2026-10-02T03:47:00.000Z' });
  assert.deepEqual(requestStatusPatch('PENDING', undefined, now),
    { status: 'PENDING', rejection_reason: null, processed_at: null });
});

test('Đổi trạng thái đơn: chỉ coi là xong khi máy chủ trả dòng đã ghi; lỗi phải nêu đúng file SQL', async () => {
  const calls: any[] = [];
  const makeClient = (result: { data: any; error: any }): any => ({ from: (table: string) => {
    calls.push(['from', table]);
    const query: any = {
      update: (patch: any) => { calls.push(['update', patch]); return query; },
      eq: (col: string, val: any) => { calls.push(['eq', col, val]); return query; },
      select: async () => result
    };
    return query;
  } });

  const row = await updateRequestStatus(
    makeClient({ data: [{ id: 'r1', status: 'APPROVED', processed_at: '2026-10-02T03:47:00.000Z' }], error: null }),
    'r1', 'APPROVED', undefined, 'PROFILE'
  );
  assert.equal(row.id, 'r1');
  assert.deepEqual(calls.filter(c => c[0] === 'eq'), [['eq', 'id', 'r1'], ['eq', 'type', 'PROFILE']]);
  const patch = calls.find(c => c[0] === 'update')[1];
  assert.equal(patch.status, 'APPROVED');
  assert.ok(typeof patch.processed_at === 'string' && patch.processed_at.length > 0);

  // Không truyền type thì không khoá theo type
  calls.length = 0;
  await updateRequestStatus(makeClient({ data: [{ id: 'r2' }], error: null }), 'r2', 'REJECTED', 'Trùng đơn');
  assert.deepEqual(calls.filter(c => c[0] === 'eq'), [['eq', 'id', 'r2']]);

  // RLS chặn lặng lẽ → 0 dòng → phải báo lỗi, không coi là thành công
  await assert.rejects(updateRequestStatus(makeClient({ data: [], error: null }), 'r1', 'APPROVED'), /không xác nhận/);
  // Lỗi PostgREST được ném nguyên vẹn để nơi gọi dịch mã lỗi
  const pgError = { code: 'PGRST204', message: "Could not find the 'processed_at' column of 'requests' in the schema cache" };
  await assert.rejects(updateRequestStatus(makeClient({ data: null, error: pgError }), 'r1', 'APPROVED'), (e: any) => e === pgError);

  assert.match(requestStatusErrorMessage(pgError), /add_processed_at\.sql/);
  assert.match(requestStatusErrorMessage({ code: '42703', message: 'column "processed_at" does not exist' }), /add_processed_at\.sql/);
  assert.match(requestStatusErrorMessage({ code: '42501', message: 'new row violates row-level security policy' }), /quyền/);
  assert.match(requestStatusErrorMessage({ message: 'network failed' }), /network failed/);
});

test('Danh sách duyệt: lấy đơn PENDING không giới hạn thời gian và đọc đủ các trang', async () => {
  const ranges: number[][] = [];
  const client: any = { from: () => {
    const query: any = {
      select: () => query,
      or: (filter: string) => { assert.equal(filter, 'created_at.gte.2026-06-28T00:00:00.000Z,status.eq.PENDING'); return query; },
      order: () => query,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        return { data: from === 0 ? Array.from({ length: 200 }, (_, i) => ({ id: i })) : [{ id: 'pending-old' }], error: null };
      }
    };
    return query;
  } };
  const rows = await fetchRecentAndPendingRequests(client, '2026-06-28T00:00:00.000Z');
  assert.equal(rows.length, 201);
  assert.equal(rows[200].id, 'pending-old');
  assert.deepEqual(ranges, [[0, 199], [200, 399]]);
});

test('Danh sách duyệt: lỗi tải phải được báo, không trả danh sách trống giả', async () => {
  const query: any = { select: () => query, or: () => query, order: () => query,
    range: async () => ({ data: null, error: new Error('network failed') }) };
  await assert.rejects(fetchRecentAndPendingRequests({ from: () => query } as any, '2026-06-28'), /network failed/);
});

// Máy chủ giả lập trả lỗi/quyền ghi; không chạm dữ liệu lương thực tế.
const salarySaveFixture = (opts: { historyError?: any; profileError?: any; future?: boolean; latestSalary?: number } = {}) => {
  const operations: string[] = [];
  const row = { id: 'server-id', user_id: 'employee-k', base_salary: 7500000, allowance: 0,
    insurance_salary: 0, effective_date: opts.future ? '2027-01-01' : '2026-09-07', reason: 'Cập nhật lương' };
  let profilePayload: any = null;
  const client: any = {
    from(table: string) {
      let operation = '';
      const query: any = {
        upsert() { operation = 'save-history'; operations.push(operation); return query; },
        select() { return query; },
        eq() { return query; }, lte() { return query; }, order() { return query; }, limit() { return query; },
        update(payload: any) { operation = 'update-profile'; operations.push(operation); profilePayload = payload; return query; },
        async single() {
          if (operation === 'save-history') return { data: opts.historyError ? null : row, error: opts.historyError };
          if (table === 'profiles') return { data: opts.profileError ? null : { id: row.user_id }, error: opts.profileError };
          operations.push('read-active');
          return { data: { ...row, base_salary: opts.latestSalary ?? row.base_salary }, error: null };
        }
      };
      return query;
    }
  };
  return { client, operations, payload: () => profilePayload, input: {
    baseSalary: row.base_salary, allowance: 0, insuranceSalary: 0, effectiveDate: row.effective_date, reason: row.reason
  } };
};

test('Lưu lương: RLS từ chối thì báo thất bại, không ghi hồ sơ', async () => {
  const error = { code: '42501', message: 'new row violates row-level security policy' };
  const f = salarySaveFixture({ historyError: error });
  await assert.rejects(saveSalaryChange(f.client, 'employee-k', f.input, '2026-09-28'), e => e === error);
  assert.deepEqual(f.operations, ['save-history']);
  assert.match(salarySaveErrorMessage(error), /quyền lưu lịch sử lương/);
});

test('Lưu lương: dùng ID máy chủ, đồng bộ hồ sơ sau khi lưu lịch sử', async () => {
  const f = salarySaveFixture();
  const result = await saveSalaryChange(f.client, 'employee-k', f.input, '2026-09-28');
  assert.equal(result.change.id, 'server-id');
  assert.equal(result.profileSalary?.baseSalary, 7500000);
  assert.equal(result.profileSyncError, null);
  assert.deepEqual(f.operations, ['save-history', 'read-active', 'update-profile']);
});

test('Lưu lương: lỗi cập nhật hồ sơ phải báo trạng thái lưu một phần', async () => {
  const f = salarySaveFixture({ profileError: { message: 'Không có quyền sửa hồ sơ' } });
  const result = await saveSalaryChange(f.client, 'employee-k', f.input, '2026-09-28');
  assert.equal(result.change.id, 'server-id');
  assert.equal(result.profileSalary, null);
  assert.equal(result.profileSyncError, 'Không có quyền sửa hồ sơ');
});

test('Lưu lương: mốc tương lai không đổi lương hiện tại; sửa mốc cũ giữ mốc mới nhất', async () => {
  const future = salarySaveFixture({ future: true });
  const scheduled = await saveSalaryChange(future.client, 'employee-k', future.input, '2026-09-28');
  assert.equal(scheduled.profileSalary, null);
  assert.deepEqual(future.operations, ['save-history']);
  const old = salarySaveFixture({ latestSalary: 9000000 });
  await saveSalaryChange(old.client, 'employee-k', old.input, '2026-09-28');
  assert.equal(old.payload().base_salary, 9000000);
});

test('Lưu lương: ngày hoặc số tiền sai không gửi đến máy chủ', async () => {
  const f = salarySaveFixture();
  await assert.rejects(saveSalaryChange(f.client, 'employee-k', { ...f.input, effectiveDate: '2026-02-30' }));
  await assert.rejects(saveSalaryChange(f.client, 'employee-k', { ...f.input, baseSalary: -1 }));
  assert.deepEqual(f.operations, []);
});

test('Thai sản: bỏ Chủ nhật và không tính ngày đi làm lại', () => {
  const range = maternityLeaveFromReturnDate('2026-09-05', '2026-09-08')!;
  assert.equal(format(range.endDate, 'yyyy-MM-dd'), '2026-09-07');
  assert.equal(range.days, 2);
  assert.equal(maternityLeaveFromReturnDate('2026-09-05', '2026-09-06')!.days, 1);
  assert.equal(maternityLeaveFromReturnDate('2026-09-06', '2026-09-07')!.days, 0);
});

test('Thai sản: kiểm tra ngày trống, sai, bằng nhau hoặc đi làm lại trước ngày nghỉ', () => {
  for (const [start, returning] of [
    ['', '2026-09-08'], ['2026-09-05', ''], ['invalid', '2026-09-08'],
    ['2026-02-30', '2026-03-08'], ['2026-09-08', '2026-09-08'], ['2026-09-09', '2026-09-08']
  ]) assert.equal(maternityLeaveFromReturnDate(start, returning), null);
});

test('Thai sản: kỳ nghỉ nhiều tháng, qua năm và ngày nhuận', () => {
  assert.equal(maternityLeaveFromReturnDate('2026-04-01', '2026-10-01')!.days, 157);
  assert.equal(maternityLeaveFromReturnDate('2026-12-31', '2027-01-04')!.days, 3);
  assert.equal(maternityLeaveFromReturnDate('2024-02-28', '2024-03-02')!.days, 3);
});

test('Thai sản: số ngày trên đơn và lịch sử khớp nhau, chỉ loại Chủ nhật', () => {
  const range = maternityLeaveFromReturnDate('2026-09-01', '2026-09-08')!;
  const req = { startDate: D('2026-09-01'), endDate: range.endDate, duration: 'FULL' as const,
    leaveType: 'INSURANCE' as const, reason: MATERNITY_LEAVE_REASON };
  const holidays: Holiday[] = [{ id: 'h', date: D('2026-09-02'), name: 'Quốc khánh', duration: 'FULL' }];
  const swappedRestDay = (day: Date) => day.getDay() === 6;
  assert.equal(range.days, 6);
  assert.equal(countLeaveDays(req, holidays, swappedRestDay), range.days);
  assert.equal(leaveDayMap(req, holidays, swappedRestDay).size, range.days);
  assert.equal(explainLeaveDays(req, holidays, swappedRestDay).holidayDays, 0);
  // Phép năm vẫn loại cả ngày lễ và ngày nghỉ tuần như trước.
  assert.equal(countLeaveDays({ ...req, leaveType: 'PAID' }, holidays), 5);
});

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

// === NHÓM LÀM CHỦ NHẬT A/B ===
// Chủ Nhật năm 2025: 28/09, 05/10, 12/10, 19/10, 26/10, 02/11 ...
const SCHED: WeekendSchedule = { version: 1, anchorSunday: '2025-10-05', anchorGroup: 'A', overrides: {} };
const GA1: UserProfile = { ...EMP, id: 'a1', name: 'An A', weekendGroup: 'A' };
const GA2: UserProfile = { ...EMP, id: 'a2', name: 'Bình A', weekendGroup: 'A' };
const GB1: UserProfile = { ...EMP, id: 'b1', name: 'Cúc B', weekendGroup: 'B' };
const GA_RESIGNED: UserProfile = { ...EMP, id: 'a9', name: 'Đã nghỉ', weekendGroup: 'A', resignationDate: '2025-06-30' };
const GA_LOCKED: UserProfile = { ...EMP, id: 'a8', name: 'Bị khoá', weekendGroup: 'A', status: 'LOCKED' };
const NOGROUP: UserProfile = { ...EMP, id: 'n1', name: 'Chưa xếp', weekendGroup: null };
const STAFF = [GA1, GA2, GB1, GA_RESIGNED, GA_LOCKED, NOGROUP];
const swapFor = (userId: string, restIso: string, status: SwapRequest['status'] = 'APPROVED'): SwapRequest =>
  ({ ...mkSwap(restIso, status, `${userId}-${restIso}`), userId });

test('parseWeekendSchedule: chịu được chuỗi JSON, rác, key không phải Chủ Nhật, giá trị lạ', () => {
  const ok = parseWeekendSchedule(JSON.stringify({
    anchorSunday: '2025-10-05', anchorGroup: 'B',
    overrides: { '2025-10-12': 'NONE', '2025-10-13': 'A', '2025-10-19': 'C' }
  }));
  assert.equal(ok.anchorSunday, '2025-10-05');
  assert.equal(ok.anchorGroup, 'B');
  assert.deepEqual(ok.overrides, { '2025-10-12': 'NONE' });        // 13/10 là Thứ 2, 'C' không hợp lệ → bỏ
  assert.deepEqual(parseWeekendSchedule(null), EMPTY_WEEKEND_SCHEDULE);
  assert.deepEqual(parseWeekendSchedule('{oops'), EMPTY_WEEKEND_SCHEDULE);
  assert.deepEqual(parseWeekendSchedule(42), EMPTY_WEEKEND_SCHEDULE);
  assert.equal(parseWeekendSchedule({ anchorSunday: '2025-10-06', anchorGroup: 'A' }).anchorSunday, null); // mốc là Thứ 2 → bỏ
  assert.equal(parseWeekendSchedule({ anchorGroup: 'X' }).anchorGroup, 'A');
});

test('sundayGroupFor: luân phiên sau mốc, trước mốc = không ai, chưa có mốc = không ai', () => {
  const g = (iso: string) => sundayGroupFor(D(iso), SCHED);
  assert.deepEqual(g('2025-10-05'), { group: 'A', source: 'AUTO' });
  assert.equal(g('2025-10-12').group, 'B');
  assert.equal(g('2025-10-19').group, 'A');
  assert.equal(g('2025-10-26').group, 'B');
  assert.equal(g('2025-11-02').group, 'A');
  assert.deepEqual(g('2025-09-28'), { group: null, source: 'UNSET' });
  assert.equal(g('2025-10-08').group, 'B');                          // Thứ 4 → theo CN 12/10 của tuần đó
  assert.deepEqual(sundayGroupFor(D('2025-10-05'), EMPTY_WEEKEND_SCHEDULE), { group: null, source: 'UNSET' });
});

test('ghim thắng luân phiên; NONE = không nhóm nào; AUTO bỏ ghim; autoGroupFor bỏ qua ghim', () => {
  let s = setSundayGroup(SCHED, D('2025-10-12'), 'A');               // luân phiên là B
  assert.deepEqual(sundayGroupFor(D('2025-10-12'), s), { group: 'A', source: 'PIN' });
  assert.equal(autoGroupFor(D('2025-10-12'), s), 'B');
  s = setSundayGroup(s, D('2025-10-19'), 'NONE');
  assert.deepEqual(sundayGroupFor(D('2025-10-19'), s), { group: null, source: 'NONE' });
  s = setSundayGroup(s, D('2025-10-15'), 'AUTO');                    // Thứ 4 → CN 19/10
  assert.equal(s.overrides['2025-10-19'], undefined);
  assert.equal(sundayGroupFor(D('2025-10-19'), s).source, 'AUTO');
  assert.deepEqual(SCHED.overrides, {});                              // không đụng bản gốc
});

test('startRotation: ép về Chủ Nhật, xoá ghim từ mốc trở đi, giữ ghim trước mốc', () => {
  const s: WeekendSchedule = { ...SCHED, overrides: { '2025-09-28': 'B', '2025-10-12': 'NONE', '2025-10-19': 'A' } };
  assert.deepEqual(pinsFrom(s, D('2025-10-15')), ['2025-10-19']);
  const next = startRotation(s, D('2025-10-15'), 'B');              // Thứ 4 → mốc CN 19/10
  assert.equal(next.anchorSunday, '2025-10-19');
  assert.equal(next.anchorGroup, 'B');
  assert.deepEqual(next.overrides, { '2025-09-28': 'B', '2025-10-12': 'NONE' });
  assert.equal(sundayGroupFor(D('2025-10-26'), next).group, 'A');
});

test('sundayOfWeek / saturdayBefore / upcomingSundays: tuần Thứ 2 → Chủ Nhật', () => {
  assert.equal(dayKeyOf(sundayOfWeek(D('2025-10-06'))), '2025-10-12');   // Thứ 2
  assert.equal(dayKeyOf(sundayOfWeek(D('2025-10-11'))), '2025-10-12');   // Thứ 7
  assert.equal(dayKeyOf(sundayOfWeek(D('2025-10-12'))), '2025-10-12');   // chính Chủ Nhật
  assert.equal(dayKeyOf(saturdayBefore(D('2025-10-12'))), '2025-10-11');
  assert.deepEqual(upcomingSundays(D('2025-10-12'), 3).map(dayKeyOf), ['2025-10-12', '2025-10-19', '2025-10-26']);
});

test('membersOf: đúng nhóm và đang làm việc; loại nghỉ việc, bị khoá, chưa xếp', () => {
  assert.deepEqual(membersOf('A', STAFF).map(e => e.id), ['a1', 'a2']);
  assert.deepEqual(membersOf('B', STAFF).map(e => e.id), ['b1']);
  assert.deepEqual(unassignedWorking(STAFF).map(e => e.id), ['n1']);
  assert.equal(hasSaturdayInWorkDays('1,2,3,4,5'), false);
  assert.equal(hasSaturdayInWorkDays(undefined), true);
});

test('membersWithoutSwap: đơn PENDING cũng tính là "đã có", REJECTED thì không', () => {
  const swaps = [swapFor('a1', '2025-10-04', 'PENDING'), swapFor('a2', '2025-10-04', 'REJECTED')];
  assert.deepEqual(membersWithoutSwap(D('2025-10-05'), membersOf('A', STAFF), swaps).map(e => e.id), ['a2']);
  assert.equal(hasSwapForSunday('a1', D('2025-10-05'), swaps), true);
  assert.equal(hasSwapForSunday('a1', D('2025-10-12'), swaps), false);
});

test('swapsOfOtherGroup: đơn của người ngoài nhóm làm CN đó (nhóm cũ / chưa xếp)', () => {
  const swaps = [swapFor('a1', '2025-10-04'), swapFor('b1', '2025-10-04'), swapFor('n1', '2025-10-04'), swapFor('b1', '2025-10-11')];
  assert.deepEqual(swapsOfOtherGroup(D('2025-10-05'), 'A', STAFF, swaps).map(s => s.userId), ['b1', 'n1']);
  assert.deepEqual(swapsOfOtherGroup(D('2025-10-05'), null, STAFF, swaps).map(s => s.userId), ['a1', 'b1', 'n1']);
});

test('dutyForWeek / nextDuty: theo nhóm của NV và tuần chứa hôm nay', () => {
  const d = dutyForWeek(GA1, D('2025-10-01'), SCHED);                // Thứ 4 tuần có CN 05/10 (A)
  assert.ok(d);
  assert.equal(dayKeyOf(d!.sunday), '2025-10-05');
  assert.equal(dayKeyOf(d!.saturday), '2025-10-04');
  assert.equal(d!.group, 'A');
  assert.equal(dutyForWeek(GA1, D('2025-10-05'), SCHED)?.group, 'A');  // chính Chủ Nhật vẫn là tuần này
  assert.equal(dutyForWeek(GB1, D('2025-10-01'), SCHED), null);
  assert.equal(dutyForWeek(GA_RESIGNED, D('2025-10-01'), SCHED), null);
  assert.equal(dutyForWeek(NOGROUP, D('2025-10-01'), SCHED), null);
  assert.equal(dutyForWeek(GA1, D('2025-10-01'), EMPTY_WEEKEND_SCHEDULE), null);
  assert.equal(dayKeyOf(nextDuty(GB1, D('2025-10-06'), SCHED)!.sunday), '2025-10-12');
  assert.equal(nextDuty(GB1, D('2025-10-06'), EMPTY_WEEKEND_SCHEDULE), null);
});

test('diffSchedules + groupPushMessages: một push mỗi người, tối đa 4 ngày, báo cả "không còn làm"', () => {
  const changes = diffSchedules(EMPTY_WEEKEND_SCHEDULE, SCHED, D('2025-10-01'), 10);
  assert.equal(changes.length, 10);
  assert.deepEqual(changes.slice(0, 2).map(c => [dayKeyOf(c.sunday), c.before, c.after]),
    [['2025-10-05', null, 'A'], ['2025-10-12', null, 'B']]);
  const msgs = groupPushMessages(changes, STAFF);
  assert.deepEqual([...msgs.keys()].sort(), ['a1', 'a2', 'b1']);     // không gửi người nghỉ việc / khoá / chưa xếp
  assert.match(msgs.get('a1')!, /05\/10, 19\/10, 02\/11, 16\/11…/);  // 5 Chủ Nhật của A → cắt còn 4
  assert.doesNotMatch(msgs.get('a1')!, /không còn làm/);
  // Ghim CN 05/10 thành NONE → chỉ nhóm A bị "không còn làm"
  const off = groupPushMessages(
    diffSchedules(SCHED, setSundayGroup(SCHED, D('2025-10-05'), 'NONE'), D('2025-10-01'), 8), STAFF);
  assert.deepEqual([...off.keys()].sort(), ['a1', 'a2']);
  assert.match(off.get('a1')!, /05\/10.*không còn làm/);
  assert.deepEqual(diffSchedules(SCHED, SCHED, D('2025-10-01'), 8), []);
});

test('findDutyHoliday: lễ rơi vào Thứ 7 hoặc Chủ Nhật của tuần đó', () => {
  const h: Holiday[] = [{ id: 'h', date: D('2025-10-04'), name: 'Lễ thử' }];
  assert.equal(findDutyHoliday(D('2025-10-05'), h)?.name, 'Lễ thử');
  assert.equal(findDutyHoliday(D('2025-10-12'), h), null);
});

test('summarizeSunday + describeSundayDuty: dữ liệu cho một dòng lịch', () => {
  const swaps = [swapFor('a1', '2025-10-04'), swapFor('b1', '2025-10-04')];
  const row = summarizeSunday(D('2025-10-05'), SCHED, STAFF, swaps);
  assert.equal(row.group, 'A');
  assert.equal(row.source, 'AUTO');
  assert.deepEqual(row.members.map(e => e.id), ['a1', 'a2']);
  assert.deepEqual(row.missing.map(e => e.id), ['a2']);
  assert.deepEqual(row.otherSwaps.map(s => s.userId), ['b1']);
  assert.equal(row.holiday, null);
  assert.equal(describeSundayDuty({ sunday: D('2025-10-05'), saturday: D('2025-10-04'), group: 'A' }),
    'Nhóm A làm CN 05/10 — nghỉ bù T7 04/10');
});

test('weekendGroup đi qua cả hai mapper; view cũ thiếu cột → null', () => {
  assert.equal(mapFullProfileRow({ id: 'u1', name: 'A', role: 'Admin', weekend_group: 'B' }).weekendGroup, 'B');
  assert.equal(mapFullProfileRow({ id: 'u1', name: 'A', role: 'Admin' }).weekendGroup, null);
  assert.equal(mapDirectoryRow({ id: 'u1', name: 'A', role: 'Admin', weekend_group: 'A' }).weekendGroup, 'A');
  assert.equal(mapDirectoryRow({ id: 'u1', name: 'A', role: 'Admin' }).weekendGroup, null);
});

test('reminderBlockReason: chỉ nhắc tháng đã qua, chưa chốt, còn người chưa xác nhận', () => {
  const NOW = D('2025-10-15');
  assert.equal(reminderBlockReason(D('2025-09-01'), NOW, false, 3), null);
  assert.match(reminderBlockReason(D('2025-10-01'), NOW, false, 3)!, /tháng đã qua/);
  assert.match(reminderBlockReason(D('2025-11-01'), NOW, false, 3)!, /tháng đã qua/);
  assert.match(reminderBlockReason(D('2025-09-01'), NOW, true, 3)!, /đã chốt/);
  assert.match(reminderBlockReason(D('2025-09-01'), NOW, false, 0)!, /đã xác nhận/);
});

test('buildSalaryReminder: ghi rõ tháng và đường đi vì app không đọc URL', () => {
  const m = buildSalaryReminder(D('2025-09-01'));
  assert.equal(m.title, '💰 Xác nhận lương tháng 09/2025');
  assert.match(m.body, /tab Lương/);
  assert.equal(m.body.split('09/2025').length - 1, 2);
  assert.match(m.body, /Xác nhận lương/);
});

test('classifyPushResult: null/lỗi ≠ chưa bật thông báo ≠ gửi được', () => {
  assert.equal(classifyPushResult(null), 'FAILED');
  assert.equal(classifyPushResult({ sent: 2, total: 2 }), 'OK');
  assert.equal(classifyPushResult({ sent: 1, total: 2 }), 'OK');
  assert.equal(classifyPushResult({ sent: 0 }), 'NO_DEVICE');
  assert.equal(classifyPushResult({ sent: 0, total: 0 }), 'NO_DEVICE');
  assert.equal(classifyPushResult({ sent: 0, total: 2 }), 'FAILED');
});

test('summarizeReminder: liệt kê đúng người chưa bật thông báo và người gửi lỗi', () => {
  const M = D('2025-09-01');
  const ok = summarizeReminder(M, [{ name: 'An', outcome: 'OK' }, { name: 'Bình', outcome: 'OK' }]);
  assert.equal(ok.allOk, true);
  assert.match(ok.message, /tới 2 người/);

  const mixed = summarizeReminder(M, [
    { name: 'An', outcome: 'OK' },
    { name: 'Bình', outcome: 'NO_DEVICE' },
    { name: 'Chi', outcome: 'FAILED' }
  ]);
  assert.equal(mixed.allOk, false);
  assert.match(mixed.message, /1\/3 người/);
  assert.match(mixed.message, /Chưa bật thông báo \(1\)[^]*• Bình/);
  assert.match(mixed.message, /Gửi lỗi \(1\)[^]*• Chi/);
  assert.doesNotMatch(mixed.message, /• An/);
});
