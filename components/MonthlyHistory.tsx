import React, { useMemo, useState } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay, isSunday, isFuture, isSameMonth, parse, addMinutes } from 'date-fns';
import { AttendanceLog, AttendanceType, OTRequest, LateRequest, Holiday, OverrideLog, LeaveRequest, SalaryAdvanceRequest, SwapRequest } from '../types';
import { OT_MULTIPLIERS, TIME_RULES } from '../constants';
import { calculateDailyStats } from '../utils/attendanceCalculator';
import { Calendar, AlertTriangle, FileText, CheckCircle2, Clock, History, DollarSign, LogOut, Home, Moon, Repeat } from 'lucide-react';
import { LEAVE_TYPE_LABEL } from '../utils/leaveTypes';
import { formatOTFormula, formatDeclaredRanges, totalOTMinutes, OT_LOCATION_LABEL } from '../utils/otDisplay';
import { restDayStatusText, restDayMinutesLabel, describeSwapShort } from '../utils/restDay';

interface Props {
  viewingMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  currentMonthLogs: AttendanceLog[];
  otRequests?: OTRequest[];
  lateRequests?: LateRequest[];
  leaveRequests?: LeaveRequest[];
  advanceRequests?: SalaryAdvanceRequest[];
  /** Đơn đổi ngày nghỉ CỦA NV này (App đã lọc) */
  swapRequests?: SwapRequest[];
  overrides?: OverrideLog[];
  onExplainLate: (date: Date, minutes: number) => void;
  /** Mở modal khai tăng ca theo khung giờ cho đúng ngày của dòng đó */
  onDeclareOT?: (date: Date) => void;
  holidays: Holiday[];
  userRole: any;
  onFetchMonthData?: (month: Date) => Promise<void>;
}

const getVietnameseDay = (date: Date): string => {
  const day = date.getDay();
  if (day === 0) return 'Chủ Nhật';
  return `Thứ ${day + 1}`;
};

// ... (Keep existing helpers) ...

const getTimeSlots = (logs: AttendanceLog[]) => {
  const findTime = (...types: AttendanceType[]) => {
    const log = logs.find(l => types.includes(l.type));
    return log ? format(log.timestamp, 'HH:mm') : '--:--';
  };

  return {
    in1: findTime(AttendanceType.IN_MORNING, AttendanceType.OT_MORNING),
    out1: findTime(AttendanceType.OUT_MORNING),
    in2: findTime(AttendanceType.IN_AFTERNOON, AttendanceType.OT_AFTERNOON),
    out2: findTime(AttendanceType.OUT_AFTERNOON),
  };
};

export const MonthlyHistory: React.FC<Props> = ({
  viewingMonth, onPrevMonth, onNextMonth,
  currentMonthLogs, otRequests = [], lateRequests = [], leaveRequests = [], advanceRequests = [], swapRequests = [], overrides = [],
  onExplainLate, onDeclareOT, holidays, userRole, onFetchMonthData
}) => {
  const today = new Date();
  const [activeTab, setActiveTab] = useState<'attendance' | 'requests'>('attendance');

  // Lazy-load data when viewing older months
  React.useEffect(() => {
    if (onFetchMonthData) onFetchMonthData(viewingMonth);
  }, [viewingMonth, onFetchMonthData]);

  const monthStart = startOfMonth(viewingMonth);
  const monthEnd = endOfMonth(viewingMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const daysReversed = [...daysInMonth].reverse();

  // --- ATTENDANCE STATS ---
  const dailyStats = useMemo(() => {
    return daysReversed.map(day => {
      const overrideForDay = overrides.find(o => isSameDay(o.date, day));

      // Lọc đơn theo TỪNG ngày, không chỉ riêng hôm nay. Trước đây ngày quá khứ
      // truyền mảng rỗng nên đơn OT/giải trình của ngày cũ không hiện ở màn này,
      // dù salaryCalculator và AdminEmployeeDetail vẫn lọc đúng theo ngày.
      const logsForDay: AttendanceLog[] = isFuture(day)
        ? []
        : currentMonthLogs.filter(log => isSameDay(log.timestamp, day));
      const requestsForDay: OTRequest[] = otRequests.filter(r => isSameDay(r.date, day));
      const lateReqsForDay: LateRequest[] = lateRequests.filter(r => isSameDay(r.date, day));

      return calculateDailyStats(day, logsForDay, userRole, holidays, 0, requestsForDay, lateReqsForDay, leaveRequests, overrideForDay, swapRequests);
    });
  }, [currentMonthLogs, otRequests, lateRequests, leaveRequests, swapRequests, overrides, today, holidays, viewingMonth]); // Added viewingMonth and leaveRequests dep

  // --- REQUESTS LIST ---
  const monthlyRequests = useMemo(() => {
    const allRequests = [
      ...otRequests.filter(r => isSameMonth(new Date(r.date), viewingMonth)).map(r => ({ ...r, typeLabel: 'Tăng Ca', sortDate: new Date(r.date), icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' })),
      ...lateRequests.filter(r => isSameMonth(new Date(r.date), viewingMonth)).map(r => ({ ...r, typeLabel: 'Đi Trễ', sortDate: new Date(r.date), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' })),
      ...leaveRequests.filter(r => isSameMonth(new Date(r.startDate), viewingMonth)).map(r => ({ ...r, typeLabel: 'Nghỉ Phép', sortDate: new Date(r.startDate), icon: LogOut, color: 'text-rose-600', bg: 'bg-rose-50' })),
      ...advanceRequests.filter(r => isSameMonth(new Date(r.date), viewingMonth)).map(r => ({ ...r, typeLabel: 'Ứng Lương', sortDate: new Date(r.date), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' })),
      // Đơn vắt tháng (T7 cuối tháng – CN đầu tháng sau) hiện ở cả hai tháng
      ...swapRequests.filter(r => isSameMonth(r.restDate, viewingMonth) || isSameMonth(r.workDate, viewingMonth)).map(r => ({ ...r, typeLabel: 'Đổi Ngày Nghỉ', sortDate: r.restDate, icon: Repeat, color: 'text-violet-600', bg: 'bg-violet-50' })),
    ];
    // Sort descending
    return allRequests.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
  }, [otRequests, lateRequests, leaveRequests, advanceRequests, swapRequests, viewingMonth]);


  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[60vh] relative z-10 pb-10">

      {/* Header */}
      <div className="bg-white p-5 border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 rounded-xl text-brand-600 shadow-sm border border-brand-100">
              <Calendar size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 leading-none">Lịch Sử {format(viewingMonth, 'MM/yyyy')}</h2>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center gap-2">
            <button onClick={onPrevMonth} className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"><svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button onClick={onNextMonth} className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"><svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'attendance' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Bảng Công
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'requests' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Đơn Từ ({monthlyRequests.length})
          </button>
        </div>
      </div>

      {/* CONTENT: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="p-4 space-y-4 bg-white">
          {/* Late Count Summary Banner */}
          {(() => {
            const lateCount = dailyStats.filter(s => s.isLate && !s.isExcused).length;
            if (lateCount === 0) return null;

            let penaltyText = '';
            let bgColor = 'bg-yellow-50 border-yellow-200';
            let textColor = 'text-yellow-700';

            if (lateCount === 1) {
              penaltyText = '⚠️ Nhắc nhở (chưa trừ phụ cấp)';
              bgColor = 'bg-yellow-50 border-yellow-200';
              textColor = 'text-yellow-700';
            } else if (lateCount === 2) {
              penaltyText = '💸 Sẽ bị trừ 20% phụ cấp tháng này';
              bgColor = 'bg-orange-50 border-orange-200';
              textColor = 'text-orange-700';
            } else if (lateCount === 3) {
              penaltyText = '💸 Sẽ bị trừ 50% phụ cấp tháng này';
              bgColor = 'bg-orange-50 border-orange-200';
              textColor = 'text-orange-700';
            } else {
              penaltyText = '🛑 Sẽ bị trừ 100% phụ cấp tháng này';
              bgColor = 'bg-red-50 border-red-200';
              textColor = 'text-red-700';
            }

            return (
              <div className={`${bgColor} border rounded-xl p-4 flex items-center gap-3`}>
                <AlertTriangle size={24} className={textColor} />
                <div>
                  <div className={`font-bold ${textColor}`}>
                    Bạn đã đi trễ {lateCount} lần trong tháng này
                  </div>
                  <div className={`text-sm ${textColor} opacity-80`}>{penaltyText}</div>
                </div>
              </div>
            );
          })()}

          {dailyStats.map((stat) => {
            // ... (Keep existing rendering logic for attendance cards)
            // Copy logic from previous file content, but just reference it here to save tokens? No, I must replace entire block.
            // I will try to keep the diff minimal or rewrite the loop.
            if (stat.status === 'future') return null;
            // Ngày làm việc (kể cả Chủ Nhật đã đổi thành ngày làm) không có dữ liệu → vắng
            if (stat.status === 'absent' && !stat.isRestDay) {
              return (
                <div key={stat.date.toISOString()} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between opacity-70">
                  <div>
                    <div className="text-sm font-bold text-slate-500">{format(stat.date, 'dd/MM/yyyy')} - {getVietnameseDay(stat.date)}</div>
                    <div className="text-xs text-slate-400 italic mt-1">
                      Vắng mặt / Không có dữ liệu{stat.restDayKind === 'SWAP_WORK' ? ' — Ngày làm bù Chủ Nhật' : ''}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-slate-300">0 công</div>
                </div>
              )
            }
            // Ngày nghỉ tuần (CN, hoặc T7 đã đổi) không chấm công vẫn phải mở ra nếu có
            // tăng ca khai báo, nếu không thì đơn khai cho ngày đó sẽ vô hình ở màn này.
            if (stat.isRestDay && stat.logs.length === 0 && stat.otBreakdown.totalConvertedDays === 0) {
              return (
                <div key={stat.date.toISOString()} className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="text-purple-400 font-bold text-sm w-12 text-center">{format(stat.date, 'dd')}</div>
                  <div className="text-purple-400 text-xs font-medium">{restDayStatusText(stat.restDayKind)}</div>
                </div>
              )
            }

            const slots = getTimeSlots(stat.logs);
            const totalWork = (stat.standardWorkDays + stat.otBreakdown.totalConvertedDays).toFixed(3);
            const hasOT = stat.otBreakdown.totalConvertedDays > 0;
            const totalOtMin = totalOTMinutes(stat.otBreakdown);
            const otMultiplier = stat.isRestDay ? OT_MULTIPLIERS.SUNDAY : OT_MULTIPLIERS.WEEKDAY;
            const dayRequests = stat.otRequests || [];

            return (
              <div key={stat.date.toISOString()} className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm transition-all hover:shadow-md bg-white">
                <div className={`px-4 py-3 flex justify-between items-start ${stat.isRestDay ? 'bg-purple-50' : 'bg-teal-50/50'}`}>
                  <div>
                    <div className="text-lg font-extrabold text-gray-800">{format(stat.date, 'dd/MM/yyyy')}</div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-0.5 flex items-center gap-2">
                      {getVietnameseDay(stat.date)}
                      {stat.isLate && !stat.isExcused && <span className="text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"><AlertTriangle size={10} /> Trễ {stat.lateMinutes}'</span>}
                      {stat.isLate && stat.isExcused && <span className="text-green-600 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle2 size={10} /> Đã duyệt trễ</span>}
                      {stat.statusText && stat.statusText !== 'Đi làm' && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${stat.status === 'holiday' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                          stat.status === 'leave' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            'bg-gray-50 text-gray-500 border-gray-100'
                          }`}>
                          {stat.statusText}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500 font-medium">Công Chuẩn: {stat.standardWorkDays.toFixed(3)}</div>
                    <div className="text-xs text-gray-500 font-medium">Công Tăng Ca: {stat.otBreakdown.totalConvertedDays.toFixed(3)}</div>
                    <div className={`text-xl font-bold mt-1 ${stat.isRestDay ? 'text-purple-600' : 'text-teal-600'}`}>{totalWork} <span className="text-xs font-normal text-gray-400">công</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm border-t border-gray-100 bg-white">
                  <div className="flex justify-between"><span className="font-semibold text-gray-500">Vào 1:</span><span className={`font-mono font-bold ${stat.overrideForDay?.in1 ? 'text-red-500' : 'text-gray-800'}`}>{slots.in1}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-gray-500">Ra 1:</span><span className={`font-mono font-bold ${stat.overrideForDay?.out1 ? 'text-red-500' : 'text-gray-800'}`}>{slots.out1}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-gray-500">Vào 2:</span><span className={`font-mono font-bold ${stat.overrideForDay?.in2 ? 'text-red-500' : 'text-gray-800'}`}>{slots.in2}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-gray-500">Ra 2:</span><span className={`font-mono font-bold ${stat.overrideForDay?.out2 ? 'text-red-500' : 'text-gray-800'}`}>{slots.out2}</span></div>
                </div>

                {onDeclareOT && stat.status !== 'future' && (
                  <div className="px-4 py-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => onDeclareOT(stat.date)}
                      className="text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-lg hover:bg-teal-100 transition font-bold active:scale-95 flex items-center gap-1"
                    >
                      <Home size={11} /> Khai tăng ca tại nhà
                    </button>
                  </div>
                )}

                {stat.isLate && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-red-50/30 flex items-center justify-between">
                    {stat.lateRequest ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-gray-600">Trạng thái giải trình:</span>
                        {stat.lateRequest.status === 'PENDING' && <span className="text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={10} /> Chờ duyệt</span>}
                        {stat.lateRequest.status === 'APPROVED' && <span className="text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> Đã duyệt</span>}
                        {stat.lateRequest.status === 'REJECTED' && <span className="text-red-600 font-bold bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={10} /> Bị từ chối</span>}
                      </div>
                    ) : (
                      <>
                        <span className="text-xs text-red-500 italic">Bạn đi trễ {stat.lateMinutes} phút.</span>
                        <button onClick={() => onExplainLate(stat.date, stat.lateMinutes)} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition font-bold shadow-sm active:scale-95">Giải trình</button>
                      </>
                    )}
                  </div>
                )}

                {dayRequests.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-indigo-50/50 space-y-2">
                    {dayRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-indigo-700 min-w-0">
                          <FileText size={12} className="shrink-0" />
                          <span className="font-medium shrink-0">
                            {req.otStart && req.otEnd
                              ? `Đơn OT ${req.otStart}–${req.otEnd} ${OT_LOCATION_LABEL[req.otLocation || 'OFFICE']}:`
                              : `Đơn OT (${req.shift === 'MORNING' ? 'Sáng' : 'Chiều'}):`}
                          </span>
                          <span className="truncate text-gray-600" title={req.reason}>{req.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hasOT && (
                  <div className="bg-slate-800 text-slate-200 px-4 py-3 text-xs">
                    <div className="font-bold text-white mb-2">Chi tiết Tăng Ca: {formatOTFormula(stat.otBreakdown, otMultiplier)}</div>
                    <ul className="space-y-1 opacity-90">
                      {stat.otBreakdown.earlyMorningMinutes > 0 && (
                        <li>
                          • Tăng Ca Sáng Sớm ({
                            (() => {
                              const end = parse(TIME_RULES.MORNING_START, 'HH:mm', stat.date);
                              const start = addMinutes(end, -stat.otBreakdown.earlyMorningMinutes);
                              return `${format(start, 'HH:mm')} - ${TIME_RULES.MORNING_START}`;
                            })()
                          }): {stat.otBreakdown.earlyMorningMinutes} phút
                        </li>
                      )}
                      {stat.otBreakdown.lunchMinutes > 0 && (
                        <>
                          {/* Breakdown: Late Morning Out */}
                          {(() => {
                            const morningEnd = parse(TIME_RULES.MORNING_END, 'HH:mm', stat.date);
                            const outLog = stat.logs.find(l => l.type === AttendanceType.OUT_MORNING);
                            if (outLog && outLog.timestamp > morningEnd) {
                              const diff = Math.round((outLog.timestamp.getTime() - morningEnd.getTime()) / 60000);
                              if (diff >= TIME_RULES.OT_AUTO_TRIGGER_MINUTES) {
                                return (
                                  <li>
                                    • Tăng Ca Trưa ({TIME_RULES.MORNING_END} - {format(outLog.timestamp, 'HH:mm')}): {diff} phút
                                  </li>
                                );
                              }
                            }
                            return null;
                          })()}

                          {/* Breakdown: Early Afternoon In */}
                          {(() => {
                            const afternoonStart = parse(TIME_RULES.AFTERNOON_START, 'HH:mm', stat.date);
                            const inLog = stat.logs.find(l => l.type === AttendanceType.IN_AFTERNOON || l.type === AttendanceType.OT_AFTERNOON);
                            if (inLog && inLog.timestamp < afternoonStart) {
                              const diff = Math.round((afternoonStart.getTime() - inLog.timestamp.getTime()) / 60000);
                              if (diff >= TIME_RULES.OT_AUTO_TRIGGER_MINUTES) {
                                return (
                                  <li>
                                    • Tăng Ca Trưa ({format(inLog.timestamp, 'HH:mm')} - {TIME_RULES.AFTERNOON_START}): {diff} phút
                                  </li>
                                );
                              }
                            }
                            return null;
                          })()}
                        </>
                      )}
                      {stat.otBreakdown.eveningMinutes > 0 && (
                        <li>
                          • Tăng Ca Tối ({
                            (() => {
                              const start = parse(TIME_RULES.AFTERNOON_END, 'HH:mm', stat.date);
                              const end = addMinutes(start, stat.otBreakdown.eveningMinutes);
                              return `${TIME_RULES.AFTERNOON_END} - ${format(end, 'HH:mm')}`;
                            })()
                          }): {stat.otBreakdown.eveningMinutes} phút
                        </li>
                      )}
                      {stat.otBreakdown.sundayMinutes > 0 && (
                        <li>• {restDayMinutesLabel(stat.restDayKind)}: {stat.otBreakdown.sundayMinutes} phút</li>
                      )}
                      {stat.otBreakdown.declaredMinutes > 0 && (
                        <li>
                          • Tăng ca khai báo ({formatDeclaredRanges(dayRequests)}): {stat.otBreakdown.declaredMinutes} phút
                        </li>
                      )}
                      {stat.otBreakdown.nightMinutes > 0 && (
                        <li className="text-indigo-300 flex items-center gap-1">
                          <Moon size={11} /> Trong đó {stat.otBreakdown.nightMinutes} phút thuộc khung đêm 22:00–06:00, hưởng hệ số ×2
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CONTENT: REQUESTS */}
      {activeTab === 'requests' && (
        <div className="p-4 space-y-4 bg-white animate-fade-in">
          {monthlyRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <History size={32} />
              </div>
              <p className="font-medium">Chưa có đơn nào trong tháng này</p>
            </div>
          ) : (
            monthlyRequests.map((req: any) => {
              const StatusIcon = req.status === 'APPROVED' ? CheckCircle2 : req.status === 'REJECTED' ? AlertTriangle : Clock;
              const statusColor = req.status === 'APPROVED' ? 'text-green-600 bg-green-50 border-green-100' : req.status === 'REJECTED' ? 'text-red-600 bg-red-50 border-red-100' : 'text-orange-600 bg-orange-50 border-orange-100';
              const statusLabel = req.status === 'APPROVED' ? 'Đã duyệt' : req.status === 'REJECTED' ? 'Bị từ chối' : 'Chờ duyệt';

              return (
                <div key={req.id} className="bg-white border boundary-gray-100 rounded-2xl shadow-sm p-4 flex gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${req.bg} ${req.color}`}>
                    <req.icon size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${req.color}`}>{req.typeLabel}</div>
                        <div className="font-bold text-gray-800 text-lg">
                          {format(req.sortDate, 'dd/MM/yyyy')}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${statusColor}`}>
                        <StatusIcon size={12} /> {statusLabel}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                      {req.reason || 'Không có lý do'}
                    </div>

                    <div className="mt-2 flex gap-3 text-xs font-medium text-gray-500">
                      {req.amount && (
                        <div className="flex items-center gap-1">
                          <DollarSign size={12} /> Số tiền: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(req.amount)}
                        </div>
                      )}
                      {req.minutesLate && (
                        <div className="flex items-center gap-1">
                          <Clock size={12} /> Trễ: {req.minutesLate} phút
                        </div>
                      )}
                      {req.shift && (
                        <div className="flex items-center gap-1">
                          <FileText size={12} /> Ca: {req.shift === 'MORNING' ? 'Sáng' : 'Chiều'}
                        </div>
                      )}
                      {req.leaveType && (
                        <div className="flex items-center gap-1">
                          <LogOut size={12} /> Loại: {LEAVE_TYPE_LABEL[req.leaveType] || req.leaveType} ({req.duration})
                        </div>
                      )}
                      {req.restDate && req.workDate && (
                        <div className="flex items-center gap-1">
                          <Repeat size={12} /> {describeSwapShort(req)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};