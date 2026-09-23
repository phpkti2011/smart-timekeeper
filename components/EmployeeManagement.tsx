import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserProfile, UserRole, UserStatus, LeaveRequest, Holiday, SwapRequest } from '../types';
import { Users, Search, Plus, Edit2, Trash2, X, Calendar, Eye, DollarSign, CheckCircle2, Lock, Undo, UserMinus, Camera } from 'lucide-react';
import { accruesAnnualLeave, getAccruedLeaveThisYear, getPaidLeaveUsedThisYear, getRemainingLeave } from '../utils/leaveTypes';
import { differenceInYears, format } from 'date-fns';
import { parseVNDate, formatVNDate } from '../utils/dateInput';
import { AdminLeaveManagement } from './AdminLeaveManagement';
import { isWorkingEmployee } from '../utils/employeeFilters';
import { makeRestDayPredicate } from '../utils/restDay';
import { validatePhone, normalizePhone } from '../utils/profileChange';
import { compressAvatar, validateImageFile } from '../utils/imageResize';
import { uploadFinalAvatar } from '../utils/avatarStorage';

interface Props {
  employees: UserProfile[];
  onAdd: (emp: UserProfile) => void;
  onEdit: (emp: UserProfile) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onView: (emp: UserProfile) => void;
  onQuickBonus: () => void;
  leaveRequests: LeaveRequest[];
  swapRequests?: SwapRequest[];
  holidays?: Holiday[];
}

const ROLES: UserRole[] = [
  'Admin',
  'Nhân Viên Kinh Doanh',
  'Nhân Viên Sản Xuất',
  'Nhân Viên Bình File',
  'Nhân Viên Thiết Kế',
  'Nhân Viên Kế Toán',
  'Nhân Viên Marketing',
  'Quản Lý Sản Xuất'
];

export const EmployeeManagement: React.FC<Props> = ({ employees, onAdd, onEdit, onDelete, onRestore, onPermanentDelete, onView, onQuickBonus, leaveRequests, swapRequests = [], holidays = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'LOCKED' | 'RESIGNED'>('ACTIVE');
  const [showLeaveMgmt, setShowLeaveMgmt] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: '',
    id: '',
    role: 'Nhân Viên Sản Xuất',
    avatar: '',
    email: '',
    phone: '',
    password: '',
    baseSalary: 0,
    allowance: 0,
    workDays: '1,2,3,4,5,6',
    contractType: 'Hợp đồng chính thức',
    contractDate: '',
    officialContractDate: null,
    insuranceSalary: 0,
    usedLeaveLegacy: 0,
    status: 'ACTIVE',
    dateOfBirth: ''
  });

  // Ảnh đại diện — Admin đổi được cho nhân viên, ghi thẳng không qua đơn
  const avatarFileRef = React.useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Date Input Refs
  const dobInputRef = React.useRef<HTMLInputElement>(null);
  const contractInputRef = React.useRef<HTMLInputElement>(null);
  const officialInputRef = React.useRef<HTMLInputElement>(null);
  const resignInputRef = React.useRef<HTMLInputElement>(null);

  // Local Text State for Dates
  const [dobText, setDobText] = useState('');
  const [contractText, setContractText] = useState('');
  const [officialText, setOfficialText] = useState('');
  const [resignText, setResignText] = useState('');

  // Sync Text on FormData Change — dùng chung helper với bảng nhập liệu hàng loạt
  React.useEffect(() => {
    setDobText(formatVNDate(formData.dateOfBirth));
    setContractText(formatVNDate(formData.contractDate));
    setOfficialText(formatVNDate(formData.officialContractDate));
    setResignText(formatVNDate(formData.resignationDate));
  }, [formData.dateOfBirth, formData.contractDate, formData.officialContractDate, formData.resignationDate]);

  type DateField = 'dateOfBirth' | 'contractDate' | 'officialContractDate' | 'resignationDate';
  const handleDateTextChange = (text: string, field: DateField, setText: (s: string) => void) => {
    setText(text);
    const iso = parseVNDate(text);
    if (iso) setFormData(prev => ({ ...prev, [field]: iso }));
    else if (!text.trim()) setFormData(prev => ({ ...prev, [field]: null }));
  };

  // Handle direct update from Leave Management
  const handleUpdateFromLeaveMgmt = (updatedEmp: UserProfile) => {
    onEdit(updatedEmp);
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingEmployees = filteredEmployees.filter(e => e.status === 'PENDING');
  const activeEmployees = filteredEmployees.filter(isWorkingEmployee);
  const lockedEmployees = filteredEmployees.filter(e => e.status === 'LOCKED');
  const resignedEmployees = filteredEmployees.filter(e => !!e.resignationDate && e.status !== 'LOCKED');

  if (showLeaveMgmt) {
    return (
      <AdminLeaveManagement
        employees={employees} // Show all
        onBack={() => setShowLeaveMgmt(false)}
        onUpdateEmployee={handleUpdateFromLeaveMgmt}
        leaveRequests={leaveRequests}
        swapRequests={swapRequests}
        holidays={holidays}
      />
    );
  }

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      name: '',
      id: crypto.randomUUID(),
      employeeCode: '',
      role: 'Nhân Viên Sản Xuất',
      avatar: '', // để trống → lúc lưu tự sinh ảnh chữ cái theo tên (trước đây là ảnh phong cảnh ngẫu nhiên từ picsum)
      email: '',
      phone: '',
      password: '',
      baseSalary: 0,
      allowance: 0,
      workDays: '1,2,3,4,5,6',
      contractType: 'Hợp đồng chính thức',
      contractDate: '',
      officialContractDate: null,
      insuranceSalary: 0,
      usedLeaveLegacy: 0,
      status: 'ACTIVE',
      dateOfBirth: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: UserProfile) => {
    setEditingId(emp.id);
    setFormData({
      ...emp,
      password: emp.password || '',
      baseSalary: emp.baseSalary || 0,
      allowance: emp.allowance || 0,
      workDays: emp.workDays || '1,2,3,4,5,6',
      insuranceSalary: emp.insuranceSalary || 0,
      usedLeaveLegacy: emp.usedLeaveLegacy || 0,
      status: emp.status || 'ACTIVE',
      dateOfBirth: emp.dateOfBirth || '',
      phone: emp.phone || ''
    });
    setIsModalOpen(true);
  };

  const handleApproveUser = (emp: UserProfile) => {
    onEdit({ ...emp, status: 'ACTIVE' });
  };

  const handleAdminPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !formData.id) return;
    const err = validateImageFile(f);
    if (err) { alert(err); return; }
    setAvatarBusy(true);
    try {
      const blob = await compressAvatar(f);
      const up = await uploadFinalAvatar(formData.id, blob);
      setFormData(prev => ({ ...prev, avatar: up.url }));
    } catch (err: any) {
      alert(err?.message || 'Không tải được ảnh.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const letterAvatar = (name?: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'NV')}&background=random`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      alert("Vui lòng nhập tên nhân viên");
      return;
    }

    const phoneError = validatePhone(formData.phone || '');
    if (phoneError) {
      alert(phoneError);
      return;
    }

    const processedData: UserProfile = {
      ...(formData as UserProfile),
      // Luôn ghi dạng chuẩn hoá (0912345678) để unique index ở DB có nghĩa
      phone: normalizePhone(formData.phone || '') || null,
      avatar: formData.avatar || letterAvatar(formData.name),
      baseSalary: Number(formData.baseSalary),
      allowance: Number(formData.allowance),
      insuranceSalary: Number(formData.insuranceSalary),
      usedLeaveLegacy: Number(formData.usedLeaveLegacy),
      dateOfBirth: formData.dateOfBirth || null,
      officialContractDate: formData.officialContractDate || null,
      resignationDate: formData.resignationDate || null
    };

    if (editingId) {
      onEdit(processedData);
    } else {
      if (formData.employeeCode && employees.some(e => e.employeeCode === formData.employeeCode)) {
        alert("Mã nhân viên (Code) đã tồn tại!");
        return;
      }
      onAdd(processedData);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa (khóa) nhân viên này?")) {
      onDelete(id);
    }
  };

  const getSeniorityText = () => {
    if (!formData.contractDate) return '';
    const years = differenceInYears(new Date(), new Date(formData.contractDate));
    return `${years} năm`;
  };

  const renderEmployeeRow = (emp: UserProfile) => (
    <div key={emp.id} className={`bg-white p-4 rounded-2xl border ${emp.status === 'PENDING' ? 'border-orange-200 bg-orange-50/50' : emp.status === 'LOCKED' ? 'border-red-100 bg-red-50/30' : 'border-gray-100'} shadow-sm flex items-center gap-4 animate-fade-in group relative overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${emp.role === 'Admin' ? 'bg-blue-500' :
        emp.status === 'PENDING' ? 'bg-orange-500' :
          emp.status === 'LOCKED' ? 'bg-red-500' :
            emp.role === 'Nhân Viên Sản Xuất' ? 'bg-green-500' : 'bg-purple-500'
        }`}></div>

      <img
        src={emp.avatar}
        alt={emp.name}
        className={`w-12 h-12 rounded-full object-cover border border-gray-100 bg-gray-200 ${emp.status === 'LOCKED' ? 'grayscale opacity-70' : ''}`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-bold truncate ${emp.status === 'LOCKED' ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{emp.name}</h3>
          {emp.status === 'PENDING' && (
            <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">Chờ duyệt</span>
          )}
          {emp.status === 'LOCKED' && (
            <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">Đã khóa</span>
          )}
          {emp.resignationDate && emp.status !== 'LOCKED' && (
            <span className="text-[10px] bg-gray-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">Nghỉ việc {format(new Date(emp.resignationDate), 'dd/MM/yy')}</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 mt-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 truncate">
            {emp.role}
          </span>
          {emp.employeeCode && (
            <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit mt-0.5">
              {emp.employeeCode}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {emp.status === 'LOCKED' ? (
          <>
            <button
              onClick={() => onRestore(emp.id)}
              className="p-2 text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors shadow-sm flex items-center gap-1 text-xs font-bold px-3"
              title="Khôi phục tài khoản"
            >
              <Undo size={16} /> Hoàn duyệt
            </button>
            <button
              onClick={() => onPermanentDelete(emp.id)}
              className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm flex items-center gap-1 text-xs font-bold px-3"
              title="Xóa vĩnh viễn"
            >
              <Trash2 size={16} /> Xóa VV
            </button>
          </>
        ) : emp.status === 'PENDING' ? (
          <button
            onClick={() => handleApproveUser(emp)}
            className="p-2 text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors shadow-sm flex items-center gap-1 text-xs font-bold px-3"
            title="Duyệt tài khoản"
          >
            <CheckCircle2 size={16} /> Duyệt
          </button>
        ) : (
          <>
            <button
              onClick={() => onView(emp)}
              className="p-2 text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors shadow-sm"
              title="Xem bảng công/lương"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => handleOpenEdit(emp)}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => handleDelete(emp.id)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Khóa tài khoản"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[60vh] relative z-10 pb-20 flex flex-col h-full">
      {/* Header */}
      <div className="bg-white p-5 border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-50 rounded-xl text-orange-600 shadow-sm border border-orange-100">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 leading-none">Nhân sự</h2>
              <span className="text-sm text-gray-500">{employees.filter(isWorkingEmployee).length} nhân viên đang làm</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLeaveMgmt(true)}
              className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center gap-2"
              title="Quản lý phép năm"
            >
              <Calendar size={20} />
              <span className="text-xs font-bold hidden sm:inline">Phép Năm</span>
            </button>
            <button
              onClick={onQuickBonus}
              className="bg-green-600 text-white p-2.5 rounded-xl shadow-lg shadow-green-200 active:scale-95 transition-all"
              title="Thưởng/Phạt nhanh"
            >
              <DollarSign size={20} />
            </button>
            <button
              onClick={handleOpenAdd}
              className="bg-gray-900 text-white p-2.5 rounded-xl shadow-lg shadow-gray-200 active:scale-95 transition-all"
              title="Thêm nhân viên"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Tìm theo tên, mã NV, chức vụ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* TABS */}
        <div className="flex items-center gap-6 mt-4 border-b border-gray-100 px-1">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`pb-2 text-sm font-bold transition-colors relative ${activeTab === 'ACTIVE' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Danh sách nhân viên
            {activeTab === 'ACTIVE' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-600 rounded-t-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('LOCKED')}
            className={`pb-2 text-sm font-bold transition-colors relative flex items-center gap-1.5 ${activeTab === 'LOCKED' ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Lock size={14} />
            Đang khóa
            {lockedEmployees.length > 0 && <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full">{lockedEmployees.length}</span>}
            {activeTab === 'LOCKED' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600 rounded-t-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('RESIGNED')}
            className={`pb-2 text-sm font-bold transition-colors relative flex items-center gap-1.5 ${activeTab === 'RESIGNED' ? 'text-gray-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <UserMinus size={14} />
            Nghỉ việc
            {resignedEmployees.length > 0 && <span className="bg-gray-200 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full">{resignedEmployees.length}</span>}
            {activeTab === 'RESIGNED' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-600 rounded-t-full"></div>}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-3 overflow-y-auto flex-1 bg-gray-50/50 no-scrollbar">

        {activeTab === 'ACTIVE' ? (
          <>
            {pendingEmployees.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold text-orange-600 uppercase mb-2 px-1 flex items-center gap-1">
                  <Lock size={12} /> Tài khoản chờ duyệt ({pendingEmployees.length})
                </div>
                <div className="space-y-3">
                  {pendingEmployees.map(renderEmployeeRow)}
                </div>
                <div className="border-b border-gray-200 my-4"></div>
              </div>
            )}
            {activeEmployees.map(renderEmployeeRow)}
            {filteredEmployees.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <p>Không tìm thấy nhân viên nào.</p>
              </div>
            )}
          </>
        ) : activeTab === 'RESIGNED' ? (
          <>
            {resignedEmployees.length > 0 ? (
              resignedEmployees.map(renderEmployeeRow)
            ) : (
              <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                <div className="p-3 bg-gray-100 rounded-full mb-2">
                  <UserMinus size={24} className="text-gray-300" />
                </div>
                <p>Không có nhân viên đã nghỉ việc.</p>
              </div>
            )}
          </>
        ) : (
          <>
            {lockedEmployees.length > 0 ? (
              lockedEmployees.map(renderEmployeeRow)
            ) : (
              <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                <div className="p-3 bg-gray-100 rounded-full mb-2">
                  <Lock size={24} className="text-gray-300" />
                </div>
                <p>Không có tài khoản bị khóa.</p>
              </div>
            )}
          </>
        )}

      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 pb-2 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-xl text-gray-900">{editingId ? 'Chỉnh sửa Nhân viên' : 'Thêm Nhân Viên'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 cursor-pointer">
                <X size={20} className="text-gray-600" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-5 overflow-y-auto no-scrollbar">
              {/* Ảnh đại diện — trước đây không ai đổi được, NV do Admin tạo nhận ảnh phong cảnh ngẫu nhiên */}
              <div className="flex items-center gap-4">
                <img
                  src={formData.avatar || letterAvatar(formData.name)}
                  alt="avatar"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 bg-gray-100 shrink-0"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => avatarFileRef.current?.click()}
                    className="text-xs font-bold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Camera size={14} /> {avatarBusy ? 'Đang tải…' : 'Đổi ảnh'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, avatar: letterAvatar(prev.name) }))}
                    className="text-xs font-bold px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition"
                  >
                    Dùng ảnh chữ cái
                  </button>
                  <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAdminPickAvatar} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Mã NV</label>
                  <input
                    type="text"
                    value={formData.employeeCode || ''}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="NV001"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Tên Nhân viên</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Tên..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Ngày sinh</label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-10"
                      placeholder="dd/mm/yyyy"
                      value={dobText}
                      onChange={(e) => handleDateTextChange(e.target.value, 'dateOfBirth', setDobText)}
                    />
                    <button
                      type="button"
                      onClick={() => dobInputRef.current?.showPicker()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Calendar size={18} />
                    </button>
                    <input
                      ref={dobInputRef} // Hidden native picker
                      type="date"
                      className="absolute opacity-0 w-0 h-0 bottom-0 left-0 -z-10"
                      onChange={(e) => {
                        if (e.target.value) setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }));
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Email (dùng đăng nhập)</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="nv@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Số điện thoại</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="0912345678"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Mật khẩu đăng nhập</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Nhập mật khẩu..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Chức vụ</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Lương Cơ Bản</label>
                  <input
                    type="number"
                    value={formData.baseSalary}
                    onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Phụ Cấp</label>
                  <input
                    type="number"
                    value={formData.allowance}
                    onChange={(e) => setFormData({ ...formData, allowance: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">Ngày làm việc</label>
                <input
                  type="text"
                  value={formData.workDays}
                  onChange={(e) => setFormData({ ...formData, workDays: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="1,2,3,4,5,6"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Loại Hợp đồng</label>
                  <select
                    value={formData.contractType}
                    onChange={(e) => setFormData({ ...formData, contractType: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  >
                    <option value="Hợp đồng chính thức">Hợp đồng chính thức</option>
                    <option value="Hợp đồng thử việc">Hợp đồng thử việc</option>
                    <option value="Part-time">Part-time</option>
                    <option value="CTV">CTV</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">
                    Ngày vào làm <span className="text-[10px] text-gray-400">(mốc tính công và thâm niên)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-10"
                      placeholder="dd/mm/yyyy"
                      value={contractText}
                      onChange={(e) => handleDateTextChange(e.target.value, 'contractDate', setContractText)}
                    />
                    <button
                      type="button"
                      onClick={() => contractInputRef.current?.showPicker()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Calendar size={18} />
                    </button>
                    <input
                      ref={contractInputRef}
                      type="date"
                      className="absolute opacity-0 w-0 h-0 bottom-0 left-0 -z-10"
                      onChange={(e) => {
                        if (e.target.value) setFormData(prev => ({ ...prev, contractDate: e.target.value }));
                      }}
                    />
                  </div>
                  {formData.contractDate && (
                    <p className="text-[10px] text-blue-600 mt-1">{getSeniorityText()}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">
                    Ngày ký HĐ chính thức <span className="text-[10px] text-gray-400">(mốc tính phép năm)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-10"
                      placeholder="dd/mm/yyyy"
                      value={officialText}
                      onChange={(e) => handleDateTextChange(e.target.value, 'officialContractDate', setOfficialText)}
                    />
                    <button
                      type="button"
                      onClick={() => officialInputRef.current?.showPicker()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Calendar size={18} />
                    </button>
                    <input
                      ref={officialInputRef}
                      type="date"
                      className="absolute opacity-0 w-0 h-0 bottom-0 left-0 -z-10"
                      onChange={(e) => {
                        if (e.target.value) setFormData(prev => ({ ...prev, officialContractDate: e.target.value }));
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {formData.officialContractDate
                      ? 'Đủ tròn 1 tháng kể từ ngày này mới được 1 ngày phép.'
                      : 'Để trống nếu chưa lên chính thức — khi đó tạm tính theo ngày vào làm.'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Phép Năm</label>
                  {(() => {
                    const previewUser = {
                      id: formData.id || 'new-user',
                      contractDate: formData.contractDate,
                      officialContractDate: formData.officialContractDate,
                      contractType: formData.contractType,
                      usedLeaveLegacy: formData.usedLeaveLegacy,
                      resignationDate: formData.resignationDate
                    };
                    const hasLeaveQuota = accruesAnnualLeave(previewUser);
                    const accrued = getAccruedLeaveThisYear(previewUser);
                    const isRestDay = makeRestDayPredicate(swapRequests.filter(s => s.userId === previewUser.id), holidays);
                    const used = getPaidLeaveUsedThisYear(previewUser.id, leaveRequests, { holidays, isRestDay });
                    const remaining = getRemainingLeave(previewUser, leaveRequests, { holidays, isRestDay });
                    return (
                      <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                        {!hasLeaveQuota ? (
                          <span className="text-gray-500 italic">Không áp dụng — chưa ký HĐ chính thức</span>
                        ) : formData.contractDate ? (
                          <>
                            <span className="text-gray-600">Quỹ {accrued} • Đã dùng {used}</span>
                            <span className={`font-bold ml-2 ${remaining < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                              Còn {remaining} ngày
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">Chọn ngày ký HĐ để tính phép</span>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {accruesAnnualLeave(formData)
                      ? 'Tính tự động. Điều chỉnh tại Quản Lý Phép Năm.'
                      : 'Khi lên chính thức, nhớ đổi cả Loại Hợp đồng và Ngày Ký HĐ.'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Lương Đóng BH</label>
                  <input
                    type="number"
                    value={formData.insuranceSalary}
                    onChange={(e) => setFormData({ ...formData, insuranceSalary: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Trạng thái</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
                    className="w-full px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  >
                    <option value="ACTIVE">Hoạt động (Active)</option>
                    <option value="PENDING">Chờ duyệt (Pending)</option>
                    <option value="LOCKED">Đã khóa (Locked)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Ngày nghỉ việc <span className="text-[10px] text-gray-400">(để trống nếu đang làm)</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      className={`w-full px-4 py-2.5 bg-white text-gray-900 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-10 ${formData.resignationDate ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`}
                      placeholder="dd/mm/yyyy"
                      value={resignText}
                      onChange={(e) => handleDateTextChange(e.target.value, 'resignationDate' as any, setResignText)}
                    />
                    <button
                      type="button"
                      onClick={() => resignInputRef.current?.showPicker()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Calendar size={18} />
                    </button>
                    <input
                      ref={resignInputRef}
                      type="date"
                      className="absolute opacity-0 w-0 h-0 bottom-0 left-0 -z-10"
                      onChange={(e) => {
                        if (e.target.value) setFormData(prev => ({ ...prev, resignationDate: e.target.value }));
                      }}
                    />
                  </div>
                  {formData.resignationDate && (
                    <button
                      type="button"
                      onClick={() => { setFormData(prev => ({ ...prev, resignationDate: null })); setResignText(''); }}
                      className="text-[10px] text-red-500 mt-1 hover:underline cursor-pointer"
                    >
                      ✕ Xóa ngày nghỉ việc (khôi phục trạng thái đang làm)
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-bold rounded-lg shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  {editingId ? 'Cập nhật thông tin' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
