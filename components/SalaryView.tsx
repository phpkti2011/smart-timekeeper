
import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth } from 'date-fns';
import { MonthlySalaryReport, UserProfile, BonusFine, SalaryChange } from '../types';
import { DollarSign, TrendingUp, TrendingDown, Building2, ChevronLeft, ChevronRight, Calendar, PlusCircle, History } from 'lucide-react';
import { SalaryAdvanceModal } from './SalaryAdvanceModal';
import { SalaryHistoryModal } from './SalaryHistoryModal';

interface Props {
  report: MonthlySalaryReport;
  user: UserProfile;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
  onRequestAdvance?: () => void;
  bonuses: BonusFine[];
  salaryChanges?: SalaryChange[];
  isConfirmed?: boolean;
  onConfirmSalary?: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export const SalaryView: React.FC<Props> = ({ report, user, selectedMonth, onMonthChange, onRequestAdvance, bonuses = [], salaryChanges = [], isConfirmed = false, onConfirmSalary }) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);


  const handlePrevMonth = () => onMonthChange(subMonths(selectedMonth, 1));
  const handleNextMonth = () => onMonthChange(addMonths(selectedMonth, 1));

  // Calculations
  const standardSalary = report.salaryPerDay * report.totalActualWorkDays;
  const otSalary = report.salaryPerDay * report.totalConvertedOTDays;

  // Filter Bonuses/Fines for Notes
  // Note: Parent should ideally pass filtered bonuses, but re-filtering here for safety/simplicity
  const monthlyBonuses = bonuses.filter(b =>
    b.userId === user.id &&
    new Date(b.date).getMonth() === selectedMonth.getMonth() &&
    new Date(b.date).getFullYear() === selectedMonth.getFullYear()
  );
  const bonusItems = monthlyBonuses.filter(b => b.type === 'BONUS');

  const fineItems = monthlyBonuses.filter(b => b.type !== 'BONUS' && !b.reason?.startsWith('CONFIRMATION:'));

  const isPastMonth = selectedMonth < startOfMonth(new Date());

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[60vh] relative z-10 pb-20 flex flex-col h-full">

      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-4 sm:p-6 text-white sticky top-0 z-20 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
          <div className="w-full sm:w-auto flex justify-between sm:block items-center">
            <div>
              <p className="text-teal-100 text-sm font-medium mb-1 flex items-center gap-1">
                <Calendar size={14} /> <span className="hidden sm:inline">Phiếu lương tháng</span><span className="sm:hidden">Tháng</span>
              </p>

              {/* Month Selector Toolbar */}
              <div className="flex items-center gap-2 mt-1 bg-white/10 rounded-lg p-1 w-fit backdrop-blur-sm">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-white/20 rounded transition-colors active:scale-95"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-lg sm:text-xl font-bold min-w-[80px] sm:min-w-[100px] text-center">
                  {format(selectedMonth, 'MM/yyyy')}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-white/20 rounded transition-colors active:scale-95"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Mobile Actions Right */}
            <div className="flex items-center gap-2 sm:hidden">
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/20 hover:bg-white/20 transition active:scale-95"
                title="Xem lịch sử lương"
              >
                <History size={20} className="text-white" />
              </button>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/20 hover:bg-white/20 transition active:scale-95"
              title="Xem lịch sử lương"
            >
              <History size={24} className="text-white" />
            </button>
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <DollarSign size={24} className="text-white" />
            </div>
          </div>
        </div>

        <div className="mt-2 sm:mt-4 flex flex-wrap justify-between items-end gap-2">
          <div>
            <p className="text-teal-100 text-xs sm:text-sm font-medium">Thực lãnh</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
              {formatCurrency(report.netSalary)}
            </h1>
          </div>

        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Confirm Salary (End of Month) */}
          {onConfirmSalary && !isConfirmed && isPastMonth && (
            <button
              onClick={onConfirmSalary}
              className="bg-red-600 hover:bg-red-700 text-white text-[10px] sm:text-xs font-bold px-3 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center gap-2 border border-red-500 whitespace-nowrap animate-pulse"
            >
              <div className="bg-white text-red-600 rounded-full p-0.5"><PlusCircle size={12} /></div> <span>Xác nhận lương</span>
            </button>
          )}

          {isConfirmed && (
            <div className="bg-white/20 text-white text-[10px] sm:text-xs font-bold px-3 py-2 rounded-lg backdrop-blur-sm flex items-center gap-1.5 border border-white/30 cursor-default">
              <div className="bg-teal-400 text-teal-900 rounded-full p-0.5"><History size={10} /></div> <span>Đã chốt</span>
            </div>
          )}

          {/* Advance Button */}
          {onRequestAdvance && !isConfirmed && (
            <button
              onClick={onRequestAdvance}
              className="bg-white/20 hover:bg-white/30 text-white text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg backdrop-blur-sm transition-all active:scale-95 flex items-center gap-1.5 border border-white/30 whitespace-nowrap"
            >
              <PlusCircle size={14} /> <span>Xin ứng</span>
            </button>
          )}
        </div>
      </div>


      {/* Body */}
      <div className="p-5 space-y-6 bg-gray-50/50 flex-1 overflow-y-auto no-scrollbar">

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-gray-500 uppercase font-bold">Đi Làm</span>
            <span className="text-lg font-bold text-gray-800 mt-1">{report.totalRealWorkDays.toFixed(2)}</span>
            <span className="text-[9px] text-gray-400">công thực tế</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-gray-500 uppercase font-bold">Nghỉ Phép/Lễ</span>
            <span className="text-lg font-bold text-blue-600 mt-1">{report.totalPaidLeaveDays.toFixed(2)}</span>
            <span className="text-[9px] text-gray-400">có lương</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-gray-500 uppercase font-bold">Công OT</span>
            <span className="text-lg font-bold text-indigo-600 mt-1">{report.totalConvertedOTDays.toFixed(2)}</span>
            <span className="text-[9px] text-gray-400">quy đổi</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-gray-500 uppercase font-bold">Vi Phạm</span>
            <span className={`text-lg font-bold mt-1 ${report.totalLateCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {report.totalLateCount}
            </span>
            <span className="text-[9px] text-gray-400">lần trễ</span>
          </div>
        </div>

        {/* Effective Parameters Explanation (New) */}
        <div className="bg-blue-50/50 rounded-2xl border border-blue-100 overflow-hidden shadow-sm">
          <details className="group">
            <summary className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-blue-50 transition-colors">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-800">Chi tiết tham số lương (Tháng nảy)</h3>
              </div>
              <ChevronRight size={16} className="text-gray-400 transform group-open:rotate-90 transition-transform" />
            </summary>

            <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm border-t border-blue-100/50">
              <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                <span className="text-gray-500">Lương cơ bản (Hợp đồng):</span>
                <span className="font-bold text-gray-900">{formatCurrency(report.effectiveBaseSalary || 0)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                <span className="text-gray-500">Lương đóng bảo hiểm:</span>
                <span className="font-bold text-gray-900">{formatCurrency(report.effectiveInsuranceSalary || 0)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                <span className="text-gray-500">Phụ cấp trách nhiệm:</span>
                <span className="font-bold text-gray-900">{formatCurrency(report.effectiveAllowance || 0)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                <span className="text-gray-500">Số ngày công chuẩn:</span>
                <span className="font-bold text-gray-900">{report.standardDaysInMonth} ngày</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-gray-200 col-span-1 sm:col-span-2 bg-white/50 px-2 rounded">
                <span className="text-gray-500">Đơn giá 1 ngày công:</span>
                <span className="font-bold text-indigo-600">
                  {formatCurrency(report.salaryPerDay)}
                  <span className="text-[10px] font-normal text-gray-400 ml-1">(Lương CB / {report.standardDaysInMonth})</span>
                </span>
              </div>
            </div>
          </details>
        </div>

        {/* Detailed Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-600" />
            <h3 className="text-sm font-bold text-gray-800">Khoản Thu Nhập</h3>
          </div>
          <div className="p-5 space-y-3">
            {/* Standard Salary Breakdown */}
            <div className="flex flex-col gap-0.5">
              {report.totalRealWorkDays > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 font-medium">Lương đi làm ({report.totalRealWorkDays.toFixed(2)} công)</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(report.salaryPerDay * report.totalRealWorkDays)}</span>
                </div>
              )}
              {report.totalPaidLeaveDays > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 font-medium text-blue-600">Lương nghỉ phép ({report.totalPaidLeaveDays.toFixed(2)} công)</span>
                  <span className="font-semibold text-blue-600">{formatCurrency(report.salaryPerDay * report.totalPaidLeaveDays)}</span>
                </div>
              )}
              <div className="text-[10px] text-gray-400 italic mt-0.5 border-t border-dashed border-gray-100 pt-0.5">
                Tổng ngày lương: {report.totalActualWorkDays.toFixed(2)} / {report.standardDaysInMonth} ngày chuẩn
              </div>
            </div>

            {/* OT Salary */}
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 font-medium">Lương tăng ca</span>
                <span className="font-semibold text-gray-900">{formatCurrency(otSalary)}</span>
              </div>
              <div className="text-[10px] text-gray-400 italic">
                (Lương CB / {report.standardDaysInMonth}) x {report.totalConvertedOTDays.toFixed(2)} ngày qui đổi
              </div>
            </div>

            {/* Allowance */}
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 font-medium">Phụ cấp</span>
                <span className="font-semibold text-gray-900">{formatCurrency(report.grossAllowance)}</span>
              </div>
              <div className="text-[10px] text-gray-400 italic">
                Theo ngày công thực tế ({report.totalActualWorkDays.toFixed(2)} ngày)
              </div>
            </div>

            {/* Bonus */}
            {(report.totalBonus > 0 || bonusItems.length > 0) && (
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 font-medium">Thưởng / Khác</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(report.totalBonus)}</span>
                </div>
                {bonusItems.length > 0 && (
                  <div className="pl-2 mt-1 space-y-0.5 border-l-2 border-green-100">
                    {bonusItems.map((b, i) => (
                      <div key={i} className="text-[10px] text-gray-500 italic">
                        - {b.reason}: {formatCurrency(b.amount)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 mt-1 border-t border-dashed border-gray-200 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500 uppercase">Tổng Thu Nhập</span>
              <span className="text-base font-bold text-green-700">
                {formatCurrency(report.grossSalary + report.grossAllowance + report.totalBonus)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <TrendingDown size={16} className="text-red-500" />
            <h3 className="text-sm font-bold text-gray-800">Khoản Khấu Trừ</h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">BHXH (10.5%)</span>
              <span className="font-semibold text-red-500">-{formatCurrency(report.insuranceDeduction)}</span>
            </div>

            {/* Late Penalty & Fines */}
            {/* Late Penalty */}
            {report.latePenalty > 0 && (
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Phạt đi trễ ({report.totalLateCount} lần)</span>
                  <span className="font-semibold text-red-500">
                    -{formatCurrency(report.latePenalty)}
                  </span>
                </div>
              </div>
            )}

            {/* Other Fines (Manual) */}
            {(report.otherFines > 0 || fineItems.length > 0) && (
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Phạt / Vi phạm</span>
                  <span className="font-semibold text-red-500">
                    -{formatCurrency(report.otherFines)}
                  </span>
                </div>
                <div className="pl-2 mt-1 space-y-0.5 border-l-2 border-red-100">
                  {fineItems.map((f, i) => (
                    <div key={i} className="text-[10px] text-gray-500 italic">
                      - {f.reason}: -{formatCurrency(f.amount)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.totalAdvances > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Đã ứng lương</span>
                <span className="font-semibold text-red-500">-{formatCurrency(report.totalAdvances)}</span>
              </div>
            )}

            <div className="pt-3 mt-1 border-t border-dashed border-gray-200 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500 uppercase">Tổng Khấu Trừ</span>
              <span className="text-base font-bold text-red-600">
                -{formatCurrency(report.insuranceDeduction + report.latePenalty + report.totalAdvances + report.otherFines)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
          <Building2 size={20} className="text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-800 leading-relaxed">
            <span className="font-bold">Ghi chú:</span> Lương cơ bản tính trên {report.standardDaysInMonth} ngày công chuẩn.
            Mọi thắc mắc vui lòng liên hệ phòng nhân sự trước ngày 05 tháng sau.
          </div>
        </div>

        {/* Modal REMOVED - Using Parent Modal */}
        <SalaryHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          salaryChanges={salaryChanges}
          userId={user.id}
        />

      </div>
    </div >
  );
};
