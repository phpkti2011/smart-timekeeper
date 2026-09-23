import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Users, Save, Repeat, X, Plus, AlertTriangle } from 'lucide-react';
import { Holiday, SwapRequest, UserProfile, WeekendGroup, WeekendSchedule, SundayAssignment } from '../types';
import {
  WEEKEND_GROUPS, WEEKEND_GROUP_LABEL, SCHEDULE_HORIZON_WEEKS, upcomingSundays, summarizeSunday, autoGroupFor,
  setSundayGroup, startRotation, pinsFrom, membersOf, unassignedWorking, hasSaturdayInWorkDays
} from '../utils/weekendGroups';

// Tab "Nhóm làm CN" trong Cấu hình Admin. Ba khối:
//   1. Thành viên: hai cột A | B, chọn là lưu ngay (onSetGroup).
//   2. Bắt đầu luân phiên: chọn Chủ Nhật mốc + nhóm → sửa bản nháp.
//   3. 12 Chủ Nhật tới: ghim từng tuần, số người chưa có đơn, nút tạo đơn hàng loạt.
// Lịch sửa trên BẢN NHÁP, chỉ ghi khi bấm "Lưu lịch" (một upsert, một đợt push).

interface Props {
  employees: UserProfile[];
  swapRequests: SwapRequest[];
  holidays: Holiday[];
  weekendSchedule: WeekendSchedule;
  /** 'MM-yyyy' các tháng đã chốt lương */
  lockedMonths: string[];
  onSaveSchedule: (next: WeekendSchedule) => Promise<boolean>;
  onSetGroup: (userId: string, group: WeekendGroup | null) => Promise<void>;
  onBulkCreate: (sundayISO: string) => Promise<void>;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const fromIso = (s: string) => new Date(`${s}T00:00:00`);
const isLocked = (d: Date, lockedMonths: string[]) => lockedMonths.includes(format(d, 'MM-yyyy'));

export const WeekendGroupPanel: React.FC<Props> = ({
  employees, swapRequests, holidays, weekendSchedule, lockedMonths, onSaveSchedule, onSetGroup, onBulkCreate
}) => {
  const [draft, setDraft] = useState<WeekendSchedule>(weekendSchedule);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const sundays = useMemo(() => upcomingSundays(today, SCHEDULE_HORIZON_WEEKS), [today]);
  const [anchorPick, setAnchorPick] = useState(iso(sundays[0]));
  const [anchorGroup, setAnchorGroup] = useState<WeekendGroup>('A');

  // Lịch từ server đổi (realtime / vừa lưu) mà chưa sửa dở → đồng bộ bản nháp
  useEffect(() => {
    if (!dirty) setDraft(weekendSchedule);
  }, [weekendSchedule, dirty]);

  const unassigned = unassignedWorking(employees);
  const totalMembers = membersOf('A', employees).length + membersOf('B', employees).length;
  const rows = useMemo(
    () => sundays.map(s => summarizeSunday(s, draft, employees, swapRequests, holidays)),
    [sundays, draft, employees, swapRequests, holidays]
  );

  const pick = async (userId: string, group: WeekendGroup | null) => {
    setBusyId(userId);
    try { await onSetGroup(userId, group); } finally { setBusyId(null); }
  };

  const handleStartRotation = () => {
    const sunday = fromIso(anchorPick);
    const pins = pinsFrom(draft, sunday);
    if (pins.length > 0) {
      const list = pins.map(p => format(fromIso(p), 'dd/MM')).join(', ');
      if (!confirm(`Đặt mốc mới sẽ xoá ${pins.length} ghim từ CN ${format(sunday, 'dd/MM')} trở đi (${list}). Tiếp tục?`)) return;
    }
    setDraft(startRotation(draft, sunday, anchorGroup));
    setDirty(true);
  };

  const handlePin = (sunday: Date, v: SundayAssignment | 'AUTO') => {
    setDraft(setSundayGroup(draft, sunday, v));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await onSaveSchedule(draft);
      if (ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const renderGroupColumn = (group: WeekendGroup) => {
    const members = membersOf(group, employees);
    return (
      <div className="bg-white border border-amber-100 rounded-xl p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-700">{WEEKEND_GROUP_LABEL[group]}</span>
          <span className="text-[10px] text-gray-400">{members.length} người</span>
        </div>
        {members.length === 0 && <p className="text-[11px] text-gray-400 italic">Chưa có ai.</p>}
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1">
            <img src={m.avatar} className="w-6 h-6 rounded-full object-cover bg-gray-200 shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 truncate">{m.name}</div>
              {!hasSaturdayInWorkDays(m.workDays) && (
                <div className="text-[10px] text-red-600 leading-tight">T7 không thuộc lịch làm việc — đơn đổi sẽ bị từ chối</div>
              )}
            </div>
            <button
              onClick={() => pick(m.id, null)}
              disabled={busyId === m.id}
              className="text-gray-300 hover:text-red-500 p-1 disabled:opacity-40"
              title="Bỏ khỏi nhóm"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <select
          value=""
          onChange={e => { if (e.target.value) pick(e.target.value, group); }}
          disabled={unassigned.length === 0 || !!busyId}
          className="w-full px-2 py-1.5 text-xs bg-white text-gray-700 border border-dashed border-amber-300 rounded-lg outline-none disabled:opacity-60"
        >
          <option value="">{unassigned.length === 0 ? 'Không còn ai để thêm' : '+ Thêm nhân viên…'}</option>
          {unassigned.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Thành viên */}
      <div>
        <div className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1 mb-2">
          <Users size={12} /> Thành viên
        </div>
        <div className="grid grid-cols-2 gap-2">
          {renderGroupColumn('A')}
          {renderGroupColumn('B')}
        </div>
        {totalMembers === 0 && (
          <p className="mt-2 text-[11px] text-amber-700 flex items-center gap-1">
            <AlertTriangle size={12} /> Chưa ai được xếp nhóm — lịch bên dưới sẽ không nhắc ai.
          </p>
        )}
        <p className="mt-1 text-[10px] text-gray-400">Chọn là lưu ngay. Người nghỉ việc / bị khoá không tính là thành viên.</p>
      </div>

      {/* 2. Bắt đầu luân phiên */}
      <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 space-y-2">
        <div className="text-xs font-bold text-amber-700 uppercase flex items-center gap-1">
          <Repeat size={12} /> Bắt đầu luân phiên
        </div>
        <p className="text-[11px] text-gray-600">
          {draft.anchorSunday
            ? <>Mốc hiện tại: CN <b>{format(fromIso(draft.anchorSunday), 'dd/MM/yyyy')}</b> — {WEEKEND_GROUP_LABEL[draft.anchorGroup]} làm, các Chủ Nhật sau xen kẽ A/B.</>
            : 'Chưa có mốc — chưa Chủ Nhật nào được xếp.'}
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={anchorPick}
            onChange={e => setAnchorPick(e.target.value)}
            className="flex-1 min-w-[140px] px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300 rounded-lg outline-none"
          >
            {sundays.map(s => <option key={iso(s)} value={iso(s)}>CN {format(s, 'dd/MM/yyyy')}</option>)}
          </select>
          {WEEKEND_GROUPS.map(g => (
            <label key={g} className="flex items-center gap-1 text-xs cursor-pointer text-gray-700">
              <input type="radio" name="weekendAnchorGroup" checked={anchorGroup === g} onChange={() => setAnchorGroup(g)} />
              {g}
            </label>
          ))}
          <button
            onClick={handleStartRotation}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg"
          >
            Đặt mốc
          </button>
        </div>
      </div>

      {/* 3. Các Chủ Nhật tới */}
      <div>
        <div className="text-xs font-bold text-gray-700 uppercase mb-2">{SCHEDULE_HORIZON_WEEKS} Chủ Nhật tới</div>
        <div className="space-y-1.5">
          {rows.map(row => {
            const auto = autoGroupFor(row.sunday, draft);
            const selectValue: SundayAssignment | 'AUTO' =
              row.source === 'PIN' ? row.group! : row.source === 'NONE' ? 'NONE' : 'AUTO';
            const pinned = row.source === 'PIN' || row.source === 'NONE';
            const locked = isLocked(row.saturday, lockedMonths) || isLocked(row.sunday, lockedMonths);
            const canBulk = !!row.group && row.missing.length > 0 && !row.holiday && !locked;
            return (
              <div key={iso(row.sunday)} className="bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-gray-800 w-20 shrink-0">CN {format(row.sunday, 'dd/MM')}</div>
                  <select
                    value={selectValue}
                    onChange={e => handlePin(row.sunday, e.target.value as SundayAssignment | 'AUTO')}
                    className={`flex-1 px-2 py-1 text-xs border rounded-lg outline-none ${pinned ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-800'}`}
                  >
                    <option value="AUTO">Tự động ({auto ? WEEKEND_GROUP_LABEL[auto] : 'chưa xếp'})</option>
                    <option value="A">Nhóm A (ghim)</option>
                    <option value="B">Nhóm B (ghim)</option>
                    <option value="NONE">Không nhóm nào làm</option>
                  </select>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                  {row.holiday && <span className="text-purple-600 font-bold">🎉 trùng lễ: {row.holiday.name}</span>}
                  {locked && <span className="text-red-500 font-bold">🔒 tháng đã chốt</span>}
                  {row.group && (
                    <span>
                      {row.members.length} thành viên · {row.members.length - row.missing.length} có đơn ·{' '}
                      <b className={row.missing.length > 0 ? 'text-amber-700' : 'text-emerald-600'}>{row.missing.length} chưa</b>
                    </span>
                  )}
                  {row.otherSwaps.length > 0 && <span className="text-red-500">{row.otherSwaps.length} đơn ngoài nhóm</span>}
                  {canBulk && (
                    <button
                      onClick={() => onBulkCreate(iso(row.sunday))}
                      disabled={dirty}
                      title={dirty ? 'Lưu lịch trước rồi mới tạo đơn' : 'Tạo và duyệt đơn cho những người chưa có'}
                      className="ml-auto px-2 py-0.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded font-bold flex items-center gap-1"
                    >
                      <Plus size={10} /> Tạo đơn cho {row.missing.length} người
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-full py-3 bg-slate-800 disabled:bg-gray-300 text-white rounded-xl font-semibold shadow-lg hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Save size={18} />
        {saving ? 'Đang lưu…' : dirty ? 'Lưu lịch (sẽ báo cho người bị ảnh hưởng)' : 'Lịch đã lưu'}
      </button>
    </div>
  );
};
