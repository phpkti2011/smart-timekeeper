import { format, isValid, parse } from 'date-fns';

// Nhập/hiển thị ngày theo kiểu Việt Nam (dd/MM/yyyy) cho các ô nhập tay.
// Dùng chung cho form nhân viên và bảng nhập liệu hàng loạt để hai nơi không
// trôi dạt khỏi nhau.

/**
 * Excel lưu ngày dưới dạng số ngày kể từ 30/12/1899. Dán một cột ngày từ Excel
 * rất hay ra dạng số này thay vì chuỗi. Mốc 25569 = số ngày tới 01/01/1970.
 */
const fromExcelSerial = (serial: number): Date | null => {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 80000) return null;
  // Nhân theo UTC rồi quy về nửa đêm địa phương để không lệch múi giờ
  const utc = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
};

/**
 * Đọc một ô ngày do người dùng gõ hoặc dán vào.
 * Chấp nhận: '25/08/2026', '5/8/2026', '2026-08-25', số serial Excel.
 * Trả về chuẩn ISO 'yyyy-MM-dd', hoặc null nếu không đọc được.
 */
export const parseVNDate = (raw: string | number | null | undefined): string | null => {
  if (raw === null || raw === undefined) return null;

  const text = String(raw).trim();
  if (!text) return null;

  // Số thuần → serial Excel
  if (/^\d+(\.\d+)?$/.test(text)) {
    const fromSerial = fromExcelSerial(Number(text));
    return fromSerial && isValid(fromSerial) ? format(fromSerial, 'yyyy-MM-dd') : null;
  }

  // Cho phép cả dấu - và . làm phân cách ngày
  const normalized = text.replace(/[.\-]/g, '/');

  // ISO sẵn: yyyy/MM/dd
  const iso = parse(normalized, 'yyyy/MM/dd', new Date());
  if (isValid(iso) && /^\d{4}\//.test(normalized)) return format(iso, 'yyyy-MM-dd');

  // Kiểu Việt Nam, chấp nhận cả 1 chữ số: d/M/yyyy
  const vn = parse(normalized, 'd/M/yyyy', new Date());
  if (isValid(vn)) return format(vn, 'yyyy-MM-dd');

  return null;
};

/** 'yyyy-MM-dd' → '25/08/2026'. Rỗng/không hợp lệ → chuỗi rỗng. */
export const formatVNDate = (iso?: string | null): string => {
  if (!iso) return '';
  // Chuỗi ngày thuần bị JS hiểu là UTC → lệch sang ngày hôm trước ở múi giờ âm
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
};

/**
 * Chuẩn hoá cột `date` của bảng requests về NỬA ĐÊM GIỜ ĐỊA PHƯƠNG.
 *
 * Bảng chứa lẫn hai dạng: chuỗi ngày 'yyyy-MM-dd' (đơn Trễ và đơn tăng ca khai
 * theo khung giờ) và chuỗi ISO đầy đủ (đơn tăng ca kiểu cũ). `new Date('2026-09-17')`
 * cho nửa đêm UTC, tức 07:00 ở giờ Việt Nam — đúng ngày ở UTC+7 nhưng LÙI MỘT NGÀY
 * ở mọi múi giờ âm. Đơn tăng ca quyết định ngày nào được trả công nên không để hở.
 */
export const parseRequestDate = (raw: string): Date => {
  if (typeof raw === 'string' && raw.length === 10) return new Date(`${raw}T00:00:00`);
  const d = new Date(raw);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
