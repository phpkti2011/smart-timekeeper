import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '../utils/supabaseClient';
import { UserProfile, AttendanceLog, OTRequest, LateRequest, SalaryAdvanceRequest, BonusFine, MonthlySalaryReport, Holiday, PayrollPeriod, PayrollDetail, OverrideLog, SalaryChange, LeaveRequest, SwapRequest } from '../types';
import { calculateMonthlySalary } from '../utils/salaryCalculator';
import { isPayrollEmployee } from '../utils/employeeFilters';
import { Download, Lock, CheckCircle, AlertTriangle, FileText, X, Gift, Users, Unlock, RotateCcw, Search, Clock } from 'lucide-react';
import { BulkBonusModal } from './BulkBonusModal';
import { ConfirmDialog } from './ConfirmDialog';
import { LateReport } from './LateReport';

interface Props {
    employees: UserProfile[];
    logs: AttendanceLog[];
    otRequests: OTRequest[];
    lateRequests: LateRequest[];
    advanceRequests: SalaryAdvanceRequest[];
    bonuses: BonusFine[];
    overrides?: OverrideLog[];
    holidays: Holiday[];
    salaryChanges: SalaryChange[];
    leaveRequests: LeaveRequest[];
    swapRequests?: SwapRequest[];
    onBulkSaveBonus: (items: Omit<BonusFine, 'id'>[]) => Promise<void>;
    onDeleteBonusBatch: (ids: string[]) => Promise<void>;
    lockedMonths: string[];
    onFetchMonthData?: (month: Date) => Promise<void>;
}

export const AdminPayrollManagement: React.FC<Props> = ({
    employees,
    logs,
    otRequests,
    lateRequests,
    advanceRequests,
    bonuses,
    overrides,
    holidays,
    salaryChanges,
    leaveRequests,
    swapRequests = [],
    onBulkSaveBonus,
    onDeleteBonusBatch,
    lockedMonths,
    onFetchMonthData
}) => {
    const [activeTab, setActiveTab] = useState<'CURRENT' | 'LATE_REPORT' | 'HISTORY'>('CURRENT');
    const [selectedMonth, setSelectedMonth] = useState<Date>(startOfMonth(new Date()));
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [report, setReport] = useState<{ details: { empId: string; report: MonthlySalaryReport }[]; totalSalary: number } | null>(null);

    const [lockedHistory, setLockedHistory] = useState<PayrollPeriod[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const [revertConfirmId, setRevertConfirmId] = useState<string | null>(null); // State for Revert Confirmation
    const [searchTerm, setSearchTerm] = useState(''); // Search State

    const [isBulkBonusModalOpen, setIsBulkBonusModalOpen] = useState(false); // New Bulk Bonus State
    const fetchHistory = async () => {
        const { data } = await supabase.from('payroll_periods').select('*').order('month', { ascending: false });
        if (data) {
            const mapped = data.map((d: any) => ({
                id: d.id,
                month: d.month,
                status: d.status,
                totalAmount: d.total_amount,
                createdAt: d.created_at
            }));
            setLockedHistory(mapped);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    // 2a. Lazy-load data for selected month if needed
    useEffect(() => {
        if (onFetchMonthData) onFetchMonthData(selectedMonth);
    }, [selectedMonth, onFetchMonthData]);

    // Nhân viên thuộc bảng lương của THÁNG ĐANG XEM (không phải của hôm nay):
    // loại tài khoản chờ duyệt / bị khoá / Admin, và người đã rời trước tháng đó.
    // Lọc theo kỳ nên bảng lương tháng cũ giữ nguyên đúng danh sách đã chốt.
    const payrollEmployees = useMemo(
        () => employees.filter(emp => emp.role !== 'Admin' && isPayrollEmployee(emp, selectedMonth)),
        [employees, selectedMonth]
    );

    // 2b. Generate Live Report for Selected Month
    useEffect(() => {
        const periodDetails: { empId: string; report: MonthlySalaryReport }[] = [];
        let total = 0;

        payrollEmployees.forEach(emp => {
            const empBonuses = bonuses.filter(b => b.userId === emp.id);
            const empOverrides = overrides.filter(o => o.userId === emp.id);

            const salaryReport = calculateMonthlySalary(
                selectedMonth,
                (logs as any[]).filter(l => l.userId === emp.id),

                otRequests.filter(r => r.userId === emp.id),
                lateRequests.filter(r => r.userId === emp.id),
                advanceRequests.filter(r => r.userId === emp.id),
                empBonuses,
                emp,
                empOverrides,
                holidays,
                salaryChanges,
                leaveRequests.filter(r => r.userId === emp.id),
                swapRequests.filter(r => r.userId === emp.id)
            );

            periodDetails.push({ empId: emp.id, report: salaryReport });
            total += salaryReport.netSalary;
        });

        setReport({ details: periodDetails, totalSalary: total });

    }, [selectedMonth, payrollEmployees, logs, otRequests, lateRequests, advanceRequests, bonuses, holidays, salaryChanges, leaveRequests, swapRequests, overrides]);

    // Derive late warnings from salary report
    const lateWarnings = React.useMemo(() => {
        if (!report) return {};
        const warnings: Record<string, { level: 3 | 6; message: string }> = {};
        report.details.forEach(d => {
            if (d.report.isConsecutive6Months) {
                warnings[d.empId] = {
                    level: 6,
                    message: `Nhân viên này đã đi trễ 6 tháng liên tiếp. Theo quy định, cần họp Ban Giám Đốc để đưa ra hình thức xử lý.`
                };
            } else if (d.report.isConsecutive3Months) {
                warnings[d.empId] = {
                    level: 3,
                    message: `Nhân viên này đã đi trễ 3 tháng liên tiếp. Theo quy định, cần cắt thưởng các ngày lễ trong năm.`
                };
            }
        });
        return warnings;
    }, [report]);


    // Helper: Kiểm tra nhân viên đã xác nhận lương
    const getConfirmationStatus = () => {
        // Cùng bộ lọc với bảng lương để mẫu số luôn khớp số dòng đang hiển thị
        const activeEmployees = payrollEmployees;
        const confirmedIds = new Set(
            bonuses
                .filter(b =>
                    b.reason?.startsWith('CONFIRMATION:') &&
                    new Date(b.date).getMonth() === selectedMonth.getMonth() &&
                    new Date(b.date).getFullYear() === selectedMonth.getFullYear()
                )
                .map(b => b.userId)
        );
        const confirmed = activeEmployees.filter(e => confirmedIds.has(e.id));
        const unconfirmed = activeEmployees.filter(e => !confirmedIds.has(e.id));
        return { total: activeEmployees.length, confirmed, unconfirmed };
    };

    const confirmationStatus = getConfirmationStatus();

    // 3. Handle Lock
    const handleLock = async () => {
        if (!report) return;

        // Guard: Kiểm tra nhân viên chưa xác nhận lương
        const { total, confirmed, unconfirmed } = confirmationStatus;

        if (unconfirmed.length > 0) {
            const unconfirmedNames = unconfirmed.map(e => `  • ${e.name} (${e.role})`).join('\n');
            const proceed = confirm(
                `⚠️ CẢNH BÁO: Còn ${unconfirmed.length}/${total} nhân viên CHƯA xác nhận lương tháng ${format(selectedMonth, 'MM/yyyy')}!\n\n` +
                `Danh sách chưa xác nhận:\n${unconfirmedNames}\n\n` +
                `Bạn có muốn tiếp tục chốt lương không?`
            );
            if (!proceed) return;
        }

        if (!confirm(`Bạn có chắc chắn muốn CHỐT LƯƠNG tháng ${format(selectedMonth, 'MM/yyyy')}?\nTổng chi: ${report.totalSalary.toLocaleString()} VNĐ`)) return;

        setIsProcessing(true);

        try {
            const { data: periodData, error: periodError } = await supabase
                .from('payroll_periods')
                .insert({
                    month: format(selectedMonth, 'yyyy-MM-01'),
                    status: 'LOCKED',
                    total_amount: report.totalSalary
                })
                .select()
                .single();

            if (periodError) throw periodError;

            const detailsToInsert = report.details.map(d => {
                const emp = employees.find(e => e.id === d.empId)!;
                return {
                    period_id: periodData.id,
                    user_id: d.empId,
                    user_name: emp.name,
                    user_role: emp.role,
                    department: 'N/A',

                    standard_work_days: d.report.standardDaysInMonth,
                    total_actual_work_days: d.report.totalActualWorkDays,
                    total_converted_ot_days: d.report.totalConvertedOTDays,

                    gross_salary: d.report.grossSalary,
                    gross_allowance: d.report.grossAllowance,
                    total_bonus: d.report.totalBonus,
                    total_deductions: d.report.latePenalty + d.report.insuranceDeduction + d.report.totalAdvances + d.report.otherFines,
                    net_salary: d.report.netSalary,

                    details_json: d.report
                };
            });

            const { error: detailsError } = await supabase.from('payroll_details').insert(detailsToInsert);
            if (detailsError) throw detailsError;

            setSuccessMsg('Đã chốt lương thành công!');
            fetchHistory();

            setTimeout(() => setSuccessMsg(''), 3000);

        } catch (err: any) {
            alert('Lỗi chốt lương: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // 4. Handle Export CSV
    const handleExport = () => {
        if (!report) return;

        const headers = [
            "Mã NV", "Họ Tên", "Chức Vụ",
            "Công Chuẩn", "Công Thực Tế", "Công Quy Đổi OT",
            "Lương Theo Công", "Phụ Cấp", "Thưởng", "Phạt", "Bảo Hiểm", "Ứng Lương", "Thực Lãnh"
        ];

        const rows = report.details.map(d => {
            const emp = employees.find(e => e.id === d.empId)!;
            const r = d.report;
            const deductions = r.latePenalty + r.otherFines;

            return [
                emp.id,
                emp.name,
                emp.role,
                r.standardDaysInMonth,
                r.totalActualWorkDays.toFixed(2),
                r.totalConvertedOTDays.toFixed(2),
                r.grossSalary,
                r.grossAllowance,
                r.totalBonus,
                deductions,
                r.insuranceDeduction,
                r.totalAdvances,
                r.netSalary
            ].join(",");
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `Bang_Luong_Thang_${format(selectedMonth, 'MM_yyyy')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 5. Handle Unlock
    const handleUnlock = async (id: string, month: string) => {
        if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn HOÀN DUYỆT (Xóa) bảng lương tháng ${format(new Date(month), 'MM/yyyy')}?\n\nHành động này không thể hoàn tác.`)) return;

        setIsProcessing(true);
        try {
            const { error } = await supabase.from('payroll_periods').delete().eq('id', id);
            if (error) throw error;

            setSuccessMsg('Đã xóa bảng lương thành công!');
            fetchHistory();

            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err: any) {
            alert("Lỗi xóa: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const isLocked = lockedMonths.includes(format(selectedMonth, 'MM-yyyy'));

    return (
        <div className="space-y-6 pb-20">
            {/* Header Area */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Quản Lý Lương & Chốt Lương</h2>
                    <p className="text-gray-500 text-sm">Xem trước, xuất báo cáo và khóa sổ lương tháng.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600"
                    >
                        &lt;
                    </button>
                    <div className="font-bold text-lg bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl border border-indigo-100 min-w-[140px] text-center">
                        {format(selectedMonth, 'MM/yyyy')}
                    </div>
                    <button
                        onClick={() => setSelectedMonth(new Date(new Date(selectedMonth).setMonth(selectedMonth.getMonth() + 1)))}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600"
                        disabled={selectedMonth >= startOfMonth(new Date())}
                    >
                        &gt;
                    </button>
                </div>
            </div>

            {/* Salary Summary Button (User Requested) */}
            <div className="flex justify-center">
                <button
                    onClick={() => setIsSummaryModalOpen(true)}
                    className="bg-white border-2 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-700 px-8 py-3 rounded-2xl font-bold shadow-sm transition-all active:scale-95 flex flex-col items-center gap-1 w-full max-w-sm"
                >
                    <span className="text-base uppercase tracking-wider">Tổng kết lương Tháng {format(selectedMonth, 'MM/yyyy')}</span>
                    <span className="text-[10px] text-indigo-400 font-medium bg-white px-2 py-0.5 rounded-full border border-indigo-50">Bấm để xem chi tiết</span>
                </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex bg-gray-200/50 p-1 rounded-2xl w-full max-w-md mx-auto">
                <button
                    onClick={() => setActiveTab('CURRENT')}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'CURRENT' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <FileText size={16} className="inline mr-1.5 -mt-0.5" />
                    Bảng Lương
                </button>
                <button
                    onClick={() => setActiveTab('LATE_REPORT')}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'LATE_REPORT' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Clock size={16} className="inline mr-1.5 -mt-0.5" />
                    Báo Cáo Trễ
                </button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'HISTORY' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Lock size={16} className="inline mr-1.5 -mt-0.5" />
                    Lịch Sử
                </button>
            </div>

            {successMsg && (
                <div className="bg-green-100 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2 animate-fade-in">
                    <CheckCircle size={20} /> {successMsg}
                </div>
            )}

            {/* View: Current Payroll */}
            {activeTab === 'CURRENT' && (
                <div className="animate-fade-in space-y-4">
                    <div className="flex items-center gap-3 justify-end">
                        {isLocked ? (
                            <button
                                onClick={() => {
                                    // Find the ID to unlock. We might need to look it up from 'lockedHistory' which we still fetch.
                                    // Or search logic. 'lockedHistory' has the ID.
                                    const historyItem = lockedHistory.find(h => format(new Date(h.month), 'MM-yyyy') === format(selectedMonth, 'MM-yyyy'));
                                    if (historyItem) handleUnlock(historyItem.id, historyItem.month);
                                }}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg shadow font-medium flex items-center gap-2 border border-red-200 transition"
                            >
                                {isProcessing ? <div className="loader small" /> : <Unlock size={18} />}
                                Hoàn chốt lương
                            </button>
                        ) : (
                            <div className="flex gap-2 items-center">
                                <button
                                    onClick={() => setIsBulkBonusModalOpen(true)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow font-medium flex items-center gap-2 transition"
                                >
                                    <Gift size={18} />
                                    Thưởng/Phạt Hàng Loạt
                                </button>
                                <div className="flex flex-col items-end gap-1">
                                    <button
                                        onClick={handleLock}
                                        disabled={isProcessing}
                                        className={`px-4 py-2 text-white rounded-lg shadow font-bold flex items-center gap-2 disabled:bg-gray-400 transition ${
                                            confirmationStatus.unconfirmed.length === 0
                                                ? 'bg-purple-600 hover:bg-purple-700'
                                                : 'bg-orange-500 hover:bg-orange-600'
                                        }`}
                                    >
                                        {isProcessing ? <div className="loader small" /> : <Lock size={18} />}
                                        Chốt Lương Tháng
                                    </button>
                                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                        confirmationStatus.unconfirmed.length === 0
                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                            : 'bg-orange-100 text-orange-700 border border-orange-200'
                                    }`}>
                                        <CheckCircle size={10} />
                                        {confirmationStatus.total - confirmationStatus.unconfirmed.length}/{confirmationStatus.total} NV đã xác nhận
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleExport}
                            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-green-200 flex items-center gap-2 font-bold transition-all active:scale-95"
                        >
                            <Download size={18} /> Xuất Excel Tổng
                        </button>
                    </div>

                    {/* NEW: Search Bar */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={18} className="text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Tìm kiếm nhân viên..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {report?.details
                            .filter(d => {
                                const emp = employees.find(e => e.id === d.empId);
                                return emp && emp.name.toLowerCase().includes(searchTerm.toLowerCase());
                            })
                            .map(d => {
                                const emp = employees.find(e => e.id === d.empId);
                                if (!emp) return null;
                                const r = d.report;

                                // Breakdown Calculations
                                const standardSalary = r.salaryPerDay * r.totalActualWorkDays;
                                const otSalary = r.salaryPerDay * r.totalConvertedOTDays;

                                // Fix date comparison: Check Year and Month matches Selected Month
                                const empBonuses = bonuses.filter(b => {
                                    const bDate = new Date(b.date);
                                    return b.userId === emp.id &&
                                        bDate.getMonth() === selectedMonth.getMonth() &&
                                        bDate.getFullYear() === selectedMonth.getFullYear();
                                });

                                const bonusItems = empBonuses.filter(b => b.type === 'BONUS');
                                const fineItems = empBonuses.filter(b => b.type !== 'BONUS' && !b.reason?.startsWith('CONFIRMATION:'));

                                return (
                                    <div key={d.empId} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 animate-fade-in relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>

                                        {/* Header */}
                                        <div className="flex justify-between items-start pl-3">
                                            <div>
                                                <div className="font-bold text-gray-800 text-lg leading-tight">{emp.name}</div>
                                                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mt-1">{emp.role}</div>
                                                {(() => {
                                                    const confirmBonus = empBonuses.find(b => b.reason?.startsWith('CONFIRMATION:'));
                                                    if (!confirmBonus) return null;
                                                    return (
                                                        <div className="text-[10px] sm:text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100 flex items-center gap-1 w-fit mt-1 animate-fade-in cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRevertConfirmId(confirmBonus.id);
                                                            }}
                                                        >
                                                            <div className="bg-teal-600 text-white rounded-full p-0.5"><CheckCircle size={8} /></div>
                                                            <span>Đã chốt</span>

                                                            {/* Fix: Always show Revert Button */}
                                                            <div className="ml-1 p-0.5 rounded-full bg-white border border-teal-200 text-teal-500 hover:text-red-500 hover:border-red-200 transition-colors flex items-center justify-center">
                                                                <RotateCcw size={10} />
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-indigo-600 leading-none">
                                                    {Math.round(r.netSalary).toLocaleString('vi-VN')} <span className="text-xs font-medium text-gray-400">đ</span>
                                                </div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Thực Lãnh</div>
                                            </div>
                                        </div>

                                        <div className="h-px bg-gray-100 w-full"></div>

                                        {/* Stats Row */}
                                        <div className="grid grid-cols-4 gap-2 pl-3">
                                            <div className="bg-green-50 rounded-xl p-2.5 flex flex-col justify-center items-center text-center">
                                                <span className="text-[10px] text-green-600 uppercase font-bold">Đi Làm</span>
                                                <span className="text-sm font-bold text-green-700">{Number(r.totalRealWorkDays.toFixed(2))}</span>
                                            </div>
                                            <div className="bg-blue-50 rounded-xl p-2.5 flex flex-col justify-center items-center text-center">
                                                <span className="text-[10px] text-blue-500 uppercase font-bold">Phép/Lễ</span>
                                                <span className="text-sm font-bold text-blue-700">{Number(r.totalPaidLeaveDays.toFixed(2))}</span>
                                            </div>
                                            <div className="bg-purple-50 rounded-xl p-2.5 flex flex-col justify-center items-center text-center">
                                                <span className="text-[10px] text-purple-400 uppercase font-bold">OT</span>
                                                <span className="text-sm font-bold text-purple-700">{Number(r.totalConvertedOTDays.toFixed(2))}</span>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-2.5 flex flex-col justify-center items-center text-center">
                                                <span className="text-[10px] text-gray-400 uppercase font-bold">Chuẩn</span>
                                                <span className="text-sm font-bold text-gray-700">{r.standardDaysInMonth}</span>
                                            </div>
                                        </div>

                                        {/* Detailed Breakdown */}
                                        <div className="flex flex-col gap-2 pl-3 text-sm mt-1">
                                            {/* Income Section */}
                                            {r.totalRealWorkDays > 0 && (
                                                <div className="flex justify-between items-center group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                    <span className="text-gray-500 font-medium flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Lương đi làm
                                                    </span>
                                                    <span className="font-bold text-gray-700">{Math.round(r.salaryPerDay * r.totalRealWorkDays).toLocaleString('vi-VN')}</span>
                                                </div>
                                            )}
                                            {r.totalPaidLeaveDays > 0 && (
                                                <div className="flex justify-between items-center group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                    <span className="text-blue-500 font-medium flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Lương nghỉ phép
                                                    </span>
                                                    <span className="font-bold text-blue-600">{Math.round(r.salaryPerDay * r.totalPaidLeaveDays).toLocaleString('vi-VN')}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                <span className="text-gray-500 font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Lương tăng ca
                                                </span>
                                                <span className="font-bold text-gray-700">{Math.round(otSalary).toLocaleString('vi-VN')}</span>
                                            </div>

                                            <div className="flex justify-between items-center group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                <span className="text-gray-500 font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Phụ cấp
                                                </span>
                                                <span className="font-bold text-gray-700">{Math.round(r.grossAllowance).toLocaleString('vi-VN')}</span>
                                            </div>

                                            {/* Bonus */}
                                            <div className="flex flex-col group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 font-medium flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span> Thưởng
                                                    </span>
                                                    <span className="font-bold text-green-600">+{Math.round(r.totalBonus).toLocaleString('vi-VN')}</span>
                                                </div>
                                                {bonusItems.length > 0 && (
                                                    <div className="pl-4 text-[11px] text-gray-400 italic mt-0.5">
                                                        {bonusItems.map((b, i) => (
                                                            <span key={i}>{b.reason} ({b.amount.toLocaleString()}){i < bonusItems.length - 1 ? ', ' : ''}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border-t border-dashed border-gray-100 my-1"></div>

                                            {/* Penalty - Late */}
                                            {r.latePenalty > 0 && (
                                                <div className="flex flex-col group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-500 font-medium flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Phạt đi trễ ({r.totalLateCount})
                                                        </span>
                                                        <span className="font-bold text-red-500">-{Math.round(r.latePenalty).toLocaleString('vi-VN')}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Penalty - Other */}
                                            {(r.otherFines > 0 || fineItems.length > 0) && (
                                                <div className="flex flex-col group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-500 font-medium flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Vi phạm / Khác
                                                        </span>
                                                        <span className="font-bold text-red-500">-{Math.round(r.otherFines).toLocaleString('vi-VN')}</span>
                                                    </div>
                                                    {fineItems.length > 0 && (
                                                        <div className="pl-4 text-[11px] text-gray-400 italic mt-0.5">
                                                            {fineItems.map((f, i) => (
                                                                <span key={i}>{f.reason} ({f.amount.toLocaleString()}){i < fineItems.length - 1 ? ', ' : ''}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                <span className="text-gray-500 font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span> Bảo hiểm (10.5%)
                                                </span>
                                                <span className="font-bold text-red-500">-{Math.round(r.insuranceDeduction).toLocaleString('vi-VN')}</span>
                                            </div>

                                            {/* NEW: Pre-Advance Total */}
                                            <div className="flex justify-between items-center bg-indigo-50 p-2 rounded-lg my-1 border border-indigo-100 shadow-sm">
                                                <span className="text-indigo-900 font-bold flex items-center gap-2 text-[13px]">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div> Tổng lương (trước ứng)
                                                </span>
                                                <span className="font-black text-indigo-700 text-sm">{Math.round(r.netSalary + r.totalAdvances).toLocaleString('vi-VN')}</span>
                                            </div>

                                            <div className="flex justify-between items-center group/item hover:bg-gray-50 p-1 rounded-lg transition-colors">
                                                <span className="text-gray-500 font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Ứng lương
                                                </span>
                                                <span className="font-bold text-orange-500">-{Math.round(r.totalAdvances).toLocaleString('vi-VN')}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* View: Late Report */}
            {activeTab === 'LATE_REPORT' && (
                <LateReport
                    employees={payrollEmployees}
                    logs={logs}
                    lateRequests={lateRequests}
                    overrides={overrides || []}
                    holidays={holidays}
                    leaveRequests={leaveRequests}
                    swapRequests={swapRequests}
                    selectedMonth={selectedMonth}
                    reportData={report?.details || null}
                />
            )}

            {/* View: History */}
            {activeTab === 'HISTORY' && (
                <div className="animate-fade-in">
                    <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2"><CheckCircle size={18} /> Lịch Sử Đã Chốt</h3>
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        {lockedHistory.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 italic">
                                Chưa có dữ liệu lịch sử.
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {lockedHistory.map(h => (
                                    <div key={h.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shadow-sm border border-indigo-100">
                                                {format(new Date(h.month), 'MM')}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900 text-base">Tháng {format(new Date(h.month), 'MM/yyyy')}</div>
                                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                    <span>Chốt ngày {format(new Date(h.createdAt), 'dd/MM/yyyy')}</span>
                                                    <span>•</span>
                                                    <span className="font-medium text-gray-700">Tổng chi: {h.totalAmount.toLocaleString('vi-VN')} đ</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 justify-end w-full sm:w-auto">
                                            <span className="text-[10px] uppercase font-bold bg-green-50 text-green-600 px-2 py-1 rounded-lg border border-green-100 flex items-center gap-1">
                                                <Lock size={10} /> Đã khóa
                                            </span>
                                            <button
                                                onClick={() => handleUnlock(h.id, h.month)}
                                                className="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg border border-red-100 transition-colors active:scale-95"
                                            >
                                                Hoàn duyệt
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Modal: Salary Summary */}
            {isSummaryModalOpen && report && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-indigo-600 p-5 flex justify-between items-center text-white shrink-0">
                            <div>
                                <h3 className="font-bold text-xl">Tổng kết chi phí lương</h3>
                                <p className="text-indigo-200 text-xs">Tháng {format(selectedMonth, 'MM/yyyy')}</p>
                            </div>
                            <button onClick={() => setIsSummaryModalOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors active:scale-95">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            {(() => {
                                const totals = report.details.reduce((acc, curr) => {
                                    const r = curr.report;
                                    const realWorkPart = r.salaryPerDay * r.totalRealWorkDays;
                                    const leavePart = r.salaryPerDay * r.totalPaidLeaveDays;
                                    const otPart = r.salaryPerDay * r.totalConvertedOTDays;

                                    return {
                                        grossSalaryReal: acc.grossSalaryReal + realWorkPart,
                                        grossSalaryLeave: acc.grossSalaryLeave + leavePart,
                                        grossSalaryOT: acc.grossSalaryOT + otPart,
                                        grossAllowance: acc.grossAllowance + r.grossAllowance,
                                        totalBonus: acc.totalBonus + r.totalBonus,
                                        insuranceDeduction: acc.insuranceDeduction + r.insuranceDeduction,
                                        totalLatePenalty: acc.totalLatePenalty + r.latePenalty,
                                        totalOtherFines: acc.totalOtherFines + r.otherFines,
                                        totalAdvances: acc.totalAdvances + r.totalAdvances,
                                        netSalary: acc.netSalary + r.netSalary
                                    };
                                }, {
                                    grossSalaryReal: 0,
                                    grossSalaryLeave: 0,
                                    grossSalaryOT: 0,
                                    grossAllowance: 0,
                                    totalBonus: 0,
                                    insuranceDeduction: 0,
                                    totalLatePenalty: 0,
                                    totalOtherFines: 0,
                                    totalAdvances: 0,
                                    netSalary: 0
                                });

                                const totalIncome = totals.grossSalaryReal + totals.grossSalaryLeave + totals.grossSalaryOT + totals.grossAllowance + totals.totalBonus;
                                const totalFines = totals.totalLatePenalty + totals.totalOtherFines;


                                return (
                                    <>
                                        {/* Main Big Number */}
                                        <div className="bg-indigo-50 rounded-2xl p-6 text-center border border-indigo-100">
                                            <p className="text-gray-500 font-bold uppercase text-xs tracking-wider mb-1">Tổng thực lãnh cần thanh toán</p>
                                            <p className="text-3xl font-black text-indigo-700">{Math.round(totals.netSalary).toLocaleString('vi-VN')} đ</p>
                                            <p className="text-xs text-indigo-400 mt-2 font-medium">Số tiền còn lại công ty phải chi trả</p>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                                <span className="font-bold text-gray-700">Tổng lương trong tháng</span>
                                                <span className="font-bold text-gray-900">{Math.round(totalIncome).toLocaleString()} đ</span>
                                            </div>

                                            <div className="px-2 space-y-2 text-sm text-gray-600 border-l-2 border-gray-200 ml-2 pl-4">
                                                <div className="flex justify-between">
                                                    <span>Lương đi làm</span>
                                                    <span>{Math.round(totals.grossSalaryReal).toLocaleString()} đ</span>
                                                </div>
                                                <div className="flex justify-between text-blue-600">
                                                    <span>Lương nghỉ phép</span>
                                                    <span>{Math.round(totals.grossSalaryLeave).toLocaleString()} đ</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Lương tăng ca</span>
                                                    <span>{Math.round(totals.grossSalaryOT).toLocaleString()} đ</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Phụ cấp</span>
                                                    <span>{Math.round(totals.grossAllowance).toLocaleString()} đ</span>
                                                </div>
                                                <div className="flex justify-between text-green-600 font-bold">
                                                    <span>Thưởng</span>
                                                    <span>+{Math.round(totals.totalBonus).toLocaleString()} đ</span>
                                                </div>
                                            </div>

                                            <div className="border-t border-dashed border-gray-200 my-2"></div>

                                            <div className="flex justify-between items-center p-3 rounded-xl">
                                                <span className="font-bold text-gray-500">Các khoản trừ</span>
                                            </div>

                                            <div className="px-2 space-y-2 text-sm text-gray-600 border-l-2 border-red-200 ml-2 pl-4">
                                                <div className="flex justify-between">
                                                    <span>Bảo hiểm (10.5%)</span>
                                                    <span className="text-red-500 font-bold">-{Math.round(totals.insuranceDeduction).toLocaleString()} đ</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Phạt (Đi trễ / Vi phạm)</span>
                                                    <span className="text-red-500 font-bold">-{Math.round(totalFines).toLocaleString()} đ</span>
                                                </div>
                                                <div className="flex justify-between bg-orange-50 p-2 -mx-2 rounded-lg">
                                                    <span className="text-orange-700 font-bold">Đã thanh toán (Ứng lương)</span>
                                                    <span className="text-orange-700 font-bold">-{Math.round(totals.totalAdvances).toLocaleString()} đ</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                            <button onClick={() => setIsSummaryModalOpen(false)} className="bg-white border border-gray-300 text-gray-700 font-bold py-2 px-6 rounded-xl hover:bg-gray-100 transition-colors">
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Bulk Bonus Modal */}
            <BulkBonusModal
                isOpen={isBulkBonusModalOpen}
                onClose={() => setIsBulkBonusModalOpen(false)}
                employees={payrollEmployees}
                onSave={onBulkSaveBonus}
                existingBonuses={bonuses}
                onDeleteBatch={onDeleteBonusBatch}
                currentMonth={selectedMonth}
                lateWarnings={lateWarnings}
            />
            {/* Revert Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!revertConfirmId}
                onClose={() => setRevertConfirmId(null)}
                title="Xác nhận hoàn chốt lương?"
                message="Hành động này sẽ hủy trạng thái 'Đã chốt' của nhân viên. Bạn sẽ cần phải chốt lại sau khi hoàn tất chỉnh sửa."
                confirmText="Hoàn chốt ngay"
                cancelText="Hủy bỏ"
                onConfirm={() => {
                    if (revertConfirmId) {
                        onDeleteBonusBatch([revertConfirmId]);
                        setRevertConfirmId(null);
                        setSuccessMsg("Đã hoàn chốt thành công!");
                        setTimeout(() => setSuccessMsg(""), 3000);
                    }
                }}
                type="warning"
            />
        </div>
    );
};
