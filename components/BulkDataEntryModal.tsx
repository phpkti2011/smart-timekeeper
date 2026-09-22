import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, LeaveRequest, Holiday, SwapRequest } from '../types';
import { supabase } from '../utils/supabaseClient';
import { X, Save, Search, AlertCircle, FileSpreadsheet, ClipboardPaste } from 'lucide-react';
import { accruesAnnualLeave, getAccruedLeaveThisYear, getPaidLeaveUsedThisYear, getRemainingLeave } from '../utils/leaveTypes';
import { selectLeaveScreenEmployees } from '../utils/employeeFilters';
import { makeRestDayPredicate } from '../utils/restDay';
import { parseVNDate, formatVNDate } from '../utils/dateInput';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employees: UserProfile[];
    leaveRequests: LeaveRequest[];
    swapRequests?: SwapRequest[];
    holidays?: Holiday[];
    onShowHistory?: (employeeId: string) => void;
    // Dùng chung state với màn Quản Lý Phép Năm để hai bảng không bao giờ lệch danh sách
    showResigned?: boolean;
    onToggleShowResigned?: (next: boolean) => void;
    onUpdateSuccess: (updatedEmployees: UserProfile[]) => void;
}

interface Row {
    id: string;
    name: string;
    code: string;
    contractType: UserProfile['contractType'];
    contractDate: string | null;
    officialContractDate: string | null;
    resignationDate: string | null;
    usedLegacy: number;
}

type EditableField = 'contractType' | 'contractDate' | 'officialContractDate' | 'resignationDate' | 'usedLegacy';

// Thứ tự cột dùng cho việc dán lan sang phải
const EDITABLE_COLS: EditableField[] = ['contractType', 'contractDate', 'officialContractDate', 'resignationDate', 'usedLegacy'];
const DATE_FIELDS: EditableField[] = ['contractDate', 'officialContractDate', 'resignationDate'];

const CONTRACT_TYPES: NonNullable<UserProfile['contractType']>[] = [
    'Hợp đồng chính thức', 'Hợp đồng thử việc', 'Part-time', 'CTV'
];

const cellKey = (id: string, field: EditableField) => `${id}:${field}`;

/** Tách nội dung clipboard thành lưới: xuống dòng = dòng, tab = cột */
export const parseClipboardGrid = (raw: string): string[][] =>
    raw.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map(line => line.split('\t'));

/**
 * Đổi một ô vừa dán thành giá trị lưu được.
 * `undefined` = không đọc được → GIỮ NGUYÊN giá trị cũ, không ghi đè.
 * `null` (ô ngày rỗng) = cố ý xoá ngày.
 */
export const coercePastedValue = (field: EditableField, raw: string): any | undefined => {
    const text = raw.trim();

    if (field === 'usedLegacy') {
        const num = parseFloat(text.replace(',', '.'));
        return Number.isNaN(num) ? undefined : num;
    }

    if (field === 'contractType') {
        return CONTRACT_TYPES.find(t => t.toLowerCase() === text.toLowerCase()) ?? undefined;
    }

    if (!text) return null;
    return parseVNDate(text) ?? undefined;
};

export const BulkDataEntryModal: React.FC<Props> = ({
    isOpen, onClose, employees, leaveRequests = [], swapRequests = [], holidays = [],
    onShowHistory, showResigned = false, onToggleShowResigned, onUpdateSuccess
}) => {
    const [data, setData] = useState<Row[]>([]);
    // Chữ đang gõ trong ô ngày — tách khỏi giá trị đã chốt để gõ dở "25/0" không bị mất
    const [dateText, setDateText] = useState<Record<string, string>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [pasteNote, setPasteNote] = useState<string | null>(null);

    // Theo từng Ô (không phải từng dòng) để vừa tô màu được ô vừa sửa,
    // vừa suy ra danh sách dòng cần ghi xuống DB.
    const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());

    // Giữ employees mới nhất mà KHÔNG đưa vào deps của useEffect khởi tạo:
    // nếu không, hồ sơ được đồng bộ lúc modal đang mở sẽ xoá sạch ô đang gõ dở.
    const employeesRef = useRef(employees);
    employeesRef.current = employees;

    useEffect(() => {
        if (!isOpen) return;
        setData(employeesRef.current.map(emp => ({
            id: emp.id,
            name: emp.name,
            code: emp.employeeCode || '',
            contractType: emp.contractType,
            contractDate: emp.contractDate || null,
            officialContractDate: emp.officialContractDate || null,
            resignationDate: emp.resignationDate || null,
            usedLegacy: emp.usedLeaveLegacy || 0
        })));
        setDateText({});
        setDirtyCells(new Set());
        setPasteNote(null);
    }, [isOpen]);

    const markDirty = (keys: string[]) => {
        setDirtyCells(prev => {
            const next = new Set(prev);
            keys.forEach(k => next.add(k));
            return next;
        });
    };

    const setCell = (id: string, field: EditableField, value: any) => {
        setData(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
        markDirty([cellKey(id, field)]);
    };

    // --- Ô ngày: gõ tới đâu hiện tới đó, chỉ chốt khi đọc được ---
    const handleDateType = (id: string, field: EditableField, text: string) => {
        setDateText(prev => ({ ...prev, [cellKey(id, field)]: text }));
        const iso = parseVNDate(text);
        if (iso) setCell(id, field, iso);
        else if (!text.trim()) setCell(id, field, null);
    };

    const handleDateBlur = (id: string, field: EditableField) => {
        const key = cellKey(id, field);
        const text = dateText[key];
        if (text === undefined) return;
        // Gõ dở hoặc gõ sai → trả về đúng giá trị đang lưu, không để ô treo chữ rác
        if (text.trim() && !parseVNDate(text)) {
            const row = data.find(r => r.id === id);
            setDateText(prev => ({ ...prev, [key]: formatVNDate(row?.[field] as string | null) }));
        }
    };

    const displayDate = (row: Row, field: EditableField): string => {
        const key = cellKey(row.id, field);
        return dateText[key] !== undefined ? dateText[key] : formatVNDate(row[field] as string | null);
    };

    // --- Dán từ Excel ---
    const handlePaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
        const raw = e.clipboardData.getData('text');
        if (!raw) return;

        const grid = parseClipboardGrid(raw);
        // Dán đúng một ô thì để trình duyệt xử lý như bình thường
        if (grid.length === 1 && grid[0].length === 1) return;

        e.preventDefault();

        let applied = 0;
        let skipped = 0;
        let outOfRange = 0;
        const touchedKeys: string[] = [];
        const patch = new Map<string, Partial<Row>>();
        const textPatch: Record<string, string> = {};

        grid.forEach((cells, r) => {
            const targetRow = filteredData[rowIndex + r];
            if (!targetRow) { outOfRange += cells.length; return; }

            cells.forEach((cellValue, c) => {
                const field = EDITABLE_COLS[colIndex + c];
                if (!field) { outOfRange++; return; }

                const value = coercePastedValue(field, cellValue);
                if (value === undefined) { skipped++; return; }

                patch.set(targetRow.id, { ...(patch.get(targetRow.id) || {}), [field]: value });
                touchedKeys.push(cellKey(targetRow.id, field));
                if (DATE_FIELDS.includes(field)) {
                    textPatch[cellKey(targetRow.id, field)] = formatVNDate(value as string | null);
                }
                applied++;
            });
        });

        if (patch.size > 0) {
            setData(prev => prev.map(r => (patch.has(r.id) ? { ...r, ...patch.get(r.id) } : r)));
            setDateText(prev => ({ ...prev, ...textPatch }));
            markDirty(touchedKeys);
        }

        const notes = [`Đã dán ${applied} ô`];
        if (skipped > 0) notes.push(`${skipped} ô không đọc được, đã giữ nguyên`);
        if (outOfRange > 0) notes.push(`${outOfRange} ô vượt quá bảng đang hiển thị, đã bỏ`);
        setPasteNote(notes.join(' · '));
    };

    const dirtyRowIds = useMemo(
        () => new Set<string>(Array.from<string>(dirtyCells).map(k => k.split(':')[0])),
        [dirtyCells]
    );

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const rows = data.filter(r => dirtyRowIds.has(r.id));
            if (rows.length === 0) { onClose(); return; }

            const promises = rows.map(r =>
                supabase.from('profiles').update({
                    contract_type: r.contractType,
                    // Ô ngày rỗng phải ghi null — chuỗi rỗng sẽ làm cột DATE báo lỗi
                    contract_date: r.contractDate || null,
                    official_contract_date: r.officialContractDate || null,
                    resignation_date: r.resignationDate || null,
                    used_leave_legacy: r.usedLegacy
                }).eq('id', r.id).select()
            );

            const results = await Promise.all(promises);
            const errors = results.filter(x => x.error);
            const silentFailures = results.filter(x => !x.error && (!x.data || x.data.length === 0));

            if (errors.length > 0) {
                console.error('Errors saving bulk data:', errors);
                throw new Error(`Có ${errors.length} lỗi xảy ra. Chi tiết: ${errors[0].error?.message || 'Unknown error'}`);
            }
            if (silentFailures.length > 0) {
                console.error('Silent failures (RLS blocked):', silentFailures);
                throw new Error('Không lưu được (quyền truy cập bị từ chối). Kiểm tra policy UPDATE của bảng "profiles" trên Supabase — tài khoản Admin phải được phép sửa hồ sơ người khác.');
            }

            const updatedEmployees = employees.map(emp => {
                const row = rows.find(r => r.id === emp.id);
                return row ? {
                    ...emp,
                    contractType: row.contractType,
                    contractDate: row.contractDate || undefined,
                    officialContractDate: row.officialContractDate,
                    resignationDate: row.resignationDate,
                    usedLeaveLegacy: row.usedLegacy
                } : emp;
            });

            onUpdateSuccess(updatedEmployees);
            onClose();
            alert(`Đã cập nhật ${rows.length} nhân viên.`);
        } catch (error: any) {
            console.error('Error saving bulk data:', error);
            alert('Lỗi khi lưu dữ liệu: ' + (error.message || JSON.stringify(error)));
        } finally {
            setIsSaving(false);
        }
    };

    // Cùng hàm lọc với màn Quản Lý Phép Năm → hai bảng không thể lệch danh sách
    const selection = useMemo(
        () => selectLeaveScreenEmployees(employees, { includeResigned: showResigned }),
        [employees, showResigned]
    );
    const visibleIds = useMemo(() => new Set(selection.visible.map(e => e.id)), [selection]);
    const hiddenCount = selection.hiddenResignedCount + selection.hiddenBlockedCount;

    // Lọc lúc render (không lọc lúc khởi tạo `data`) để bật/tắt checkbox hay gõ
    // tìm kiếm không làm mất những ô Admin đang gõ dở.
    const filteredData = useMemo(() => data.filter(item =>
        visibleIds.has(item.id) && (
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.code.toLowerCase().includes(searchTerm.toLowerCase())
        )
    ), [data, visibleIds, searchTerm]);

    if (!isOpen) return null;

    const dirtyClass = (id: string, field: EditableField) =>
        dirtyCells.has(cellKey(id, field)) ? 'bg-amber-100 border-amber-400' : 'border-gray-300';

    const dateInputClass = (row: Row, field: EditableField) => {
        const missingOfficial = field === 'officialContractDate' && !row.officialContractDate;
        return `w-28 px-2 py-1.5 border rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-blue-500 ${dirtyCells.has(cellKey(row.id, field))
            ? 'bg-amber-100 border-amber-400'
            : missingOfficial ? 'bg-yellow-50 border-yellow-300' : 'border-gray-300'}`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white w-full max-w-7xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileSpreadsheet className="text-orange-600" size={24} />
                            Nhập Liệu Hợp Đồng &amp; Phép
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Sửa nhiều nhân viên cùng lúc. Copy một cột trong Excel rồi dán vào ô đầu tiên để điền hàng loạt.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-gray-100 flex flex-wrap gap-4 items-center bg-white">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Tìm nhân viên..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={showResigned}
                            onChange={e => onToggleShowResigned?.(e.target.checked)}
                            className="w-4 h-4 accent-blue-600"
                        />
                        Hiện cả NV đã nghỉ việc
                    </label>
                    <div className="ml-auto text-right text-xs text-orange-600 italic flex items-center gap-1">
                        <AlertCircle size={14} /> Ô tô vàng là ô đã sửa, chưa lưu
                    </div>
                </div>

                {/* Kết quả lần dán gần nhất */}
                {pasteNote && (
                    <div className="bg-blue-50 border-b border-blue-100 text-blue-800 text-xs px-4 py-2 flex items-center gap-2">
                        <ClipboardPaste size={14} />
                        <span>{pasteNote}</span>
                        <button onClick={() => setPasteNote(null)} className="ml-auto hover:text-blue-950">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Cho Admin biết đang ẩn ai */}
                {hiddenCount > 0 && (
                    <div className="bg-amber-50 border-b border-amber-100 text-amber-800 text-xs px-4 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                            Đang ẩn
                            {selection.hiddenResignedCount > 0 && <> <b>{selection.hiddenResignedCount}</b> nhân viên đã nghỉ việc</>}
                            {selection.hiddenResignedCount > 0 && selection.hiddenBlockedCount > 0 && ' và'}
                            {selection.hiddenBlockedCount > 0 && <> <b>{selection.hiddenBlockedCount}</b> tài khoản bị khoá / chờ duyệt</>}.
                        </span>
                        {!showResigned && selection.hiddenResignedCount > 0 && onToggleShowResigned && (
                            <button onClick={() => onToggleShowResigned(true)} className="font-bold underline hover:text-amber-900">
                                Hiện NV đã nghỉ việc
                            </button>
                        )}
                    </div>
                )}

                {/* Bảng */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 font-semibold w-10 text-center">#</th>
                                <th className="p-3 font-semibold">Mã NV</th>
                                <th className="p-3 font-semibold">Tên Nhân Viên</th>
                                <th className="p-3 font-semibold">Loại HĐ</th>
                                <th className="p-3 font-semibold text-center" title="Mốc tính công và thâm niên">Ngày vào làm</th>
                                <th className="p-3 font-semibold text-center text-blue-600" title="Mốc tích luỹ phép năm">Ngày HĐ chính thức</th>
                                <th className="p-3 font-semibold text-center">Ngày nghỉ việc</th>
                                <th className="p-3 font-semibold text-right text-orange-600" title="Số ngày đã nghỉ trước khi dùng phần mềm. Nhập số âm để cộng thêm phép">Đã dùng (Cũ)</th>
                                <th className="p-3 font-semibold text-center text-gray-600">Quỹ</th>
                                <th className="p-3 font-semibold text-center text-gray-600">Đã dùng</th>
                                <th className="p-3 font-semibold text-right">Còn Lại</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredData.map((item, index) => {
                                const previewEmp = {
                                    id: item.id,
                                    contractDate: item.contractDate || undefined,
                                    officialContractDate: item.officialContractDate,
                                    contractType: item.contractType,
                                    usedLeaveLegacy: item.usedLegacy,
                                    resignationDate: item.resignationDate
                                };
                                const hasLeaveQuota = accruesAnnualLeave(previewEmp);
                                const accrued = getAccruedLeaveThisYear(previewEmp);
                                const isRestDay = makeRestDayPredicate(swapRequests.filter(s => s.userId === item.id), holidays);
                                const usedSystem = getPaidLeaveUsedThisYear(item.id, leaveRequests, { holidays, isRestDay });
                                const remaining = getRemainingLeave(previewEmp, leaveRequests, { holidays, isRestDay });

                                return (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="p-3 text-center text-gray-400 text-xs">{index + 1}</td>
                                        <td className="p-3 text-sm font-mono text-blue-600">{item.code || '--'}</td>
                                        <td className="p-3 font-medium text-gray-800 text-sm whitespace-nowrap">{item.name}</td>

                                        {/* Loại HĐ */}
                                        <td className="p-3">
                                            <select
                                                value={item.contractType || ''}
                                                onChange={e => setCell(item.id, 'contractType', e.target.value)}
                                                onPaste={e => handlePaste(e, index, 0)}
                                                className={`px-2 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 ${dirtyClass(item.id, 'contractType')}`}
                                            >
                                                <option value="">-- Chưa chọn --</option>
                                                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </td>

                                        {/* Ba ô ngày */}
                                        {DATE_FIELDS.map((field, i) => (
                                            <td className="p-3 text-center" key={field}>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="dd/mm/yyyy"
                                                    value={displayDate(item, field)}
                                                    onChange={e => handleDateType(item.id, field, e.target.value)}
                                                    onBlur={() => handleDateBlur(item.id, field)}
                                                    onPaste={e => handlePaste(e, index, i + 1)}
                                                    className={dateInputClass(item, field)}
                                                />
                                            </td>
                                        ))}

                                        {/* Đã dùng (Cũ) */}
                                        <td className="p-3 text-right">
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={item.usedLegacy}
                                                onChange={e => {
                                                    const v = parseFloat(e.target.value);
                                                    if (!Number.isNaN(v)) setCell(item.id, 'usedLegacy', v);
                                                }}
                                                onPaste={e => handlePaste(e, index, 4)}
                                                className={`w-20 px-2 py-1.5 border rounded-lg text-sm text-right font-bold text-orange-600 outline-none focus:ring-2 focus:ring-orange-500 ${dirtyClass(item.id, 'usedLegacy')}`}
                                            />
                                        </td>

                                        {/* Ba cột chỉ đọc — tính theo giá trị đang gõ */}
                                        <td className="p-3 text-center">
                                            <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">
                                                {!hasLeaveQuota ? '—' : (item.officialContractDate || item.contractDate) ? accrued : '-'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => onShowHistory?.(item.id)}
                                                title="Xem chi tiết các ngày nghỉ tạo nên con số này"
                                                className="font-bold text-blue-600 bg-gray-100 hover:bg-blue-50 px-2 py-1 rounded text-sm underline decoration-dotted underline-offset-4 transition-colors"
                                            >
                                                {usedSystem}
                                            </button>
                                        </td>
                                        <td className="p-3 text-right">
                                            <span className={`font-bold ${remaining < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                {!hasLeaveQuota ? '—' : (item.officialContractDate || item.contractDate) ? remaining : '-'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="p-8 text-center text-gray-400 text-sm">
                                        {searchTerm ? (
                                            <>Không tìm thấy nhân viên nào khớp từ khoá "{searchTerm}".</>
                                        ) : selection.hiddenResignedCount > 0 && onToggleShowResigned ? (
                                            <>
                                                Không có nhân viên nào đang làm việc.{' '}
                                                <button onClick={() => onToggleShowResigned(true)} className="text-blue-600 font-bold underline">
                                                    Hiện {selection.hiddenResignedCount} NV đã nghỉ việc
                                                </button>
                                            </>
                                        ) : (
                                            <>Chưa có nhân viên nào.</>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500">
                        {dirtyRowIds.size > 0
                            ? `${dirtyRowIds.size} nhân viên có thay đổi chưa lưu`
                            : 'Chưa có thay đổi nào'}
                    </span>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition-colors text-sm"
                        >
                            Hủy Bỏ
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || dirtyRowIds.size === 0}
                            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving
                                ? <span className="animate-spin h-4 w-4 block border-2 border-white rounded-full border-t-transparent"></span>
                                : <Save size={16} />}
                            Lưu Thay Đổi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
