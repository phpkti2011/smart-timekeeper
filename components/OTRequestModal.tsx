import React, { useState, useEffect } from 'react';
import { X, Clock, FileText, Send, Plus, Trash2, Home, Building2, Moon, AlertTriangle, User } from 'lucide-react';
import { AttendanceType, OTLocation } from '../types';
import {
  rangeMinutes, splitOTRange, splitOTRanges, validateOTRanges,
  MAX_HOME_OT_BACKDATE_DAYS, MAX_HOME_OT_MINUTES_PER_DAY, NIGHT_OT_WINDOW
} from '../utils/otRules';

export type OTModalMode = 'OFFICE' | 'HOME' | 'ADMIN';

export interface OTSubmitPayload {
  reason: string;
  date: string;                 // 'yyyy-MM-dd'
  location: OTLocation;
  /** Rỗng = đơn kiểu cũ: chỉ là cờ mở khoá, số phút suy từ giờ chấm công */
  ranges: { start: string; end: string }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: OTSubmitPayload) => void;
  mode: OTModalMode;
  /** Chỉ dùng cho mode OFFICE */
  type?: AttendanceType | null;
  /** Tên nhân viên đang được tạo đơn hộ (mode ADMIN) */
  targetName?: string;
  /** Ngày mặc định 'yyyy-MM-dd' — dùng khi mở từ một dòng ngày cụ thể */
  defaultDate?: string;
  /** Khung giờ đã khai của nhân viên đó trong ngày đang chọn */
  getExistingRanges?: (date: string) => { start?: string | null; end?: string | null }[];
  /** Giờ chấm công 'HH:mm' của nhân viên đó trong ngày đang chọn */
  getAttendanceTimes?: (date: string) => string[];
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtMinutes = (m: number) => {
  if (m <= 0) return '0 phút';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r} phút`;
};

export const OTRequestModal: React.FC<Props> = ({
  isOpen, onClose, onSubmit, mode, type, targetName, defaultDate,
  getExistingRanges, getAttendanceTimes
}) => {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(defaultDate || todayStr());
  const [location, setLocation] = useState<OTLocation>(mode === 'HOME' ? 'HOME' : 'OFFICE');
  const [ranges, setRanges] = useState<{ start: string; end: string }[]>([{ start: '', end: '' }]);

  // Mở lại modal thì trả form về mặc định của chế độ đang mở.
  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setDate(defaultDate || todayStr());
    setLocation(mode === 'HOME' ? 'HOME' : 'OFFICE');
    setRanges([{ start: '', end: '' }]);
  }, [isOpen, mode, defaultDate]);

  if (!isOpen) return null;

  const isOffice = mode === 'OFFICE';
  const isAdmin = mode === 'ADMIN';

  // === NHÁNH CŨ: tăng ca tại công ty, gửi kèm chấm công ===
  if (isOffice) {
    if (!type) return null;
    const title = type === AttendanceType.OT_MORNING ? 'Đăng ký Tăng Ca Sáng' : 'Đăng ký Tăng Ca Chiều';

    const handleSubmitOffice = (e: React.FormEvent) => {
      e.preventDefault();
      if (!reason.trim()) {
        alert('Vui lòng nhập lý do tăng ca');
        return;
      }
      // ranges rỗng → giữ nguyên hành vi cũ hoàn toàn: đơn chỉ là cờ mở khoá.
      onSubmit({ reason, date: todayStr(), location: 'OFFICE', ranges: [] });
      setReason('');
    };

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <Clock size={20} />
              <h2 className="font-bold text-lg">{title}</h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmitOffice} className="p-6 space-y-4">
            <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg flex items-start gap-2">
              <div className="mt-0.5 text-yellow-600"><FileText size={16} /></div>
              <p className="text-xs text-yellow-800 leading-relaxed">
                Theo quy định, bạn cần gửi đơn đăng ký cho OT đầu ca. Giờ chấm công sẽ chỉ được tính sau khi đơn được duyệt.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Lý do tăng ca <span className="text-red-500">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm min-h-[100px] resize-none"
                placeholder="Ví dụ: Fix bug gấp dự án A, Hỗ trợ khách hàng..."
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Send size={18} />
              Gửi yêu cầu & Chấm công
            </button>
          </form>
        </div>
      </div>
    );
  }

  // === NHÁNH MỚI: khai theo khung giờ (tại nhà / Admin tạo hộ) ===
  const existing = getExistingRanges ? getExistingRanges(date) : [];
  const attendanceTimes = getAttendanceTimes ? getAttendanceTimes(date) : [];
  const filledRanges = ranges.filter(r => r.start && r.end);
  const totalSplit = splitOTRanges(filledRanges);
  const totalMinutes = totalSplit.dayMinutes + totalSplit.nightMinutes;

  const validationError = validateOTRanges({
    date, ranges, existingRanges: existing, attendanceTimes, today: todayStr(), isAdmin
  });

  const handleSubmitDeclared = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do tăng ca');
      return;
    }
    if (validationError) {
      alert(validationError);
      return;
    }
    onSubmit({ reason, date, location, ranges: filledRanges });
  };

  const updateRange = (i: number, field: 'start' | 'end', value: string) =>
    setRanges(prev => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const title = isAdmin ? 'Tạo Đơn Tăng Ca (Admin)' : 'Tăng Ca Tại Nhà';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all my-auto max-h-[95vh] flex flex-col">

        <div className={`p-4 flex justify-between items-center text-white ${isAdmin ? 'bg-gradient-to-r from-rose-600 to-orange-600' : 'bg-gradient-to-r from-teal-600 to-cyan-600'}`}>
          <div className="flex items-center gap-2 min-w-0">
            {isAdmin ? <User size={20} /> : <Home size={20} />}
            <div className="min-w-0">
              <h2 className="font-bold text-lg leading-tight">{title}</h2>
              {isAdmin && targetName && (
                <p className="text-xs text-white/85 truncate">Tạo hộ: <b>{targetName}</b> · Tự động duyệt</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmitDeclared} className="p-5 space-y-4 overflow-y-auto">

          {/* Ngày */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Ngày tăng ca <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm"
            />
            {!isAdmin && (
              <p className="text-[11px] text-gray-500">
                Chỉ khai bù được trong vòng {MAX_HOME_OT_BACKDATE_DAYS} ngày, tối đa {MAX_HOME_OT_MINUTES_PER_DAY / 60} tiếng một ngày.
              </p>
            )}
          </div>

          {/* Nơi làm — chỉ Admin được chọn; nhân viên tự khai thì mặc định tại nhà */}
          {isAdmin && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Nơi làm việc</label>
              <div className="grid grid-cols-2 gap-2">
                {([['OFFICE', 'Tại công ty', Building2], ['HOME', 'Tại nhà', Home]] as const).map(([val, label, Icon]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setLocation(val)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-1.5 ${
                      location === val
                        ? 'bg-rose-600 text-white border-rose-600 shadow'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Khung giờ */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Khung giờ làm <span className="text-red-500">*</span></label>

            {ranges.map((r, i) => {
              const mins = rangeMinutes(r.start, r.end);
              const split = splitOTRange(r.start, r.end);
              const crossesMidnight = !!r.start && !!r.end && r.end <= r.start;
              return (
                <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => updateRange(i, 'start', e.target.value)}
                      className="flex-1 min-w-0 px-2 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    <span className="text-gray-400 text-sm shrink-0">→</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => updateRange(i, 'end', e.target.value)}
                      className="flex-1 min-w-0 px-2 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    {ranges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRanges(prev => prev.filter((_, j) => j !== i))}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                        aria-label="Xoá khung giờ"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {mins > 0 && (
                    <div className="text-[11px] text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-gray-800">{fmtMinutes(mins)}</span>
                      {split.nightMinutes > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-semibold">
                          <Moon size={11} /> {split.nightMinutes} phút sau {NIGHT_OT_WINDOW.start} ×2
                        </span>
                      )}
                      {crossesMidnight && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                          <AlertTriangle size={11} /> vắt qua nửa đêm
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setRanges(prev => [...prev, { start: '', end: '' }])}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm font-semibold text-gray-500 hover:border-teal-400 hover:text-teal-600 transition flex items-center justify-center gap-1.5"
            >
              <Plus size={15} /> Thêm khung giờ
            </button>
          </div>

          {/* Tổng */}
          {totalMinutes > 0 && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-teal-800 font-semibold">Tổng khai báo</span>
                <span className="text-teal-900 font-bold">{fmtMinutes(totalMinutes)}</span>
              </div>
              {totalSplit.nightMinutes > 0 && (
                <p className="text-[11px] text-teal-700 mt-1">
                  Trong đó {totalSplit.dayMinutes} phút hệ số thường và {totalSplit.nightMinutes} phút trong khung đêm {NIGHT_OT_WINDOW.start}–{NIGHT_OT_WINDOW.end} hưởng ×2.
                </p>
              )}
              <p className="text-[11px] text-teal-700 mt-1">
                Số công quy đổi tính theo hệ số của ngày {date.split('-').reverse().join('/')} sau khi đơn được duyệt.
              </p>
            </div>
          )}

          {/* Lỗi */}
          {validationError && filledRanges.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs text-red-800 leading-relaxed">{validationError}</p>
            </div>
          )}

          {/* Lý do */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Lý do tăng ca <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm min-h-[70px] resize-none"
              placeholder="Ví dụ: Xử lý đơn hàng gấp cho khách..."
            />
          </div>

          <button
            type="submit"
            disabled={!!validationError || !reason.trim()}
            className={`w-full py-3.5 rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
              validationError || !reason.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : isAdmin ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-teal-600 text-white hover:bg-teal-700'
            }`}
          >
            <Send size={18} />
            {isAdmin ? 'Tạo đơn & Duyệt luôn' : 'Gửi đơn tăng ca'}
          </button>

          <p className="text-[11px] text-gray-500 text-center">
            {isAdmin
              ? 'Đơn do Admin tạo được duyệt ngay. Vẫn bị chặn nếu khung giờ trùng với giờ đã chấm công.'
              : 'Không cần chấm công và không kiểm tra vị trí. Đơn cần được duyệt mới tính công.'}
          </p>
        </form>
      </div>
    </div>
  );
};
