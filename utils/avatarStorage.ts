import { supabase } from './supabaseClient';

// === ẢNH ĐẠI DIỆN TRÊN SUPABASE STORAGE ===
// Bucket `avatars` (public). Thư mục cấp 1 là auth.uid() để policy
// `(storage.foldername(name))[1] = auth.uid()::text` khớp. Xem setup_avatar_storage.sql.
//
// Vòng đời:
//   - NV chọn ảnh → CHƯA tải lên. Chỉ tải khi bấm gửi đơn (bấm huỷ thì không để lại rác).
//   - Tải lên `{uid}/pending-{ts}.jpg`, đơn lưu cả URL lẫn path.
//   - Admin duyệt → ghi URL vào profiles.avatar, file nằm nguyên; dọn pending khác.
//   - Từ chối / NV huỷ → xoá đúng file pending đó.
//   - KHÔNG ghi đè đường dẫn cố định: nếu ảnh chờ duyệt ghi đè file đang dùng thì
//     profiles.avatar vẫn trỏ vào URL đó → ảnh đổi ngay khi chưa duyệt.

export const AVATAR_BUCKET = 'avatars';

const bucket = () => supabase.storage.from(AVATAR_BUCKET);

const uploadError = (message: string): Error => {
  const thieuBucket = /bucket not found/i.test(message);
  return new Error(
    thieuBucket
      ? 'Chưa có kho ảnh trên Supabase. Cần chạy setup_avatar_storage.sql trước.'
      : `Không tải được ảnh lên. Kiểm tra kết nối mạng rồi thử lại. (${message})`
  );
};

/** Đường dẫn của mọi file pending-* trong thư mục của một người. */
const listPendingPaths = async (userId: string): Promise<string[]> => {
  const { data } = await bucket().list(userId, { limit: 100 });
  return (data || [])
    .filter(f => f.name.startsWith('pending-'))
    .map(f => `${userId}/${f.name}`);
};

/** Xoá mọi ảnh pending của một người, trừ `keepPath` nếu có. Lỗi chỉ ghi log. */
export const removePendingAvatars = async (userId: string, keepPath?: string): Promise<void> => {
  try {
    const paths = (await listPendingPaths(userId)).filter(p => p !== keepPath);
    if (paths.length) await bucket().remove(paths);
  } catch (e) {
    console.warn('[AVATAR] Không dọn được ảnh pending:', e);
  }
};

/** Xoá một file theo đường dẫn. Lỗi chỉ ghi log — đơn quan trọng hơn 60 KB rác. */
export const removeAvatarPath = async (path: string | undefined | null): Promise<void> => {
  if (!path) return;
  try {
    await bucket().remove([path]);
  } catch (e) {
    console.warn('[AVATAR] Không xoá được ảnh:', path, e);
  }
};

/** Nhân viên tải ảnh CHỜ DUYỆT. Mỗi người tối đa một đơn chờ nên dọn pending cũ trước. */
export const uploadPendingAvatar = async (userId: string, blob: Blob): Promise<{ url: string; path: string }> => {
  await removePendingAvatars(userId);
  const path = `${userId}/pending-${Date.now()}.jpg`;
  const { error } = await bucket().upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw uploadError(error.message);
  const { data } = bucket().getPublicUrl(path);
  return { url: data.publicUrl, path };
};

/** Admin đổi ảnh cho nhân viên: ghi thẳng, không qua đơn. */
export const uploadFinalAvatar = async (userId: string, blob: Blob): Promise<{ url: string; path: string }> => {
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await bucket().upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw uploadError(error.message);
  const { data } = bucket().getPublicUrl(path);
  return { url: data.publicUrl, path };
};
