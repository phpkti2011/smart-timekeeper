
import React, { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  isSunday,
  startOfDay
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Cake } from 'lucide-react';
import { LeaveRequest, UserProfile, Holiday } from '../types';

interface Props {
  leaveRequests: LeaveRequest[];
  employees: UserProfile[];
  holidays: Holiday[];
  currentUser?: UserProfile | null;
}

export const CompanyCalendar: React.FC<Props> = ({ leaveRequests, employees, holidays, currentUser }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Create grid inclusive of previous/next month padding days to align with Mon-Sun
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Helper: Get birthdays
  const getBirthdaysForDay = (date: Date) => {
    return employees.filter(emp => {
      if (!emp.dateOfBirth) return false;
      const dob = new Date(emp.dateOfBirth);
      return dob.getDate() === date.getDate() && dob.getMonth() === date.getMonth();
    });
  };

  // Monthly Birthdays Summary
  const monthlyBirthdays = employees.filter(emp => {
    if (!emp.dateOfBirth) return false;
    const dob = new Date(emp.dateOfBirth);
    return dob.getMonth() === currentMonth.getMonth();
  }).sort((a, b) => new Date(a.dateOfBirth!).getDate() - new Date(b.dateOfBirth!).getDate());



  // Helper: Get holidays
  const getHolidaysForDay = (date: Date) => {
    return holidays.filter(h => isSameDay(new Date(h.date), date));
  };

  // Helper to get leaves for a specific day
  const isAdminOrManager = currentUser?.role === 'Admin' || currentUser?.role === 'Quản Lý Sản Xuất';

  const getLeavesForDay = (date: Date) => {
    const targetDate = startOfDay(date);
    return leaveRequests
      .filter(req => req.status === 'APPROVED' || req.status === 'PENDING')
      .filter(req => {
        // Phân quyền: Admin/Quản lý thấy tất cả, NV chỉ thấy của mình
        if (!isAdminOrManager && req.userId !== currentUser?.id) return false;

        // Normalize to start of day to ensure day-level comparison works regardless of time
        const start = startOfDay(new Date(req.startDate));
        const end = startOfDay(new Date(req.endDate));
        return isWithinInterval(targetDate, { start, end });
      })
      .map(req => {
        // Find employee name if not directly available
        const emp = employees.find(e => e.id === req.userId);

        let effectiveDuration = req.duration;
        if (!isSameDay(new Date(req.startDate), new Date(req.endDate))) {
          effectiveDuration = 'FULL'; // Multi-day leaves are always full days
        }

        return {
          name: emp?.name || req.userName || 'Unknown',
          type: req.leaveType,
          duration: effectiveDuration,
          status: req.status
        };
      });
  };

  const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[60vh] relative z-10 flex flex-col pb-20">

      {/* Header */}
      <div className="p-5 border-b border-gray-100 bg-white sticky top-0 z-20 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-800">Lịch nghỉ toàn công ty</h2>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-white rounded-md transition-colors text-gray-500 hover:text-gray-900 shadow-sm"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-gray-700 min-w-[100px] text-center">
            Tháng {format(currentMonth, 'MM / yyyy')}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-white rounded-md transition-colors text-gray-500 hover:text-gray-900 shadow-sm"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto no-scrollbar">
        {/* Weekday Header */}
        <div className="grid grid-cols-7 mb-2">
          {weekDays.map((day, index) => (
            <div key={day} className={`text-center text-xs font-bold py-2 ${index === 6 ? 'text-red-500' : 'text-gray-500'}`}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-t border-l border-gray-200 bg-gray-200 gap-px">
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const leaves = getLeavesForDay(day);
            const birthdays = getBirthdaysForDay(day);
            const dailyHolidays = getHolidaysForDay(day);
            const isSun = isSunday(day);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[80px] bg-white p-1 flex flex-col relative ${!isCurrentMonth ? 'bg-gray-50' : ''}`}
              >
                {/* Day Number */}
                <div className={`text-right text-xs mb-1 p-1 ${!isCurrentMonth ? 'text-gray-300' : isSun ? 'text-red-400' : 'text-gray-600'}`}>
                  <span className={`${isToday ? 'bg-blue-500 text-white w-6 h-6 inline-flex items-center justify-center rounded-full font-bold' : ''}`}>
                    {format(day, 'd')}
                  </span>
                </div>


                {/* Leave Badges & Birthdays */}
                <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                  {/* Birthdays */}
                  {birthdays.map(emp => (
                    <div key={emp.id} className="bg-pink-100 text-pink-600 text-[10px] px-1 py-0.5 rounded shadow-sm text-center leading-tight font-bold flex items-center justify-center gap-1" title={`Sinh nhật ${emp.name}`}>
                      🎂 {emp.name}
                    </div>
                  ))}

                  {/* Holidays */}
                  {dailyHolidays.map(h => (
                    <div key={h.id} className="bg-purple-500 text-white text-[10px] px-1 py-1 rounded shadow-sm text-center leading-tight break-words font-bold">
                      🎉 {h.name}
                    </div>
                  ))}

                  {/* Leaves */}
                  {leaves.map((leave, lIdx) => {
                    let bgClass = 'bg-red-500'; // Default FULL
                    if (leave.duration === 'MORNING') bgClass = 'bg-yellow-500';
                    if (leave.duration === 'AFTERNOON') bgClass = 'bg-teal-500';

                    const isPending = leave.status === 'PENDING';
                    const statusLabel = isPending ? ' (Chờ duyệt)' : '';

                    return (
                      <div
                        key={lIdx}
                        className={`${bgClass} text-white text-[10px] px-1 py-1 rounded shadow-sm text-center leading-tight break-words ${isPending ? 'opacity-40' : ''}`}
                        title={`${leave.name} - ${leave.type === 'PAID' ? 'Phép năm' : 'Không lương'} (${leave.duration === 'MORNING' ? 'Sáng' : leave.duration === 'AFTERNOON' ? 'Chiều' : 'Cả ngày'})${statusLabel}`}
                      >
                        {leave.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 justify-center sm:justify-start">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Nghỉ cả ngày</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>Nghỉ Sáng</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-teal-500 rounded"></div>
            <span>Nghỉ Chiều</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded opacity-40"></div>
            <span>Chờ duyệt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span>Hôm nay</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-500 rounded"></div>
            <span>Ngày Lễ</span>
          </div>
        </div>
      </div>

      {/* Monthly Birthdays Footer */}
      {monthlyBirthdays.length > 0 && (
        <div className="mx-4 mb-4 mt-2 p-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl border border-pink-100">
          <div className="flex items-center gap-2 mb-3 text-pink-600 font-bold">
            <Cake size={18} />
            <span>Chúc mừng sinh nhật tháng {format(currentMonth, 'MM')}! 🎉</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {monthlyBirthdays.map(emp => (
              <div key={emp.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-pink-100">
                <img src={emp.avatar} className="w-6 h-6 rounded-full" />
                <div className="text-xs">
                  <span className="font-bold text-gray-800">{emp.name}</span>
                  <span className="text-pink-500 ml-1">({format(new Date(emp.dateOfBirth!), 'dd/MM')})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
