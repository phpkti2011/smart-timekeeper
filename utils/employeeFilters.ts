import { endOfMonth, startOfMonth } from 'date-fns';
import { UserProfile } from '../types';

// Lọc nhân viên dùng chung cho toàn app.
// Nhân viên nghỉ việc được đánh dấu bằng `resignationDate`, KHÔNG phải bằng
// `status` — họ vẫn giữ status 'ACTIVE'. Mọi chỗ chỉ lọc theo status đều lọt.

/** status undefined = dữ liệu cũ chưa có cột này, coi như đang hoạt động */
export const isActiveAccount = (emp: Pick<UserProfile, 'status'>): boolean =>
  emp.status === 'ACTIVE' || !emp.status;

export const isResigned = (emp: Pick<UserProfile, 'resignationDate'>): boolean =>
  !!emp.resignationDate;

/** Nhân viên đang thực sự làm việc */
export const isWorkingEmployee = (emp: Pick<UserProfile, 'status' | 'resignationDate'>): boolean =>
  isActiveAccount(emp) && !isResigned(emp);

/**
 * Đã rời công ty TRƯỚC kỳ đang xem. Còn ân hạn hết tháng nghỉ việc để kịp
 * chốt lương/phép tháng cuối.
 *
 * So với KỲ ĐANG XEM chứ không phải với hôm nay — nếu không, mở báo cáo tháng 3
 * vào tháng 9 sẽ làm người nghỉ tháng 6 biến mất khỏi tháng 3, dù tháng đó họ
 * có đi làm thật và đã được trả lương.
 */
export const isResignedBeforePeriod = (
  emp: Pick<UserProfile, 'resignationDate'>,
  periodStart: Date
): boolean => {
  if (!emp.resignationDate) return false;
  return startOfMonth(periodStart) > endOfMonth(new Date(emp.resignationDate));
};

/** Nhân viên nghỉ việc đã quá lâu để còn hiển thị ở các màn "hôm nay" */
export const isResignedAndHidden = (emp: Pick<UserProfile, 'resignationDate'>): boolean =>
  isResignedBeforePeriod(emp, new Date());

/** Nhân viên thuộc bảng lương của kỳ `periodStart` (tài khoản thật + chưa rời trước kỳ đó) */
export const isPayrollEmployee = (
  emp: Pick<UserProfile, 'status' | 'resignationDate'>,
  periodStart: Date
): boolean => isActiveAccount(emp) && !isResignedBeforePeriod(emp, periodStart);

export interface LeaveScreenSelection {
  visible: UserProfile[];
  hiddenResignedCount: number;  // ẩn vì đã nghỉ việc — bật checkbox là thấy lại
  hiddenBlockedCount: number;   // tài khoản khoá / chờ duyệt — ẩn hẳn
}

/**
 * Nguồn sự thật duy nhất cho danh sách nhân viên ở cả hai bảng phép.
 * Trả luôn số đếm để dòng "Đang ẩn N người" không phải lọc lại lần nữa.
 */
export const selectLeaveScreenEmployees = (
  employees: UserProfile[],
  opts: { includeResigned?: boolean } = {}
): LeaveScreenSelection => {
  const includeResigned = !!opts.includeResigned;
  const visible: UserProfile[] = [];
  let hiddenResignedCount = 0;
  let hiddenBlockedCount = 0;

  employees.forEach(emp => {
    // Tài khoản đăng ký chờ duyệt chưa phải nhân viên → ẩn hẳn
    if (emp.status === 'PENDING') {
      hiddenBlockedCount++;
      return;
    }

    // Đã nghỉ việc → theo checkbox, KỂ CẢ khi tài khoản đã bị khoá.
    // Quy trình thực tế là nghỉ việc xong thì khoá tài khoản luôn, mà đây
    // đúng là người cần tra phép tồn lúc thanh lý hợp đồng — ẩn hẳn họ sẽ
    // làm checkbox "Hiện cả NV đã nghỉ việc" trở nên vô dụng.
    if (isResigned(emp)) {
      if (includeResigned) visible.push(emp);
      else hiddenResignedCount++;
      return;
    }

    // Còn đang làm nhưng tài khoản bị khoá → ẩn hẳn
    if (!isActiveAccount(emp)) {
      hiddenBlockedCount++;
      return;
    }

    visible.push(emp);
  });

  return { visible, hiddenResignedCount, hiddenBlockedCount };
};

// === MAP DÒNG BẢNG profiles ===
// Hai hàm map tách bạch, cố ý không dùng chung: hồ sơ đầy đủ có lương, hồ sơ
// danh bạ thì KHÔNG. Để chung một hàm là sẽ có ngày ai đó "cho tiện" map cả
// lương vào danh bạ.

/**
 * Hồ sơ ĐẦY ĐỦ từ bảng `profiles` (Admin đọc mọi người; ai cũng đọc được dòng
 * của chính mình). `fallback` dùng cho lúc đăng nhập: email lấy từ auth,
 * avatar lấy từ user_metadata nếu profile chưa có.
 */
export const mapFullProfileRow = (
  e: any,
  fallback: { email?: string; avatarUrl?: string } = {}
): UserProfile => ({
  id: e.id,
  name: e.name,
  role: e.role,
  avatar: e.avatar || fallback.avatarUrl || '',
  email: fallback.email ?? e.email,
  phone: e.phone ?? null,
  baseSalary: e.base_salary,
  allowance: e.allowance || 0,
  insuranceSalary: e.insurance_salary || 0,
  workDays: e.work_days || '1,2,3,4,5,6',
  contractType: e.contract_type || 'Hợp đồng chính thức',
  contractDate: e.contract_date,
  officialContractDate: e.official_contract_date || null,
  employeeCode: e.employee_code,
  status: e.status,
  dateOfBirth: e.date_of_birth ?? null,
  usedLeaveLegacy: e.used_leave_legacy || 0,
  resignationDate: e.resignation_date || null
});

/**
 * Hồ sơ RÚT GỌN từ view `employee_directory` — KHÔNG có lương, email, SĐT.
 * Lương để undefined chứ KHÔNG đặt 0: số 0 trông như "lương bằng không" và
 * sẽ lừa được mắt người review.
 */
export const mapDirectoryRow = (e: any): UserProfile => ({
  id: e.id,
  name: e.name,
  role: e.role,
  avatar: e.avatar || '',
  status: e.status,
  employeeCode: e.employee_code,
  dateOfBirth: e.date_of_birth ?? null,
  resignationDate: e.resignation_date ?? null,
  isDirectoryOnly: true
});
