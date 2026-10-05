// Nhắc nhân viên xác nhận lương — phần THUẦN (không React/supabase) để test được.
// Phần gửi thật nằm ở AdminPayrollManagement.tsx + utils/pushNotifications.ts.
import { format, startOfMonth } from 'date-fns';

/**
 * Kết quả một lần gọi /api/send-push-notification.
 * `total` vắng khi người đó chưa đăng ký thiết bị nào (API trả { sent: 0, reason }).
 */
export interface PushResult {
  sent: number;
  total?: number;
}

export type ReminderOutcome = 'OK' | 'NO_DEVICE' | 'FAILED';

/**
 * Vì sao KHÔNG cho nhắc là một chuỗi tiếng Việt (null = được nhắc).
 *
 * Nhân viên chỉ thấy nút "Xác nhận lương" khi `selectedMonth < đầu tháng hôm nay`
 * (SalaryView.isPastMonth) và chưa xác nhận. Nhắc tháng hiện tại là đẩy người ta tới
 * một màn hình không có gì để bấm; nhắc tháng đã chốt thì không còn tác dụng.
 */
export function reminderBlockReason(
  selectedMonth: Date,
  now: Date,
  isLocked: boolean,
  pendingCount: number
): string | null {
  if (isLocked) return 'Tháng này đã chốt lương, không cần nhắc nữa.';
  if (startOfMonth(selectedMonth) >= startOfMonth(now)) {
    return 'Chỉ nhắc được tháng đã qua: nhân viên chỉ bấm "Xác nhận lương" được khi tháng đã kết thúc.';
  }
  if (pendingCount <= 0) return 'Mọi nhân viên đã xác nhận.';
  return null;
}

/**
 * Nội dung thông báo. Ghi RÕ tháng và đường đi vì bấm vào thông báo chỉ mở app ở
 * trang chủ, tháng mặc định là tháng hiện tại (App.tsx chưa đọc URL để chọn tab/tháng)
 * — nhân viên phải tự chọn đúng tháng, nên phải nói cho họ biết tháng nào.
 */
export function buildSalaryReminder(month: Date): { title: string; body: string } {
  const m = format(month, 'MM/yyyy');
  return {
    title: `💰 Xác nhận lương tháng ${m}`,
    body: `Bảng lương tháng ${m} đã sẵn sàng. Vào tab Lương → chọn tháng ${m} → bấm "Xác nhận lương".`
  };
}

/**
 * Phân loại để Admin biết phải làm gì tiếp:
 * - OK: có ít nhất một thiết bị nhận được.
 * - NO_DEVICE: người đó chưa bật thông báo → Admin phải nhắc trực tiếp.
 * - FAILED: gọi API lỗi (sai khoá, mạng, máy chủ) hoặc có thiết bị mà đều không gửi được.
 */
export function classifyPushResult(r: PushResult | null): ReminderOutcome {
  if (!r) return 'FAILED';
  if (r.sent > 0) return 'OK';
  return r.total ? 'FAILED' : 'NO_DEVICE';
}

export interface ReminderLine {
  name: string;
  outcome: ReminderOutcome;
}

/** Câu tổng kết cho Admin. allOk = mọi người đều nhận được (dùng để chọn toast hay hộp thoại). */
export function summarizeReminder(
  month: Date,
  lines: ReminderLine[]
): { allOk: boolean; message: string } {
  const m = format(month, 'MM/yyyy');
  const ok = lines.filter(l => l.outcome === 'OK');
  const noDevice = lines.filter(l => l.outcome === 'NO_DEVICE');
  const failed = lines.filter(l => l.outcome === 'FAILED');
  const allOk = ok.length === lines.length;

  if (allOk) {
    return { allOk, message: `Đã gửi nhắc xác nhận lương tháng ${m} tới ${ok.length} người.` };
  }

  const parts = [`Đã gửi nhắc tháng ${m} tới ${ok.length}/${lines.length} người.`];
  if (noDevice.length > 0) {
    parts.push(
      `Chưa bật thông báo (${noDevice.length}) — hãy nhắc trực tiếp:\n` +
      noDevice.map(l => `  • ${l.name}`).join('\n')
    );
  }
  if (failed.length > 0) {
    parts.push(
      `Gửi lỗi (${failed.length}) — kiểm tra khoá API/mạng rồi thử lại:\n` +
      failed.map(l => `  • ${l.name}`).join('\n')
    );
  }
  return { allOk, message: parts.join('\n\n') };
}
