# 📋 TÀI LIỆU QUY CÁCH, LOGIC & NGUYÊN TẮC PHẦN MỀM CHẤM CÔNG P&D

> **Phiên bản:** 4.0 | **Cập nhật:** 22/03/2026  
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
| `requests` | Đơn OT / Trễ / Nghỉ phép / Ứng lương |
| `bonuses` | Thưởng / Phạt |
| `holidays` | Ngày lễ |
| `salary_changes` | Lịch sử thay đổi lương |
| `payroll_periods` | Bảng lương đã chốt |
| `settings` | Cấu hình GPS/IP công ty |

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
- **Nhân viên thường**: Chỉ xem/chấm công/gửi đơn của chính mình.

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

### Ngày chủ nhật
- Chủ nhật **KHÔNG** tính công chuẩn (`standardWorkDays = 0`).
- Toàn bộ thời gian làm việc CN → Tự động chuyển sang **OT Chủ nhật** (hệ số ×2.0).

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

### Công thức quy đổi OT sang ngày công
```
convertedOTDays = (otMinutes × multiplier) / 480
```
> 480 phút = 1 ngày công (8 tiếng).

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
| Loại | Mô tả |
|------|-------|
| `PAID` | Nghỉ có lương |
| `UNPAID` | Nghỉ không lương |

### Thời lượng nghỉ (`LeaveDuration`)
| Giá trị | Mô tả | Tính công |
|---------|-------|-----------|
| `FULL` | Cả ngày | PAID → 1.0, UNPAID → 0.0 |
| `MORNING` | Nửa sáng | PAID → 0.5, UNPAID → 0.0 |
| `AFTERNOON` | Nửa chiều | PAID → 0.5, UNPAID → 0.0 |

### Quota phép có lương
- **1 ngày/tháng** (cho hợp đồng chính thức).
- **Không cộng dồn** — Mỗi tháng reset về 1 ngày.
- Quota kiểm tra cả đơn `APPROVED` + `PENDING` → Tránh gửi nhiều đơn bypass.
- Nếu hết quota → Hệ thống **CHẶN** không cho gửi đơn PAID, yêu cầu chọn UNPAID.

### Tính phép còn lại (`calculateRemainingLeave`)
```
remainingLeave = monthsWorked - usedPaidDays - usedLegacy
```
- `monthsWorked`: Số tháng từ ngày ký HĐ (hoặc đầu năm, tùy chế độ).
- `usedPaidDays`: Tổng ngày phép PAID đã dùng (APPROVED).
- `usedLegacy`: Số ngày phép nhập tay (cho dữ liệu cũ).

### Xử lý nghỉ phép trong ngày
- **Nghỉ cả ngày**: Không tính chấm công, return sớm.
- **Nghỉ nửa ngày**: Tính công cho nửa ngày còn lại + cộng 0.5 (nếu PAID) cho nửa ngày nghỉ.

### Duyệt nghỉ phép
- Admin duyệt → Trừ `leaveBalance` của nhân viên.
- Admin bác / chuyển trạng thái → Hoàn lại `leaveBalance`.

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
| `requests` | Cập nhật đơn OT/Trễ/Phép/Ứng lương |
| `bonuses` | Cập nhật thưởng/phạt |
| `attendance_overrides` | Cập nhật override |
| `profiles` | Cập nhật khi có nhân viên mới đăng ký |
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
| `leaveBalance` | number | Số ngày phép còn |
| `usedLeaveLegacy` | number | Phép đã dùng (nhập tay) |
| `resignationDate` | string | Ngày nghỉ việc |

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
LEAVE_PER_MONTH = 1     // 1 ngày phép có lương/tháng
```
