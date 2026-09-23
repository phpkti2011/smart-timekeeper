# 📋 TÀI LIỆU QUY CÁCH, LOGIC & NGUYÊN TẮC PHẦN MỀM CHẤM CÔNG P&D

> **Phiên bản:** 4.2 | **Cập nhật:** 23/09/2026  
> **Công nghệ:** React + TypeScript + Vite + Supabase (PostgreSQL) + Gemini AI  
> **Tác giả:** Phạm Hồng Phúc

---

## MỤC LỤC

1. [Kiến trúc tổng quan](#1-kiến-trúc-tổng-quan)
2. [Xác thực & Phân quyền](#2-xác-thực--phân-quyền)
3. [Quy tắc chấm công](#3-quy-tắc-chấm-công)
4. [Quy tắc tăng ca (OT)](#4-quy-tắc-tăng-ca-ot)
5. [Quy tắc đi trễ](#5-quy-tắc-đi-trễ)
6. [Nghỉ phép](#6-nghỉ-phép)
   - [6b. Đổi ngày nghỉ hàng tuần](#6b-đổi-ngày-nghỉ-hàng-tuần)
   - [6c. Đổi thông tin cá nhân](#6c-đổi-thông-tin-cá-nhân)
7. [Ngày lễ](#7-ngày-lễ)
8. [Tính lương](#8-tính-lương)
9. [Thưởng / Phạt](#9-thưởng--phạt)
10. [Ứng lương](#10-ứng-lương)
11. [Admin Override (Điều chỉnh thủ công)](#11-admin-override)
12. [Chốt bảng lương (Payroll Lock)](#12-chốt-bảng-lương)
13. [Thay đổi lương theo lịch sử](#13-thay-đổi-lương-theo-lịch-sử)
14. [AI Assistant](#14-ai-assistant)
15. [Realtime & Thông báo](#15-realtime--thông-báo)
16. [Xác minh vị trí (GPS/IP)](#16-xác-minh-vị-trí)
17. [Cấu trúc dữ liệu (Database)](#17-cấu-trúc-dữ-liệu)
18. [Vai trò nhân viên](#18-vai-trò-nhân-viên)
19. [Backup & Import](#19-backup--import)

---

## 1. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────┐
│              Frontend (React + Vite)         │
│  App.tsx (Main) → 29 Components              │
│  Utils: attendanceCalculator, salaryCalc...  │
├─────────────────────────────────────────────┤
│              Supabase (Backend)              │
│  Auth | PostgreSQL | Realtime | Storage      │
├─────────────────────────────────────────────┤
│              Gemini AI (Optional)            │
│  Báo cáo & Chatbot thông minh               │
└─────────────────────────────────────────────┘
```

### Danh sách bảng DB chính:
| Bảng | Mô tả |
|------|-------|
| `profiles` | Thông tin nhân viên |
| `attendance_logs` | Log chấm công |
| `attendance_overrides` | Điều chỉnh công thủ công |
| `requests` | Đơn OT / Trễ / Nghỉ phép / Ứng lương / Đổi ngày nghỉ (`SWAP`) / Đổi thông tin cá nhân (`PROFILE`) |
| `bonuses` | Thưởng / Phạt |
| `holidays` | Ngày lễ |
| `salary_changes` | Lịch sử thay đổi lương |
| `payroll_periods` | Bảng lương đã chốt |
| `settings` | Cấu hình GPS/IP công ty |
| `employee_directory` | **VIEW** danh bạ rút gọn (8 cột: id, tên, ảnh, chức vụ, trạng thái, mã NV, ngày sinh, ngày nghỉ việc — **không** lương/email/SĐT). Nhân viên thường đọc đồng nghiệp qua đây. Xem mục 2. |
| Storage `avatars` | Bucket **công khai** chứa ảnh đại diện: `{uid}/pending-{ts}.jpg` (chờ duyệt) và `{uid}/{ts}.jpg` (đã duyệt / Admin đổi). Xem mục 6c. |

---

## 2. Xác thực & Phân quyền

### Đăng ký
- Sử dụng **Supabase Auth** (email + password).
- Tài khoản mới có trạng thái mặc định: **`PENDING`** → Admin phải duyệt thành **`ACTIVE`**.
- Yêu cầu **xác thực email** trước khi đăng nhập.
- Avatar tự động tạo từ tên: `ui-avatars.com`.

### Đăng nhập
- Hỗ trợ **"Ghi nhớ tài khoản"** (lưu email/password vào `localStorage`).
- Sau khi đăng nhập → fetch profile từ bảng `profiles`.

### Trạng thái tài khoản (`UserStatus`)
| Trạng thái | Mô tả |
|------------|-------|
| `ACTIVE` | Được phép sử dụng hệ thống |
| `PENDING` | Chờ Admin duyệt |
| `LOCKED` | Bị khóa |

### Phân quyền
- **Admin**: Toàn quyền (duyệt đơn, quản lý nhân sự, cấu hình, bypass GPS, chốt lương).
- **Nhân viên thường**: Chỉ xem/chấm công/gửi đơn của chính mình. Xem và **đề nghị sửa**
  hồ sơ cá nhân (mục 6c); mọi thay đổi phải Admin duyệt.
- **Quản Lý Sản Xuất**: về dữ liệu giống nhân viên thường — **không** xem được lương của ai
  (họ chỉ cần biết ai nghỉ, thông tin đó nằm ở bảng đơn từ).

### Ai đọc được gì (RLS — từ 4.2, cần chạy `restrict_profile_salary_access.sql`)
Trước 4.2 mọi nhân viên đăng nhập đều tải về `profiles.select('*')` của cả công ty, tức là
đọc được lương cơ bản, lương BHXH của mọi người bằng DevTools. Từ 4.2:

| Dữ liệu | Chủ hồ sơ | Admin | Người khác (đã đăng nhập) |
|---|---|---|---|
| `profiles` đầy đủ (lương, phụ cấp, lương BHXH, email, SĐT) | ✅ | ✅ | ❌ |
| `employee_directory` (VIEW 8 cột, không lương/email/SĐT) | ✅ | ✅ | ✅ |
| `salary_changes`, `bonuses` | ✅ | ✅ | ❌ |
| Đơn ứng lương (`requests.type = 'ADVANCE'`) | ✅ | ✅ | ❌ |
| Đơn nghỉ / OT / trễ / đổi ngày nghỉ / đổi thông tin | ✅ | ✅ | ✅ (lịch công ty cần) |
| Ghi `profiles` (UPDATE) | ❌ | ✅ | ❌ |

- Policy dùng hàm `public.is_admin()` (`SECURITY DEFINER`) thay vì SELECT `profiles` trực
  tiếp: policy đặt trên `profiles` mà tự đọc `profiles` sẽ gây lỗi `42P17 infinite
  recursion` và khoá cứng app.
- VIEW `employee_directory` **cố ý không** đặt `security_invoker = true` (view phải bỏ qua
  RLS của bảng gốc). Supabase Advisor sẽ cảnh báo `security_definer_view` — **đừng "sửa cho
  hết warning"**, làm vậy danh bạ trống với mọi nhân viên và Admin ngừng nhận thông báo.
- Code chạy được với **cả hai** trạng thái DB (trước và sau khi chạy SQL): Admin đọc
  `profiles`; nhân viên đọc `employee_directory`, view chưa có thì lùi về `profiles` kèm
  `console.warn`. Hồ sơ danh bạ (`mapDirectoryRow`) gắn cờ `isDirectoryOnly`, lương để
  `undefined` (không phải 0) và **không bao giờ** đưa vào `calculateMonthlySalary`.
  `currentUser` luôn nạp bằng `mapFullProfileRow` từ dòng `profiles` của chính mình
  (`refreshCurrentUser`), không bao giờ spread từ mảng `employees`.
- Thông báo đẩy "có đơn mới" gửi cho Admin lấy danh sách Admin từ `employee_directory`
  (nhân viên thường không còn đọc được `profiles` người khác).
- Ngày sinh vẫn nằm trong danh bạ vì lịch sinh nhật công ty đang công khai sẵn.
- Thứ tự triển khai an toàn: deploy code → PHẦN A của SQL (tạo hàm + view, chưa siết) →
  đăng nhập bằng tài khoản nhân viên kiểm tra Lịch công ty còn đủ tên/ảnh/sinh nhật →
  PHẦN B (siết policy) → kiểm tra lại bằng DevTools. Cuối file SQL có khối **HOÀN TÁC**
  (5 giây, không mất dữ liệu). BƯỚC 7b (UPDATE `requests` chỉ Admin) chỉ chạy nếu BƯỚC 0
  cho thấy policy cũ đang mở cho mọi người.

---

## 3. Quy tắc chấm công

### Giờ làm việc chuẩn

| Ca | Bắt đầu | Kết thúc | Thời lượng |
|----|---------|----------|-----------|
| **Sáng** | 08:00 | 12:00 | 4 giờ (240 phút) |
| **Chiều** | 13:30 | 17:30 | 4 giờ (240 phút) |

### 6 loại chấm công (`AttendanceType`)
| Enum | Hiển thị | Mô tả |
|------|----------|-------|
| `OT_MORNING` | Tăng ca sáng | Chấm trước 08:00 |
| `IN_MORNING` | Vào sáng | Chấm vào ca sáng |
| `OUT_MORNING` | Ra sáng | Chấm ra ca sáng |
| `OT_AFTERNOON` | Tăng ca chiều | Chấm trước 13:30 |
| `IN_AFTERNOON` | Vào chiều | Chấm vào ca chiều |
| `OUT_AFTERNOON` | Ra chiều | Chấm ra ca chiều |

### Xác minh chấm công
Nhân viên **BẮT BUỘC** phải thỏa **ít nhất 1 trong 2** điều kiện:

1. **GPS**: Khoảng cách đến công ty ≤ `allowedRadiusMeters` (mặc định 100m).
2. **IP/Wifi**: IP công cộng trùng với `allowedIpPrefix` của công ty.

> **Ngoại lệ:** Admin được bypass toàn bộ kiểm tra vị trí.

### Xử lý dữ liệu thông minh (Data Sanitization)

1. **Loại bỏ trùng lặp**: Nếu cùng loại chấm công ≤ 5 phút:
   - Loại `IN`/`OT`: Giữ **lần đầu tiên** (check-in sớm nhất).
   - Loại `OUT`: Giữ **lần cuối cùng** (check-out muộn nhất).

2. **Lọc phiên ngắn (Spam)**: Nếu IN + OUT < 5 phút → Bị loại bỏ hoàn toàn.

### Snap-to-grid (Làm tròn công)
- Nếu thời gian làm việc 1 ca nằm trong khoảng **230–250 phút** → Tự động làm tròn lên **240 phút** (tính bằng 0.5 công).
- Giúp tránh thiệt thòi cho nhân viên khi chấm công lệch vài phút.

### Tính công chuẩn (standardWorkDays)
```
standardWorkDays = (morningMinutes + afternoonMinutes) / (240 × 2)
```
- Giá trị: `0`, `0.5`, hoặc `1.0` (tối đa 1.0/ngày).

### Ngày nghỉ tuần (mặc định Chủ Nhật)
- Ngày nghỉ tuần **KHÔNG** tính công chuẩn (`standardWorkDays = 0`).
- Toàn bộ thời gian làm việc ngày nghỉ tuần → Tự động chuyển sang **OT ngày nghỉ tuần** (hệ số ×2.0, hằng `OT_MULTIPLIERS.SUNDAY`).
- Mặc định ngày nghỉ tuần là Chủ Nhật. Nhân viên có **đơn đổi ngày nghỉ** đã duyệt (mục 6b)
  thì Thứ 7 tuần đó là ngày nghỉ tuần, còn Chủ Nhật là ngày làm việc thường.
- Trong code: `DailyStats.isSunday` là Chủ Nhật **theo lịch** (chỉ để hiện nhãn/màu); mọi chỗ
  tính tiền dùng `DailyStats.isRestDay` (ngày nghỉ tuần **thực tế**, từ `resolveRestDay` trong
  `utils/restDay.ts`). Cố ý tách hai khái niệm để không còn chỗ nào hỏi thẳng `isSunday(date)`
  rồi trả ×2 cho cả Thứ 7 lẫn Chủ Nhật.

### Chống double-tap
- Biến `isProcessingAttendance` ngăn chặn gửi 2 request cùng lúc.

---

## 4. Quy tắc tăng ca (OT)

### Hệ số OT (`OT_MULTIPLIERS`)
| Loại | Hệ số | Mô tả |
|------|-------|-------|
| Ngày thường | ×1.5 | Trước 08:00, trưa 12:00–13:30, sau 17:30 |
| Chủ nhật | ×2.0 | Toàn bộ thời gian làm việc CN |
| Ngày lễ | ×4.0 | Toàn bộ thời gian làm việc ngày lễ |
| **Khung đêm 22:00–06:00** | **×2.0** | Áp cho **mọi** loại OT — xem bên dưới |

### Hệ số khung đêm (`NIGHT_OT_WINDOW`, `utils/otRules.ts`)
Phút rơi vào khoảng **22:00–06:00** hưởng hệ số:
```
hệ số đêm = max(hệ số của ngày, 2.0)
```
Lấy `max` chứ **không** ghi đè và **không** nhân chồng:
- Ghi đè cứng thì làm đêm ngày lễ sẽ **tụt** từ ×4.0 xuống ×2.0.
- Nhân chồng thì lễ đêm thành ×8.0, tức 1 giờ làm lúc 23h bằng 1 ngày công.

**Hệ quả:** Chủ Nhật (2.0) và ngày lễ (4.0) **không đổi một con số nào**. Luật đêm
chỉ tác động lên OT ngày thường.

Khung vắt qua biên bị **cắt đôi** tính hai hệ số. Ví dụ ở lại công ty tới 23:00:
```
(270 phút × 1.5 + 60 phút × 2.0) / 480 = 1.094 công
```

### Công thức quy đổi OT sang ngày công
```
convertedOTDays = (phút ngày × hệ số ngày + phút đêm × hệ số đêm) / 480
```
> 480 phút = 1 ngày công (8 tiếng). Không có phút đêm thì công thức rút gọn về
> `(otMinutes × multiplier) / 480` như trước.

### Nhóm bị chặn OT tự động (`BLOCKED_OT_ROLES`)
| Vai trò | OT tự động? |
|---------|------------|
| **NV Kinh Doanh** | ❌ Bị chặn |
| **NV Kế Toán** | ❌ Bị chặn |
| **NV Marketing** | ❌ Bị chặn |
| NV Sản Xuất | ✅ Tự động |
| NV Bình File | ✅ Tự động |
| NV Thiết Kế | ✅ Tự động |
| Quản Lý Sản Xuất | ✅ Tự động |

### Logic chi tiết

#### OT Sáng sớm (trước 08:00)
- **Nhân viên được phép**: Cần có **đơn OT ca sáng** được duyệt.
- **Nhóm bị chặn**: Không tính dù có đơn (trừ khi Admin Override).

#### OT Trưa (12:00–13:30)
- Chỉ tính nếu:
  1. Không thuộc nhóm bị chặn.
  2. Có đơn OT ca sáng được duyệt.
  3. Thời gian ra > `12:15` (vượt ngưỡng auto-trigger 15 phút).

#### OT Chiều tối (sau 17:30)
- **Nhóm thường**: Tự động tính nếu ra ca sau `17:45` (vượt ngưỡng 15 phút).
- **Nhóm bị chặn**: Chỉ tính nếu có **đơn OT ca chiều** được duyệt.

#### OT Chủ nhật
- **Tất cả** thời gian làm việc CN (cả standard + OT) → Tính OT ×2.0.
- Công chuẩn CN = 0 (toàn bộ dồn vào OT).

#### Admin Override
- Nếu có Admin Override cho ngày đó → **Bypass toàn bộ kiểm tra** nhóm bị chặn.
- OT chỉ tính khi thời gian override > ngưỡng auto-trigger (15 phút).

### Tăng ca khai theo khung giờ (`ot_start` / `ot_end` / `ot_location`)

Dành cho tăng ca **không có giờ chấm công**: làm tiếp ở nhà buổi tối, hoặc ngày
nhân viên quên chấm công ra và Admin khai bù.

**Đâu là nguồn số phút — một câu:** có đủ `ot_start` **và** `ot_end` thì phút lấy
theo khung giờ khai; thiếu thì đơn chỉ là **cờ mở khoá**, phút suy từ giờ chấm công.

| Đơn | Có khung giờ? | Nguồn phút |
|---|---|---|
| Đơn cũ (trước tính năng này) | Không | Cờ mở khoá — *hành vi giữ nguyên* |
| NV gửi, tại công ty | Không nhập | Cờ mở khoá |
| NV gửi, tại nhà | Có | Khung giờ khai |
| Admin tạo hộ (cả OFFICE lẫn HOME) | Có | Khung giờ Admin khai |

- **Nhiều khung một ngày**: mỗi khung là **một dòng `requests`** riêng, duyệt lẻ được.
- `ot_end <= ot_start` nghĩa là khung **vắt qua nửa đêm**; toàn bộ phút vẫn thuộc ngày `date`.
- Phút khai báo vào bucket riêng `declaredMinutes`, **không** ảnh hưởng `standardWorkDays`
  → tổng công thực tế và phụ cấp không đổi.
- Cả **4 đường ra** của `calculateDailyStats` đều cộng OT khai báo: ngày lễ, ngày nghỉ
  phép, ngày không có log nào, và ngày bình thường. Riêng **ngày tương lai** thì không.
- Đơn do **Admin tạo hộ tự động duyệt**; đơn nhân viên tự gửi vẫn chờ duyệt.
- Luồng tại nhà / Admin **không** đi qua kiểm tra GPS/IP và **không** yêu cầu chấm công.

#### Ràng buộc (`validateOTRanges`)
| Kiểm tra | Nhân viên | Admin |
|---|---|---|
| Giờ kết thúc khác giờ bắt đầu | Chặn | Chặn |
| Chồng lấn với khung đã khai cùng ngày | Chặn | **Chặn** |
| Chồng lấn với khoảng đã chấm công | Chặn | **Chặn** |
| Tháng đã chốt lương (theo **ngày khai**) | Chặn | Chặn |
| Ngày tương lai | Chặn | Chặn |
| Một khung > 6 tiếng | Chặn | Miễn |
| Tổng > 6 tiếng/ngày | Chặn | Miễn |
| Khai bù quá 7 ngày | Chặn | Miễn |

Hai dòng chồng lấn **giữ chặn cả với Admin** vì đó là **đếm trùng tiền**, không phải
vấn đề chính sách. Khoảng đã chấm công = từ lần chấm đầu tới lần chấm cuối trong ngày:
người đang ở công ty thì không thể đồng thời làm ở nhà. Ngày quên chấm công ra thì
khoảng này hẹp lại nên khai bù buổi tối vẫn lọt — đúng ca cần khai bù nhất.

> **Cần chạy `add_ot_time_range.sql` trên Supabase trước khi deploy**, nếu không mọi
> lần gửi đơn tăng ca theo khung giờ sẽ lỗi.

---

## 5. Quy tắc đi trễ

### Ngưỡng trễ
- **Buffer**: 5 phút (đến 08:05 hoặc 13:35 vẫn OK).
- Sau buffer → Tính trễ **TOÀN BỘ** thời gian (tính từ giờ bắt đầu ca, không phải từ buffer).

### Bậc phạt đi trễ (theo tháng)
| Lần trễ/tháng | Hình phạt |
|---------------|-----------|
| Lần 1 | ⚠️ Nhắc nhở (không phạt tiền) |
| Lần 2 | 💸 Trừ **20%** phụ cấp tháng |
| Lần 3 | 💸 Trừ **50%** phụ cấp tháng |
| Lần ≥ 4 | 🛑 Trừ **100%** phụ cấp tháng |

> Phạt trễ **không bao giờ** vượt quá tổng phụ cấp thực nhận (`grossAllowance`).

### Cảnh báo đi trễ liên tiếp
| Tình trạng | Hình thức xử lý |
|------------|-----------------|
| **3 tháng liên tiếp** ≥ 2 lần trễ/tháng | 🚨 Cắt thưởng các ngày lễ trong năm |
| **6 tháng liên tiếp** ≥ 2 lần trễ/tháng | 🔴 Họp Ban Giám Đốc xử lý |

### Đơn giải trình trễ
- Nhân viên có thể gửi đơn giải trình (`LateRequest`) với lý do.
- Nếu Admin duyệt → Trạng thái `isExcused = true` → **KHÔNG BỊ TÍNH TRỄ**.

---

## 6. Nghỉ phép

### Loại nghỉ phép (`LeaveType`)
| Loại | Mô tả | Công ty trả lương? | Trừ quỹ phép? |
|------|-------|--------------------|---------------|
| `PAID` | Phép năm | Có — 1.0 công | **Có** |
| `SPECIAL` | Nghỉ chế độ công ty trả: cưới, tang (Điều 115.1) | Có — 1.0 công | Không |
| `INSURANCE` | Nghỉ chế độ **BHXH chi trả**: thai sản, khám thai, vợ sinh con | **Không — 0 công** | Không |
| `UNPAID` | Nghỉ không hưởng lương (Điều 115.2, việc riêng) | Không — 0 công | Không |

> `isPaidLeaveType` viết theo **danh sách trắng** (`PAID` hoặc `SPECIAL`), cố ý không
> viết `t !== 'UNPAID'`. Kiểu loại trừ khiến mỗi loại nghỉ thêm mới mặc định được trả
> lương — chính là cái bẫy suýt làm công ty trả 6 tháng lương thai sản chồng lên tiền BHXH.

`INSURANCE` trả 0 công nhưng trạng thái ngày vẫn là **nghỉ**, không phải **vắng**.

### Danh mục lý do nghỉ chế độ (`SPECIAL_LEAVE_REASONS`)
Loại nghỉ lưu vào đơn lấy từ **lý do đã chọn**, không phải từ tab người dùng bấm.

| Nhóm | Lý do | Ngày | Loại |
|---|---|---|---|
| Hiếu hỉ | Cưới bản thân | 3 | `SPECIAL` |
| Hiếu hỉ | Cưới con | 1 | `SPECIAL` |
| Hiếu hỉ | Tang cha/mẹ (hai bên), vợ/chồng, con | 3 | `SPECIAL` |
| Thai sản (BHXH) | Thai sản (sinh con) | tự nhập | `INSURANCE` |
| Thai sản (BHXH) | Khám thai | 1 | `INSURANCE` |
| Thai sản (BHXH) | Sẩy thai / nạo, hút thai | tự nhập | `INSURANCE` |
| Thai sản (BHXH) | Vợ sinh con (lao động nam) | 5 | `INSURANCE` |
| Không hưởng lương | Tang ông bà nội/ngoại, anh/chị/em ruột | 1 | `UNPAID` |
| Không hưởng lương | Cưới của cha/mẹ | 1 | `UNPAID` |
| Không hưởng lương | Cưới anh/chị/em ruột | 1 | `UNPAID` |
| Khác | (nhập tay) | tự nhập | `SPECIAL` |

> **Cần chạy `add_insurance_leave_type.sql` trên Supabase trước khi deploy** — cột
> `leave_type` có thể đang có CHECK constraint chặn giá trị `INSURANCE`.

### Thời lượng nghỉ (`LeaveDuration`)
| Giá trị | Mô tả | Tính công |
|---------|-------|-----------|
| `FULL` | Cả ngày | PAID/SPECIAL → 1.0, INSURANCE/UNPAID → 0.0 |
| `MORNING` | Nửa sáng | PAID/SPECIAL → 0.5, INSURANCE/UNPAID → 0.0 |
| `AFTERNOON` | Nửa chiều | PAID/SPECIAL → 0.5, INSURANCE/UNPAID → 0.0 |

### Quỹ phép năm
- Tích luỹ **1 ngày cho mỗi tháng làm việc**, tối đa **12 ngày/năm**.
- **Cộng dồn trong năm**, tự **reset về 0 ngày 01/01** (không dồn qua năm).
- Không cộng thêm theo thâm niên.

### Trần sử dụng trong tháng
- Tối đa **2 ngày phép năm (`PAID`) mỗi tháng** — chỉ áp cho **nhân viên tự xin nghỉ**.
- **Admin tạo đơn hộ thì KHÔNG bị trần này**, chỉ bị giới hạn bởi quỹ phép năm còn lại.
  Admin tự xin nghỉ cho chính mình vẫn chịu trần (phân biệt theo "tạo hộ", không theo vai trò).
- Chỉ áp cho `PAID`. `SPECIAL`, `INSURANCE` và `UNPAID` đều được **miễn trừ**.
- Đếm cả đơn `APPROVED` + `PENDING` → Tránh gửi nhiều đơn bypass.
- Tính theo **tháng của ngày bắt đầu nghỉ**, không phải tháng hiện tại.
- Vượt trần hoặc hết quỹ → Hệ thống **CHẶN** gửi đơn PAID, yêu cầu chọn UNPAID.
- **Quỹ năm chặn cứng với mọi người**, kể cả Admin.

### Chống đơn nghỉ trùng ngày

Một ngày chỉ nghỉ được một lần. Ba lớp bảo vệ:

**1. Chặn khi tạo** (`findOverlappingLeave`, `utils/leaveTypes.ts`)

| Tình huống | Kết quả |
|---|---|
| Đè lên đơn `APPROVED` hoặc `PENDING` của cùng người | **Chặn** |
| Đè lên đơn `REJECTED` | Cho qua — đơn bị từ chối không chiếm ngày |
| Chỉ đè đúng ngày Chủ Nhật hoặc ngày lễ cả ngày | Cho qua — những ngày đó không trừ phép |
| Người khác nghỉ cùng ngày | Cho qua |
| **Admin tạo đơn hộ** | **Vẫn chặn** |

Chặn cả Admin vì đây là **trùng dữ liệu**, không phải vấn đề chính sách — giống
luật chồng lấn của đơn tăng ca. Muốn sửa một kỳ nghỉ thì **xoá đơn cũ rồi tạo lại**.

Chốt chặn thật nằm ở `handleSubmitLeaveRequest` (`App.tsx`); `LeaveRequestModal`
chỉ cảnh báo sớm và khoá nút gửi.

**2. Đếm theo NGÀY, không theo ĐƠN**

`getPaidLeaveUsedThisYear` và `getPaidLeaveUsedThisMonth` gộp các đơn thành một
**bản đồ ngày** (`leaveDayMap` → `mergeLeaveDayMaps`) rồi mới cộng. Cộng theo đơn
thì hai đơn phủ cùng một ngày sẽ ăn quỹ hai lần.

Ngày bị nhiều đơn phủ lấy phần **lớn nhất**: nửa buổi rồi lại có đơn cả ngày thì
ngày đó là 1.0, không phải 1.5.

> Hạn chế đã biết: nửa buổi **sáng** + nửa buổi **chiều** cùng ngày ra 0.5 thay vì
> 1.0. Chấp nhận được vì trừ thiếu an toàn hơn trừ thừa, và ca này rất hiếm.

`LeaveUsageEntry` có hai trường số ngày:
- `deductedDays` — đơn này **tự nó** trừ bao nhiêu (dùng cho từng dòng trong bảng)
- `newDeductedDays` — phần **chưa bị đơn cũ hơn chiếm** (dùng cho con số **tổng**)
- `overlapDays > 0` → đơn có ngày trùng, màn lịch sử tô cảnh báo

**3. Khử trùng khi hiển thị**
- `CompanyCalendar`: **một người một thẻ mỗi ngày**; nhiều đơn thì lấy đơn mạnh
  nhất (`APPROVED` hơn `PENDING`, `FULL` hơn nửa buổi). **Không vẽ thẻ nghỉ vào
  Chủ Nhật** để khớp bảng công.
- `LeaveHistoryModal`: các con số tổng đếm theo ngày đã khử trùng; có băng cảnh
  báo khi phát hiện đơn trùng.

### Xoá đơn từ (Admin)

Nút **"Xoá đơn"** ở màn Duyệt Đơn, trên đơn đã xử lý, áp dụng cho **mọi loại đơn**
(nghỉ / tăng ca / đi trễ / ứng lương). Dùng cho đơn **nhập trùng hoặc nhập nhầm** —
khác với "Từ chối" (đơn có thật nhưng không duyệt) và "Hoàn duyệt" (đưa về chờ duyệt).

Ràng buộc: chỉ Admin thấy nút · hỏi xác nhận có tên và ngày cụ thể · chặn tháng đã
chốt lương · **không hoàn tác được**.

> **Cần chạy `add_delete_request_policy.sql` trên Supabase** — bảng `requests` trước
> đây chưa bao giờ bị xoá dòng nào nên có thể chưa có policy DELETE. Thiếu policy
> thì Postgres **không báo lỗi**, chỉ lặng lẽ xoá 0 dòng; phần mềm bắt được ca này
> và sẽ nhắc đúng tên file.

### Tính phép còn lại (`utils/leaveTypes.ts`)
```
remainingLeave = getAccruedLeaveThisYear - getPaidLeaveUsedThisYear - usedLeaveLegacy
```
- **Không lưu số dư trong DB** — luôn tính lại từ đơn đã duyệt nên không bao giờ lệch,
  kể cả đơn Admin tạo hộ (vào thẳng trạng thái `APPROVED`).
- `getAccruedLeaveThisYear`: 1 ngày/tháng, từ tháng ký HĐ (nếu ký trong năm nay) đến
  tháng hiện tại hoặc tháng nghỉ việc.
- `getPaidLeaveUsedThisYear`: tổng ngày phép `PAID` đã duyệt trong năm, đếm bằng
  `countLeaveDays` (**bỏ Chủ Nhật và ngày lễ** để khớp với cách tính công).
- `usedLeaveLegacy`: số ngày nhập tay cho dữ liệu cũ. Cũng là **ô điều chỉnh tay duy
  nhất** của Admin — nhập số âm để cộng thêm phép.
- Kết quả **có thể âm** → Admin nhìn thấy nhân viên đã nghỉ vượt quỹ (hiển thị đỏ).

### Xử lý nghỉ phép trong ngày
- **Nghỉ cả ngày**: Không tính chấm công, return sớm.
- **Nghỉ nửa ngày**: Tính công cho nửa ngày còn lại + cộng 0.5 (nếu PAID) cho nửa ngày nghỉ.

### Duyệt nghỉ phép
- Không có bước trừ số dư: phép còn lại được tính lại từ danh sách đơn `APPROVED`,
  nên duyệt / bác đơn là số phép tự cập nhật.
- Nếu duyệt đơn sẽ vượt quỹ năm hoặc trần 2 ngày/tháng → hiện cảnh báo xác nhận
  (cảnh báo, không chặn cứng).

---

## 6b. Đổi ngày nghỉ hàng tuần

Nghỉ **Thứ 7**, đi làm bù **Chủ Nhật** ngay sau đó. Dùng khi công ty xếp lịch làm Chủ Nhật.
Vì đây là **lịch do công ty xếp**, nhân viên chỉ gửi đơn để công ty xác nhận nên form
**không có ô lý do**: chỉ chọn Thứ 7 rồi gửi. Cột `reason` được điền sẵn hằng
`SWAP_DEFAULT_REASON` để các màn hình dùng chung không phải xử lý chuỗi rỗng.
Đơn loại `SWAP` trong bảng `requests`: cột `date` = Thứ 7 nghỉ bù, cột `swap_work_date` =
Chủ Nhật làm bù (= `date` + 1). Toàn bộ luật nằm ở `utils/restDay.ts` (module thuần, chạy
được bằng node).

> **Cần chạy `add_swap_request_type.sql` trên Supabase trước khi deploy** — thêm giá trị
> `SWAP` vào CHECK constraint của cột `type`, thêm cột `swap_work_date`, và unique index
> "mỗi nhân viên mỗi tuần một đơn còn hiệu lực". Thiếu thì insert bị từ chối và phần mềm
> nhắc đúng tên file.

### Hiệu lực khi đơn được duyệt (chỉ `APPROVED`)
| Ngày | Tính công |
|------|-----------|
| Thứ 7 (`restDate`) | Y hệt Chủ Nhật: công chuẩn 0; **mọi phút** chấm công (cả ca chuẩn lẫn OT) dồn vào một rổ **×2.0**, không tách khung đêm; đơn nghỉ phép rơi vào ngày này **vô hiệu**, không trừ quỹ phép; OT khai báo tại nhà ×2.0. |
| Chủ Nhật (`workDate`) | Y hệt ngày thường: công chuẩn tối đa 1.0; OT sáng sớm/trưa/chiều ×1.5, khung đêm ×2.0; đi trễ tính như thường; nghỉ phép **có hiệu lực và trừ quỹ**; không chấm công → **Vắng** ("Vắng — Ngày làm bù Chủ Nhật"). |

Đơn `PENDING` / `REJECTED` không ảnh hưởng gì tới tính công.

### Công chuẩn tháng
Đếm ngày T2–T7 theo `workDays` như cũ, **trừ** Thứ 7 có đơn nghỉ bù, **cộng** Chủ Nhật có
đơn làm bù. Trong cùng tháng thì bù trừ bằng 0. Đơn **vắt tháng** (T7 30/09 – CN 01/10):
tháng 9 giảm 1, tháng 10 tăng 1 — nhân viên làm đủ vẫn **đủ công cả hai tháng**, và nếu bỏ
làm Chủ Nhật thì phần thiếu rơi đúng vào tháng có Chủ Nhật.

Ví dụ lương cơ bản 26.000.000, cả hai tháng đều có 26 ngày T2–T7 theo lịch, làm đủ:

| | Tháng 9 (T7 30/09 nghỉ bù) | Tháng 10 (CN 01/10 làm bù) |
|---|---|---|
| Không có đơn | 26/26 → 26.000.000 | 26/26 → 26.000.000 |
| Có đơn, mẫu số theo lịch (cách **không** dùng) | 25/26 → 25.000.000 | 27/26 → 27.000.000 |
| Có đơn, mẫu số theo lịch của NV (**cách đang dùng**) | 25/25 → 26.000.000 | 27/27 → 26.000.000 |

### Quy trình
- Nhân viên tự tạo → `PENDING` → Admin duyệt ở màn Duyệt Đơn (tab "Đổi ngày nghỉ").
- Admin tạo hộ (màn chi tiết nhân viên, nút "Đổi Ngày Nghỉ") → `APPROVED` ngay.
- Khi Admin **duyệt** đơn `PENDING` → chạy lại toàn bộ luật validate: ngày lễ hoặc đơn nghỉ
  mới xuất hiện trong lúc chờ có thể làm đơn không còn hợp lệ.
- Duyệt rồi từ chối / hoàn duyệt → mọi màn hình tự tính lại từ state (không lưu số dư).
- Thông báo đẩy: tạo → quản lý; duyệt/từ chối → nhân viên (giống đơn nghỉ phép).

### Luật validate (`validateSwapRequest`, theo thứ tự kiểm tra)
| # | Luật | Admin miễn? |
|---|------|-------------|
| 1 | Ngày nghỉ bù phải là **Thứ 7** (Chủ Nhật tự suy = T7 + 1) | Không |
| 2 | Thứ 7 phải thuộc `workDays` của NV (lịch không có T7 thì "vốn đã nghỉ, không cần đổi") | Không |
| 3 | Thứ 7 và Chủ Nhật không trùng ngày lễ | Không |
| 4 | NV chỉ gửi trong vòng **7 ngày sau Chủ Nhật** làm bù (`MAX_SWAP_BACKDATE_DAYS`) | **Có** |
| 5 | Thứ 7 không quá 1 năm kể từ hôm nay (bắt gõ nhầm năm) | Không |
| 6 | **Mỗi tuần một đơn** còn hiệu lực (`APPROVED`/`PENDING`); đơn `REJECTED` không chiếm chỗ. DB có unique index làm lưới an toàn cuối. | Không — trùng dữ liệu |
| 7 | Thứ 7 không nằm trong đơn nghỉ phép (`APPROVED`/`PENDING`) | Không |
| 8 | Chủ Nhật không nằm trong đơn nghỉ phép | Không |

Ngoài ra ở `App.tsx`: **tháng đã chốt lương** chặn tạo/duyệt/từ chối/xoá — kiểm tra **cả
tháng của Thứ 7 lẫn tháng của Chủ Nhật**. Hệ quả: đơn vắt tháng phải tạo trước khi chốt
lương tháng có Thứ 7.

### Chéo với nghỉ phép (chặn cả Admin, hai chiều)
- Đơn nghỉ phép mới phủ lên **Thứ 7 đã đổi** → chặn (ngày đó đã là ngày nghỉ tuần).
- Đơn nghỉ phép mới phủ lên **Chủ Nhật đã đổi** → cho phép, trừ quỹ như ngày thường.
- Mọi hàm đếm ngày phép trong `utils/leaveTypes.ts` nhận predicate `isRestDay` (mặc định
  Chủ Nhật; có đơn đổi thì truyền `makeRestDayPredicate` từ `utils/restDay.ts`) để số phép
  ở mọi màn hình khớp với calculator.

### Ngày lễ thêm sau khi duyệt
Ngày lễ rơi vào Thứ 7 hoặc Chủ Nhật của đơn đã duyệt → đơn **vô hiệu cả hai ngày**
(`isSwapVoidedByHoliday`), hai ngày tính như không có đơn; màn Duyệt Đơn gắn nhãn
"Vô hiệu — trùng ngày lễ". Lý do: nếu không vô hiệu, ngày lễ trên Thứ 7 đã đổi bị cổng
`!isRestDay` ở `salaryCalculator` gạt mất 1.0 công lễ.

### Hiển thị
- Lịch sử tháng / Chi tiết NV: Thứ 7 đã đổi hiện "Nghỉ bù (đổi Chủ Nhật)" hoặc "Đi làm ngày
  nghỉ bù" (×2); Chủ Nhật đã đổi hiện "Làm bù Chủ Nhật" hoặc "Vắng mặt — Ngày làm bù Chủ Nhật".
- Lịch công ty: thẻ 🔁 "nghỉ bù" trên Thứ 7 và "làm CN" trên Chủ Nhật (mờ khi chờ duyệt);
  thẻ nghỉ phép không vẽ vào ngày nghỉ tuần thực tế của từng người.
- Báo cáo Telegram (`api/daily-report.ts`, chép tay luật vì không import được `utils/`):
  Thứ 7 đã đổi không bị báo "nghỉ không phép"; sáng Thứ 2 báo thêm Chủ Nhật vừa qua cho
  riêng NV làm bù; có mục "ĐỔI NGÀY NGHỈ TUẦN NÀY".

### Ghi chú
- Đi trễ trên ngày nghỉ tuần vẫn đếm trễ (Chủ Nhật hiện nay đã vậy; Thứ 7 đã đổi thừa hưởng
  y nguyên).
- Ba chỗ tính hạn mức ứng lương trong `App.tsx` trước đây thiếu tham số lịch sử lương và đơn
  nghỉ phép; khi thêm tham số đơn đổi ngày nghỉ đã truyền đủ, nên hạn mức ứng giờ tính cả
  phép có lương và lịch sử lương như màn Bảng Lương.
- Kiểm thử module thuần: `npm run test:pure` (`scripts/pure.test.ts`, chạy bằng `node:test`
  qua esbuild) — phủ phân loại ngày, luật validate, tính công ngày, lương tháng, vắt tháng
  và đếm ngày phép.

---

## 6c. Đổi thông tin cá nhân

Nhân viên bấm vào **ảnh/tên ở góc trên** để mở màn Hồ sơ: xem toàn bộ thông tin của mình
và **đề nghị sửa 4 trường**: họ tên, ngày sinh, số điện thoại, ảnh đại diện. Đề nghị là đơn
loại `PROFILE` trong bảng `requests`; **Admin duyệt thì phần mềm mới ghi vào `profiles`**,
nhân viên không tự sửa được gì. Các trường công ty quản lý (mã NV, email, chức vụ, loại HĐ,
ngày vào làm, ngày ký HĐ chính thức, ngày làm việc, lương) chỉ đọc — sai thì liên hệ Admin.
Toàn bộ luật nằm ở `utils/profileChange.ts` (module thuần, chạy được bằng node).

> **Cần chạy 3 file SQL trên Supabase, theo thứ tự:**
> 1. `add_profile_request_type.sql` — **trước khi deploy**: thêm `PROFILE` vào CHECK của
>    cột `type`; cột `requests.profile_changes` (JSONB); cột `profiles.phone` + unique index
>    chống trùng số; unique index "mỗi người một đơn PROFILE đang chờ"; policy cho nhân viên
>    tự xoá đơn PROFILE `PENDING` của mình. Thiếu thì insert bị từ chối và phần mềm nhắc
>    đúng tên file.
> 2. `setup_avatar_storage.sql` — **trước khi deploy**: bucket `avatars` (công khai, 2 MB,
>    jpeg/png/webp) và 4 policy "đọc công khai; ghi/sửa/xoá trong thư mục của mình hoặc là
>    Admin".
> 3. `restrict_profile_salary_access.sql` — **sau khi deploy**, xem mục 2 "Ai đọc được gì".

### Dữ liệu đơn
Cột `date` = ngày gửi (để lọc tháng / sắp xếp như đơn khác). Cột `profile_changes` chỉ chứa
trường **có đổi**, lưu **cả giá trị cũ** để màn duyệt hiện "A → B" và để hoàn tác được:

```json
{ "name":   { "old": "Nguyễn Văn A", "new": "Nguyễn Văn An" },
  "phone":  { "old": null, "new": "0912345678" },
  "avatar": { "old": "https://…/1700.jpg", "new": "https://…/pending-1727.jpg",
              "newPath": "<uid>/pending-1727.jpg" } }
```

Lý do tuỳ chọn; để trống thì điền `PROFILE_DEFAULT_REASON` ("Cập nhật thông tin cá nhân")
và màn duyệt ẩn dòng lý do.

### Luật validate (`validateProfileRequest`)
| Trường | Luật |
|---|---|
| Chung | Phải có ít nhất một thay đổi. **Mỗi người một đơn `PENDING`** (chặn ở app; unique index ở DB là lưới cuối). |
| Họ tên | Không rỗng; ít nhất 2 từ; tối đa 50 ký tự; chỉ chữ, khoảng trắng, nháy, gạch nối. Gộp khoảng trắng trước khi so — đổi mỗi khoảng trắng không tính là thay đổi. |
| Ngày sinh | Ở quá khứ; tuổi 15–75; trước ngày vào làm. Luôn kèm cảnh báo "đổi ngày sinh làm đổi thưởng sinh nhật các tháng chưa chốt lương". |
| Số điện thoại | Chuẩn hoá về 10 số bắt đầu bằng 0 (`+84`, `84`, `0084`, dấu chấm/gạch/ngoặc/khoảng trắng đều chấp nhận; 11 số chỉ nhận đầu `02` cố định). Rỗng = xoá số. Đầu số lạ chỉ **cảnh báo**, không chặn. Trùng số người khác → DB từ chối lúc **duyệt** (mã 23505), Admin thấy "đã thuộc về nhân viên khác", đơn vẫn `PENDING`; màn duyệt cũng cảnh báo trước nếu thấy trùng trong danh sách. |
| Ảnh | JPG/PNG/WEBP, tối đa 10 MB trước khi nén; nén phía trình duyệt về 512×512 JPEG (~60 KB); URL phải https. |

### Quy trình
- Nhân viên gửi → `PENDING` → push cho **Admin** (chỉ Admin; QLSX không duyệt đơn nào).
  Đang có đơn chờ thì form khoá, hiện banner cam + nút **"Huỷ đề nghị"** (xoá đơn và xoá
  ảnh `pending-*` trên Storage).
- Admin duyệt (màn Duyệt Đơn, tab "Đổi thông tin"): ghi `profiles` **trước**, đổi status
  **sau** — ghi `profiles` lỗi thì đơn vẫn `PENDING`, không mất gì. Bước ghi **idempotent**
  (bỏ qua trường mà giá trị hiện tại đã bằng giá trị mới) nên bấm Duyệt lần hai an toàn.
- Đơn có đổi ngày sinh → hộp xác nhận liệt kê **chênh lệch thưởng sinh nhật từng tháng chưa
  chốt** trong năm (tính bằng `getVirtualBirthdayBonus` với ngày cũ và mới). Không chặn theo
  tháng chốt lương vì tháng đã chốt được đóng băng trong `payroll_details`.
- Từ chối: không chạm `profiles`; xoá ảnh `pending-*`.
- **Hoàn duyệt** đơn đã duyệt (nút "Hoàn tác & mở lại đơn"): trả lại giá trị cũ **chỉ với
  trường mà giá trị hiện tại vẫn bằng giá trị mới** — ai sửa tay sau đó thì bỏ qua và nói
  rõ; đơn về `PENDING`. Thứ tự cũng là `profiles` trước, status sau.
- Admin sửa trực tiếp trong tab Nhân sự (kể cả số điện thoại, ảnh) → ghi thẳng, không cần
  đơn. Ghi `processed_at` khi duyệt/từ chối.
- Sau khi duyệt, hồ sơ của chính nhân viên được nạp lại (`refreshCurrentUser`) nên header
  đổi tên/ảnh ngay; đồng nghiệp thấy tên/ảnh mới khi tải lại (xem mục 15).

### Ảnh đại diện (Storage bucket `avatars`, công khai)
- Nhân viên chọn ảnh → nén phía trình duyệt (`utils/imageResize.ts`: chặn theo loại/dung
  lượng **trước** khi decode để ảnh 50 MP không sập tab điện thoại; giữ đúng chiều ảnh chụp
  dọc; cắt vuông căn giữa bằng `computeCoverCrop`) → tải lên `avatars/{uid}/pending-{ts}.jpg`
  **lúc gửi đơn**; đơn lưu cả URL lẫn `newPath`.
- Trước khi tải ảnh mới, xoá mọi `pending-*` cũ trong thư mục mình → mỗi người tối đa 1
  ảnh chờ.
- Duyệt: ghi URL vào `profiles.avatar`, file nằm nguyên. Từ chối / huỷ: xoá file.
- **Không ghi đè đường dẫn cố định** — nếu không ảnh sẽ đổi ngay khi chưa duyệt.
- Admin đổi ảnh cho NV trong tab Nhân sự → `avatars/{uid}/{ts}.jpg`, ghi thẳng. Nút "Dùng
  ảnh chữ cái" quay về `ui-avatars.com` như lúc đăng ký.
- Ảnh đã duyệt cũ không dọn tự động; cuối `setup_avatar_storage.sql` có câu dọn `pending-*`
  mồ côi để chạy tay.

### Ghi chú
- Trong lúc viết tính năng này phát hiện và sửa 3 lỗi có sẵn: (1) `fetchProfile` không nạp
  `dateOfBirth` nên màn Lương của chính nhân viên thiếu thưởng sinh nhật và `BirthdayAlert`
  của chính mình không bao giờ hiện; (2) `getVirtualBirthdayBonus` dùng `isSameMonth` so
  cả **năm** nên thưởng sinh nhật **chưa bao giờ** được cộng tự động (xem mục 9); (3)
  `sendPushToManagers` lọc vai trò `'Manager'` không tồn tại trong `UserRole`.
- Kiểm thử: `npm run test:pure` — 41 test; phần đổi thông tin phủ chuẩn hoá, từng luật
  validate, diff, apply/revert idempotent, map dòng, thưởng sinh nhật đổi tháng, và test
  chống tái phát "map dòng danh bạ bằng mapper đầy đủ rồi spread lên `currentUser` làm mất
  lương".

---

## 7. Ngày lễ

### Loại ngày lễ
| Loại | Tính công | OT |
|------|-----------|-----|
| `FULL` (cả ngày) | 1.0 công | Nếu đi làm → OT ×4.0 |
| `MORNING` (nửa sáng) | 0.5 công (phần lễ) | Phần lễ → OT ×4.0, phần còn lại → Tính bình thường |
| `AFTERNOON` (nửa chiều) | 0.5 công (phần lễ) | Tương tự |

### Ngày lễ mặc định
- 01/01: Tết Dương Lịch
- 30/04: Ngày Giải Phóng
- 01/05: Quốc Tế Lao Động

> Admin có thể thêm/xóa ngày lễ qua giao diện `CompanyCalendar`. Hỗ trợ thêm khoảng ngày (range).

---

## 8. Tính lương

### Công thức tổng quát

```
Thực lãnh = Thu nhập - Khấu trừ

Thu nhập = Lương theo công + Phụ cấp theo công + Thưởng
Khấu trừ = Phạt trễ + BHXH + Ứng lương + Phạt khác
```

### Chi tiết từng thành phần

#### Công chuẩn tháng (`standardDaysInMonth`)
- Đếm số ngày trong tháng nằm trong `workDays` của nhân viên.
- Mặc định: Thứ 2–Thứ 7 (6 ngày/tuần) → ~26 ngày.
- Có đơn đổi ngày nghỉ đã duyệt (mục 6b): **trừ** Thứ 7 nghỉ bù, **cộng** Chủ Nhật làm bù
  (đơn vắt tháng làm tháng có T7 giảm 1, tháng có CN tăng 1).
- Nếu bằng 0 → Fallback = 26.

#### Đơn giá ngày
```
salaryPerDay  = baseSalary / standardDaysInMonth
allowancePerDay = allowance / standardDaysInMonth
```

#### Lương theo công (`grossSalary`)
```
grossSalary = salaryPerDay × (totalActualWorkDays + totalConvertedOTDays)
```
> Làm tròn đến **1.000đ** gần nhất.

#### Phụ cấp theo công (`grossAllowance`)
```
grossAllowance = allowancePerDay × totalActualWorkDays
```
> Phụ cấp **KHÔNG** nhân theo OT, chỉ tính trên công thực tế (standard).

#### Tổng công thực tế (`totalActualWorkDays`)
```
totalActualWorkDays = totalRealWorkDays + totalPaidLeaveDays
```
- `totalRealWorkDays`: Ngày thực sự đi làm.
- `totalPaidLeaveDays`: Ngày nghỉ có lương + ngày lễ.

#### BHXH (`insuranceDeduction`)
```
insuranceDeduction = insuranceSalary × 10.5%
```

#### Rounding (Làm tròn)
- **Tất cả** các khoản tiền → Làm tròn về **1.000đ** gần nhất (`roundToThousands`).
- Công số → Làm tròn 2 chữ số thập phân.

### Xử lý nhân viên nghỉ việc
- Nếu có `resignationDate` → Bỏ qua tất cả ngày sau ngày nghỉ việc.
- Thưởng sau ngày nghỉ việc → Không tính.
- Thưởng sinh nhật: Chỉ tính nếu sinh nhật ≤ ngày nghỉ việc.

---

## 9. Thưởng / Phạt

### Loại (`BonusFine.type`)
| Loại | Mô tả |
|------|-------|
| `BONUS` | Thưởng (cộng vào thu nhập) |
| `PENALTY` | Phạt (khấu trừ) |
| `SALARY_CONFIRM` | Xác nhận chốt lương (đánh dấu) |

### Thưởng sinh nhật tự động (`getVirtualBirthdayBonus`)
- Tự động thêm vào tháng sinh nhật (không cần Admin tạo).
- **Sửa ở 4.2:** trước đây so tháng bằng `isSameMonth` của date-fns — hàm này so cả **năm**
  (03/1995 ≠ 03/2026) nên khoản này **chưa bao giờ** được cộng tự động từ commit đầu. Nay so
  đúng tháng. Hệ quả: từ tháng chưa chốt đầu tiên sau khi deploy, nhân viên đủ thâm niên sẽ
  **tự có** thưởng sinh nhật trong bảng lương; nếu Admin từng thêm tay khoản này thì phải
  xoá bản thêm tay để khỏi trùng. Tháng đã chốt không đổi.
- Điều kiện: Thâm niên ≥ 1 năm + Hợp đồng chính thức + Có ngày sinh + Có ngày ký HĐ.

| Thâm niên | Mức thưởng |
|-----------|-----------|
| 1 năm | 100.000đ |
| 2–5 năm | 200.000đ |
| > 5 năm | 300.000đ |

### Thưởng/Phạt hàng loạt (Bulk)
- Admin có thể thêm thưởng/phạt cho nhiều nhân viên cùng lúc.
- Hỗ trợ nhóm theo `createdAt` để hiển thị lịch sử bulk.

---

## 10. Ứng lương

### Quy tắc
- Số tiền ứng **KHÔNG ĐƯỢC** vượt quá `netSalary` (thực lãnh) hiện tại.
- Hệ thống tính: `maxAllowed = netSalary - pendingAdvances`.
- Nếu vượt → **CHẶN** không cho tạo đơn.

### Quy trình
| Người tạo | Trạng thái ban đầu |
|-----------|-------------------|
| Nhân viên tự tạo | `PENDING` (chờ Admin duyệt) |
| Admin tạo hộ | `APPROVED` (tự động duyệt) |

---

## 11. Admin Override

### Mô tả
- Admin có thể **điều chỉnh thủ công** giờ chấm công cho bất kỳ ngày nào.
- Override tạo "mock logs" với thời gian do Admin nhập → Thay thế hoàn toàn logs thật.

### Cấu trúc Override
```typescript
{
  userId: string,
  date: Date,
  in1: "08:00",   // Vào sáng
  out1: "12:00",  // Ra sáng
  in2: "13:30",   // Vào chiều
  out2: "17:30",  // Ra chiều
  workDays: number, // Số công thủ công
  note: string
}
```

### Hiệu ứng Override
- **Bypass nhóm bị chặn OT** → Tất cả vai trò đều tính OT khi có override.
- **Tự động duyệt OT** → Override ngầm duyệt cả đơn OT sáng + chiều.
- **OT chỉ tính** khi thời gian override > ngưỡng auto-trigger (15 phút).
- Lưu bằng **UPSERT** (cùng `user_id` + `date` → Cập nhật, không tạo mới).

---

## 12. Chốt bảng lương

### Quy trình
1. Admin chọn tháng → Hệ thống tính lương tất cả nhân viên.
2. Admin xác nhận chốt → Tạo `PayrollPeriod` + `PayrollDetail` cho từng người.
3. Tháng đã chốt → **KHÔNG** thể sửa đổi.

### Xác nhận cá nhân
- Nhân viên có thể **"Xác nhận lương"** trên bảng lương của mình.
- Xác nhận được lưu dưới dạng `BonusFine` với type `BONUS`, amount = 0, reason chứa `"CONFIRMATION"`.

---

## 13. Thay đổi lương theo lịch sử

### Logic (`getEffectiveSalaryAttributes`)
- Mỗi thay đổi lương có `effectiveDate`.
- Khi tính lương tháng X → Tìm bản ghi lương có `effectiveDate ≤ cuối tháng X` **mới nhất**.
- Nếu không có lịch sử → Dùng giá trị trên profile hiện tại.

### Upsert
- Cùng `user_id` + `effective_date` → Cập nhật (không tạo bản ghi trùng).

---

## 14. AI Assistant

### Công nghệ
- **Gemini 2.0 Flash** qua `@google/genai`.
- API Key qua biến môi trường `VITE_GOOGLE_AI_KEY`.

### Chức năng
1. **Báo cáo chấm công**: Tóm tắt lịch trình làm việc hôm nay.
2. **Chatbot**: Trả lời câu hỏi về quy định, nhân sự (có ngữ cảnh thực).

### Ngữ cảnh chatbot
- Thông tin nhân viên hiện tại (tên, chức vụ).
- Trạng thái hôm nay.
- Báo cáo hiệu suất cá nhân.
- Báo cáo quản trị (chỉ Admin).
- Lịch sử tháng trước.

---

## 15. Realtime & Thông báo

### Supabase Realtime
Lắng nghe thay đổi realtime trên 6 bảng:

| Bảng | Hành động |
|------|-----------|
| `attendance_logs` | Cập nhật logs khi có chấm công mới |
| `requests` | Cập nhật đơn OT/Trễ/Phép/Ứng lương/Đổi ngày nghỉ/Đổi thông tin (kể cả DELETE khi NV huỷ đề nghị) |
| `bonuses` | Cập nhật thưởng/phạt |
| `attendance_overrides` | Cập nhật override |
| `profiles` | Cập nhật khi có nhân viên mới đăng ký / Admin sửa hồ sơ. **Sau khi siết RLS (mục 2)** nhân viên thường chỉ còn nhận sự kiện trên dòng của **chính mình** (→ `refreshCurrentUser`); tên/ảnh mới của đồng nghiệp chỉ hiện khi tải lại trang. |
| `payroll_periods` | Cập nhật khi chốt/mở lương |

### Thông báo
1. **Browser Notification** (nếu được cấp quyền).
2. **Audio Alert** (file `notification.mp3`).
3. **In-app Toast** (tự động ẩn sau 5 giây).

### Ai nhận thông báo gì?
| Sự kiện | Admin | Nhân viên |
|---------|-------|-----------|
| Có chấm công mới | ✅ | ❌ |
| Có đơn mới | ✅ | ❌ |
| Đơn được duyệt/từ chối | ❌ | ✅ (của mình) |
| Thưởng/Phạt mới | ❌ | ✅ (của mình) |
| Nhân viên mới đăng ký | ✅ | ❌ |
| Chốt lương | ❌ | ✅ |

---

## 16. Xác minh vị trí

### GPS (Haversine)
- Tính khoảng cách bằng **công thức Haversine** (bán kính Trái Đất = 6371km).
- Cấu hình: `enableHighAccuracy: true`, timeout: 10s.
- Tự động refresh mỗi 60 giây.

### IP
- Lấy IP công cộng qua **ipify** (Primary) → **ipapi** (Fallback).
- So sánh prefix IP (vd: `113.161`).
- Nếu offline → Fallback: `127.0.0.1 (Offline)`.

### Cấu hình (Admin)
- GPS tọa độ công ty + bán kính cho phép.
- IP prefix wifi công ty.
- Lưu vào bảng `settings` trên Supabase.

---

## 17. Cấu trúc dữ liệu

### Profile nhân viên (`UserProfile`)
| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID Supabase Auth |
| `name` | string | Họ tên |
| `employeeCode` | string | Mã NV (NV001...) |
| `role` | UserRole | Vai trò |
| `status` | UserStatus | ACTIVE/PENDING/LOCKED |
| `email` | string | Email |
| `baseSalary` | number | Lương cơ bản |
| `allowance` | number | Phụ cấp |
| `insuranceSalary` | number | Lương đóng BHXH |
| `workDays` | string | "1,2,3,4,5,6" |
| `contractType` | string | Loại hợp đồng |
| `contractDate` | string | Ngày ký HĐ |
| `dateOfBirth` | string | Ngày sinh |
| `usedLeaveLegacy` | number | Phép đã dùng trước khi dùng phần mềm / điều chỉnh tay |
| `resignationDate` | string | Ngày nghỉ việc |
| `phone` | string \| null | Số điện thoại, 10 số bắt đầu bằng 0; **không trùng** (unique index `profiles_phone_unique`); null = chưa khai |
| `isDirectoryOnly` | boolean | `true` = hồ sơ rút gọn từ view `employee_directory` — không có lương/email/SĐT, **không** đưa vào tính lương |

### Loại hợp đồng (`contractType`)
| Giá trị | Mô tả |
|---------|-------|
| `Hợp đồng chính thức` | Đủ quyền lợi |
| `Hợp đồng thử việc` | Thử việc |
| `Part-time` | Bán thời gian |
| `CTV` | Cộng tác viên |

---

## 18. Vai trò nhân viên

| Vai trò | OT tự động | Ghi chú |
|---------|-----------|---------|
| `Admin` | ✅ | Toàn quyền hệ thống |
| `Nhân Viên Kinh Doanh` | ❌ | Bị chặn OT |
| `Nhân Viên Sản Xuất` | ✅ | |
| `Nhân Viên Bình File` | ✅ | |
| `Nhân Viên Thiết Kế` | ✅ | |
| `Nhân Viên Kế Toán` | ❌ | Bị chặn OT |
| `Nhân Viên Marketing` | ❌ | Bị chặn OT |
| `Quản Lý Sản Xuất` | ✅ | |

---

## 19. Backup & Import

### Backup JSON
- Xuất toàn bộ dữ liệu (nhân sự, logs, đơn, thưởng/phạt, lễ, override) thành file JSON.
- Tên file: `smart-timekeeper-backup-YYYY-MM-DD-HHmm.json`.

### Import Excel
- Hỗ trợ nhập chấm công từ file Excel (.xlsx).
- Cột hỗ trợ (tiếng Anh & Việt): `Email`, `Name/Tên`, `Code/Mã NV`, `Timestamp/Ngày`, `Type/Loại`.
- Khớp nhân viên theo: Email → Mã NV → Tên (ưu tiên theo thứ tự).
- Hỗ trợ cả serial date (Excel) và ISO date string.

---

## Phụ lục: Hằng số quan trọng

```typescript
TIME_RULES = {
  MORNING_START: "08:00",
  MORNING_END: "12:00",
  AFTERNOON_START: "13:30",
  AFTERNOON_END: "17:30",
  LATE_BUFFER_MINUTES: 5,        // Buffer trễ: 5 phút
  OT_AUTO_TRIGGER_MINUTES: 15,   // Ngưỡng tự động tính OT: 15 phút
  SNAP_MIN_MINUTES: 230,         // Snap-to-grid min: ~3h50
  SNAP_MAX_MINUTES: 250,         // Snap-to-grid max: ~4h10
  SESSION_FULL_MINUTES: 240      // 1 ca = 4 tiếng
}

OT_MULTIPLIERS = {
  WEEKDAY: 1.5,   // Ngày thường
  SUNDAY: 2.0,    // Chủ nhật
  HOLIDAY: 4.0    // Ngày lễ
}

INSURANCE_RATE = 10.5%  // Tỷ lệ đóng BHXH
LEAVE_DAYS_PER_MONTH = 1        // Tích luỹ 1 ngày phép/tháng làm việc
LEAVE_MAX_DAYS_PER_YEAR = 12    // Trần quỹ phép 1 năm
MONTHLY_PAID_LEAVE_QUOTA = 2    // Trần 2 ngày phép năm/tháng (chỉ áp cho NV tự xin nghỉ)
MAX_SWAP_BACKDATE_DAYS = 7      // NV chỉ gửi đơn đổi ngày nghỉ trong 7 ngày sau CN làm bù (utils/restDay.ts)
```
