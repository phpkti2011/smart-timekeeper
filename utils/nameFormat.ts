// Rút gọn tên người cho những chỗ chật như ô lịch.
// Tên Việt xếp Họ → Đệm → Tên, nên phần gọi tên nằm ở CUỐI chuỗi.

/** Cắt khoảng trắng thừa và tách thành các âm tiết. */
const words = (fullName: string): string[] =>
  (fullName || '').trim().split(/\s+/).filter(Boolean);

/** 'Phạm Hồng Phúc' → 'Phúc'. Chuỗi rỗng → ''. */
export const shortName = (fullName: string): string => {
  const w = words(fullName);
  return w.length === 0 ? '' : w[w.length - 1];
};

/** Lấy `n` âm tiết cuối: 'Phạm Hồng Phúc' với n=2 → 'Hồng Phúc'. */
export const lastWords = (fullName: string, n: number): string => {
  const w = words(fullName);
  return w.slice(Math.max(0, w.length - n)).join(' ');
};

/**
 * Rút gọn cả danh sách, tự nới thêm âm tiết khi bị TRÙNG.
 *
 * Hai người "Nguyễn Văn Phúc" và "Phạm Hồng Phúc" mà cùng hiện "Phúc" thì ô lịch
 * nói sai người — tệ hơn là tên dài. Nên khi trùng thì cả nhóm đó lùi ra một âm
 * tiết ("Văn Phúc" / "Hồng Phúc"), lặp tới khi phân biệt được hoặc hết chữ.
 *
 * Trả Map từ tên đầy đủ → tên rút gọn. Tên đầy đủ trùng nhau hoàn toàn thì đành
 * để nguyên, không có gì để phân biệt thêm.
 */
export const buildShortNameMap = (fullNames: string[]): Map<string, string> => {
  const unique = Array.from(new Set(fullNames.filter(Boolean)));
  const result = new Map<string, string>();
  const maxWords = unique.reduce((m, n) => Math.max(m, words(n).length), 1);

  // Mỗi tên bắt đầu ở 1 âm tiết, tăng dần cho tới khi không còn đụng ai.
  const depth = new Map<string, number>(unique.map(n => [n, 1]));

  for (let round = 0; round < maxWords; round++) {
    const byShort = new Map<string, string[]>();
    unique.forEach(n => {
      const s = lastWords(n, depth.get(n)!);
      if (!byShort.has(s)) byShort.set(s, []);
      byShort.get(s)!.push(n);
    });

    let coNoiThem = false;
    byShort.forEach((nhom) => {
      if (nhom.length < 2) return;
      nhom.forEach(n => {
        const d = depth.get(n)!;
        // Đã dùng hết chữ thì không nới được nữa, tránh lặp vô hạn.
        if (d < words(n).length) {
          depth.set(n, d + 1);
          coNoiThem = true;
        }
      });
    });

    if (!coNoiThem) break;
  }

  unique.forEach(n => result.set(n, lastWords(n, depth.get(n)!)));
  return result;
};
