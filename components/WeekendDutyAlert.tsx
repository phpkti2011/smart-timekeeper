import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Holiday, SwapRequest, UserProfile, WeekendSchedule } from '../types';
import { Users, X, Repeat } from 'lucide-react';
import { dutyForWeek, findDutyHoliday, hasSwapForSunday, WEEKEND_GROUP_LABEL, SundayDuty } from '../utils/weekendGroups';

// Banner nhắc nhân viên: nhóm của mình làm Chủ Nhật tuần này mà chưa có đơn
// đổi ngày nghỉ (nghỉ T7, làm bù CN). Khuôn theo LeaveAlert: tắt được theo
// ngày bằng localStorage. Đặt góc DƯỚI phải để không chồng HolidayAlert (trên phải).
//
// Admin không có banner: đã có báo cáo Telegram mỗi sáng, số đếm ở tab
// "Nhóm làm CN" và tên người thiếu đơn ở footer Lịch công ty.

interface Props {
  currentUser: UserProfile;
  weekendSchedule: WeekendSchedule;
  /** Đơn đổi ngày nghỉ của CHÍNH nhân viên này */
  swapRequests: SwapRequest[];
  holidays: Holiday[];
  /** Mở form đổi ngày nghỉ đã điền sẵn Thứ 7 ('yyyy-MM-dd') */
  onFileRequest: (restDateISO: string) => void;
}

const DISMISS_KEY = 'weekend_duty_dismissed';
const todayKey = () => format(new Date(), 'yyyy-MM-dd');

export const WeekendDutyAlert: React.FC<Props> = ({ currentUser, weekendSchedule, swapRequests, holidays, onFileRequest }) => {
  const [duty, setDuty] = useState<SundayDuty | null>(null);

  useEffect(() => {
    if (currentUser.role === 'Admin') { setDuty(null); return; }

    let dismissed: string | null = null;
    try { dismissed = localStorage.getItem(DISMISS_KEY); } catch { /* chế độ riêng tư: coi như chưa tắt */ }
    if (dismissed === todayKey()) { setDuty(null); return; }

    const d = dutyForWeek(currentUser, new Date(), weekendSchedule);
    if (!d) { setDuty(null); return; }
    if (findDutyHoliday(d.sunday, holidays)) { setDuty(null); return; }                 // trùng lễ: 6b đã vô hiệu đơn
    if (hasSwapForSunday(currentUser.id, d.sunday, swapRequests)) { setDuty(null); return; } // đã có đơn (kể cả chờ duyệt)
    setDuty(d);
  }, [currentUser, weekendSchedule, swapRequests, holidays]);

  if (!duty) return null;

  const isSundayToday = todayKey() === format(duty.sunday, 'yyyy-MM-dd');

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, todayKey()); } catch { /* bỏ qua */ }
    setDuty(null);
  };

  return (
    <div className="fixed bottom-24 right-4 left-4 sm:left-auto z-50 animate-bounce-in" style={{ maxWidth: '380px' }}>
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 rounded-xl shadow-2xl border border-amber-300/40 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>

        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md shrink-0">
            <Users size={24} className="text-white" />
          </div>
          <div className="flex-1 pr-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-100 mb-0.5">
              {WEEKEND_GROUP_LABEL[duty.group]} làm Chủ Nhật
            </p>
            <h3 className="text-sm font-bold leading-tight">
              {isSundayToday
                ? `Hôm nay (CN ${format(duty.sunday, 'dd/MM')}) nhóm bạn đi làm`
                : `Chủ Nhật ${format(duty.sunday, 'dd/MM')} nhóm bạn đi làm`}
            </h3>
            <p className="mt-1 text-xs text-amber-50">
              Nghỉ bù Thứ 7 {format(duty.saturday, 'dd/MM')}. Bạn <b>chưa có đơn đổi ngày nghỉ</b> cho tuần này —
              chưa có đơn thì Thứ 7 vẫn tính là ngày làm việc.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors text-white/70 hover:text-white"
            title="Để sau (nhắc lại ngày mai)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onFileRequest(format(duty.saturday, 'yyyy-MM-dd'))}
            className="flex-1 py-2 bg-white text-amber-700 rounded-lg text-xs font-bold shadow active:scale-95 transition flex items-center justify-center gap-1"
          >
            <Repeat size={14} /> Làm đơn ngay
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 bg-white/15 rounded-lg text-xs font-semibold hover:bg-white/25 transition"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
};
