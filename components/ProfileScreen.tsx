import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Camera, Send, Pencil, Info, AlertOctagon, AlertTriangle, Clock, ChevronRight,
  Mail, Phone, Calendar, Briefcase, IdCard, Wallet, XCircle, User, History
} from 'lucide-react';
import { differenceInMonths, format } from 'date-fns';
import { ProfileChangeRequest, ProfileChangeSet, UserProfile } from '../types';
import {
  buildProfileChanges, describeProfileChanges, validateProfileRequest, warnPhonePrefix,
  affectsBirthdayBonus, findPendingProfileRequest, changedFields, AVATAR_PENDING_PLACEHOLDER,
  PROFILE_DEFAULT_REASON
} from '../utils/profileChange';
import { compressAvatar, validateImageFile } from '../utils/imageResize';
import { uploadPendingAvatar } from '../utils/avatarStorage';
import { parseVNDate, formatVNDate } from '../utils/dateInput';
import { getRequestStatusClass, getRequestStatusText } from '../utils/leaveTypes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Hồ sơ ĐẦY ĐỦ của chính mình (currentUser) */
  user: UserProfile;
  /** Đơn PROFILE của chính mình */
  requests: ProfileChangeRequest[];
  remainingLeave: number;
  /** Trả true nếu đã gửi thành công (để thoát chế độ sửa) */
  onSubmit: (changes: ProfileChangeSet, reason: string) => Promise<boolean>;
  onCancelPending: (id: string) => Promise<void>;
  onGoToSalary: () => void;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
/** "1,2,3,4,5,6" → "T2–T7"; "1,3,5" → "T2, T4, T6" */
const workDaysLabel = (workDays?: string): string => {
  const nums = (workDays || '1,2,3,4,5,6').split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= 7);
  if (nums.length === 0) return '—';
  const labels = nums.map(n => (n === 7 ? 'CN' : WEEKDAY_SHORT[n]));
  const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return consecutive && nums.length > 2 ? `${labels[0]}–${labels[labels.length - 1]}` : labels.join(', ');
};

const seniorityLabel = (contractDate?: string | null): string => {
  if (!contractDate) return '';
  const start = new Date(String(contractDate).length === 10 ? `${contractDate}T00:00:00` : contractDate);
  if (isNaN(start.getTime())) return '';
  const months = Math.max(0, differenceInMonths(new Date(), start));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return 'mới vào';
  return [y > 0 ? `${y} năm` : '', m > 0 ? `${m} tháng` : ''].filter(Boolean).join(' ');
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '🟢 Đang hoạt động',
  PENDING: '🟠 Chờ duyệt tài khoản',
  LOCKED: '🔴 Đã khoá'
};

export const ProfileScreen: React.FC<Props> = ({
  isOpen, onClose, user, requests, remainingLeave, onSubmit, onCancelPending, onGoToSalary
}) => {
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'HISTORY'>('PROFILE');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [dobText, setDobText] = useState('');
  const [dobIso, setDobIso] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dobPickerRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName(user.name || '');
    const iso = user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '';
    setDobIso(iso);
    setDobText(formatVNDate(iso));
    setPhone(user.phone || '');
    setReason('');
    setAvatarBlob(null);
    setAvatarPreview(prev => { if (prev) URL.revokeObjectURL(prev); return ''; });
  };

  // Mở lại thì về tab Hồ sơ, thoát chế độ sửa, nạp lại giá trị hiện tại
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('PROFILE');
    setEditing(false);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user.id, user.name, user.dateOfBirth, user.phone, user.avatar]);

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  const pending = useMemo(() => findPendingProfileRequest(user.id, requests), [user.id, requests]);
  const history = useMemo(
    () => [...requests].sort((a, b) => (b.createdAt?.getTime() ?? b.date.getTime()) - (a.createdAt?.getTime() ?? a.date.getTime())),
    [requests]
  );

  // Diff sống trong lúc gõ. Ảnh mới chưa tải lên nên dùng URL giả để validate.
  const liveChanges = useMemo(() => buildProfileChanges(user, {
    name, dateOfBirth: dobIso, phone,
    avatar: avatarBlob ? AVATAR_PENDING_PLACEHOLDER : (user.avatar || '')
  }), [user, name, dobIso, phone, avatarBlob]);

  const error = editing
    ? validateProfileRequest({
      userId: user.id, changes: liveChanges, today: todayStr(),
      contractDate: user.contractDate, existingRequests: requests
    })
    : null;
  const phoneWarn = liveChanges.phone?.new ? warnPhonePrefix(liveChanges.phone.new) : null;
  const diffLines = describeProfileChanges(liveChanges);

  if (!isOpen) return null;

  const handleDobText = (text: string) => {
    setDobText(text);
    const iso = parseVNDate(text);
    if (iso) setDobIso(iso);
    else if (!text.trim()) setDobIso('');
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const err = validateImageFile(f);
    if (err) { alert(err); return; }
    try {
      const blob = await compressAvatar(f);
      setAvatarBlob(blob);
      setAvatarPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      if (!editing) setEditing(true);
    } catch (err: any) {
      alert(err?.message || 'Không xử lý được ảnh.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error) { alert(error); return; }
    setSubmitting(true);
    try {
      let changes = liveChanges;
      if (avatarBlob) {
        // Chỉ tải lên lúc gửi: bấm huỷ trước đó thì không để lại file mồ côi
        const up = await uploadPendingAvatar(user.id, avatarBlob);
        changes = { ...liveChanges, avatar: { old: user.avatar || null, new: up.url, newPath: up.path } };
      }
      const ok = await onSubmit(changes, reason);
      if (ok) {
        setEditing(false);
        setAvatarBlob(null);
        setAvatarPreview(prev => { if (prev) URL.revokeObjectURL(prev); return ''; });
        setReason('');
      }
    } catch (err: any) {
      alert(err?.message || 'Không gửi được đề nghị.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    resetForm();
  };

  const shownAvatar = avatarPreview || user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'NV')}&background=random`;
  const canEdit = !pending && user.status !== 'LOCKED';

  const ReadRow = ({ icon: Icon, label, value, hint }: { icon: any; label: string; value?: string | null; hint?: string }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <Icon size={16} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">{label}</div>
        <div className="text-sm text-gray-800 font-medium break-words">{value || <span className="text-gray-400 italic">Chưa có</span>}</div>
        {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col h-[92vh] sm:h-[88vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2">
            <User size={20} />
            <h2 className="font-bold text-lg">Thông tin cá nhân</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          {([['PROFILE', 'Hồ sơ'], ['HISTORY', `Lịch sử đề nghị (${history.length})`]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === id ? 'border-brand-500 text-brand-600 bg-brand-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 scrollbar-hide">
          {activeTab === 'PROFILE' ? (
            <form onSubmit={handleSubmit} className="p-5 space-y-5">

              {/* Ảnh + tên */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <img src={shownAvatar} alt={user.name} className="w-24 h-24 rounded-full object-cover border-4 border-brand-100 shadow bg-gray-100" />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-md hover:bg-brand-700 active:scale-95 transition border-2 border-white"
                      title="Đổi ảnh đại diện"
                    >
                      <Camera size={16} />
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePickFile} />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-gray-900 truncate">{user.name}</div>
                  <div className="text-sm text-gray-500 truncate">{user.role}{user.employeeCode ? ` · ${user.employeeCode}` : ''}</div>
                  {avatarBlob && <div className="text-[11px] text-brand-600 font-semibold mt-1">Ảnh mới, sẽ áp dụng sau khi Admin duyệt</div>}
                </div>
              </div>

              {/* Đơn đang chờ */}
              {pending && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-orange-700 font-bold text-sm">
                    <Clock size={15} /> Đang chờ Admin duyệt
                    <span className="text-[11px] font-normal text-orange-500 ml-auto">
                      gửi {pending.createdAt ? format(pending.createdAt, 'dd/MM HH:mm') : format(pending.date, 'dd/MM')}
                    </span>
                  </div>
                  <ul className="text-xs text-orange-900 space-y-0.5 pl-1">
                    {describeProfileChanges(pending.changes).map(l => <li key={l}>• {l}</li>)}
                  </ul>
                  {pending.changes.avatar?.new && (
                    <div className="flex items-center gap-2 text-[11px] text-orange-800">
                      <img src={pending.changes.avatar.old || ''} className="w-8 h-8 rounded-full object-cover bg-white border" alt="" />
                      <ChevronRight size={12} />
                      <img src={pending.changes.avatar.new} className="w-8 h-8 rounded-full object-cover bg-white border" alt="" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onCancelPending(pending.id)}
                    className="text-xs font-bold text-red-600 bg-white border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 active:scale-95 transition flex items-center gap-1"
                  >
                    <XCircle size={13} /> Huỷ đề nghị
                  </button>
                </div>
              )}

              {/* Có thể đề nghị sửa */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Có thể đề nghị sửa</span>
                  {!editing ? (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setEditing(true)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition ${canEdit ? 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                      title={pending ? 'Đang có đơn chờ duyệt' : undefined}
                    >
                      <Pencil size={13} /> Đề nghị sửa
                    </button>
                  ) : (
                    <button type="button" onClick={handleCancelEdit} className="text-xs font-bold text-gray-500 hover:text-gray-800 px-2 py-1">
                      Huỷ
                    </button>
                  )}
                </div>

                <div className="px-4">
                  {!editing ? (
                    <>
                      <ReadRow icon={User} label="Họ tên" value={user.name} />
                      <ReadRow icon={Calendar} label="Ngày sinh" value={formatVNDate(user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '')} />
                      <ReadRow icon={Phone} label="Số điện thoại" value={user.phone} />
                    </>
                  ) : (
                    <div className="py-3 space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Họ tên</label>
                        <input
                          type="text" value={name} onChange={e => setName(e.target.value)}
                          className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Ngày sinh</label>
                        <div className="relative">
                          <input
                            type="text" value={dobText} onChange={e => handleDobText(e.target.value)} placeholder="dd/mm/yyyy"
                            className="w-full px-3 py-2 pr-10 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                          />
                          <button type="button" onClick={() => dobPickerRef.current?.showPicker()} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600">
                            <Calendar size={16} />
                          </button>
                          <input
                            ref={dobPickerRef} type="date" className="absolute opacity-0 w-0 h-0 bottom-0 left-0 -z-10"
                            onChange={e => { if (e.target.value) { setDobIso(e.target.value); setDobText(formatVNDate(e.target.value)); } }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Số điện thoại</label>
                        <input
                          type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912345678"
                          className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Ghi chú cho Admin <span className="text-gray-400 font-normal">(không bắt buộc)</span></label>
                        <input
                          type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ví dụ: Đổi tên theo CCCD mới"
                          className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        />
                      </div>

                      {diffLines.length > 0 && (
                        <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-xs text-brand-900 space-y-1">
                          <div className="font-bold">Sẽ đề nghị đổi:</div>
                          {diffLines.map(l => <div key={l}>• {l}</div>)}
                          {affectsBirthdayBonus(liveChanges) && (
                            <div className="flex items-start gap-1 text-amber-800 pt-1">
                              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                              <span>Đổi ngày sinh sẽ làm thay đổi thưởng sinh nhật của các tháng chưa chốt lương.</span>
                            </div>
                          )}
                          {phoneWarn && (
                            <div className="flex items-start gap-1 text-amber-800 pt-1">
                              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                              <span>{phoneWarn}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                          <AlertOctagon size={15} className="text-red-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-red-800 leading-relaxed">{error}</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={!!error || submitting}
                        className={`w-full py-3 rounded-xl font-bold shadow flex items-center justify-center gap-2 transition-all ${error || submitting
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                          : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95'}`}
                      >
                        <Send size={16} />
                        {submitting ? 'Đang gửi…' : error ? '🚫 Chưa hợp lệ' : 'Gửi đề nghị'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 flex items-start gap-1">
                  <Info size={12} className="shrink-0 mt-0.5" />
                  <span>Bốn mục trên cần Admin duyệt mới có hiệu lực. Ảnh mới cũng chỉ hiện sau khi duyệt.</span>
                </div>
              </div>

              {/* Công ty quản lý */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                  Công ty quản lý (chỉ xem)
                </div>
                <div className="px-4">
                  <ReadRow icon={IdCard} label="Mã nhân viên" value={user.employeeCode} />
                  <ReadRow icon={Mail} label="Email đăng nhập" value={user.email} />
                  <ReadRow icon={Briefcase} label="Chức vụ" value={user.role} />
                  <ReadRow icon={Briefcase} label="Loại hợp đồng" value={user.contractType} />
                  <ReadRow
                    icon={Calendar} label="Ngày vào làm"
                    value={formatVNDate(user.contractDate ? String(user.contractDate).slice(0, 10) : '')}
                    hint={seniorityLabel(user.contractDate) ? `Thâm niên ${seniorityLabel(user.contractDate)}` : undefined}
                  />
                  <ReadRow icon={Calendar} label="Ngày ký HĐ chính thức" value={formatVNDate(user.officialContractDate ? String(user.officialContractDate).slice(0, 10) : '')} />
                  <ReadRow icon={Clock} label="Ngày làm việc" value={workDaysLabel(user.workDays)} />
                  <ReadRow icon={User} label="Trạng thái" value={STATUS_LABEL[user.status || 'ACTIVE'] || user.status} />
                </div>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
                  Sai thông tin? Liên hệ Admin để sửa.
                </div>
              </div>

              {/* Phép + link lương */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="text-[11px] text-emerald-700 font-semibold uppercase">Phép năm còn lại</div>
                  <div className={`text-2xl font-bold ${remainingLeave < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{remainingLeave} <span className="text-xs font-normal">ngày</span></div>
                </div>
                <button
                  type="button"
                  onClick={onGoToSalary}
                  className="rounded-xl border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 active:scale-95 transition flex flex-col justify-between"
                >
                  <div className="text-[11px] text-gray-500 font-semibold uppercase flex items-center gap-1"><Wallet size={12} /> Bảng lương</div>
                  <div className="text-sm font-bold text-brand-600 flex items-center gap-1">Xem tháng này <ChevronRight size={14} /></div>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-5 space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <History size={40} className="mx-auto mb-2 opacity-50" />
                  <p>Chưa có đề nghị sửa thông tin nào.</p>
                </div>
              ) : history.map(req => (
                <div key={req.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-xs text-gray-500">
                      Gửi {req.createdAt ? format(req.createdAt, 'dd/MM/yyyy HH:mm') : format(req.date, 'dd/MM/yyyy')}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${getRequestStatusClass(req.status)}`}>
                      {getRequestStatusText(req.status)}
                    </span>
                  </div>
                  <ul className="text-sm text-gray-800 space-y-0.5">
                    {changedFields(req.changes).length === 0
                      ? <li className="text-gray-400 italic">(không có nội dung)</li>
                      : describeProfileChanges(req.changes).map(l => <li key={l}>• {l}</li>)}
                  </ul>
                  {req.reason && req.reason !== PROFILE_DEFAULT_REASON && (
                    <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg italic">"{req.reason}"</div>
                  )}
                  {req.status === 'REJECTED' && req.rejectionReason && (
                    <div className="text-[11px] text-red-500 italic">Lý do từ chối: "{req.rejectionReason}"</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
