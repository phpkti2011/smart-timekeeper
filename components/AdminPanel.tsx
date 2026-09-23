
import React, { useState, useEffect } from 'react';
import { Coordinates, Holiday, SwapRequest, UserProfile, WeekendGroup, WeekendSchedule } from '../types';
import { getCurrentPosition, getPublicIP } from '../utils/geo';
import { MapPin, Globe, Save, X, RefreshCw, Server, Calendar, Trash2, Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { WeekendGroupPanel } from './WeekendGroupPanel';
import { EMPTY_WEEKEND_SCHEDULE } from '../utils/weekendGroups';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (coords: Coordinates, ip: string) => void;
  initialCoords: Coordinates | null;
  initialIp: string;
  holidays: Holiday[];
  onAddHoliday: (startDate: string, endDate: string, name: string, duration: 'FULL' | 'MORNING' | 'AFTERNOON') => void;
  onDeleteHoliday: (id: string) => void;
  // Tab "Nhóm làm CN" — xem utils/weekendGroups.ts
  employees?: UserProfile[];
  swapRequests?: SwapRequest[];
  weekendSchedule?: WeekendSchedule;
  lockedMonths?: string[];
  onSaveWeekendSchedule?: (next: WeekendSchedule) => Promise<boolean>;
  onSetWeekendGroup?: (userId: string, group: WeekendGroup | null) => Promise<void>;
  onBulkCreateGroupSwaps?: (sundayISO: string) => Promise<void>;
}

export const AdminPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  initialCoords,
  initialIp,
  holidays,
  onAddHoliday,
  onDeleteHoliday,
  employees = [],
  swapRequests = [],
  weekendSchedule = EMPTY_WEEKEND_SCHEDULE,
  lockedMonths = [],
  onSaveWeekendSchedule,
  onSetWeekendGroup,
  onBulkCreateGroupSwaps
}) => {
  const [activeTab, setActiveTab] = useState<'CONFIG' | 'HOLIDAYS' | 'GROUPS'>('CONFIG');

  // Config State
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);

  // Holiday State
  const [holidayStartDate, setHolidayStartDate] = useState('');
  const [holidayEndDate, setHolidayEndDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [holidayDuration, setHolidayDuration] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL');

  useEffect(() => {
    if (isOpen) {
      setLat(initialCoords?.latitude.toString() || '');
      setLng(initialCoords?.longitude.toString() || '');
      setIp(initialIp || '');
    }
  }, [isOpen, initialCoords, initialIp]);

  const handleFetchGPS = async () => {
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      setLat(pos.coords.latitude.toString());
      setLng(pos.coords.longitude.toString());
    } catch (e) {
      alert("Không thể lấy GPS: " + e);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchIP = async () => {
    setLoading(true);
    try {
      const fetchedIp = await getPublicIP();
      setIp(fetchedIp);
    } catch (e) {
      alert("Không thể lấy IP");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      alert("Vui lòng nhập tọa độ hợp lệ");
      return;
    }

    onSave({ latitude, longitude }, ip);
    onClose();
  };

  const handleAddHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayStartDate || !holidayEndDate || !newHolidayName) {
      alert("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    if (new Date(holidayEndDate) < new Date(holidayStartDate)) {
      alert("Ngày kết thúc không được nhỏ hơn ngày bắt đầu");
      return;
    }

    onAddHoliday(holidayStartDate, holidayEndDate, newHolidayName, holidayDuration);
    setHolidayStartDate('');
    setHolidayEndDate('');
    setNewHolidayName('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className={`bg-white rounded-2xl w-full ${activeTab === 'GROUPS' ? 'max-w-md' : 'max-w-sm'} overflow-hidden shadow-2xl flex flex-col max-h-[85vh]`}>
        <div className="bg-slate-800 p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2">
            <Server size={20} />
            <h2 className="font-bold text-lg">Cấu hình Admin</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('CONFIG')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'CONFIG' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Cấu hình GPS/IP
          </button>
          <button
            onClick={() => setActiveTab('HOLIDAYS')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'HOLIDAYS' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Quản lý Ngày Lễ
          </button>
          <button
            onClick={() => setActiveTab('GROUPS')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'GROUPS' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Nhóm làm CN
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto no-scrollbar flex-1">

          {activeTab === 'CONFIG' && (
            <>
              {/* GPS Section */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <MapPin size={14} /> Tọa độ GPS
                  </label>
                  <button
                    onClick={handleFetchGPS}
                    className="text-xs flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100 transition"
                  >
                    <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                    Lấy GPS thực
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-xs text-gray-400">Vĩ độ (Lat)</span>
                    <input
                      type="number"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                      placeholder="10.77..."
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-gray-400">Kinh độ (Lng)</span>
                    <input
                      type="number"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                      placeholder="106.70..."
                    />
                  </div>
                </div>
              </div>

              {/* IP Section */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <Globe size={14} /> IP Mạng
                  </label>
                  <button
                    onClick={handleFetchIP}
                    className="text-xs flex items-center gap-1 text-purple-600 bg-purple-50 px-2 py-1 rounded-md hover:bg-purple-100 transition"
                  >
                    <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                    Lấy IP thực
                  </button>
                </div>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm font-mono"
                  placeholder="192.168.1.1"
                />
              </div>

              <div className="pt-2 text-xs text-gray-400 italic">
                * Cấu hình này sẽ ghi đè dữ liệu cảm biến thực tế để test chấm công.
              </div>

              <button
                onClick={handleSave}
                className="w-full py-3 bg-slate-800 text-white rounded-xl font-semibold shadow-lg hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} />
                Lưu cấu hình
              </button>
            </>
          )}

          {activeTab === 'HOLIDAYS' && (
            <div className="space-y-4">
              <form onSubmit={handleAddHolidaySubmit} className="bg-orange-50 p-3 rounded-xl border border-orange-100 space-y-3">
                <div className="text-xs font-bold text-orange-700 uppercase flex items-center gap-1">
                  <Plus size={12} /> Thêm khoảng nghỉ lễ
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold">Từ ngày</label>
                    <input
                      type="date"
                      value={holidayStartDate}
                      onChange={e => {
                        setHolidayStartDate(e.target.value);
                        if (!holidayEndDate) setHolidayEndDate(e.target.value);
                      }}
                      className="w-full px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold">Đến ngày</label>
                    <input
                      type="date"
                      value={holidayEndDate}
                      onChange={e => setHolidayEndDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold">Tên ngày lễ</label>
                  <input
                    type="text"
                    value={newHolidayName}
                    onChange={e => setNewHolidayName(e.target.value)}
                    placeholder="Ví dụ: Tết Nguyên Đán"
                    className="w-full px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold">Thời lượng nghỉ</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="holidayDuration"
                        value="FULL"
                        checked={holidayDuration === 'FULL'}
                        onChange={() => setHolidayDuration('FULL')}
                        className="w-3 h-3 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-xs text-gray-700">Cả ngày</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="holidayDuration"
                        value="MORNING"
                        checked={holidayDuration === 'MORNING'}
                        onChange={() => setHolidayDuration('MORNING')}
                        className="w-3 h-3 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-xs text-gray-700">Sáng</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="holidayDuration"
                        value="AFTERNOON"
                        checked={holidayDuration === 'AFTERNOON'}
                        onChange={() => setHolidayDuration('AFTERNOON')}
                        className="w-3 h-3 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-xs text-gray-700">Chiều</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Thêm ngày nghỉ
                </button>
              </form>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                {holidays.length === 0 && <p className="text-center text-xs text-gray-400 italic">Chưa có ngày lễ nào.</p>}
                {holidays.sort((a, b) => a.date.getTime() - b.date.getTime()).map(holiday => (
                  <div key={holiday.id} className="flex items-center justify-between bg-white border border-gray-100 p-2.5 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-50 text-red-500 p-1.5 rounded-lg">
                        <Calendar size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-800">
                          {holiday.name}
                          {holiday.duration && holiday.duration !== 'FULL' && (
                            <span className="ml-1 text-[10px] font-normal text-orange-600 bg-orange-50 px-1 rounded border border-orange-100">
                              {holiday.duration === 'MORNING' ? '(Sáng)' : '(Chiều)'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">{format(holiday.date, 'dd/MM/yyyy')}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteHoliday(holiday.id)}
                      className="text-gray-300 hover:text-red-500 p-1.5 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'GROUPS' && onSaveWeekendSchedule && onSetWeekendGroup && onBulkCreateGroupSwaps && (
            <WeekendGroupPanel
              employees={employees}
              swapRequests={swapRequests}
              holidays={holidays}
              weekendSchedule={weekendSchedule}
              lockedMonths={lockedMonths}
              onSaveSchedule={onSaveWeekendSchedule}
              onSetGroup={onSetWeekendGroup}
              onBulkCreate={onBulkCreateGroupSwaps}
            />
          )}
        </div>
      </div>
    </div>
  );
};
