import { computeCoverCrop } from './profileChange';

// === NÉN ẢNH ĐẠI DIỆN Ở CLIENT ===
// Chạm DOM (canvas, createImageBitmap) nên KHÔNG đưa vào scripts/pure.test.ts.
// Phần toán cắt ảnh (computeCoverCrop) nằm ở utils/profileChange.ts để test được.
//
// Ảnh chụp điện thoại 5 MB → sau nén ~60 KB (512×512, JPEG 0.82). Avatar hiển
// thị to nhất là 96px, màn 3x = 288px, nên 512 dư sức mà vẫn nhẹ.

export const AVATAR_SIZE = 512;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Chặn TRƯỚC khi decode: ảnh 50 MP decode ra ~200 MB RAM, đủ làm sập tab trên
 * điện thoại đời thấp. Kiểm type/size là đủ rẻ để chạy trước.
 */
export const validateImageFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Chỉ nhận ảnh JPG, PNG hoặc WEBP.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Ảnh quá lớn (${(file.size / 1048576).toFixed(1)} MB, tối đa 10 MB). Chụp lại ở độ phân giải thấp hơn.`;
  }
  return null;
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Không nén được ảnh.'))), 'image/jpeg', quality);
  });

/**
 * Cắt vuông căn giữa, thu về 512×512, xuất JPEG. Kể cả nguồn PNG cũng ra JPEG:
 * ảnh chân dung JPEG nhỏ hơn PNG 5–10 lần, mất kênh alpha không sao vì avatar
 * tròn đã bị cắt.
 */
export const compressAvatar = async (file: File): Promise<Blob> => {
  const err = validateImageFile(file);
  if (err) throw new Error(err);

  // 'from-image' đọc EXIF: ảnh chụp dọc bằng iPhone không bị nằm ngang
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const crop = computeCoverCrop(bitmap.width, bitmap.height, AVATAR_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = crop.dw;
    canvas.height = crop.dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);

    // 0.82 là ngưỡng kinh điển: ~40–80 KB ở 512px, mắt thường không phân biệt
    // được với 0.95. Quá 300 KB (ảnh nhiều chi tiết) thì hạ dần.
    for (const quality of [0.82, 0.70, 0.60]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= 300 * 1024 || quality === 0.60) return blob;
    }
    throw new Error('Không nén được ảnh.');
  } finally {
    bitmap.close();
  }
};
