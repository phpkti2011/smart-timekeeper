import React, { useMemo, useState } from 'react';
import { format, subMonths, startOfMonth } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertTriangle, Clock, TrendingUp, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { UserProfile, AttendanceLog, LateRequest, OverrideLog, Holiday, LeaveRequest, MonthlySalaryReport, SwapRequest } from '../types';
import { getLateCountForMonth } from '../utils/salaryCalculator';

interface EmployeeLateData {
    empId: string;
    name: string;
    avatar: string;
    role: string;
    currentMonthLate: number;
    penaltyTier: string;
    penaltyPercent: number;
    penaltyAmount: number;
    consecutiveMonths: number;
    isConsecutive3: boolean;
    isConsecutive6: boolean;
    monthlyBreakdown: number[]; // late counts for last 6 months (newest first)
}

interface Props {
    employees: UserProfile[];
    logs: AttendanceLog[];
    lateRequests: LateRequest[];
    overrides: OverrideLog[];
    holidays: Holiday[];
    leaveRequests: LeaveRequest[];
    swapRequests?: SwapRequest[];
    selectedMonth: Date;
    reportData: { empId: string; report: MonthlySalaryReport }[] | null;
}

export const LateReport: React.FC<Props> = ({
    employees,
    logs,
    lateRequests,
    overrides,
    holidays,
    leaveRequests,
    swapRequests = [],
    selectedMonth,
    reportData
}) => {
    const [showAll, setShowAll] = useState(false);
    const [sortBy, setSortBy] = useState<'late' | 'consecutive' | 'name'>('late');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const lateData = useMemo<EmployeeLateData[]>(() => {
        return employees.map(emp => {
            const empLogs = logs.filter(l => l.userId === emp.id);
            const empLateReqs = lateRequests.filter(r => r.userId === emp.id);
            const empOverrides = (overrides || []).filter(o => o.userId === emp.id);
            const empLeaveReqs = leaveRequests.filter(r => r.userId === emp.id);
            const empSwapReqs = swapRequests.filter(r => r.userId === emp.id);

            // Get report data for this employee
            const empReport = reportData?.find(r => r.empId === emp.id)?.report;
            const currentMonthLate = empReport?.totalLateCount ?? getLateCountForMonth(
                selectedMonth, empLogs, empLateReqs, empOverrides, holidays, emp, empLeaveReqs, empSwapReqs
            );

            // Monthly breakdown (last 6 months, newest first = selectedMonth, then 5 previous)
            const months = Array.from({ length: 6 }, (_, i) => subMonths(selectedMonth, i));
            const monthlyBreakdown = months.map((m, idx) => {
                if (idx === 0) return currentMonthLate;
                return getLateCountForMonth(m, empLogs, empLateReqs, empOverrides, holidays, emp, empLeaveReqs, empSwapReqs);
            });

            // Consecutive late months (from newest, requires ≥2 late/month)
            let consecutive = 0;
            for (const count of monthlyBreakdown) {
                if (count >= 2) consecutive++;
                else break;
            }

            // Penalty calculation
            let penaltyTier = '';
            let penaltyPercent = 0;
            const grossAllowance = empReport?.grossAllowance ?? 0;

            if (currentMonthLate === 0) {
                penaltyTier = '—';
                penaltyPercent = 0;
            } else if (currentMonthLate === 1) {
                penaltyTier = 'Nhắc nhở';
                penaltyPercent = 0;
            } else if (currentMonthLate === 2) {
                penaltyTier = 'Trừ 20%';
                penaltyPercent = 20;
            } else if (currentMonthLate === 3) {
                penaltyTier = 'Trừ 50%';
                penaltyPercent = 50;
            } else {
                penaltyTier = 'Trừ 100%';
                penaltyPercent = 100;
            }

            return {
                empId: emp.id,
                name: emp.name,
                avatar: emp.avatar,
                role: emp.role,
                currentMonthLate,
                penaltyTier,
                penaltyPercent,
                penaltyAmount: grossAllowance * (penaltyPercent / 100),
                consecutiveMonths: consecutive,
                isConsecutive3: empReport?.isConsecutive3Months ?? consecutive >= 3,
                isConsecutive6: empReport?.isConsecutive6Months ?? consecutive >= 6,
                monthlyBreakdown
            };
        });
    }, [employees, logs, lateRequests, overrides, holidays, leaveRequests, selectedMonth, reportData]);

    // Filter & sort
    const displayData = useMemo(() => {
        let filtered = showAll ? lateData : lateData.filter(d => d.currentMonthLate > 0);

        filtered.sort((a, b) => {
            let diff = 0;
            if (sortBy === 'late') diff = a.currentMonthLate - b.currentMonthLate;
            else if (sortBy === 'consecutive') diff = a.consecutiveMonths - b.consecutiveMonths;
            else diff = a.name.localeCompare(b.name);
            return sortDir === 'desc' ? -diff : diff;
        });

        return filtered;
    }, [lateData, showAll, sortBy, sortDir]);

    // Summary stats
    const totalLateEmployees = lateData.filter(d => d.currentMonthLate > 0).length;
    const flagged3 = lateData.filter(d => d.isConsecutive3 && !d.isConsecutive6).length;
    const flagged6 = lateData.filter(d => d.isConsecutive6).length;
    const totalPenaltyAmount = lateData.reduce((sum, d) => sum + d.penaltyAmount, 0);

    const handleSort = (col: 'late' | 'consecutive' | 'name') => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('desc'); }
    };

    const SortIcon = ({ col }: { col: 'late' | 'consecutive' | 'name' }) => {
        if (sortBy !== col) return null;
        return sortDir === 'desc' ? <ChevronDown size={14} className="inline" /> : <ChevronUp size={14} className="inline" />;
    };

    // Month labels for breakdown columns
    const monthLabels = Array.from({ length: 6 }, (_, i) =>
        format(subMonths(selectedMonth, i), 'MM/yy')
    );

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
                    <div className="text-3xl font-black text-gray-800">{totalLateEmployees}</div>
                    <div className="text-xs text-gray-500 font-medium mt-1">NV đi trễ tháng này</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
                    <div className="text-3xl font-black text-red-500">{totalPenaltyAmount.toLocaleString('vi-VN')}₫</div>
                    <div className="text-xs text-gray-500 font-medium mt-1">Tổng tiền phạt</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm text-center">
                    <div className="text-3xl font-black text-amber-600">{flagged3}</div>
                    <div className="text-xs text-amber-600 font-medium mt-1">Cảnh báo 3 tháng</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm text-center">
                    <div className="text-3xl font-black text-red-600">{flagged6}</div>
                    <div className="text-xs text-red-600 font-medium mt-1">Cảnh báo 6 tháng</div>
                </div>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setShowAll(!showAll)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${showAll
                        ? 'bg-gray-100 border-gray-300 text-gray-700'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        }`}
                >
                    <Filter size={14} />
                    {showAll ? 'Hiện tất cả nhân viên' : `Chỉ NV có đi trễ (${totalLateEmployees})`}
                </button>
                <div className="text-xs text-gray-400 font-medium">
                    Tháng {format(selectedMonth, 'MM/yyyy')}
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th className="p-3 sticky left-0 bg-gray-50 z-10">
                                    <button onClick={() => handleSort('name')} className="hover:text-gray-800 transition">
                                        Nhân viên <SortIcon col="name" />
                                    </button>
                                </th>
                                <th className="p-3 text-center">
                                    <button onClick={() => handleSort('late')} className="hover:text-gray-800 transition">
                                        Trễ T.này <SortIcon col="late" />
                                    </button>
                                </th>
                                <th className="p-3 text-center">Mức phạt</th>
                                <th className="p-3 text-right">Trừ phụ cấp</th>
                                <th className="p-3 text-center">
                                    <button onClick={() => handleSort('consecutive')} className="hover:text-gray-800 transition">
                                        Liên tiếp <SortIcon col="consecutive" />
                                    </button>
                                </th>
                                <th className="p-3 text-center">Cảnh báo</th>
                                {/* Monthly breakdown columns */}
                                {monthLabels.map((label, idx) => (
                                    <th key={idx} className={`p-3 text-center text-[10px] ${idx === 0 ? 'bg-indigo-50/50' : ''}`}>
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {displayData.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="p-8 text-center text-gray-400">
                                        <Clock size={32} className="mx-auto mb-2 opacity-40" />
                                        <div className="font-bold">Không có nhân viên nào đi trễ</div>
                                        <div className="text-xs mt-1">Tháng {format(selectedMonth, 'MM/yyyy')}</div>
                                    </td>
                                </tr>
                            ) : (
                                displayData.map(item => (
                                    <tr key={item.empId} className={`hover:bg-gray-50/50 transition-colors ${item.isConsecutive6 ? 'bg-red-50/30' : item.isConsecutive3 ? 'bg-amber-50/30' : ''
                                        }`}>
                                        {/* Employee */}
                                        <td className="p-3 sticky left-0 bg-white z-10">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300 shrink-0">
                                                    <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm">{item.name}</div>
                                                    <div className="text-[10px] text-gray-400">{item.role}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Late count this month */}
                                        <td className="p-3 text-center">
                                            {item.currentMonthLate > 0 ? (
                                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${item.currentMonthLate >= 4 ? 'bg-red-100 text-red-700' :
                                                    item.currentMonthLate >= 3 ? 'bg-orange-100 text-orange-700' :
                                                        item.currentMonthLate >= 2 ? 'bg-amber-100 text-amber-700' :
                                                            'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {item.currentMonthLate}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-sm">0</span>
                                            )}
                                        </td>

                                        {/* Penalty tier */}
                                        <td className="p-3 text-center">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${item.penaltyPercent === 0 && item.currentMonthLate === 0 ? 'bg-gray-100 text-gray-400' :
                                                item.penaltyPercent === 0 ? 'bg-blue-50 text-blue-600' :
                                                    item.penaltyPercent <= 20 ? 'bg-amber-50 text-amber-600' :
                                                        item.penaltyPercent <= 50 ? 'bg-orange-50 text-orange-600' :
                                                            'bg-red-50 text-red-600'
                                                }`}>
                                                {item.penaltyTier}
                                            </span>
                                        </td>

                                        {/* Penalty amount */}
                                        <td className="p-3 text-right">
                                            {item.penaltyAmount > 0 ? (
                                                <span className="font-bold text-red-600 text-sm">
                                                    -{item.penaltyAmount.toLocaleString('vi-VN')}₫
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-sm">—</span>
                                            )}
                                        </td>

                                        {/* Consecutive months */}
                                        <td className="p-3 text-center">
                                            {item.consecutiveMonths > 0 ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <TrendingUp size={12} className={
                                                        item.consecutiveMonths >= 6 ? 'text-red-500' :
                                                            item.consecutiveMonths >= 3 ? 'text-amber-500' :
                                                                'text-gray-400'
                                                    } />
                                                    <span className={`font-black text-sm ${item.consecutiveMonths >= 6 ? 'text-red-600' :
                                                        item.consecutiveMonths >= 3 ? 'text-amber-600' :
                                                            'text-gray-600'
                                                        }`}>{item.consecutiveMonths}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-300 text-sm">0</span>
                                            )}
                                        </td>

                                        {/* Warning */}
                                        <td className="p-3 text-center">
                                            {item.isConsecutive6 ? (
                                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-lg">
                                                    <AlertTriangle size={10} /> Họp BGĐ
                                                </span>
                                            ) : item.isConsecutive3 ? (
                                                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-lg">
                                                    <AlertTriangle size={10} /> Cắt thưởng lễ
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-sm">—</span>
                                            )}
                                        </td>

                                        {/* Monthly breakdown */}
                                        {item.monthlyBreakdown.map((count, idx) => (
                                            <td key={idx} className={`p-3 text-center text-xs ${idx === 0 ? 'bg-indigo-50/30' : ''}`}>
                                                {count > 0 ? (
                                                    <span className={`font-bold ${count >= 4 ? 'text-red-600' :
                                                        count >= 3 ? 'text-orange-600' :
                                                            count >= 2 ? 'text-amber-600' :
                                                                'text-yellow-600'
                                                        }`}>{count}</span>
                                                ) : (
                                                    <span className="text-gray-200">·</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer summary */}
                {displayData.length > 0 && (
                    <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <span>Hiển thị <span className="font-bold text-gray-700">{displayData.length}</span> / {employees.length} nhân viên</span>
                        <span>
                            Tổng phạt: <span className="font-bold text-red-600">{totalPenaltyAmount.toLocaleString('vi-VN')}₫</span>
                        </span>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs font-bold text-gray-500 mb-2">QUY ĐỊNH PHẠT TRỄ</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        Lần 1: Nhắc nhở
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        Lần 2: Trừ 20% phụ cấp
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                        Lần 3: Trừ 50% phụ cấp
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        Lần 4+: Trừ 100% phụ cấp
                    </div>
                </div>
                <div className="border-t border-gray-100 mt-3 pt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-4 h-4 rounded bg-amber-100 text-amber-700 text-center text-[8px] font-bold leading-4">!</span>
                        3 tháng liên tiếp trễ ≥2 lần/tháng → Cắt thưởng lễ trong năm
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-4 h-4 rounded bg-red-100 text-red-700 text-center text-[8px] font-bold leading-4">!</span>
                        6 tháng liên tiếp trễ ≥2 lần/tháng → Họp Ban Giám Đốc xử lý
                    </div>
                </div>
            </div>
        </div>
    );
};
