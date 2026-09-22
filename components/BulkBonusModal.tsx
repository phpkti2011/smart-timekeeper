import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, BonusFine } from '../types';
import { X, CheckCircle, AlertTriangle, Users, DollarSign, Wand2, Trash2, History, RotateCcw, Edit2, ChevronRight, Calendar } from 'lucide-react';
import { format, isSameMonth, parseISO } from 'date-fns';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employees: UserProfile[]; // Active employees
    onSave: (data: Omit<BonusFine, 'id'>[]) => Promise<void>;
    existingBonuses: BonusFine[]; // Needed for history
    onDeleteBatch: (ids: string[]) => Promise<void>;
    currentMonth: Date;
    lateWarnings?: Record<string, { level: 3 | 6; message: string }>; // Consecutive late warnings per userId
}

export const BulkBonusModal: React.FC<Props> = ({ isOpen, onClose, employees, onSave, existingBonuses, onDeleteBatch, currentMonth, lateWarnings }) => {
    // Mode State
    const [mode, setMode] = useState<'NEW' | 'HISTORY'>('NEW');

    // Edit State
    const [editingBatchFrom, setEditingBatchFrom] = useState<string | null>(null); // To track which batch we are editing (createdAt timestamp)
    const [idsToDeleteOnSave, setIdsToDeleteOnSave] = useState<string[]>([]);

    // Global Inputs
    const [type, setType] = useState<'BONUS' | 'PENALTY'>('BONUS');
    const [globalReason, setGlobalReason] = useState('');
    const [globalAmount, setGlobalAmount] = useState<number>(0);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // List State
    const [selectedEmployees, setSelectedEmployees] = useState<{
        userId: string;
        name: string;
        avatar: string;
        amount: number;
        reason: string;
        isSelected: boolean;
    }[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Default reset
            if (!editingBatchFrom) resetForm();
        } else {
            // Full reset on close
            setEditingBatchFrom(null);
            setIdsToDeleteOnSave([]);
            setMode('NEW');
        }
    }, [isOpen]);

    const resetForm = () => {
        // Init list with 0
        const initialList = employees.map(emp => ({
            userId: emp.id,
            name: emp.name,
            avatar: emp.avatar,
            amount: 0,
            reason: '',
            isSelected: !emp.resignationDate // Auto-deselect resigned
        }));
        setSelectedEmployees(initialList);
        setGlobalReason('');
        setGlobalAmount(0);
        setType('BONUS');
        setDate(format(currentMonth, 'yyyy-MM-dd')); // Default to selected month
        setEditingBatchFrom(null);
        setIdsToDeleteOnSave([]);
    };

    // --- HISTORY LOGIC ---
    const historyGroups = useMemo(() => {
        // Group bonuses by createdAt
        const groups: Record<string, BonusFine[]> = {};
        const singles: BonusFine[] = [];

        existingBonuses.forEach(b => {
            // Bỏ qua các record xác nhận lương của nhân viên (lưu dưới dạng BonusFine với reason chứa "CONFIRMATION")
            if (b.reason && b.reason.includes('CONFIRMATION')) return;

            // Filter by Month View?
            // Determine if we should show ONLY current month bonuses or all?
            // User usually wants to verify current month payroll.
            // Let's filter by bonus.date appearing in currentMonth
            if (isSameMonth(new Date(b.date), currentMonth)) {
                if (b.createdAt) {
                    // Creating a key from timestamp
                    const key = typeof b.createdAt === 'string' ? b.createdAt : b.createdAt.toISOString();
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(b);
                } else {
                    singles.push(b);
                }
            }
        });

        // Convert to array
        const batchList = Object.entries(groups).map(([ts, items]) => ({
            id: ts,
            timestamp: new Date(ts),
            type: items[0].type,
            reason: items[0].reason, // Use first reason as "Title"
            count: items.length,
            totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
            items: items,
            date: items[0].date
        }));

        // Sort by created newest first
        return batchList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }, [existingBonuses, currentMonth]);

    // --- ACTIONS ---

    const handleApplyAll = () => {
        setSelectedEmployees(prev => prev.map(item => ({
            ...item,
            amount: item.isSelected ? globalAmount : item.amount,
            reason: item.isSelected ? globalReason : item.reason
        })));
    };

    const handleToggleSelect = (userId: string) => {
        setSelectedEmployees(prev => prev.map(item =>
            item.userId === userId ? { ...item, isSelected: !item.isSelected } : item
        ));
    };

    const handleChangeRow = (userId: string, field: 'amount' | 'reason', value: any) => {
        setSelectedEmployees(prev => prev.map(item =>
            item.userId === userId ? { ...item, [field]: value } : item
        ));
    };

    const handleSave = async () => {
        const toSave = selectedEmployees
            .filter(item => item.isSelected && item.amount > 0)
            .map(item => ({
                userId: item.userId,
                date: new Date(date),
                amount: item.amount,
                type,
                reason: item.reason || globalReason || (type === 'BONUS' ? 'Thưởng' : 'Phạt')
            }));

        if (toSave.length === 0) {
            alert("Không có dữ liệu nào để lưu.");
            return;
        }

        if (confirm(`Xác nhận ${idsToDeleteOnSave.length > 0 ? 'CẬP NHẬT' : 'LƯU'} danh sách?`)) {
            // Delete old if editing
            if (idsToDeleteOnSave.length > 0) {
                await onDeleteBatch(idsToDeleteOnSave);
            }
            await onSave(toSave);
            onClose();
        }
    };

    const handleEditBatch = (batchId: string, items: BonusFine[]) => {
        // Load data into form
        const refItem = items[0];

        // Settings
        setType(refItem.type);
        setGlobalReason(refItem.reason);
        setDate(format(new Date(refItem.date), 'yyyy-MM-dd'));
        // Find common amount?
        setGlobalAmount(refItem.amount);

        // Map employees
        const newSelection = employees.map(emp => {
            const found = items.find(i => i.userId === emp.id);
            if (found) {
                return {
                    userId: emp.id,
                    name: emp.name,
                    avatar: emp.avatar,
                    amount: found.amount,
                    reason: found.reason,
                    // Giữ nguyên quy tắc bỏ tick NV đã nghỉ việc như lúc khởi tạo,
                    // nếu không nạp lại mẫu cũ sẽ tick lại đúng người vừa bị bỏ
                    isSelected: !emp.resignationDate
                };
            } else {
                return {
                    userId: emp.id,
                    name: emp.name,
                    avatar: emp.avatar,
                    amount: 0,
                    reason: '',
                    isSelected: false
                };
            }
        });

        setSelectedEmployees(newSelection);
        setEditingBatchFrom(batchId);
        setIdsToDeleteOnSave(items.map(i => i.id));
        setMode('NEW'); // Switch to input view
    };

    const handleDeleteBatch = async (items: BonusFine[]) => {
        if (confirm(`Bạn có chắc chắn muốn xóa lô ${items.length} mục này?`)) {
            const ids = items.map(i => i.id);
            await onDeleteBatch(ids);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in text-gray-800">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">

                {/* Header */}
                <div className={`p-4 flex justify-between items-center text-white shadow-md transition-colors ${mode === 'HISTORY' ? 'bg-indigo-600' : (type === 'BONUS' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-red-500 to-rose-600')}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full bg-white/20`}>
                            {mode === 'HISTORY' ? <History size={24} /> : <Users size={24} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{mode === 'HISTORY' ? 'Lịch Sử Nhập Liệu' : (editingBatchFrom ? 'Chỉnh Sửa Hàng Loạt' : `Nhập ${type === 'BONUS' ? 'Thưởng' : 'Phạt'} Hàng Loạt`)}</h2>
                            <p className="text-white/80 text-sm">{mode === 'HISTORY' ? 'Các lô dữ liệu đã nhập trong tháng' : 'Áp dụng nhanh cho nhiều nhân viên'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Mode Switcher */}
                        <div className="bg-black/20 p-1 rounded-lg flex text-xs font-bold mr-4">
                            <button
                                onClick={() => setMode('NEW')}
                                className={`px-3 py-1.5 rounded-md transition ${mode === 'NEW' ? 'bg-white text-gray-800 shadow-sm' : 'text-white/60 hover:text-white'}`}
                            >Nhập Liệu</button>
                            <button
                                onClick={() => setMode('HISTORY')}
                                className={`px-3 py-1.5 rounded-md transition ${mode === 'HISTORY' ? 'bg-white text-gray-800 shadow-sm' : 'text-white/60 hover:text-white'}`}
                            >Lịch Sử</button>
                        </div>

                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                {mode === 'NEW' ? (
                    <>
                        {/* Controls */}
                        <div className="p-5 bg-gray-50 border-b border-gray-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">

                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Loại</label>
                                <div className="flex bg-white rounded-lg p-1 border shadow-sm">
                                    <button
                                        onClick={() => setType('BONUS')}
                                        className={`flex-1 py-1.5 text-sm font-bold rounded-md transition ${type === 'BONUS' ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >Thưởng</button>
                                    <button
                                        onClick={() => setType('PENALTY')}
                                        className={`flex-1 py-1.5 text-sm font-bold rounded-md transition ${type === 'PENALTY' ? 'bg-red-100 text-red-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >Phạt</button>
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày áp dụng</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-gray-400"
                                />
                            </div>

                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Lý do chung</label>
                                <input
                                    type="text"
                                    placeholder="Vd: Thưởng Tết..."
                                    value={globalReason}
                                    onChange={(e) => setGlobalReason(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>

                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số tiền chung (VNĐ)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={globalAmount || ''}
                                        onChange={(e) => setGlobalAmount(Number(e.target.value))}
                                        className="w-full pl-8 p-2 border border-gray-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="0"
                                    />
                                    <DollarSign size={14} className="absolute left-2.5 top-3 text-gray-400" />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <button
                                    onClick={handleApplyAll}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow transition flex items-center justify-center gap-2"
                                >
                                    <Wand2 size={16} /> Áp dụng
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-100 sticky top-0 z-10 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="p-3 rounded-tl-lg">Nhân viên</th>
                                        <th className="p-3 text-right">Số tiền</th>
                                        <th className="p-3">Lý do cụ thể</th>
                                        <th className="p-3 text-center rounded-tr-lg w-16">Chọn</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {selectedEmployees.map((item) => (
                                        <tr key={item.userId} className={`group transition-colors ${item.isSelected ? 'bg-white hover:bg-blue-50/50' : 'bg-gray-50 opacity-60'}`}>
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden border border-gray-300 shrink-0">
                                                        <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-gray-800 text-sm">{item.name}</div>
                                                        {/* Late Warning Badge */}
                                                        {lateWarnings && type === 'BONUS' && lateWarnings[item.userId] && (
                                                            <div className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md w-fit ${lateWarnings[item.userId].level >= 6
                                                                ? 'bg-red-100 text-red-600'
                                                                : 'bg-amber-100 text-amber-600'
                                                                }`}>
                                                                <AlertTriangle size={10} />
                                                                {lateWarnings[item.userId].level >= 6 ? '6 tháng trễ liên tiếp!' : '3 tháng trễ liên tiếp!'}
                                                            </div>
                                                        )}
                                                        {(() => {
                                                            const emp = employees.find(e => e.id === item.userId);
                                                            return emp?.resignationDate ? (
                                                                <div className="text-[10px] font-bold mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md w-fit bg-gray-200 text-gray-600">
                                                                    Nghỉ việc {format(new Date(emp.resignationDate), 'dd/MM/yy')}
                                                                </div>
                                                            ) : null;
                                                        })()}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right">
                                                <input
                                                    disabled={!item.isSelected}
                                                    type="number"
                                                    value={item.amount || ''}
                                                    onChange={(e) => handleChangeRow(item.userId, 'amount', Number(e.target.value))}
                                                    className="w-32 p-1.5 text-right border border-gray-300 rounded text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
                                                    placeholder="0"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    disabled={!item.isSelected}
                                                    type="text"
                                                    value={item.reason}
                                                    onChange={(e) => handleChangeRow(item.userId, 'reason', e.target.value)}
                                                    className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
                                                    placeholder={globalReason || "..."}
                                                />
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleToggleSelect(item.userId)}
                                                    className={`p-1.5 rounded-full transition ${item.isSelected ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`}
                                                >
                                                    {item.isSelected ? <CheckCircle size={18} /> : <X size={18} />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                            <div>
                                <span className="text-gray-500 text-sm font-medium">Tổng cộng ({selectedEmployees.filter(e => e.isSelected && e.amount > 0).length} người):</span>
                                <div className={`text-2xl font-black ${type === 'BONUS' ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedEmployees.reduce((sum, item) => sum + (item.isSelected ? (item.amount || 0) : 0), 0))}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-xl shadow-sm transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    onClick={handleSave}
                                    className={`px-8 py-2.5 text-white font-bold rounded-xl shadow-lg transition active:scale-95 flex items-center gap-2 ${type === 'BONUS' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                                >
                                    {editingBatchFrom ? <RotateCcw size={18} /> : <Users size={18} />}
                                    {editingBatchFrom ? 'Cập nhật thay đổi' : 'Lưu Danh Sách'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    // HISTORY MODE
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                        {historyGroups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                <History size={48} className="mb-4 opacity-30" />
                                <p>Chưa có lịch sử nhập liệu nào trong tháng này.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {historyGroups.map(group => (
                                    <div key={group.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group relative">
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm font-bold ${group.type === 'BONUS' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                                    {group.type === 'BONUS' ? 'T' : 'P'}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-800 text-lg">{group.reason || '(Không có lý do)'} <span className="text-gray-400 font-normal text-sm ml-2">#{group.id.slice(-6)}</span></h3>
                                                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                                        <span className="flex items-center gap-1"><Calendar size={14} /> {format(new Date(group.date), 'dd/MM/yyyy')}</span>
                                                        <span className="flex items-center gap-1"><Users size={14} /> {group.count} nhân viên</span>
                                                        <span className="flex items-center gap-1 text-gray-400 text-xs">Tạo: {format(group.timestamp, 'HH:mm dd/MM')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-xl font-black ${group.type === 'BONUS' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {new Intl.NumberFormat('vi-VN').format(group.totalAmount)} đ
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleDeleteBatch(group.items)}
                                                className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 transition"
                                            >
                                                <Trash2 size={14} /> Xóa lô
                                            </button>
                                            <button
                                                onClick={() => handleEditBatch(group.id, group.items)}
                                                className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1 transition"
                                            >
                                                <Edit2 size={14} /> Chỉnh sửa
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
