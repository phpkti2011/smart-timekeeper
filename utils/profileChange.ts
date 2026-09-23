import { differenceInYears, format, isValid } from 'date-fns';
import {
  ProfileChangeRequest, ProfileChangeSet, ProfileField, ProfileFieldChange,
  RequestStatus, UserProfile, UserRole
} from '../types';
import { formatVNDate, parseRequestDate } from './dateInput';

// === LUẬT ĐỔI THÔNG TIN CÁ NHÂN ===
// Module thuần: không import React/supabase nên chạy được bằng node để kiểm thử.
//
// Nhân viên ĐỀ NGHỊ sửa 4 trường (họ tên, ngày sinh, số điện thoại, ảnh đại
// diện). Đơn chỉ là đề nghị — Admin duyệt thì App mới ghi vào bảng profiles.
// Nội dung đơn nằm ở cột JSONB requests.profile_changes, mỗi trường có đổi là
// một entry {old, new}. Lưu "old" để (1) màn duyệt hiện được "A → B" mà không
// phải tra bảng profiles, (2) hoàn tác được đơn đã duyệt.

export const PROFILE_TYPE_LABEL = 'Đổi thông tin cá nhân';
/** Lý do mặc định khi nhân viên không ghi — để màn duyệt không phải xử lý chuỗi rỗng. */
export const PROFILE_DEFAULT_REASON = 'Cập nhật thông tin cá nhân';
/** Chỉ đơn PENDING chiếm chỗ. Đã duyệt / bị từ chối thì gửi lại được ngay. */
export const PROFILE_OCCUPYING_STATUSES: RequestStatus[] = ['PENDING'];

export const EDITABLE_FIELDS: ProfileField[] = ['name', 'dateOfBirth', 'phone', 'avatar'];

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  name: 'Họ tên',
  dateOfBirth: 'Ngày sinh',
  phone: 'Số điện thoại',
  avatar: 'Ảnh đại diện'
};

/** Tên cột trong bảng profiles của từng trường. */
export const PROFILE_FIELD_COLUMN: Record<ProfileField, string> = {
  name: 'name',
  dateOfBirth: 'date_of_birth',
  phone: 'phone',
  avatar: 'avatar'
};

export const MIN_WORKING_AGE = 15;
export const MAX_AGE = 75;
export const MAX_NAME_LENGTH = 50;

/**
 * URL giả để form validate được TRƯỚC khi ảnh thật được tải lên Storage.
 * Ảnh chỉ tải lên lúc bấm gửi (bấm huỷ thì không để lại file mồ côi), nên
 * trong lúc gõ form chưa có URL thật.
 */
export const AVATAR_PENDING_PLACEHOLDER = 'https://pending.upload/avatar';

// === CHUẨN HOÁ ===

/** Cắt hai đầu, gộp nhiều khoảng trắng thành một. */
export const normalizeName = (raw: string | null | undefined): string =>
  (raw || '').trim().replace(/\s+/g, ' ');

/**
 * Bỏ dấu chấm, gạch, ngoặc, khoảng trắng; đưa +84 / 0084 / 84 về 0.
 * Luôn ghi DB dạng này thì unique index mới có nghĩa — nếu không thì
 * 0912345678 và +84912345678 là hai dòng khác nhau.
 */
export const normalizePhone = (raw: string | null | undefined): string => {
  let s = (raw || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (s.startsWith('0084')) s = '0' + s.slice(4);
  else if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
  return s;
};

/** Chuỗi rỗng / chỉ khoảng trắng → null, để so sánh "chưa có" nhất quán. */
const nz = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s ? s : null;
};

const isoToDate = (iso: string | null | undefined): Date | null => {
  if (!iso || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return isValid(d) ? d : null;
};

// === VALIDATE TỪNG TRƯỜNG (trả câu tiếng Việt, hoặc null nếu hợp lệ) ===

export const validateName = (raw: string): string | null => {
  const n = normalizeName(raw);
  if (!n) return 'Họ tên không được để trống.';
  if (n.split(' ').length < 2) {
    return 'Họ tên phải có ít nhất 2 từ (họ và tên), ví dụ "Nguyễn An". Ô lịch công ty rút gọn tên theo từ cuối nên tên một chữ sẽ hiển thị nhầm người.';
  }
  if (n.length > MAX_NAME_LENGTH) return `Họ tên quá dài (tối đa ${MAX_NAME_LENGTH} ký tự, hiện ${n.length}).`;
  if (!/^[\p{L}\s'.\-]+$/u.test(n)) {
    return 'Họ tên chỉ gồm chữ cái, dấu cách, dấu nháy và gạch nối — không có số hay ký tự đặc biệt.';
  }
  return null;
};

export const validateDateOfBirth = (
  iso: string | null | undefined,
  opts: { today: string; contractDate?: string | null }
): string | null => {
  if (!nz(iso)) return 'Ngày sinh không được để trống.';
  const d = isoToDate(iso);
  if (!d) return 'Ngày sinh không hợp lệ. Nhập theo dạng dd/mm/yyyy, ví dụ 02/03/1995.';
  const today = isoToDate(opts.today);
  if (!today) return null; // không có mốc hôm nay thì không kiểm tuổi
  if (d >= today) return 'Ngày sinh phải ở quá khứ.';
  const age = differenceInYears(today, d);
  if (age < MIN_WORKING_AGE) {
    return `Ngày sinh không hợp lý: theo ngày này bạn mới ${age} tuổi. Người lao động phải từ ${MIN_WORKING_AGE} tuổi trở lên.`;
  }
  if (age > MAX_AGE) return `Ngày sinh không hợp lý: theo ngày này bạn đã ${age} tuổi. Kiểm tra lại năm sinh.`;
  const c = isoToDate(opts.contractDate ? String(opts.contractDate) : null);
  if (c && d >= c) {
    return `Ngày sinh (${format(d, 'dd/MM/yyyy')}) phải trước ngày vào làm (${format(c, 'dd/MM/yyyy')}). Một trong hai đang sai — liên hệ Admin nếu ngày vào làm không đúng.`;
  }
  return null;
};

/** Rỗng là hợp lệ (nghĩa là xoá số). */
export const validatePhone = (raw: string | null | undefined): string | null => {
  const p = normalizePhone(raw);
  if (!p) return null;
  if (!/^\d+$/.test(p)) return 'Số điện thoại chỉ gồm chữ số. Bỏ chữ và ký tự lạ giúp mình.';
  if (!p.startsWith('0')) return 'Số điện thoại phải bắt đầu bằng 0 (hoặc +84). Ví dụ: 0912345678.';
  // Di động 10 số; số bàn 02x có 11 số
  const okLength = p.length === 10 || (p.length === 11 && p.startsWith('02'));
  if (!okLength) return `Số điện thoại phải gồm đúng 10 chữ số, hiện ${p.length} chữ số. Ví dụ: 0912345678.`;
  return null;
};

/**
 * Đầu số di động Việt Nam (Viettel 03x/086/096-098, Vinaphone 081-085/088/091/094,
 * Mobifone 070/076-079/089/090/093, Vietnamobile 052/056/058/092, Gmobile 059/099).
 * Chỉ dùng để CẢNH BÁO, không chặn: đầu số thay đổi theo giấy phép Bộ TT&TT,
 * làm luật cứng sẽ chặn nhầm nhân viên mới vài năm nữa.
 */
const VN_MOBILE_PREFIX_RE = /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9\d)/;

export const warnPhonePrefix = (raw: string | null | undefined): string | null => {
  const p = normalizePhone(raw);
  if (!p || p.startsWith('02')) return null;
  if (VN_MOBILE_PREFIX_RE.test(p)) return null;
  return `Đầu số ${p.slice(0, 3)}x không nằm trong danh sách đầu số di động Việt Nam. Kiểm tra lại, hoặc cứ gửi nếu đây là số bàn.`;
};

export const validateAvatarUrl = (url: string | null | undefined): string | null => {
  if (!nz(url) || !/^https:\/\//i.test(url!)) return 'Đường dẫn ảnh không hợp lệ.';
  return null;
};

// === DIFF ===

/** Giá trị người dùng đang gõ trong form. Chuỗi rỗng = xoá / chưa có. */
export interface ProfileDraft {
  name: string;
  dateOfBirth: string; // 'yyyy-MM-dd' hoặc ''
  phone: string;
  avatar: string;      // URL hiện tại, hoặc AVATAR_PENDING_PLACEHOLDER khi đã chọn ảnh mới
  avatarPath?: string; // đường dẫn object trên Storage sau khi tải lên
}

type Current = Pick<UserProfile, 'name' | 'dateOfBirth' | 'phone' | 'avatar'>;

/** Giá trị HIỆN TẠI của một trường, đã chuẩn hoá về cùng dạng với đơn. */
export const currentFieldValue = (cur: Current, f: ProfileField): string | null => {
  switch (f) {
    case 'name': return nz(normalizeName(cur.name));
    case 'dateOfBirth': return nz(cur.dateOfBirth ? String(cur.dateOfBirth).slice(0, 10) : null);
    case 'phone': return nz(normalizePhone(cur.phone));
    case 'avatar': return nz(cur.avatar);
  }
};

/** Chỉ giữ trường THỰC SỰ đổi. Đổi mỗi khoảng trắng trong tên không phải thay đổi. */
export const buildProfileChanges = (current: Current, draft: ProfileDraft): ProfileChangeSet => {
  const c: ProfileChangeSet = {};

  const curName = currentFieldValue(current, 'name');
  const newName = nz(normalizeName(draft.name));
  if (newName !== curName) c.name = { old: nz(current.name), new: newName };

  const curDob = currentFieldValue(current, 'dateOfBirth');
  const newDob = nz(draft.dateOfBirth ? draft.dateOfBirth.slice(0, 10) : null);
  if (newDob !== curDob) c.dateOfBirth = { old: curDob, new: newDob };

  const curPhone = currentFieldValue(current, 'phone');
  const newPhone = nz(normalizePhone(draft.phone));
  if (newPhone !== curPhone) c.phone = { old: curPhone, new: newPhone };

  // Ảnh: chỉ ghi nhận khi CÓ ảnh mới. Không có chuyện "xoá ảnh".
  const curAvatar = currentFieldValue(current, 'avatar');
  const newAvatar = nz(draft.avatar);
  if (newAvatar && newAvatar !== curAvatar) {
    c.avatar = { old: curAvatar, new: newAvatar, ...(draft.avatarPath ? { newPath: draft.avatarPath } : {}) };
  }
  return c;
};

export const changedFields = (c: ProfileChangeSet): ProfileField[] =>
  EDITABLE_FIELDS.filter(f => !!c[f]);

const showValue = (f: ProfileField, v: string | null, side: 'old' | 'new'): string => {
  if (f === 'avatar') return v ? (side === 'old' ? 'ảnh cũ' : 'ảnh mới') : 'Chưa có';
  if (v === null) return 'Chưa có';
  if (f === 'dateOfBirth') return formatVNDate(v) || v;
  return v;
};

/** ["Họ tên: A → B", "Ngày sinh: 02/03/1995 → 20/04/1995", …] */
export const describeProfileChanges = (c: ProfileChangeSet): string[] =>
  changedFields(c).map(f => {
    const ch = c[f] as ProfileFieldChange;
    return `${PROFILE_FIELD_LABEL[f]}: ${showValue(f, ch.old, 'old')} → ${showValue(f, ch.new, 'new')}`;
  });

/** "Họ tên, Ngày sinh" */
export const describeProfileChangesShort = (c: ProfileChangeSet): string =>
  changedFields(c).map(f => PROFILE_FIELD_LABEL[f]).join(', ');

/** Đổi ngày sinh làm đổi thưởng sinh nhật của các tháng chưa chốt lương. */
export const affectsBirthdayBonus = (c: ProfileChangeSet): boolean => !!c.dateOfBirth;

// === CHỐNG TRÙNG ===

export const findPendingProfileRequest = (
  userId: string,
  existing: ProfileChangeRequest[],
  opts: { excludeId?: string } = {}
): ProfileChangeRequest | null =>
  existing.find(r =>
    r.userId === userId &&
    r.id !== opts.excludeId &&
    PROFILE_OCCUPYING_STATUSES.includes(r.status)
  ) || null;

// === VALIDATE TOÀN ĐƠN ===

export interface ProfileValidationInput {
  userId: string;
  changes: ProfileChangeSet;
  /** Hôm nay 'yyyy-MM-dd', truyền vào để test được */
  today: string;
  /** Ngày vào làm của nhân viên, để chặn ngày sinh sau ngày vào làm */
  contractDate?: string | null;
  /** Toàn bộ đơn PROFILE (mọi nhân viên) — hàm tự lọc theo userId */
  existingRequests: ProfileChangeRequest[];
  /** Khi duyệt lại chính đơn này thì bỏ nó ra khỏi kiểm tra trùng */
  excludeId?: string;
}

/** Trả về câu thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export const validateProfileRequest = (input: ProfileValidationInput): string | null => {
  const { userId, changes, today, contractDate, existingRequests, excludeId } = input;

  if (changedFields(changes).length === 0) {
    return 'Chưa có thay đổi nào. Hãy sửa ít nhất một trong: họ tên, ngày sinh, số điện thoại, ảnh đại diện.';
  }

  const pending = findPendingProfileRequest(userId, existingRequests, { excludeId });
  if (pending) {
    const luc = pending.createdAt ? format(pending.createdAt, 'dd/MM HH:mm') : format(pending.date, 'dd/MM');
    return `Bạn đang có một đề nghị sửa thông tin chờ duyệt (gửi lúc ${luc}, nội dung: ${describeProfileChangesShort(pending.changes) || 'trống'}). Vui lòng chờ Admin xử lý, hoặc huỷ đơn cũ rồi gửi lại.`;
  }

  if (changes.name) {
    const e = validateName(changes.name.new || '');
    if (e) return e;
  }
  if (changes.dateOfBirth) {
    const e = validateDateOfBirth(changes.dateOfBirth.new, { today, contractDate });
    if (e) return e;
  }
  if (changes.phone && changes.phone.new !== null) {
    const e = validatePhone(changes.phone.new);
    if (e) return e;
  }
  if (changes.avatar) {
    const e = validateAvatarUrl(changes.avatar.new);
    if (e) return e;
  }
  return null;
};

// === ÁP DỤNG / HOÀN TÁC (thuần: nhận hồ sơ, trả patch) ===

export interface ProfilePatchResult {
  /** Trường cần ghi vào profiles (khoá camelCase như UserProfile) */
  patch: Partial<UserProfile>;
  /** Trường bị bỏ qua, kèm lý do ở nơi gọi */
  skipped: ProfileField[];
}

/**
 * Sinh patch để ÁP DỤNG đơn. Trường mà giá trị hiện tại đã bằng giá trị mới
 * thì bỏ qua → duyệt lại lần hai là vô hại (idempotent). Đây là lý do khi
 * "ghi profiles xong nhưng đóng đơn hỏng" chỉ cần bấm Duyệt lại.
 */
export const applyProfileChanges = (current: Current, changes: ProfileChangeSet): ProfilePatchResult => {
  const patch: Partial<UserProfile> = {};
  const skipped: ProfileField[] = [];
  changedFields(changes).forEach(f => {
    const ch = changes[f] as ProfileFieldChange;
    if (currentFieldValue(current, f) === ch.new) { skipped.push(f); return; }
    (patch as any)[f] = f === 'avatar' ? (ch.new ?? '') : ch.new;
  });
  return { patch, skipped };
};

/**
 * Sinh patch để HOÀN TÁC đơn đã duyệt: chỉ trả lại trường mà giá trị hiện tại
 * VẪN đúng bằng giá trị mới của đơn. Ai đó đã sửa tiếp sau khi duyệt thì bỏ
 * qua trường đó (nơi gọi liệt kê trong confirm).
 */
export const revertProfileChanges = (current: Current, changes: ProfileChangeSet): ProfilePatchResult => {
  const patch: Partial<UserProfile> = {};
  const skipped: ProfileField[] = [];
  changedFields(changes).forEach(f => {
    const ch = changes[f] as ProfileFieldChange;
    if (currentFieldValue(current, f) !== ch.new) { skipped.push(f); return; }
    (patch as any)[f] = f === 'avatar' ? (ch.old ?? '') : ch.old;
  });
  return { patch, skipped };
};

/** Đổi patch camelCase → cột snake_case của bảng profiles. */
export const patchToColumns = (patch: Partial<UserProfile>): Record<string, any> => {
  const out: Record<string, any> = {};
  (Object.keys(patch) as ProfileField[]).forEach(f => {
    const col = PROFILE_FIELD_COLUMN[f];
    if (col) out[col] = (patch as any)[f];
  });
  return out;
};

// === MAP DÒNG DB ===

type ProfileLike = { id: string; name?: string; avatar?: string; role?: UserRole };

const safeParse = (s: string): any => {
  try { return JSON.parse(s); } catch { return {}; }
};

/**
 * Map 1 dòng bảng `requests` (type='PROFILE') sang ProfileChangeRequest.
 * PostgREST trả JSONB dạng object; phòng thủ cả trường hợp về dạng chuỗi.
 */
export const mapProfileRow = (r: any, profiles: ProfileLike[] = []): ProfileChangeRequest => {
  const user = profiles.find(p => p.id === r.user_id);
  const raw = typeof r.profile_changes === 'string' ? safeParse(r.profile_changes) : (r.profile_changes ?? {});
  const changes: ProfileChangeSet = {};
  EDITABLE_FIELDS.forEach(f => {
    const v = raw && typeof raw === 'object' ? raw[f] : undefined;
    if (v && typeof v === 'object') {
      changes[f] = { old: v.old ?? null, new: v.new ?? null, ...(v.newPath ? { newPath: String(v.newPath) } : {}) };
    }
  });
  return {
    userId: r.user_id,
    userName: user?.name || 'Unknown',
    userAvatar: user?.avatar || '',
    userRole: (user?.role || 'Employee') as UserRole,
    createdAt: r.created_at ? new Date(r.created_at) : undefined,
    processedAt: r.processed_at ? new Date(r.processed_at) : undefined,
    id: String(r.id),
    date: r.date ? parseRequestDate(r.date) : (r.created_at ? new Date(r.created_at) : new Date()),
    changes,
    reason: r.reason || PROFILE_DEFAULT_REASON,
    status: r.status,
    rejectionReason: r.rejection_reason ?? null
  };
};

/** Payload insert. `today` là 'yyyy-MM-dd' để cột date sắp xếp/lọc tháng được. */
export const toProfileRow = (
  userId: string,
  changes: ProfileChangeSet,
  reason: string,
  status: RequestStatus,
  today: string
) => ({
  user_id: userId,
  type: 'PROFILE',
  date: today,
  profile_changes: changes,
  reason: reason?.trim() || PROFILE_DEFAULT_REASON,
  status
});

// === PHỤ TRỢ THUẦN CHO ẢNH ===

/**
 * Toán cắt "cover" hình vuông, căn giữa. Không phóng to ảnh nhỏ hơn đích.
 * Trả toạ độ nguồn (sx, sy, sw, sh) và kích thước đích (dw, dh) cho drawImage.
 */
export const computeCoverCrop = (w: number, h: number, size: number) => {
  const side = Math.max(1, Math.min(w, h));
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  const dw = Math.min(size, side);
  return { sx, sy, sw: side, sh: side, dw, dh: dw };
};
