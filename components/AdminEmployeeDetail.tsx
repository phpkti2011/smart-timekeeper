
import React, { useState, useMemo } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay, isSunday, isFuture, addMonths, subMonths, isSameMonth, parse, addMinutes } from 'date-fns';
import {
  UserProfile,
  OTRequest,
  LateRequest,
  SalaryAdvanceRequest,
  BonusFine,
  AttendanceLog,
  AttendanceType,
  OverrideLog,
  Holiday,
  SalaryChange,
  LeaveRequest
} from '../types';

import { TIME_RULES, OT_MULTIPLIERS } from '../constants';
import { calculateDailyStats } from '../utils/attendanceCalculator';
import { calculateMonthlySalary } from '../utils/salaryCalculator';
import { ArrowLeft, Calendar, DollarSign, AlertTriangle, FileText, CheckCircle2, Clock, ChevronLeft, ChevronRight, Plus, Trash2, SlidersHorizontal, Edit2 } from 'lucide-react';
import { SalaryView } from './SalaryView';
import { BonusPenaltyModal } from './BonusPenaltyModal';
import { AttendanceEditModal } from './AttendanceEditModal';
import { SalaryChangeModal } from './SalaryChangeModal';


interface Props {
  employee: UserProfile;
  onBack: () => void;
  // Global data sources (to be filtered by employee ID)
  otRequests: OTRequest[];
  lateRequests: LateRequest[];
  advances: SalaryAdvanceRequest[];
  bonuses: BonusFine[];
  onAddBonus: (bonus: Omit<BonusFine, 'id'>) => void;
  onUpdateBonus: (bonus: BonusFine) => void; // New
  onDeleteBonus: (id: string) => void;
  onImportBonuses: (userId: string) => void;

  overrides?: OverrideLog[];
  onSaveOverride?: (data: Omit<OverrideLog, 'id'>) => void;
  holidays: Holiday[];
  salaryChanges: SalaryChange[];
  logs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
  onDeleteSalaryChange: (id: string, userId: string) => void;
  onAddSalaryChange: (data: { baseSalary: number; allowance: number; insuranceSalary: number; effectiveDate: string; reason: string }) => void;
  onRequestCreate: (type: 'LEAVE' | 'ADVANCE', targetEmployee: UserProfile) => void;
  lockedMonths: string[]; // New prop
}

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

// Helper to get full Vietnamese Day
const getVietnameseDayFull = (date: Date): string => {
  const day = date.getDay();
  if (day === 0) return 'Chủ Nhật';
  return `Thứ ${day + 1}`;
};

export const AdminEmployeeDetail: React.FC<Props> = ({
  employee,
  onBack,
  otRequests,
  lateRequests,
  advances,
  bonuses,
  onAddBonus,
  onUpdateBonus, // Destructure new prop
  onDeleteBonus,
  onImportBonuses,
  overrides = [],
  onSaveOverride,
  holidays,
  salaryChanges,
  logs,
  leaveRequests,
  onRequestCreate,
  onAddSalaryChange,
  onDeleteSalaryChange,
  lockedMonths
}) => {

  const [activeTab, setActiveTab] = useState<'ATTENDANCE' | 'PAYROLL' | 'ADJUST' | 'HISTORY'>('PAYROLL');
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<BonusFine | null>(null); // New State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<Date | null>(null);
  const [editingStats, setEditingStats] = useState<any>(null); // To pass initial values to modal

  const [editingSalaryChange, setEditingSalaryChange] = useState<SalaryChange | null>(null);

  const handlePrevMonth = () => setSelectedMonth(subMonths(selectedMonth, 1));
  const handleNextMonth = () => setSelectedMonth(addMonths(selectedMonth, 1));

  // Filter global data for this specific employee
  const employeeOtRequests = otRequests.filter(r => r.userId === employee.id);
  const employeeLateRequests = lateRequests.filter(r => r.userId === employee.id);
  const employeeAdvances = advances.filter(r => r.userId === employee.id);
  const employeeBonuses = bonuses.filter(b => b.userId === employee.id);
  const employeeOverrides = overrides.filter(o => o.userId === employee.id);
  const employeeLeaveRequests = leaveRequests.filter(r => r.userId === employee.id);

  const monthBonuses = employeeBonuses.filter(b => isSameMonth(b.date, selectedMonth));

  // Filter logs for this employee
  const employeeLogs = logs.filter(log => log.userId === employee.id);

  const isLocked = lockedMonths.includes(format(selectedMonth, 'MM-yyyy'));

  const monthData = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    const days = eachDayOfInterval({ start, end });

    // Helper to get time slots from logs
    const stats = days.map(day => {
      // Filter real logs for this day using employeeLogs
      const dailyLogs = employeeLogs.filter(log => isSameDay(log.timestamp, day));

      // Removed mock data generation logic

      const dayOtReqs = employeeOtRequests.filter(r => isSameDay(r.date, day));
      const dayLateReqs = employeeLateRequests.filter(r => isSameDay(r.date, day));
      const override = employeeOverrides.find(o => isSameDay(o.date, day));

      return calculateDailyStats(
        day,
        dailyLogs,
        employee.role,
        holidays,
        0,
        dayOtReqs,
        dayLateReqs,
        employeeLeaveRequests,
        override // Pass override
      );
    });

    return { stats, simulatedLogs: [] }; // simulatedLogs unused
  }, [selectedMonth, employee, employeeLogs, employeeOtRequests, employeeLateRequests, employeeOverrides, holidays, employeeLeaveRequests]);

  const salaryReport = useMemo(() => {
    return calculateMonthlySalary(
      selectedMonth,
      employeeLogs, // Use filtered employee logs
      employeeOtRequests,
      employeeLateRequests,
      employeeAdvances,
      employeeBonuses, // Pass all bonuses, calculator filters by month
      employee,
      employeeOverrides,
      holidays,
      salaryChanges,
      employeeLeaveRequests
    );
  }, [selectedMonth, monthData, employee, employeeOtRequests, employeeLateRequests, employeeAdvances, employeeBonuses, holidays, employeeOverrides, salaryChanges, employeeLeaveRequests]);


  const handleAddBonusSubmit = (data: Omit<BonusFine, 'id'>) => {
    if (editingBonus) {
      onUpdateBonus({
        ...data,
        id: editingBonus.id
      });
      setEditingBonus(null);
    } else {
      onAddBonus(data);
    }
    setIsBonusModalOpen(false); // Close here or let Modal close itself via props if wired?
    // Modal closes itself via onClose prop which sets state false. 
    // BUT we need to close it here too because onSubmit prop usually doesn't close it?
    // Actually parent usually closes. Let's look at existing code usage.
    // Existing usage just calls onAddBonus. The Modal calls onSubmit then resets and calls onClose.
    // So we don't need to close it here if the Modal does it.
    // However, we need to clear editing state.
  };

  const handleEditBonus = (bonus: BonusFine) => {
    setEditingBonus(bonus);
    setIsBonusModalOpen(true);
  };


  const handleImportExcel = () => {
    onImportBonuses(employee.id);
    setIsBonusModalOpen(false);
  };

  const handleEditClick = (stat: any) => {
    setEditingDate(stat.date);
    setEditingStats(stat);
    setIsEditModalOpen(true);
  };

  const handleOverrideSave = (data: Omit<OverrideLog, 'id'>) => {
    if (onSaveOverride) {
      onSaveOverride(data);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[80vh] relative z-10 flex flex-col h-full">

      {/* Header */}
      <div className="bg-slate-800 p-4 sm:p-6 text-white sticky top-0 z-30 shadow-lg">
        <div className="flex flex-col gap-4 mb-2">
          {/* Top Row: Name & Info */}
          <div className="flex items-center gap-3 w-full">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition shrink-0">
              <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold truncate">{employee.name}</h1>
              <div className="flex items-center gap-2">
                <p className="text-slate-400 text-xs sm:text-sm truncate max-w-[150px]">{employee.role}</p>
                <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">Logs: {employeeLogs.length}</span>
              </div>
            </div>
          </div>

          {/* Bottom Row: Actions & Month Selector (Moved Here) */}
          <div className="flex flex-row items-center justify-between w-full gap-3 bg-slate-700/30 p-2 rounded-xl border border-white/5">
            {/* Month Selector (Left aligned now for better flow or keep Right? Image shows red box moved down. Usually Actions right, Month left? Or match original order?) 
               Original: Actions (Left/Top in mobile), Month (Right/Bottom in mobile).
               User wants the whole block moved down.
               Let's keep the inner order: Actions + Month Selector.
            */}

            {/* Month Selector */}
            <div className="flex items-center gap-1 bg-slate-700 p-1 rounded-lg border border-slate-600/50 shadow-sm">
              <button onClick={handlePrevMonth} className="p-1 hover:bg-white/10 rounded-md transition-colors text-slate-300 hover:text-white">
                <ChevronLeft size={14} />
              </button>
              <div className="flex items-center gap-1 px-1 text-xs font-bold whitespace-nowrap justify-center min-w-[70px] sm:min-w-[90px]">
                <Calendar size={12} className="text-slate-400 hidden sm:block" />
                <span>{format(selectedMonth, 'MM/yyyy')}</span>
              </div>
              <button onClick={handleNextMonth} className="p-1 hover:bg-white/10 rounded-md transition-colors text-slate-300 hover:text-white">
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => onRequestCreate('LEAVE', employee)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
              >
                <FileText size={14} /> <span className="hidden xs:inline">T.Đơn Nghỉ</span><span className="inline xs:hidden">Nghỉ</span>
              </button>
              <button
                onClick={() => onRequestCreate('ADVANCE', employee)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
              >
                <DollarSign size={14} /> <span className="hidden xs:inline">T.Đơn Ứng</span><span className="inline xs:hidden">Ứng</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs (Single Row) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-700/50 p-1 rounded-xl mt-2">
          <button
            onClick={() => setActiveTab('ATTENDANCE')}
            className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'ATTENDANCE' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Bảng Công
          </button>
          <button
            onClick={() => setActiveTab('PAYROLL')}
            className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'PAYROLL' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Bảng Lương
          </button>
          <button
            onClick={() => setActiveTab('ADJUST')}
            className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'ADJUST' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}
          >
            <DollarSign size={14} /> Thưởng & Phạt
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'HISTORY' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}
          >
            <Clock size={14} /> Lịch sử lương
          </button>
        </div>
      </div>


      {/* Admin Actions: Create Request */}

      <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4 no-scrollbar">

        {/* TAB 1: ATTENDANCE */}
        {activeTab === 'ATTENDANCE' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
            {monthData.stats.map(stat => {
              // Future dates without override: Hide
              if (stat.status === 'future' && !stat.isOverride) return null;

              const slots = getTimeSlots(stat.logs);
              let cardBg = "bg-white";
              let note = stat.statusText || "";
              let borderColor = "border-gray-200";
              let shadow = "shadow-sm hover:shadow-md";

              // Styling logic based on status
              if (stat.isOverride) {
                cardBg = "bg-amber-50";
                borderColor = "border-amber-200";
                // Don't set note here, let late check set it below if applicable
              }

              if (stat.status === 'leave' && !stat.isOverride) {
                cardBg = "bg-green-50";
                borderColor = "border-green-200";
              } else if (stat.isSunday && !stat.isOverride) {
                if (stat.otBreakdown.totalConvertedDays > 0) {
                  cardBg = "bg-purple-50";
                  borderColor = "border-purple-200";
                  note = "Làm Chủ Nhật";
                } else {
                  // Sunday off - simplified view or opacity
                  cardBg = "bg-slate-50 opacity-60";
                  borderColor = "border-slate-100";
                }
              }

              // Late notification - always show if late (including override days)
              if (stat.isLate) {
                if (stat.isExcused) {
                  if (!stat.isOverride) { // Only change card style if not override
                    cardBg = "bg-emerald-50";
                    borderColor = "border-emerald-200";
                  }
                  note = "Đi trễ (Đã duyệt)";
                } else {
                  if (!stat.isOverride) { // Only change card style if not override
                    cardBg = "bg-red-50";
                    borderColor = "border-red-200";
                  }
                  note = `Trễ ${stat.lateMinutes}p`;
                }
              }

              return (
                <div key={stat.date.toISOString()} className={`relative rounded-2xl border ${borderColor} ${cardBg} p-4 ${shadow} transition-all duration-200 flex flex-col justify-between`}>
                  {/* Header: Date & Edit */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-800">{format(stat.date, 'dd/MM')}</span>
                        <span className="text-xs font-bold text-gray-600 bg-white/60 px-2 py-0.5 rounded-md border border-gray-100 shadow-sm">
                          {getVietnameseDayFull(stat.date)}
                        </span>
                      </div>
                      {/* Note Badge */}
                      {note && (
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded mt-1 inline-block ${stat.isLate && !stat.isExcused ? 'bg-red-100 text-red-600' :
                          stat.isOverride ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                          {note}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleEditClick(stat)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-colors shadow-sm bg-white/50"
                      title="Chỉnh sửa ngày công"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>

                  {/* Time Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm bg-white/60 p-2 rounded-xl mb-3">
                    <div className="flex flex-col items-center p-1 rounded hover:bg-white transition-colors">
                      <span className="text-[10px] text-gray-400 font-semibold uppercase">Sáng</span>
                      <span className={`font-mono font-bold ${stat.isOverride ? 'text-red-600' : 'text-gray-700'}`}>{slots.in1} - {slots.out1}</span>
                    </div>
                    <div className="flex flex-col items-center p-1 rounded hover:bg-white transition-colors">
                      <span className="text-[10px] text-gray-400 font-semibold uppercase">Chiều</span>
                      <span className={`font-mono font-bold ${stat.isOverride ? 'text-red-600' : 'text-gray-700'}`}>{slots.in2} - {slots.out2}</span>
                    </div>
                  </div>

                  {/* Footer: Stats */}
                  <div className="flex items-center justify-between pt-3 border-t border-black/5">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Công Chuẩn</span>
                      <span className="text-xl font-bold text-gray-800 leading-none">{stat.standardWorkDays}</span>
                    </div>

                    {/* OT Display */}
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Tăng Ca</span>
                      <span className={`text-xl font-bold leading-none ${stat.otBreakdown.totalConvertedDays > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {stat.otBreakdown.totalConvertedDays > 0 ? stat.otBreakdown.totalConvertedDays.toFixed(3) : '0'}
                      </span>
                    </div>
                  </div>

                  {/* Detailed OT Breakdown (Enhanced matching Monthly History) */}
                  {stat.otBreakdown.totalConvertedDays > 0 && (
                    <div className="mt-3 pt-2 border-t border-dashed border-gray-200 text-[10px] space-y-1">
                      <div className="text-center italic text-gray-400 mb-1">
                        {(stat.otBreakdown.earlyMorningMinutes + stat.otBreakdown.lunchMinutes + stat.otBreakdown.eveningMinutes + stat.otBreakdown.sundayMinutes)} / 60 / 8 x {stat.isSunday ? OT_MULTIPLIERS.SUNDAY : OT_MULTIPLIERS.WEEKDAY} = {stat.otBreakdown.totalConvertedDays.toFixed(3)}
                      </div>
                      {stat.otBreakdown.earlyMorningMinutes > 0 && (
                        <div className="flex justify-between text-blue-600">
                          <span>• Sáng ({
                            (() => {
                              const end = parse(TIME_RULES.MORNING_START, 'HH:mm', stat.date);
                              const start = addMinutes(end, -stat.otBreakdown.earlyMorningMinutes);
                              return `${format(start, 'HH:mm')} - ${TIME_RULES.MORNING_START}`;
                            })()
                          }):</span>
                          <span className="font-bold">{stat.otBreakdown.earlyMorningMinutes}p</span>
                        </div>
                      )}
                      {stat.otBreakdown.lunchMinutes > 0 && (
                        <div className="flex flex-col gap-0.5 text-blue-600">
                          {/* Breakdown: Late Morning Out */}
                          {(() => {
                            const morningEnd = parse(TIME_RULES.MORNING_END, 'HH:mm', stat.date);
                            const outLog = stat.logs.find(l => l.type === AttendanceType.OUT_MORNING);
                            if (outLog && outLog.timestamp > morningEnd) {
                              const diff = Math.round((outLog.timestamp.getTime() - morningEnd.getTime()) / 60000);
                              if (diff >= TIME_RULES.OT_AUTO_TRIGGER_MINUTES) {
                                return (
                                  <div className="flex justify-between">
                                    <span>• Trưa ({TIME_RULES.MORNING_END} - {format(outLog.timestamp, 'HH:mm')}):</span>
                                    <span className="font-bold">{diff}p</span>
                                  </div>
                                );
                              }
                            }
                            return null;
                          })()}

                          {/* Breakdown: Early Afternoon In */}
                          {(() => {
                            const afternoonStart = parse(TIME_RULES.AFTERNOON_START, 'HH:mm', stat.date);
                            // Fixed: Find either IN_AFTERNOON or OT_AFTERNOON
                            const inLog = stat.logs.find(l => l.type === AttendanceType.IN_AFTERNOON || l.type === AttendanceType.OT_AFTERNOON);

                            if (inLog && inLog.timestamp < afternoonStart) {
                              const diff = Math.round((afternoonStart.getTime() - inLog.timestamp.getTime()) / 60000);
                              if (diff >= TIME_RULES.OT_AUTO_TRIGGER_MINUTES) {
                                return (
                                  <div className="flex justify-between">
                                    <span>• Trưa ({format(inLog.timestamp, 'HH:mm')} - {TIME_RULES.AFTERNOON_START}):</span>
                                    <span className="font-bold">{diff}p</span>
                                  </div>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      )}
                      {stat.otBreakdown.eveningMinutes > 0 && (
                        <div className="flex justify-between text-blue-600">
                          <span>• Tối ({
                            (() => {
                              const start = parse(TIME_RULES.AFTERNOON_END, 'HH:mm', stat.date);
                              const end = addMinutes(start, stat.otBreakdown.eveningMinutes);
                              return `${TIME_RULES.AFTERNOON_END} - ${format(end, 'HH:mm')}`;
                            })()
                          }):</span>
                          <span className="font-bold">{stat.otBreakdown.eveningMinutes}p</span>
                        </div>
                      )}
                      {stat.otBreakdown.sundayMinutes > 0 && (
                        <div className="flex justify-between text-purple-600 font-bold">
                          <span>• Chủ Nhật:</span>
                          <span>{stat.otBreakdown.sundayMinutes}p</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* DEBUG: Raw Logs Inspector */}
                  <details className="mt-2 pt-2 border-t border-gray-100">
                    <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                      Xem Logs Gốc ({stat.logs.length})
                    </summary>
                    <div className="mt-1 space-y-1 bg-gray-50 p-2 rounded text-[10px] font-mono text-gray-600">
                      {stat.logs.length > 0 ? stat.logs.map(l => (
                        <div key={l.id} className="flex justify-between border-b border-gray-200 last:border-0 pb-0.5">
                          <span>{format(l.timestamp, 'HH:mm')}</span>
                          <span className={l.type.includes('OT') ? 'text-blue-600 font-bold' : ''}>{l.type}</span>
                        </div>
                      )) : (
                        <span className="italic">Không có dữ liệu gốc</span>
                      )}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )
        }

        {/* TAB 2: PAYROLL */}
        {activeTab === 'PAYROLL' && (
          <SalaryView
            report={salaryReport}
            user={employee}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            bonuses={bonuses}
          />
        )}

        {/* TAB 3: BONUS & PENALTY (Renamed from ADJUST) */}
        {activeTab === 'ADJUST' && (
          <div className="space-y-4 pb-10">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[400px]">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <DollarSign size={18} className="text-slate-600" />
                    Thưởng & Phạt
                    {isLocked && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full border border-red-200">Đã Chốt</span>}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Các khoản điều chỉnh lương thủ công tháng {format(selectedMonth, 'MM/yyyy')}
                  </p>
                </div>
                {!isLocked && (
                  <button
                    onClick={() => setIsBonusModalOpen(true)}
                    className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-slate-800 transition active:scale-95 flex items-center gap-1.5"
                    title="Thêm mới"
                  >
                    <Plus size={16} /> Thêm mới
                  </button>
                )}
              </div>

              {/* Locked Warning */}
              {isLocked && (
                <div className="mb-4 bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-center gap-3 text-sm text-orange-700">
                  <Lock size={18} />
                  <span>Bảng lương tháng này đã được chốt. Không thể chỉnh sửa thưởng/phạt.</span>
                </div>
              )}

              {monthBonuses.length === 0 ? (
                <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-200 mt-10">
                  <p>Chưa có khoản điều chỉnh nào trong tháng này.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {monthBonuses.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${item.type === 'BONUS' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                          {item.type === 'BONUS' ? <Plus size={18} /> : <DollarSign size={18} />}
                        </div>
                        <div>
                          <div className="font-bold text-gray-800 text-sm">{item.reason}</div>
                          <div className="text-xs text-gray-500">{format(item.date, 'dd/MM/yyyy')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${item.type === 'BONUS' ? 'text-green-600' : 'text-red-500'}`}>
                          {item.type === 'BONUS' ? '+' : '-'}{formatCurrency(item.amount)}
                        </span>
                        {!isLocked && (
                          <>
                            <button
                              onClick={() => handleEditBonus(item)}
                              className="text-gray-300 hover:text-blue-500 transition-colors p-1"
                              title="Chỉnh sửa"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => onDeleteBonus(item.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors p-1"
                              title="Xóa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SALARY HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="pb-20">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[400px]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Clock size={18} className="text-slate-600" />
                    Lịch sử lương
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Các mốc thay đổi lương cơ bản</p>
                </div>
                <button
                  onClick={() => setIsSalaryModalOpen(true)}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition shadow-sm active:scale-95"
                  title="Lên lịch tăng lương"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 pl-6 py-2">
                {(() => {
                  const history = [...salaryChanges]
                    .filter(s => s.userId === employee.id)
                    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

                  if (history.length === 0) {
                    return (
                      <div className="relative group">
                        <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 bg-blue-500 border-blue-500 mt-1.5"></div>
                        <div className="flex flex-col opacity-60">
                          <span className="text-xs font-bold text-slate-800">Hiện tại (Mặc định)</span>
                          <span className="font-bold text-base text-gray-900">{formatCurrency(employee.baseSalary || 0)}</span>
                          <span className="text-[10px] text-gray-500">Chưa có lịch sử thay đổi</span>
                        </div>
                      </div>
                    );
                  }

                  return history.map((change, idx) => {
                    const effDate = new Date(change.effectiveDate);
                    const isFuture = effDate > new Date();
                    const isCurrent = !isFuture && history.findIndex(h => new Date(h.effectiveDate) <= new Date()) === idx;

                    return (
                      <div key={change.id} className="relative group">
                        <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-2 ${isFuture ? 'bg-white border-slate-300' : isCurrent ? 'bg-green-500 border-green-500' : 'bg-blue-500 border-blue-500'} mt-1.5 transition-colors`}></div>
                        <div className="flex justify-between items-start w-full">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isFuture ? 'text-slate-400' : 'text-slate-800'}`}>
                                {format(effDate, 'dd/MM/yyyy')}
                              </span>
                              {isFuture && <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-[10px] font-bold">Sắp tới</span>}
                              {isCurrent && <span className="text-green-600 text-[10px] font-bold">Đang áp dụng</span>}
                            </div>
                            <span className={`font-bold text-base ${isFuture ? 'text-gray-400' : 'text-gray-900'}`}>{formatCurrency(change.baseSalary)}</span>
                            <span className="text-[10px] text-gray-500 flex flex-col gap-0.5 mt-1">
                              <span>PC: {formatCurrency(change.allowance)}</span>
                              <span>BH: {formatCurrency(change.insuranceSalary)}</span>
                            </span>
                            {change.reason && (
                              <p className="text-[10px] text-gray-400 italic mt-1 bg-gray-50 p-1.5 rounded border border-gray-100">
                                "{change.reason}"
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 ml-2">
                            <button
                              onClick={() => {
                                setEditingSalaryChange(change);
                                setIsSalaryModalOpen(true);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Chỉnh sửa"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => onDeleteSalaryChange(change.id, change.userId)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Xóa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}


      </div>




      {/* Modals */}
      <BonusPenaltyModal
        isOpen={isBonusModalOpen}
        onClose={() => {
          setIsBonusModalOpen(false);
          setEditingBonus(null); // Reset when closed
        }}
        onSubmit={handleAddBonusSubmit}
        onImportExcel={handleImportExcel}
        defaultUserId={employee.id}
        initialData={editingBonus}
        lateWarnings={(() => {
          const warnings: Record<string, { level: 3 | 6; message: string }> = {};
          if (salaryReport.isConsecutive6Months) {
            warnings[employee.id] = {
              level: 6,
              message: `Nhân viên này đã đi trễ 6 tháng liên tiếp. Theo quy định, cần họp Ban Giám Đốc để đưa ra hình thức xử lý.`
            };
          } else if (salaryReport.isConsecutive3Months) {
            warnings[employee.id] = {
              level: 3,
              message: `Nhân viên này đã đi trễ 3 tháng liên tiếp. Theo quy định, cần cắt thưởng các ngày lễ trong năm.`
            };
          }
          return warnings;
        })()}
      />

      {
        isEditModalOpen && editingDate && (
          <AttendanceEditModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleOverrideSave}
            date={editingDate}
            userId={employee.id}
            userName={employee.name}
            initialTimes={getTimeSlots(editingStats?.logs || [])}
            initialWorkDays={editingStats?.standardWorkDays}
            existingOverride={employeeOverrides.find(o => isSameDay(o.date, editingDate))}
          />
        )
      }

      <SalaryChangeModal
        isOpen={isSalaryModalOpen}
        onClose={() => {
          setIsSalaryModalOpen(false);
          setEditingSalaryChange(null);
        }}
        onSubmit={onAddSalaryChange}
        currentUserSalary={{
          baseSalary: employee.baseSalary || 0,
          allowance: employee.allowance || 0,
          insuranceSalary: employee.insuranceSalary || 0
        }}
        initialData={editingSalaryChange}
      />
    </div >

  );
};