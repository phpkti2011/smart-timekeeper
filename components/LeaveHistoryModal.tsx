import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { X, CalendarClock, AlertTriangle, RefreshCw, Inbox, CheckCircle2 } from 'lucide-react';
import { Holiday, LeaveRequest, LeaveType, UserProfile, SwapRequest } from '../types';
import {
    getAccruedLeaveThisYear,
    getLeaveEntriesForYear,
    getRemainingLeave,
    getLeaveBadgeClass,
    getRequestStatusClass,
    getRequestStatusText,
    LEAVE_TYPE_LABEL,
    countDistinctLeaveDays,
    countDistinctCalendarDays,
    LeaveUsageEntry
} from '../utils/leaveTypes';
import { fetchLeaveRequestsByYear } from '../utils/leaveQueries';
import { makeRestDayPredicate } from '../utils/restDay';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employee: UserProfile;
    leaveRequests: LeaveRequest[]; // Đơn của năm hiện tại, lấy từ state App
    swapRequests?: SwapRequest[]; // Đơn đổi ngày nghỉ CỦA NV này — T7 đã đổi không trừ phép, CN đã đổi thì có
    holidays?: Holiday[];
}

const DURATION_LABEL: Record<string, string> = {
    FULL: 'Cả ngày',
    MORNING: 'Buổi sáng',
    AFTERNOON: 'Buổi chiều'
};

const TYPE_FILTERS: { value: 'ALL' | LeaveType; label: string }[] = [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'PAID', label: 'Phép năm' },
    { value: 'SPECIAL', label: 'Chế độ' },
    { value: 'INSURANCE', label: 'BHXH' },
    { value: 'UNPAID', label: 'Không lương' }
];

// Câu giải thích vì sao số ngày trừ quỹ ít hơn số ngày lịch
const explainText = (entry: LeaveUsageEntry): string => {
    const { breakdown, request } = entry;
    const parts: string[] = [];

    if (breakdown.sundayDays > 0) parts.push(`${breakdown.sundayDays} ngày nghỉ tuần`);
    if (breakdown.holidayDays > 0) {
        const names = [...new Set(breakdown.holidayNames)].join(', ');
        parts.push(`${breakdown.holidayDays} ngày lễ${names ? ` (${names})` : ''}`);
    }

    if (parts.length > 0) {
        return `${breakdown.calendarDays} ngày lịch − ${parts.join(' − ')} = ${breakdown.countedDays} ngày`;
    }
    if (breakdown.isHalfDay) return 'Nghỉ nửa buổi → 0.5 ngày';
    if (request.leaveType === 'PAID' && request.status === 'APPROVED') return '—';
    return '';
};

export const LeaveHistoryModal: React.FC<Props> = ({ isOpen, onClose, employee, leaveRequests, swapRequests = [], holidays = [] }) => {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [typeFilter, setTypeFilter] = useState<'ALL' | LeaveType>('ALL');
    const [showAllStatuses, setShowAllStatuses] = useState(false);
    const [cache, setCache] = useState<Record<number, LeaveRequest[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reqIdRef = useRef(0);

    const isCurrentYear = year === currentYear;

    // Reset khi đổi nhân viên hoặc mở lại modal
    useEffect(() => {
        if (isOpen) {
            setYear(currentYear);
            setTypeFilter('ALL');
            setShowAllStatuses(false);
            setCache({});
            setError(null);
        }
    }, [isOpen, employee.id]);

    // Đóng bằng phím Esc
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // Năm hiện tại dùng dữ liệu sẵn có; năm cũ phải query thêm
    const loadYear = (targetYear: number) => {
        const myId = ++reqIdRef.current;
        setLoading(true);
        setError(null);
        fetchLeaveRequestsByYear(employee.id, targetYear, [employee])
            .then(rows => {
                if (reqIdRef.current !== myId) return; // bỏ kết quả về trễ
                setCache(prev => ({ ...prev, [targetYear]: rows }));
                setLoading(false);
            })
            .catch((e: any) => {
                if (reqIdRef.current !== myId) return;
                setError(e?.message || 'Không tải được dữ liệu');
                setLoading(false);
            });
    };

    useEffect(() => {
        if (!isOpen || isCurrentYear) return;
        if (cache[year]) return; // đã có trong cache, không query lại
        loadYear(year);
    }, [isOpen, year, isCurrentYear]);

    const source: LeaveRequest[] | null = isCurrentYear ? leaveRequests : (cache[year] ?? null);

    const asOfForYear = isCurrentYear ? new Date() : new Date(year, 11, 31);

    // Ngày nghỉ tuần của NV này (CN, hoặc T7 đã đổi) — để số trong modal khớp số ngoài bảng
    const isRestDay = makeRestDayPredicate(swapRequests, holidays);

    const allEntries = useMemo(() => getLeaveEntriesForYear(employee.id, source || [], {
        asOf: asOfForYear,
        holidays,
        isRestDay,
        statuses: showAllStatuses ? ['APPROVED', 'PENDING', 'REJECTED'] : ['APPROVED']
    }), [employee.id, source, holidays, swapRequests, showAllStatuses, year]);

    const entries = typeFilter === 'ALL'
        ? allEntries
        : allEntries.filter(e => e.request.leaveType === typeFilter);

    // Các con số đối chiếu — dùng đúng hàm mà bảng bên ngoài đang dùng
    const accrued = getAccruedLeaveThisYear(employee, { asOf: asOfForYear });
    // Cộng newDeductedDays để khớp getPaidLeaveUsedThisYear — đơn nhập trùng ngày
    // chỉ được trừ quỹ một lần.
    const usedSystem = allEntries.reduce((sum, e) => sum + e.newDeductedDays, 0);
    const legacy = employee.usedLeaveLegacy || 0;
    const remaining = accrued - usedSystem - legacy;

    // Chốt chặn: số trong modal phải khớp số ngoài bảng
    const outsideRemaining = getRemainingLeave(employee, leaveRequests, { holidays, isRestDay });
    const matchesTable = isCurrentYear && remaining === outsideRemaining;

    // Đếm theo NGÀY đã khử trùng, không cộng theo đơn: ba đơn phủ cùng một kỳ
    // nghỉ trước đây cho ra con số gấp đôi số ngày thật.
    const daysOfType = (t: LeaveType) =>
        countDistinctLeaveDays(allEntries.filter(e => e.request.leaveType === t).map(e => e.request), holidays, isRestDay);

    const totalCalendarDays = countDistinctCalendarDays(allEntries.map(e => e.request));
    const specialDays = daysOfType('SPECIAL');
    const unpaidDays = daysOfType('UNPAID');
    const insuranceDays = daysOfType('INSURANCE');

    // Đơn có ngày bị đơn cũ hơn chiếm trước → Admin cần nhìn ra để dọn
    const overlapCount = allEntries.filter(e => e.overlapDays > 0).length;

    const yearOptions = useMemo(() => {
        const contractYear = employee.contractDate
            ? new Date(employee.contractDate).getFullYear()
            : currentYear - 4;
        const start = Math.max(contractYear, currentYear - 5);
        const years: number[] = [];
        for (let y = currentYear; y >= start; y--) years.push(y);
        return years.length > 0 ? years : [currentYear];
    }, [employee.contractDate, currentYear]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                            <CalendarClock size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Lịch Sử Phép Đã Dùng</h2>
                            <p className="text-sm text-gray-500">
                                {employee.name}
                                {employee.employeeCode ? ` · ${employee.employeeCode}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>Năm {y}</option>
                            ))}
                        </select>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Toolbar: lọc loại nghỉ + hiện đơn chưa duyệt */}
                <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex p-1 bg-gray-100 rounded-lg">
                        {TYPE_FILTERS.map(f => (
                            <button
                                key={f.value}
                                onClick={() => setTypeFilter(f.value)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${typeFilter === f.value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showAllStatuses}
                            onChange={e => setShowAllStatuses(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Hiện cả đơn chờ duyệt / bị từ chối
                    </label>
                </div>

                {/* Bảng chi tiết */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-10 text-center text-gray-400">
                            <RefreshCw size={28} className="mx-auto mb-3 animate-spin opacity-60" />
                            <p className="text-sm">Đang tải đơn nghỉ năm {year}...</p>
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center">
                            <div className="inline-flex flex-col items-center gap-3 bg-red-50 border border-red-100 text-red-700 px-6 py-5 rounded-xl">
                                <AlertTriangle size={24} />
                                <p className="text-sm font-medium">Không tải được dữ liệu năm {year}</p>
                                <p className="text-xs opacity-80">{error}</p>
                                <button
                                    onClick={() => loadYear(year)}
                                    className="mt-1 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    Thử lại
                                </button>
                            </div>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="p-10 text-center text-gray-400">
                            <Inbox size={36} className="mx-auto mb-3 opacity-50" />
                            {allEntries.length > 0 ? (
                                <p className="text-sm">
                                    Năm {year} không có đơn nào thuộc loại "{TYPE_FILTERS.find(f => f.value === typeFilter)?.label}".
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm">Không có đơn nghỉ nào trong năm {year}.</p>
                                    {!isCurrentYear && (
                                        <p className="text-xs mt-2 max-w-md mx-auto opacity-80">
                                            Nếu chắc chắn có đơn trong năm này mà không thấy, có thể do quyền truy cập
                                            (RLS) của bảng <span className="font-mono">requests</span>.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 font-semibold">Ngày nghỉ</th>
                                    <th className="p-4 font-semibold">Loại</th>
                                    <th className="p-4 font-semibold text-center" title="Tổng số ngày trong khoảng nghỉ">Ngày lịch</th>
                                    <th className="p-4 font-semibold text-center text-blue-700" title="Số ngày thực sự bị trừ khỏi quỹ phép năm">Trừ quỹ</th>
                                    <th className="p-4 font-semibold">Vì sao</th>
                                    <th className="p-4 font-semibold text-right">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {entries.map(entry => {
                                    const { request: req, breakdown, deductsQuota, deductedDays } = entry;
                                    const isSingleDay = breakdown.calendarDays <= 1;
                                    const note = explainText(entry);
                                    const timeTip = [
                                        req.createdAt ? `Tạo lúc ${format(new Date(req.createdAt), 'dd/MM/yyyy HH:mm')}` : '',
                                        req.processedAt ? `Duyệt lúc ${format(new Date(req.processedAt), 'dd/MM/yyyy HH:mm')}` : ''
                                    ].filter(Boolean).join(' · ');

                                    return (
                                        <tr key={req.id} className={`hover:bg-blue-50/30 transition-colors ${req.status !== 'APPROVED' ? 'opacity-60' : ''}`}>
                                            {/* Ngày nghỉ */}
                                            <td className="p-4 align-top">
                                                <div className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                                                    {format(new Date(req.startDate), 'dd/MM/yyyy')}
                                                    {!isSingleDay && ` → ${format(new Date(req.endDate), 'dd/MM/yyyy')}`}
                                                    {breakdown.isCrossYear && (
                                                        <span
                                                            title={`Đơn vắt qua 2 năm — toàn bộ ${breakdown.countedDays} ngày được tính vào quỹ năm ${new Date(req.startDate).getFullYear()} theo ngày bắt đầu.`}
                                                            className="text-amber-500"
                                                        >
                                                            <AlertTriangle size={13} />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {DURATION_LABEL[req.duration] || req.duration}
                                                </div>
                                                {req.reason && (
                                                    <div className="text-xs text-gray-400 italic mt-1 max-w-[220px] truncate" title={req.reason}>
                                                        "{req.reason}"
                                                    </div>
                                                )}
                                            </td>

                                            {/* Loại nghỉ */}
                                            <td className="p-4 align-top">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded border whitespace-nowrap ${getLeaveBadgeClass(req.leaveType)}`}>
                                                    {LEAVE_TYPE_LABEL[req.leaveType]}
                                                </span>
                                            </td>

                                            {/* Ngày lịch */}
                                            <td className="p-4 align-top text-center text-sm text-gray-600">
                                                {breakdown.calendarDays}
                                            </td>

                                            {/* Trừ quỹ */}
                                            <td className="p-4 align-top text-center">
                                                {deductsQuota ? (
                                                    <span className="text-sm font-bold text-blue-600">−{deductedDays}</span>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-sm text-gray-400">0</span>
                                                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                            Không trừ quỹ
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Vì sao */}
                                            <td className="p-4 align-top text-xs text-gray-600 leading-relaxed">
                                                {note && <div>{note}</div>}
                                                {req.status !== 'APPROVED' && (
                                                    <div className="text-orange-600 mt-0.5">
                                                        {req.status === 'PENDING' ? 'Chưa duyệt — không tính' : 'Bị từ chối — không tính'}
                                                    </div>
                                                )}
                                                {req.status === 'APPROVED' && req.leaveType !== 'PAID' && (
                                                    <div className="text-gray-400 mt-0.5">
                                                        {LEAVE_TYPE_LABEL[req.leaveType]} — không trừ quỹ phép năm
                                                    </div>
                                                )}
                                                {entry.overlapDays > 0 && (
                                                    <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">
                                                        ⚠ Trùng <b>{entry.overlapDays}</b> ngày với đơn trước — phần trùng không cộng lại
                                                    </div>
                                                )}
                                            </td>

                                            {/* Trạng thái */}
                                            <td className="p-4 align-top text-right">
                                                <span
                                                    title={timeTip || undefined}
                                                    className={`text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${getRequestStatusClass(req.status)}`}
                                                >
                                                    {getRequestStatusText(req.status)}
                                                </span>
                                                {req.status === 'REJECTED' && req.rejectionReason && (
                                                    <div className="text-[10px] text-red-400 italic mt-1 max-w-[150px] ml-auto">
                                                        "{req.rejectionReason}"
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                <tr>
                                    <td className="p-4 text-xs text-gray-500" colSpan={2}>
                                        {(specialDays > 0 || unpaidDays > 0 || insuranceDays > 0) && (
                                            <span>
                                                Nghỉ chế độ: <b>{specialDays}</b> ngày
                                                {insuranceDays > 0 && <> · BHXH chi trả: <b>{insuranceDays}</b> ngày</>}
                                                {' '}· Không lương: <b>{unpaidDays}</b> ngày
                                                <span className="text-gray-400"> (không trừ quỹ)</span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center text-sm font-bold text-gray-600">{totalCalendarDays}</td>
                                    <td className="p-4 text-center">
                                        <span className="text-base font-bold text-blue-600">{usedSystem}</span>
                                    </td>
                                    <td className="p-4 text-xs font-bold text-gray-600" colSpan={2}>
                                        TỔNG TRỪ QUỸ PHÉP NĂM
                                        {typeFilter !== 'ALL' && (
                                            <span className="block font-normal text-gray-400 mt-0.5">
                                                Đang lọc theo loại — tổng vẫn tính cả năm
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>

                {/* Khối đối chiếu */}
                <div className="border-t border-gray-100 bg-gray-50/60 p-5 rounded-b-2xl">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
                        <span className="text-gray-500">Quỹ năm {year}:</span>
                        <span className="font-bold text-gray-800">{accrued}</span>
                        <span className="text-gray-400">−</span>
                        <span className="text-gray-500">Đã dùng (phần mềm):</span>
                        <span className="font-bold text-blue-600">{usedSystem}</span>
                        <span className="text-gray-400">−</span>
                        <span className="text-gray-500">Đã dùng (cũ):</span>
                        {isCurrentYear ? (
                            <span className="font-bold text-orange-600">{legacy}</span>
                        ) : (
                            <span className="text-gray-400 line-through">{legacy}</span>
                        )}
                        <span className="text-gray-400">=</span>
                        {isCurrentYear ? (
                            <>
                                <span className="text-gray-500">Còn lại:</span>
                                <span className={`font-bold text-base ${remaining < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {remaining}
                                </span>
                                {matchesTable && (
                                    <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                                        <CheckCircle2 size={11} /> Khớp với bảng
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <span className="text-gray-500">Còn lại (chưa trừ phép cũ):</span>
                                <span className="font-bold text-base text-gray-600">{accrued - usedSystem}</span>
                            </>
                        )}
                    </div>

                    {overlapCount > 0 && (
                        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>
                                Có <b>{overlapCount}</b> đơn trùng ngày với đơn khác — nhiều khả năng là một kỳ nghỉ
                                bị nhập nhiều lần. Các con số ở đây <b>đã khử trùng</b> nên vẫn đúng, nhưng nên vào
                                mục <b>Duyệt Đơn</b> xoá đơn thừa cho gọn.
                            </span>
                        </div>
                    )}

                    {!isCurrentYear && (
                        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>
                                Số "Đã dùng (Cũ)" ({legacy} ngày) là số nhập tay <b>không gắn với năm nào</b>, nên
                                không đưa vào phép tính của năm {year}. Chỉ dòng đối chiếu của năm {currentYear} mới
                                khớp với bảng bên ngoài.
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
