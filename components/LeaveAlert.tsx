import React, { useState, useEffect } from 'react';
import { startOfDay, addDays, isWithinInterval, startOfWeek, endOfWeek, isSameDay, format, isMonday } from 'date-fns';
import { LeaveRequest, UserProfile } from '../types';
import { CalendarOff, X, UserMinus, ChevronDown, ChevronUp } from 'lucide-react';
import { isPaidText } from '../utils/leaveTypes';

interface Props {
  leaveRequests: LeaveRequest[];
  employees: UserProfile[];
  currentUser: UserProfile;
}

interface LeaveInfo {
  name: string;
  duration: string;
  leaveType: string;
  dateRange: string;
}

export const LeaveAlert: React.FC<Props> = ({ leaveRequests, employees, currentUser }) => {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [todayLeaves, setTodayLeaves] = useState<LeaveInfo[]>([]);
  const [tomorrowLeaves, setTomorrowLeaves] = useState<LeaveInfo[]>([]);
  const [weekLeaves, setWeekLeaves] = useState<LeaveInfo[]>([]);

  useEffect(() => {
    // Only show for Admin and Quản Lý Sản Xuất
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Quản Lý Sản Xuất') return;

    // Check if already dismissed today
    const dismissedDate = localStorage.getItem('leave_alert_dismissed');
    if (dismissedDate === format(new Date(), 'yyyy-MM-dd')) return;

    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    const approved = leaveRequests.filter(r => r.status === 'APPROVED');

    const getLeaveInfo = (req: LeaveRequest): LeaveInfo => {
      const emp = employees.find(e => e.id === req.userId);
      const durationText = req.duration === 'MORNING' ? 'Ngh\u1EC9 s\u00E1ng' : req.duration === 'AFTERNOON' ? 'Ngh\u1EC9 chi\u1EC1u' : 'Ngh\u1EC9 c\u1EA3 ng\u00E0y';
      const typeText = isPaidText(req.leaveType);
      const start = format(new Date(req.startDate), 'dd/MM');
      const end = format(new Date(req.endDate), 'dd/MM');
      const dateRange = isSameDay(new Date(req.startDate), new Date(req.endDate)) ? start : `${start} - ${end}`;
      return {
        name: emp?.name || req.userName || 'Unknown',
        duration: durationText,
        leaveType: typeText,
        dateRange
      };
    };

    const isOnLeave = (req: LeaveRequest, date: Date) => {
      const start = startOfDay(new Date(req.startDate));
      const end = startOfDay(new Date(req.endDate));
      return isWithinInterval(date, { start, end });
    };

    // Today
    const todayList = approved.filter(r => isOnLeave(r, today)).map(getLeaveInfo);
    setTodayLeaves(todayList);

    // Tomorrow
    const tomorrowList = approved.filter(r => isOnLeave(r, tomorrow)).map(getLeaveInfo);
    setTomorrowLeaves(tomorrowList);

    // This week (only show on Monday)
    let weekList: LeaveInfo[] = [];
    if (isMonday(today)) {
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      weekList = approved.filter(r => {
        const start = startOfDay(new Date(r.startDate));
        const end = startOfDay(new Date(r.endDate));
        return (start <= weekEnd && end >= today);
      }).map(getLeaveInfo);
      // Deduplicate (same person might appear in today + week)
      const todayNames = new Set(todayList.map(l => l.name));
      weekList = weekList.filter(l => !todayNames.has(l.name));
    }
    setWeekLeaves(weekList);

    if (todayList.length > 0 || tomorrowList.length > 0 || weekList.length > 0) {
      setVisible(true);
    }
  }, [leaveRequests, employees, currentUser]);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('leave_alert_dismissed', format(new Date(), 'yyyy-MM-dd'));
  };

  if (!visible) return null;

  const totalCount = todayLeaves.length + tomorrowLeaves.length + weekLeaves.length;

  const renderSection = (title: string, items: LeaveInfo[], emoji: string) => {
    if (items.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200 mb-1">{emoji} {title}</p>
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs text-white/90 py-0.5">
            <span className="font-medium">{item.name}</span>
            <span className="text-teal-200 text-[10px]">{item.duration} ({item.leaveType}) {item.dateRange}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed top-20 right-4 z-50 animate-bounce-in" style={{ maxWidth: '380px' }}>
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white p-4 rounded-xl shadow-2xl border border-teal-400/30 relative overflow-hidden">

        {/* Background Decoration */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md shrink-0">
            <UserMinus size={24} className="text-white" />
          </div>

          <div className="flex-1 pr-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200 mb-0.5">
              {`Th\u00F4ng b\u00E1o ngh\u1EC9 ph\u00E9p`}
            </p>
            <h3 className="text-sm font-bold leading-tight">
              {`C\u00F3 ${totalCount} l\u01B0\u1EE3t ngh\u1EC9 ph\u00E9p`}
            </h3>
          </div>

          <div className="absolute top-2 right-2 flex gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors text-white/70 hover:text-white"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded-full transition-colors text-white/70 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Summary (always visible) */}
        <div className="mt-2 text-xs text-teal-100">
          {todayLeaves.length > 0 && <span>{`H\u00F4m nay: ${todayLeaves.map(l => l.name).join(', ')}`}</span>}
          {todayLeaves.length > 0 && (tomorrowLeaves.length > 0 || weekLeaves.length > 0) && <span> | </span>}
          {tomorrowLeaves.length > 0 && <span>{`Ng\u00E0y mai: ${tomorrowLeaves.map(l => l.name).join(', ')}`}</span>}
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-1 border-t border-white/20 pt-1">
            {renderSection('H\u00F4m nay', todayLeaves, '\uD83D\uDD34')}
            {renderSection('Ng\u00E0y mai', tomorrowLeaves, '\uD83D\uDFE1')}
            {renderSection('Tu\u1EA7n n\u00E0y', weekLeaves, '\uD83D\uDFE2')}
          </div>
        )}
      </div>
    </div>
  );
};
