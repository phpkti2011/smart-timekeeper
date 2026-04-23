
import React, { useEffect, useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  LogIn,
  LogOut,
  MapPin,
  Wifi,
  Sparkles,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  X,
  Settings,
  Home,
  CalendarDays,
  FileCheck,
  Sunrise,
  Sunset,
  Users,
  DollarSign,
  Calendar,
  Navigation,
  Briefcase,
  Lock,
  CheckCircle,
  Bell, // Added
  Info // Added
} from 'lucide-react';
import { DigitalClock } from './components/DigitalClock';
import { TimeButton } from './components/TimeButton';
import { AttendanceHistory } from './components/AttendanceHistory';
import { MonthlyHistory } from './components/MonthlyHistory';
import { AiAssistant } from './components/AiAssistant'; // Added
import { AdminPanel } from './components/AdminPanel';
import { RequestApproval } from './components/RequestApproval';
import { AdminPayrollManagement } from './components/AdminPayrollManagement';
import { OTRequestModal } from './components/OTRequestModal';
import { LateExplanationModal } from './components/LateExplanationModal';
import { EmployeeManagement } from './components/EmployeeManagement';
import { AdminEmployeeDetail } from './components/AdminEmployeeDetail';
import { SalaryView } from './components/SalaryView';
import { BonusPenaltyModal } from './components/BonusPenaltyModal';
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { SalaryAdvanceModal } from './components/SalaryAdvanceModal'; // New Import
import { CompanyCalendar } from './components/CompanyCalendar';
import { HolidayAlert } from './components/HolidayAlert';
import { BirthdayAlert } from './components/BirthdayAlert';
import { AuthScreen } from './components/AuthScreen';
import { PushNotificationToggle } from './components/PushNotificationToggle';
import { InstallPrompt } from './components/InstallPrompt';
import { SalaryConfirmationModal } from './components/SalaryConfirmationModal';
import { AttendanceLog, AttendanceType, Coordinates, OTRequest, LateRequest, SalaryAdvanceRequest, RequestStatus, UserProfile, BonusFine, LeaveRequest, LeaveType, LeaveDuration, OverrideLog, Holiday, SalaryChange } from './types';

import { COMPANY_SETTINGS, MOCK_USER, MOCK_EMPLOYEES, MOCK_BONUSES, MOCK_ADVANCES, MOCK_HOLIDAYS } from './constants';
import { calculateDistance, getCurrentPosition, getPublicIP } from './utils/geo';
import { generateAttendanceReport } from './services/geminiService';
import { calculateMonthlySalary } from './utils/salaryCalculator';
import { startOfMonth, eachDayOfInterval, endOfMonth, isFuture, isSameDay, differenceInDays, format, isSameMonth } from 'date-fns';
import { checkAndIncrementLeaveBalance, getVirtualBirthdayBonus, calculateRemainingLeave, getPaidLeaveUsedThisMonth } from './utils/salaryCalculator';
import { supabase } from './utils/supabaseClient';
import { sendPushToUser, sendPushToManagers } from './utils/pushNotifications';

// Helper: NV nghỉ việc → ẩn sau khi hết tháng nghỉ việc
const isResignedAndHidden = (emp: UserProfile): boolean => {
  if (!emp.resignationDate) return false;
  const resignDate = new Date(emp.resignationDate);
  const endOfResignMonth = endOfMonth(resignDate);
  return new Date() > endOfResignMonth;
};

// Helper: Kiểm tra tháng đã chốt lương chưa
const isMonthLocked = (date: Date, lockedMonths: string[]): boolean => {
  return lockedMonths.includes(format(date, 'MM-yyyy'));
};

const LOCKED_MONTH_MSG = '🔒 THÁNG ĐÃ CHỐT LƯƠNG!\n\nKhông thể thực hiện thao tác này vì tháng đã được chốt.\nVui lòng liên hệ Admin để hoàn chốt lương trước khi sửa đổi.';

const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Main Data State
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [otRequests, setOtRequests] = useState<OTRequest[]>([]);
  const [lateRequests, setLateRequests] = useState<LateRequest[]>([]);
  const [advanceRequests, setAdvanceRequests] = useState<SalaryAdvanceRequest[]>(MOCK_ADVANCES);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [overrides, setOverrides] = useState<OverrideLog[]>([]); // New State
  const [holidays, setHolidays] = useState<Holiday[]>(MOCK_HOLIDAYS); // New State
  const [salaryChanges, setSalaryChanges] = useState<SalaryChange[]>([]); // New State: Salary History
  const [lockedMonths, setLockedMonths] = useState<string[]>([]); // New State: Locked Payroll Months

  // Employees "Database" - Initialize with Mock Data
  const [employees, setEmployees] = useState<UserProfile[]>(MOCK_EMPLOYEES);

  const [bonuses, setBonuses] = useState<BonusFine[]>(MOCK_BONUSES);

  // Location/Device State
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [currentIp, setCurrentIp] = useState<string>('Detecting...');
  const [distance, setDistance] = useState<number | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin / Manual Mode State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualCoords, setManualCoords] = useState<Coordinates | null>(null);
  const [manualIp, setManualIp] = useState<string>('');

  // Selected Employee for View Mode
  const [viewingEmployee, setViewingEmployee] = useState<UserProfile | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'requests' | 'hr' | 'salary' | 'calendar'>('today');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Modals State
  const [isOtModalOpen, setIsOtModalOpen] = useState(false);
  const [pendingOtType, setPendingOtType] = useState<AttendanceType | null>(null);

  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [pendingLateDate, setPendingLateDate] = useState<Date | null>(null);
  const [pendingLateMinutes, setPendingLateMinutes] = useState<number>(0);

  const [isGeneralBonusModalOpen, setIsGeneralBonusModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false); // New State
  const [currentAdvanceLimit, setCurrentAdvanceLimit] = useState(0); // Store limit when opening prompt

  // Salary Month Selection State
  const [currentSalaryMonth, setCurrentSalaryMonth] = useState(new Date());
  const [requestTargetUser, setRequestTargetUser] = useState<UserProfile | null>(null); // State for Admin creating request for others
  const [leaveRequestTargetUser, setLeaveRequestTargetUser] = useState<UserProfile | null>(null); // NEW: Target for Leave Requests

  // Failure Modal State
  const [isFailureModalOpen, setIsFailureModalOpen] = useState(false);
  const [failureReasons, setFailureReasons] = useState<string[]>([]);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false); // Success Modal State
  const [isProcessingAttendance, setIsProcessingAttendance] = useState(false); // Double-tap prevention
  const [successMsg, setSuccessMsg] = useState(""); // Success Msg State
  const [isSalaryConfirmModalOpen, setIsSalaryConfirmModalOpen] = useState(false); // Salary Confirm Modal State

  // Other Existing Functions...



  // History Month Selection State
  const [viewingMonth, setViewingMonth] = useState(new Date());

  // Config State (Loaded from DB)
  const [companyConfig, setCompanyConfig] = useState(COMPANY_SETTINGS);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Logic ---

  // Supabase Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchProfile(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
        setAuthLoading(false);
        return;
      }
      fetchProfile(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (session: any) => {
    if (!session?.user) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (data) {
        const user: UserProfile = {
          id: data.id,
          name: data.name,
          role: data.role,
          avatar: data.avatar || session.user.user_metadata.avatar_url,
          email: session.user.email,
          baseSalary: data.base_salary,
          allowance: data.allowance || 0,
          insuranceSalary: data.insurance_salary || 0,
          leaveBalance: data.leave_balance,
          workDays: data.work_days || "1,2,3,4,5,6",
          contractType: data.contract_type || 'Hợp đồng chính thức',
          contractDate: data.contract_date,
          status: data.status // Don't override DB value
        };
        setCurrentUser(user);
      } else {
        // Fallback if profile not found (sign up trigger lag?)
        setCurrentUser(null);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setAuthLoading(false);
    }
  };


  // Fetch Data from Supabase
  useEffect(() => {
    if (currentUser) {
      fetchAllData();
    }
  }, [currentUser?.id]); // Only refetch if ID changes (login), not on every user update to avoid loops

  // Sync Current User with Employees List
  useEffect(() => {
    if (currentUser && employees.length > 0) {
      const freshUser = employees.find(e => e.id === currentUser.id);
      // Only update if there are meaningful differences to avoid loops
      if (freshUser) {
        // Check simple integrity or specific fields
        const hasChanges =
          freshUser.leaveBalance !== currentUser.leaveBalance ||
          freshUser.usedLeaveLegacy !== currentUser.usedLeaveLegacy ||
          freshUser.contractDate !== currentUser.contractDate;

        if (hasChanges) {
          setCurrentUser(prev => ({ ...prev!, ...freshUser }));
        }
      }
    }
  }, [employees, currentUser?.id]);

  // === Nhân viên hiển thị (ẩn NV nghỉ việc đã hết tháng) ===
  const visibleEmployees = useMemo(() => employees.filter(emp => !isResignedAndHidden(emp)), [employees]);

  // === PERFORMANCE: Memoized filters for current user ===
  const myLogs = useMemo(() => logs.filter(l => l.userId === currentUser?.id), [logs, currentUser?.id]);
  const myOtRequests = useMemo(() => otRequests.filter(r => r.userId === currentUser?.id), [otRequests, currentUser?.id]);
  const myLateRequests = useMemo(() => lateRequests.filter(r => r.userId === currentUser?.id), [lateRequests, currentUser?.id]);
  const myLeaveRequests = useMemo(() => leaveRequests.filter(r => r.userId === currentUser?.id), [leaveRequests, currentUser?.id]);
  const myAdvanceRequests = useMemo(() => advanceRequests.filter(r => r.userId === currentUser?.id), [advanceRequests, currentUser?.id]);
  const myOverrides = useMemo(() => overrides.filter(o => o.userId === currentUser?.id), [overrides, currentUser?.id]);
  const myBonuses = useMemo(() => bonuses.filter(b => b.userId === currentUser?.id), [bonuses, currentUser?.id]);

  // Calculate Salary for Advance Limit Check
  const advanceTargetSalaryReport = useMemo(() => {
    if (!isAdvanceModalOpen) return null;

    const target = requestTargetUser || currentUser;
    if (!target) return null;

    // Filter Data for Target
    const targetLogs = logs.filter(l => l.userId === target.id);
    const targetOt = otRequests.filter(r => r.userId === target.id);
    const targetLate = lateRequests.filter(r => r.userId === target.id);
    const targetAdvances = advanceRequests.filter(r => r.userId === target.id); // Filter globally
    const targetBonuses = bonuses.filter(b => b.userId === target.id);
    const targetOverrides = overrides.filter(o => o.userId === target.id);

    // Calculate for CURRENT REAL MONTH (Always advance for current period)
    const now = new Date();

    return calculateMonthlySalary(
      now,
      targetLogs,
      targetOt,
      targetLate,
      targetAdvances,
      targetBonuses,
      target,
      targetOverrides,
      holidays,
      salaryChanges
    );

  }, [
    isAdvanceModalOpen,
    requestTargetUser,
    currentUser,
    logs,
    otRequests,
    lateRequests,
    advanceRequests,
    bonuses,
    overrides,
    overrides,
    holidays,
    salaryChanges
  ]);


  // === PERFORMANCE: Track which months have been loaded ===
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const DEFAULT_MONTHS_TO_LOAD = 3;

  const fetchAllData = async () => {
    setLoadingLocation(true);

    // Calculate cutoff: only load last 3 months by default
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - DEFAULT_MONTHS_TO_LOAD);
    const cutoffISO = cutoffDate.toISOString();
    const cutoffDateStr = format(cutoffDate, 'yyyy-MM-dd');

    // Mark initial months as loaded
    const initialMonths = new Set<string>();
    for (let i = 0; i <= DEFAULT_MONTHS_TO_LOAD; i++) {
      const m = new Date();
      m.setMonth(m.getMonth() - i);
      initialMonths.add(format(m, 'yyyy-MM'));
    }
    setLoadedMonths(initialMonths);

    try {
      // 1. Fetch Employees
      const { data: empData } = await supabase.from('profiles').select('*');
      if (empData) {
        const mappedEmps: UserProfile[] = empData.map((e: any) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          avatar: e.avatar,
          email: e.email,
          baseSalary: e.base_salary,
          allowance: e.allowance || 0,
          insuranceSalary: e.insurance_salary || 0,
          leaveBalance: e.leave_balance,
          workDays: e.work_days || "1,2,3,4,5,6",
          contractType: e.contract_type || 'Hợp đồng chính thức',
          contractDate: e.contract_date,

          employeeCode: e.employee_code, // Map from DB
          status: e.status, // Fix: Map status from DB
          dateOfBirth: e.date_of_birth,
          usedLeaveLegacy: e.used_leave_legacy || 0,
          resignationDate: e.resignation_date || null
        }));
        setEmployees(mappedEmps);
      }

      // 2. Fetch Logs (Unlimited - Recursive Pagination)
      let allFetchedLogs: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error: chunkError } = await supabase
          .from('attendance_logs')
          .select('*')
          .gte('timestamp', cutoffISO)
          .order('timestamp', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (chunkError) {
          console.error("Error fetching logs page:", page, chunkError);
          break;
        }

        if (chunk && chunk.length > 0) {
          allFetchedLogs = [...allFetchedLogs, ...chunk];
          // If we got less than requested, it's the last page
          if (chunk.length < pageSize) hasMore = false;
          else page++;
        } else {
          hasMore = false;
        }
      }

      console.log(`FETCH COMPLETE: Retrieved ${allFetchedLogs.length} logs in ${page + 1} pages.`);

      if (allFetchedLogs.length > 0) {
        const mappedLogs: AttendanceLog[] = allFetchedLogs.map((l: any) => ({
          id: l.id,
          userId: l.user_id,
          type: l.type,
          timestamp: new Date(l.timestamp),
          location: { lat: l.location_lat, lng: l.location_lng },
          ip: l.ip,
          isValidLocation: l.is_valid_location,
          note: l.note
        }));
        setLogs(mappedLogs);
      }

      // 3. Fetch Salary Changes (History)
      const { data: salaryData } = await supabase.from('salary_changes').select('*');
      if (salaryData) {
        setSalaryChanges(salaryData.map((s: any) => ({
          id: s.id,
          userId: s.user_id,
          baseSalary: s.base_salary,
          allowance: s.allowance,
          insuranceSalary: s.insurance_salary,
          effectiveDate: s.effective_date,
          reason: s.reason,
          createdAt: s.created_at
        })));
      }

      // 8. Fetch Locked Months
      const { data: periodData, error: periodError } = await supabase.from('payroll_periods').select('month');
      if (periodError) console.error("Error fetching periods:", periodError);
      if (periodData) {
        setLockedMonths(periodData.map((p: any) => format(new Date(p.month), 'MM-yyyy')));
      }

      // 3. Fetch Requests (only recent)
      const { data: reqData } = await supabase.from('requests').select('*').gte('created_at', cutoffISO);
      if (reqData) {
        // Filter into specific categories
        const ots = reqData.filter((r: any) => r.type === 'OT').map((r: any) => ({
          ...mapBaseRequest(r, empData),
          id: r.id,
          date: new Date(r.date),
          shift: r.shift,
          reason: r.reason,
          status: r.status
        }));
        setOtRequests(ots);

        const lates = reqData.filter((r: any) => r.type === 'LATE').map((r: any) => {
          // Handle timezone: Parse the date and extract local date components
          const dateStr = r.date;
          let parsedDate: Date;

          if (dateStr.length === 10) {
            // Pure date string like '2026-01-22' - parse as local midnight
            parsedDate = new Date(dateStr + 'T00:00:00');
          } else {
            // ISO UTC string like '2026-01-21T17:00:00.000Z'
            // Convert to local Date, then extract local date components
            const utcDate = new Date(dateStr);
            parsedDate = new Date(utcDate.getFullYear(), utcDate.getMonth(), utcDate.getDate());
          }

          return {
            ...mapBaseRequest(r, empData),
            id: r.id,
            date: parsedDate,
            reason: r.reason,
            status: r.status,
            minutesLate: r.minutes_late
          };
        });
        setLateRequests(lates);

        const leaves = reqData.filter((r: any) => r.type === 'LEAVE').map((r: any) => ({
          ...mapBaseRequest(r, empData),
          id: r.id,
          startDate: new Date(r.start_date),
          endDate: new Date(r.end_date),
          leaveType: r.leave_type,
          duration: r.leave_duration,
          reason: r.reason,
          status: r.status
        }));
        setLeaveRequests(leaves);

        const advances = reqData.filter((r: any) => r.type === 'ADVANCE').map((r: any) => ({
          ...mapBaseRequest(r, empData),
          id: r.id,
          date: new Date(r.created_at),
          amount: r.amount,
          reason: r.reason,
          status: r.status
        }));
        setAdvanceRequests(advances);
      }

      // 4. Fetch Holidays
      const { data: holData } = await supabase.from('holidays').select('*');
      if (holData) {
        setHolidays(holData.map((h: any) => ({
          id: h.id,
          date: new Date(h.date),
          name: h.name,
          duration: h.duration // Map duration
        })));
      }

      // 5. Fetch Bonuses (only recent)
      const { data: bonusData } = await supabase.from('bonuses').select('*').gte('date', cutoffDateStr);
      if (bonusData) {
        setBonuses(bonusData.map((b: any) => ({
          id: b.id,
          userId: b.user_id,
          date: new Date(b.date),
          amount: b.amount,
          type: b.type,
          reason: b.reason,
          createdAt: b.created_at ? new Date(b.created_at) : undefined
        })));
      }

      // 6. Fetch Overrides (only recent)
      const { data: overrideData } = await supabase.from('attendance_overrides').select('*').gte('date', cutoffDateStr);
      if (overrideData) {
        setOverrides(overrideData.map((o: any) => ({
          id: o.id,
          userId: o.user_id,
          date: new Date(o.date),
          in1: o.in1,
          out1: o.out1,
          in2: o.in2,
          out2: o.out2,
          workDays: o.work_days,
          note: o.note
        })));
      }

      // 7. Fetch Settings (GPS/IP)
      const { data: settingsData } = await supabase.from('settings').select('*');
      if (settingsData && settingsData.length > 0) {
        const newConfig = { ...COMPANY_SETTINGS };

        const locSetting = settingsData.find(s => s.key === 'company_location');
        if (locSetting && locSetting.value) {
          newConfig.location = {
            latitude: locSetting.value.lat,
            longitude: locSetting.value.lng
          };
          newConfig.allowedRadiusMeters = locSetting.value.radius || 100;
        }

        const ipSetting = settingsData.find(s => s.key === 'wifi_ip');
        if (ipSetting && ipSetting.value) {
          newConfig.allowedIpPrefix = ipSetting.value;
        }

        setCompanyConfig(newConfig);
      }

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoadingLocation(false);
    }
  };

  // === LAZY-LOAD: Fetch data for a specific month (Admin xem tháng cũ) ===
  const fetchMonthData = async (month: Date) => {
    const monthKey = format(month, 'yyyy-MM');
    if (loadedMonths.has(monthKey)) return;

    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const startDateStr = format(start, 'yyyy-MM-dd');
    const endDateStr = format(end, 'yyyy-MM-dd');

    const [logsRes, reqsRes, bonusRes, overrideRes] = await Promise.all([
      supabase.from('attendance_logs').select('*')
        .gte('timestamp', startISO).lte('timestamp', endISO),
      supabase.from('requests').select('*')
        .gte('created_at', startISO).lte('created_at', endISO),
      supabase.from('bonuses').select('*')
        .gte('date', startDateStr).lte('date', endDateStr),
      supabase.from('attendance_overrides').select('*')
        .gte('date', startDateStr).lte('date', endDateStr),
    ]);

    if (logsRes.data && logsRes.data.length > 0) {
      const newLogs: AttendanceLog[] = logsRes.data.map((l: any) => ({
        id: l.id, userId: l.user_id, type: l.type,
        timestamp: new Date(l.timestamp),
        location: { lat: l.location_lat, lng: l.location_lng },
        ip: l.ip, isValidLocation: l.is_valid_location, note: l.note
      }));
      setLogs(prev => {
        const existingIds = new Set(prev.map(l => l.id));
        return [...prev, ...newLogs.filter(l => !existingIds.has(l.id))];
      });
    }

    if (reqsRes.data && reqsRes.data.length > 0) {
      const empData = employees;
      const mapReq = (r: any) => {
        const user = empData.find(p => p.id === r.user_id);
        return { userId: r.user_id, userName: user?.name || 'Unknown', userAvatar: user?.avatar || '', userRole: user?.role || 'Employee', createdAt: r.created_at ? new Date(r.created_at) : undefined, processedAt: r.processed_at ? new Date(r.processed_at) : undefined };
      };
      const newOts = reqsRes.data.filter((r: any) => r.type === 'OT').map((r: any) => ({ ...mapReq(r), id: r.id, date: new Date(r.date), shift: r.shift, reason: r.reason, status: r.status }));
      const newLates = reqsRes.data.filter((r: any) => r.type === 'LATE').map((r: any) => {
        const dateStr = r.date;
        let parsedDate = dateStr.length === 10 ? new Date(dateStr + 'T00:00:00') : (() => { const d = new Date(dateStr); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();
        return { ...mapReq(r), id: r.id, date: parsedDate, reason: r.reason, status: r.status, minutesLate: r.minutes_late };
      });
      const newLeaves = reqsRes.data.filter((r: any) => r.type === 'LEAVE').map((r: any) => ({ ...mapReq(r), id: r.id, startDate: new Date(r.start_date), endDate: new Date(r.end_date), leaveType: r.leave_type, duration: r.leave_duration, reason: r.reason, status: r.status }));
      const newAdvances = reqsRes.data.filter((r: any) => r.type === 'ADVANCE').map((r: any) => ({ ...mapReq(r), id: r.id, date: new Date(r.created_at), amount: r.amount, reason: r.reason, status: r.status }));

      if (newOts.length) setOtRequests(prev => { const ids = new Set(prev.map(r => r.id)); return [...prev, ...newOts.filter(r => !ids.has(r.id))]; });
      if (newLates.length) setLateRequests(prev => { const ids = new Set(prev.map(r => r.id)); return [...prev, ...newLates.filter(r => !ids.has(r.id))]; });
      if (newLeaves.length) setLeaveRequests(prev => { const ids = new Set(prev.map(r => r.id)); return [...prev, ...newLeaves.filter(r => !ids.has(r.id))]; });
      if (newAdvances.length) setAdvanceRequests(prev => { const ids = new Set(prev.map(r => r.id)); return [...prev, ...newAdvances.filter(r => !ids.has(r.id))]; });
    }

    if (bonusRes.data && bonusRes.data.length > 0) {
      const newBonuses = bonusRes.data.map((b: any) => ({ id: b.id, userId: b.user_id, date: new Date(b.date), amount: b.amount, type: b.type, reason: b.reason, createdAt: b.created_at ? new Date(b.created_at) : undefined }));
      setBonuses(prev => { const ids = new Set(prev.map(b => b.id)); return [...prev, ...newBonuses.filter(b => !ids.has(b.id))]; });
    }

    if (overrideRes.data && overrideRes.data.length > 0) {
      const newOverrides = overrideRes.data.map((o: any) => ({ id: o.id, userId: o.user_id, date: new Date(o.date), in1: o.in1, out1: o.out1, in2: o.in2, out2: o.out2, workDays: o.work_days, note: o.note }));
      setOverrides(prev => { const ids = new Set(prev.map(o => o.id)); return [...prev, ...newOverrides.filter(o => !ids.has(o.id))]; });
    }

    setLoadedMonths(prev => new Set([...prev, monthKey]));
  };

  const mapBaseRequest = (req: any, allProfiles: any[]) => {
    const user = allProfiles?.find((p: any) => p.id === req.user_id);
    return {
      userId: req.user_id,
      userName: user?.name || 'Unknown',
      userAvatar: user?.avatar || '',
      userRole: user?.role || 'Employee',
      createdAt: req.created_at ? new Date(req.created_at) : undefined,
      processedAt: req.processed_at ? new Date(req.processed_at) : undefined
    };
  };

  // Check Monthly Leave Increment on Load
  useEffect(() => {
    // In a real app, this runs on backend. Here we simulate it on app load.
    const updatedEmployees = employees.map(checkAndIncrementLeaveBalance);
    // Check if any changes occurred to avoid infinite loop
    const hasChanged = JSON.stringify(updatedEmployees) !== JSON.stringify(employees);
    if (hasChanged) {
      setEmployees(updatedEmployees);
      // Also update current user if needed
      if (currentUser) {
        const updatedUser = updatedEmployees.find(e => e.id === currentUser.id);
        if (updatedUser) setCurrentUser(updatedUser);
      }
    }
  }, []);

  const fetchRealLocationData = async () => {
    if (isManualMode) return; // Don't fetch if in manual mode

    setLoadingLocation(true);
    setErrorMsg(null);
    try {
      // Get IP
      const ip = await getPublicIP();
      setCurrentIp(ip);

      // Get GPS
      const pos = await getCurrentPosition();
      const userCoords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      };
      setCurrentLocation(userCoords);

      const dist = calculateDistance(userCoords, companyConfig.location);
      setDistance(dist);
    } catch (err: any) {
      console.warn("Location/IP Fetch Error:", err?.message || err);
      setErrorMsg("Không thể lấy vị trí. Vui lòng bật GPS.");
      setDistance(null);
      setCurrentLocation(null);
    } finally {
      setLoadingLocation(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchRealLocationData();
      const interval = setInterval(() => {
        if (!isManualMode) fetchRealLocationData();
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [isManualMode, currentUser]);


  // Auth Handlers
  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
  };

  const handleRegister = (newUser: UserProfile) => {
    // Only add to database, do NOT auto login
    setEmployees(prev => [...prev, newUser]);
  };

  const handleLogout = async () => {
    // Remove confirmation to prevent sandbox issues
    await supabase.auth.signOut();
    setCurrentUser(null);
    setActiveTab('today');
    setLogs([]);
    setIsManualMode(false); // Reset manual mode to re-enable strict location checks
  };

  // Notification State
  const [notification, setNotification] = useState<{ title: string; body: string } | null>(null);

  // --- REALTIME & NOTIFICATIONS ---
  const triggerNotification = (title: string, body: string) => {
    // 1. Browser Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/vite.svg' });
      } catch (e) {
        console.warn("Native notification failed (likely mobile restriction):", e);
      }
    }

    // 2. Audio Alert
    try {
      const audio = new Audio('/notification.mp3'); // Try to play if exists, silent fail if not
      audio.play().catch(() => { });
    } catch (e) { }

    // 3. In-App Toast
    setNotification({ title, body });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    if (!currentUser) return;

    // Push notification is now managed by PushNotificationToggle component

    const channel = supabase.channel('realtime_updates')
      // 1. Logs
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;

        if (eventType === 'INSERT') {
          const log: AttendanceLog = {
            id: newRec.id,
            userId: newRec.user_id,
            type: newRec.type,
            timestamp: new Date(newRec.timestamp),
            location: { lat: newRec.location_lat, lng: newRec.location_lng },
            ip: newRec.ip,
            isValidLocation: newRec.is_valid_location,
            note: newRec.note
          };
          setLogs(prev => {
            if (prev.find(l => l.id === log.id)) return prev; // Dedup
            return [...prev, log];
          });

          if (currentUser.role === 'Admin' && log.userId !== currentUser.id) {
            const user = employees.find(e => e.id === log.userId);
            triggerNotification('Chấm công mới', `${user?.name || 'Nhân viên'} vừa chấm công`);
          }
        } else if (eventType === 'DELETE') {
          setLogs(prev => prev.filter(l => l.id !== oldRec.id));
        }
      })
      // 2. Requests (OT, Late, Leave, Advance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;

        if (eventType === 'DELETE') {
          setOtRequests(prev => prev.filter(r => r.id !== oldRec.id));
          setLateRequests(prev => prev.filter(r => r.id !== oldRec.id));
          setLeaveRequests(prev => prev.filter(r => r.id !== oldRec.id));
          setAdvanceRequests(prev => prev.filter(r => r.id !== oldRec.id));
          return;
        }

        const user = employees.find(e => e.id === newRec.user_id);
        const baseReq = {
          userId: newRec.user_id,
          userName: user?.name || 'Unknown',
          userAvatar: user?.avatar || '',
          userRole: user?.role || 'Employee',
          status: newRec.status
        };

        if (newRec.type === 'OT') {
          const req = { ...baseReq, id: newRec.id, date: new Date(newRec.date), shift: newRec.shift, reason: newRec.reason } as OTRequest;
          setOtRequests(prev => eventType === 'UPDATE' ? prev.map(r => r.id === req.id ? req : r) : [...prev, req]);
        } else if (newRec.type === 'LATE') {
          const req = { ...baseReq, id: newRec.id, date: new Date(newRec.date), minutesLate: newRec.minutes_late, reason: newRec.reason } as LateRequest;
          setLateRequests(prev => eventType === 'UPDATE' ? prev.map(r => r.id === req.id ? req : r) : [...prev, req]);
        } else if (newRec.type === 'LEAVE') {
          const req = { ...baseReq, id: newRec.id, startDate: new Date(newRec.start_date), endDate: new Date(newRec.end_date), leaveType: newRec.leave_type, duration: newRec.leave_duration, reason: newRec.reason } as LeaveRequest;
          setLeaveRequests(prev => eventType === 'UPDATE' ? prev.map(r => r.id === req.id ? req : r) : [...prev, req]);
        } else if (newRec.type === 'ADVANCE') {
          const req = { ...baseReq, id: newRec.id, date: new Date(newRec.created_at), amount: newRec.amount, reason: newRec.reason } as SalaryAdvanceRequest;
          setAdvanceRequests(prev => eventType === 'UPDATE' ? prev.map(r => r.id === req.id ? req : r) : [...prev, req]);
        }

        if (eventType === 'INSERT' && currentUser.role === 'Admin' && newRec.user_id !== currentUser.id) {
          triggerNotification('Yêu cầu mới', `${baseReq.userName} vừa gửi yêu cầu ${newRec.type}`);
        } else if (eventType === 'UPDATE' && newRec.user_id === currentUser.id && newRec.status !== 'PENDING') {
          triggerNotification('Kết quả duyệt đơn', `Đơn ${newRec.type} của bạn đã được ${newRec.status === 'APPROVED' ? 'DUYỆT' : 'TỪ CHỐI'}`);
        }
      })
      // 3. Bonuses
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonuses' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;
        if (eventType === 'DELETE') {
          setBonuses(prev => prev.filter(b => b.id !== oldRec.id));
          return;
        }
        const bonus = { id: newRec.id, userId: newRec.user_id, date: new Date(newRec.date), amount: newRec.amount, type: newRec.type, reason: newRec.reason } as BonusFine;
        setBonuses(prev => eventType === 'UPDATE' ? prev.map(b => b.id === bonus.id ? bonus : b) : [...prev, bonus]);

        if (eventType === 'INSERT' && newRec.user_id === currentUser.id) {
          triggerNotification('Thưởng/Phạt mới', `Bạn vừa nhận được ${newRec.type === 'BONUS' ? 'Thưởng' : 'Phạt'}: ${newRec.amount.toLocaleString()}đ`);
        }
      })
      // 4. Overrides
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_overrides' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;
        if (eventType === 'DELETE') {
          setOverrides(prev => prev.filter(o => o.id !== oldRec.id));
          return;
        }
        const override = { id: newRec.id, userId: newRec.user_id, date: new Date(newRec.date), in1: newRec.in1, out1: newRec.out1, in2: newRec.in2, out2: newRec.out2, workDays: newRec.work_days, note: newRec.note } as OverrideLog;
        setOverrides(prev => eventType === 'UPDATE' ? prev.map(o => o.id === override.id ? override : o) : [...prev, override]);
      })
      // 5. Profiles (Realtime new employees)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;

        if (eventType === 'DELETE') {
          setEmployees(prev => prev.filter(e => e.id !== oldRec.id));
          return;
        }

        const newProfile: UserProfile = {
          id: newRec.id,
          name: newRec.name,
          role: newRec.role,
          avatar: newRec.avatar,
          email: newRec.email,
          baseSalary: newRec.base_salary,
          allowance: newRec.allowance || 0,
          insuranceSalary: newRec.insurance_salary || 0,
          leaveBalance: newRec.leave_balance,
          workDays: newRec.work_days || "1,2,3,4,5,6",
          contractType: newRec.contract_type || 'Hợp đồng chính thức',
          contractDate: newRec.contract_date,
          employeeCode: newRec.employee_code,
          status: newRec.status // Important!
        };

        setEmployees(prev => {
          if (eventType === 'UPDATE') {
            return prev.map(e => e.id === newProfile.id ? newProfile : e);
          } else {
            // INSERT
            if (prev.find(e => e.id === newProfile.id)) return prev; // Dedup

            // Trigger notification if Admin
            if (currentUser.role === 'Admin') {
              triggerNotification('Nhân sự mới', `${newProfile.name} vừa đăng ký tài khoản`);
            }
            return [...prev, newProfile];
          }
        });
      })

      // 6. Payroll Periods (Locks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_periods' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;

        if (eventType === 'INSERT') {
          const monthStr = format(new Date(newRec.month), 'MM-yyyy');
          setLockedMonths(prev => [...prev, monthStr]);

          // Notify everyone except Admin (who likely performed the action)
          // Or just notify everyone to be safe/clear.
          if (currentUser.role !== 'Admin') {
            triggerNotification('Thông báo lương', `Bảng lương tháng ${format(new Date(newRec.month), 'MM/yyyy')} đã được Chốt.`);
          }
        } else if (eventType === 'DELETE') {
          const monthStr = format(new Date(oldRec.month), 'MM-yyyy'); // Warning: oldRec might strictly only have ID?
          // postgres_changes for DELETE usually only returns old record ID if replica identity is default.
          // However, if we can't get the date, we might just refetch or filter by ID if we stored IDs.
          // Since we store strings 'MM-yyyy', we might need to refetch to be safe, OR we rely on `fetchAllData` which is safer.
          // Let's refetch locked months to be sure.

          // Simple refresh:
          supabase.from('payroll_periods').select('month').then(({ data }) => {
            if (data) setLockedMonths(data.map((p: any) => format(new Date(p.month), 'MM-yyyy')));
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); }

  }, [currentUser, employees]);

  // Handle Admin Save (Persist to DB)
  const handleAdminSave = async (coords: Coordinates, ip: string) => {
    setIsManualMode(true);
    setManualCoords(coords);
    setManualIp(ip);

    // Update Local Config
    const newConfig = {
      ...companyConfig,
      location: { latitude: coords.latitude, longitude: coords.longitude },
      allowedIpPrefix: ip
    };
    setCompanyConfig(newConfig);

    // Update main state immediately
    setCurrentLocation(coords);
    setCurrentIp(ip);
    const dist = calculateDistance(coords, newConfig.location);
    setDistance(dist);
    setErrorMsg(null); // Clear errors

    // Persist to Supabase
    try {
      // Save Location
      await supabase.from('settings').upsert({
        key: 'company_location',
        value: { lat: coords.latitude, lng: coords.longitude, radius: companyConfig.allowedRadiusMeters }
      });
      // Save IP
      await supabase.from('settings').upsert({
        key: 'wifi_ip',
        value: ip
      });

      triggerNotification('Lưu cấu hình', 'Đã lưu GPS/IP mới vào hệ thống');
    } catch (err) {
      console.error("Failed to save settings:", err);
      triggerNotification('Lỗi', 'Không thể lưu vào database');
    }
  };


  // Excel Import Handler
  const handleImportExcel = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(sheet);

        const newLogs: any[] = [];
        let successCount = 0;
        let failCount = 0;

        for (const row of json) {
          // Flexible Column Mapping (English & Vietnamese)
          const email = row['Email'] || row['email'];
          const name = row['Name'] || row['Tên'] || row['Tên nhân viên'];
          const code = row['Code'] || row['Mã NV'] || row['MNV'];

          const timeVal = row['Timestamp'] || row['Date'] || row['Ngày'] || row['Thời gian'];
          const type = row['Type'] || row['Loại'] || 'IN_MORNING';

          // Multi-strategy User Matching
          const user = employees.find(emp => {
            if (email && emp.email?.toLowerCase().trim() === email.toString().toLowerCase().trim()) return true;
            if (code && emp.id === code.toString().trim()) return true;
            if (name && emp.name.toLowerCase().trim() === name.toString().toLowerCase().trim()) return true;
            return false;
          });

          if (user && timeVal) {
            let timestamp: Date;
            if (typeof timeVal === 'number') {
              // Convert Excel serial date
              timestamp = new Date((timeVal - (25567 + 2)) * 86400 * 1000);
            } else {
              timestamp = new Date(timeVal);
            }

            if (!isNaN(timestamp.getTime())) {
              // Guard: Tháng đã chốt lương
              if (isMonthLocked(timestamp, lockedMonths)) {
                failCount++;
                continue;
              }

              newLogs.push({
                user_id: user.id,
                type: type,
                timestamp: timestamp.toISOString(),
                ip: 'Excel Import',
                location_lat: 0,
                location_lng: 0,
                is_valid_location: true,
                note: `Imported (Source: ${email || name || code})`
              });
              successCount++;
            } else {
              failCount++;
            }
          } else {
            failCount++;
          }
        }

        if (newLogs.length > 0) {
          const { error } = await supabase.from('attendance_logs').insert(newLogs);
          if (error) throw error;
          alert(`✅ NHẬP THÀNH CÔNG!\n\n- Đã thêm: ${successCount} dòng.\n- Bỏ qua/Lỗi: ${failCount} dòng.\n\n(Đã khớp nhân viên theo Email/Tên/Mã)`);
        } else {
          alert("⚠️ KHÔNG CÓ DỮ LIỆU ĐƯỢC NHẬP!\n\nLý do có thể:\n1. Không tìm thấy cột 'Email', 'Tên' hoặc 'Ngày' trong file.\n2. Tên nhân viên trong file không khớp với hệ thống.\n3. Định dạng ngày tháng không hợp lệ.");
        }

      } catch (err: any) {
        alert("Lỗi xử lý file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Backup Handler
  const handleBackup = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      employees,
      logs,
      requests: {
        ot: otRequests,
        late: lateRequests,
        leave: leaveRequests,
        advance: advanceRequests
      },
      bonuses,
      holidays,
      overrides
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-timekeeper-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // NEW CENTRALIZED HANDLER FOR OPENING ADVANCE MODAL
  const handleOpenAdvanceModal = (targetUser: UserProfile | null = null) => {
    const userToCheck = targetUser || currentUser;
    if (!userToCheck) return;

    let limit = 0;
    const currentMonth = new Date();

    // 1. If currently viewing OWN salary report on Salary Tab, use it directly (Most accurate)
    if (!targetUser && activeTab === 'salary' && salaryReport && isSameMonth(salaryReport.month, currentMonth)) {
      limit = Math.max(0, salaryReport.netSalary);
    }
    // 2. If Admin viewing someone else, OR failing above, calculate on the fly
    else {
      // Use existing state data if available, or fallbacks
      const targetLogs = logs.filter(l => l.userId === userToCheck.id);

      const tempReport = calculateMonthlySalary(
        currentMonth,
        targetLogs,
        otRequests.filter(r => r.userId === userToCheck.id),
        lateRequests.filter(r => r.userId === userToCheck.id),
        advanceRequests.filter(r => r.userId === userToCheck.id),
        bonuses.filter(b => b.userId === userToCheck.id),
        userToCheck,
        overrides.filter(o => o.userId === userToCheck.id),
        holidays
      );
      limit = Math.max(0, tempReport.netSalary);
    }

    // Set state and open
    setCurrentAdvanceLimit(limit);
    setRequestTargetUser(targetUser); // If null, means current user
    setIsAdvanceModalOpen(true);
  };

  // Helper Wrappers for specific components
  const handleRequestAdvanceFromSalaryView = () => {
    handleOpenAdvanceModal(null); // Current User
  };

  const handleRequestAdvanceFromAdmin = (type: string, target: UserProfile) => {
    if (type === 'ADVANCE') {
      handleOpenAdvanceModal(target);
    } else if (type === 'LEAVE') {
      setRequestTargetUser(target);
      setIsLeaveModalOpen(true);
    }
  };

  const handleAttendanceClick = (type: AttendanceType) => {
    // Guard: Tháng đã chốt lương
    if (isMonthLocked(new Date(), lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    const isAdminUser = currentUser?.role === 'Admin';
    // Calculate IP validity early to allow bypassing GPS check if IP is valid
    const isValidIp = currentIp === companyConfig.allowedIpPrefix || (companyConfig.allowedIpPrefix && currentIp.startsWith(companyConfig.allowedIpPrefix));

    // Guard: Missing GPS (Only block if IP is ALSO invalid)
    if (!currentLocation && !isManualMode && !isAdminUser && !isValidIp) {
      fetchRealLocationData();
      setFailureReasons(['Đang xác định vị trí...', 'Vui lòng đợi 3 giây rồi thử lại.', 'Hãy đảm bảo đã BẬT GPS trên điện thoại.']);
      setIsFailureModalOpen(true);
      return;
    }

    // STRICT LOCATION & IP ENFORCEMENT
    // Allow Admin to bypass
    if (!isManualMode && !isAdminUser) {
      const isValidDistance = distance !== null && distance <= companyConfig.allowedRadiusMeters;

      if (!isValidDistance && !isValidIp) {
        setFailureReasons([
          `Khoảng cách: ${Math.round(distance || 0)}m (Yêu cầu < ${companyConfig.allowedRadiusMeters}m)`,
          `Wifi/IP: ${currentIp} (Yêu cầu: ${companyConfig.allowedIpPrefix || 'Chưa cấu hình'})`
        ]);
        setIsFailureModalOpen(true);
        return;
      }
    }

    if (type === AttendanceType.OT_MORNING || type === AttendanceType.OT_AFTERNOON) {
      setPendingOtType(type);
      setIsOtModalOpen(true);
      return;
    }

    processAttendance(type);
  };

  const handleSubmitOtRequest = async (reason: string) => {
    if (pendingOtType && currentUser) {
      // Guard: Tháng đã chốt lương
      if (isMonthLocked(new Date(), lockedMonths)) {
        alert(LOCKED_MONTH_MSG);
        return;
      }

      // 1. Attempt Check-in First (Crucial)
      const isCheckInSuccess = await processAttendance(pendingOtType, `Auto-checkin for OT Request: ${reason}`);

      if (!isCheckInSuccess) {
        alert("⚠️ CHẤM CÔNG THẤT BẠI!\n\nKhông thể lưu giờ chấm công nên Đơn Tăng Ca cũng bị hủy.\nVui lòng kiểm tra kết nối mạng và thử lại.");
        return;
      }

      // 2. If Check-in success, proceed to Create Request
      const shift = pendingOtType === AttendanceType.OT_MORNING ? 'MORNING' : 'AFTERNOON';

      const newRequest: OTRequest = {
        id: Date.now().toString(),
        date: new Date(),
        shift: shift,
        reason: reason,
        status: 'PENDING',
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        userRole: currentUser.role
      };

      setOtRequests(prev => [...prev, newRequest]);

      setIsOtModalOpen(false);
      setPendingOtType(null);

      // Persist to Supabase
      try {
        const { error } = await supabase.from('requests').insert({
          user_id: currentUser.id,
          type: 'OT',
          date: new Date().toISOString(),
          shift: shift,
          reason: reason,
          status: 'PENDING'
        });
        if (error) {
          console.error("Error inserting OT request:", error);
          // Note: Check-in succeeded but Request failed saving. Edge case.
          alert("✅ Đã chấm công thành công!\n⚠️ Tuy nhiên có lỗi khi lưu Đơn Tăng Ca. Vui lòng tạo lại đơn trong mục 'Lịch Sử'.");
        } else {
          // Success both
          triggerNotification("Thành công", "Đã chấm công và nộp đơn tăng ca thành công.");
          sendPushToManagers('⏰ Đơn tăng ca mới', `${currentUser.name} đã gửi đơn tăng ca.`);
        }
      } catch (err) {
        console.error("Error saving OT request:", err);
      }
    }
  };

  const handleExplainLate = (date: Date, minutes: number) => {
    setPendingLateDate(date);
    setPendingLateMinutes(minutes);
    setIsLateModalOpen(true);
  };

  const handleSubmitLateExplanation = async (reason: string) => {
    if (pendingLateDate && currentUser) {
      // Guard: Tháng đã chốt lương
      if (isMonthLocked(pendingLateDate, lockedMonths)) {
        alert(LOCKED_MONTH_MSG);
        return;
      }

      const payload = {
        user_id: currentUser.id,
        type: 'LATE',
        date: format(pendingLateDate, 'yyyy-MM-dd'),
        reason: reason,
        minutes_late: pendingLateMinutes,
        status: 'PENDING'
      };

      const newRequest: LateRequest = {
        id: Date.now().toString(),
        date: pendingLateDate,
        reason: reason,
        minutesLate: pendingLateMinutes,
        status: 'PENDING',
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        userRole: currentUser.role
      };

      setLateRequests(prev => [...prev, newRequest]);
      setIsLateModalOpen(false);
      setPendingLateDate(null);

      await supabase.from('requests').insert(payload);
      sendPushToManagers('🕐 Giải trình đi trễ', `${currentUser.name} đã gửi giải trình đi trễ ${pendingLateMinutes} phút.`);
    }
  };

  const handleAdminCreateRequest = (type: 'LEAVE' | 'ADVANCE', target: UserProfile) => {
    if (type === 'LEAVE') {
      setLeaveRequestTargetUser(target);
      setIsLeaveModalOpen(true);
    } else if (type === 'ADVANCE') {
      setRequestTargetUser(target);
      setIsAdvanceModalOpen(true);
    }
  };

  const handleSubmitAdvanceRequest = async (amount: number, reason: string) => {
    // Use target user if set (Admin mode), otherwise current user
    const target = requestTargetUser || currentUser;
    const isAdminAction = !!requestTargetUser; // True if creating for someone else (Admin)

    if (target) {
      // Guard: Tháng đã chốt lương
      if (isMonthLocked(new Date(), lockedMonths)) {
        alert(LOCKED_MONTH_MSG);
        return;
      }

      // 1. Get or Calculate Current Net Salary
      let netSalary = 0;
      const currentMonth = new Date();

      // If the target is current user AND salaryReport is already calculated, use it
      if (target.id === currentUser?.id && salaryReport && isSameMonth(salaryReport.month, currentMonth)) {
        netSalary = salaryReport.netSalary;
      } else {
        // Otherwise, calculate it on-the-fly
        const tempSalary = calculateMonthlySalary(
          currentMonth,
          logs.filter(l => l.userId === target.id),
          otRequests.filter(r => r.userId === target.id),
          lateRequests.filter(r => r.userId === target.id),
          advanceRequests.filter(r => r.userId === target.id),
          bonuses.filter(b => b.userId === target.id),
          target,
          overrides.filter(o => o.userId === target.id),
          holidays
        );
        netSalary = tempSalary.netSalary;
      }

      // 2. Calculate Pending Advances (not yet deducted)
      const pendingAmount = advanceRequests
        .filter(r => r.userId === target.id && isSameMonth(r.date, currentMonth) && r.status === 'PENDING')
        .reduce((sum, r) => sum + r.amount, 0);

      const maxAllowed = netSalary - pendingAmount;

      if (amount > maxAllowed) {
        const formatVND = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('vi-VN');
        alert(`❌ KHÔNG THỂ TẠO ĐƠN!\n\nSố tiền tạm ứng vượt quá thực lãnh hiện tại.\n\n- Thực lãnh: ${Math.floor(netSalary).toLocaleString('vi-VN')} đ\n- Đang chờ duyệt: ${pendingAmount.toLocaleString('vi-VN')} đ\n- Khả dụng: ${formatVND(maxAllowed)} đ`);
        return;
      }

      const status = isAdminAction ? 'APPROVED' : 'PENDING';

      const payload = {
        user_id: target.id,
        type: 'ADVANCE',
        amount: amount,
        reason: reason,
        status: status
      };

      const newRequest: SalaryAdvanceRequest = {
        id: Date.now().toString(),
        date: new Date(),
        amount: amount,
        reason: reason,
        status: status as RequestStatus,
        userId: target.id,
        userName: target.name,
        userAvatar: target.avatar,
        userRole: target.role
      };
      setAdvanceRequests(prev => [...prev, newRequest]);
      await supabase.from('requests').insert(payload);

      if (isAdminAction) {
        triggerNotification('Đã tạo đơn ứng lương', `Đã tạo và duyệt đơn cho ${target.name}`);
        setRequestTargetUser(null);
        sendPushToUser(target.id, '💰 Đơn ứng lương', `Admin đã tạo và duyệt đơn ứng lương cho bạn.`);
      } else {
        sendPushToManagers('💰 Đơn ứng lương mới', `${target.name} đã gửi đơn ứng lương ${amount.toLocaleString('vi-VN')} đ.`);
      }
    }
  };

  const handleSubmitLeaveRequest = async (data: { startDate: string, endDate: string, type: LeaveType, duration: LeaveDuration, reason: string }) => {
    // Use target user if set (Admin mode), otherwise current user
    const target = leaveRequestTargetUser || currentUser;
    const isAdminAction = !!leaveRequestTargetUser; // True if creating for someone else (Admin)

    if (target) {
      // Guard: Tháng đã chốt lương (kiểm tra cả tháng bắt đầu và kết thúc)
      if (isMonthLocked(new Date(data.startDate), lockedMonths)) {
        alert(LOCKED_MONTH_MSG);
        return;
      }
      if (data.startDate !== data.endDate && isMonthLocked(new Date(data.endDate), lockedMonths)) {
        alert(LOCKED_MONTH_MSG);
        return;
      }

      const status = isAdminAction ? 'APPROVED' : 'PENDING';

      // NEW: Check monthly quota for PAID leave (1 day per month policy)
      let finalLeaveType = data.type;
      const paidUsedThisMonth = getPaidLeaveUsedThisMonth(target.id, leaveRequests, new Date(data.startDate));

      // Calculate requested days
      const dayDiff = differenceInDays(new Date(data.endDate), new Date(data.startDate)) + 1;
      const requestedDays = data.startDate === data.endDate && data.duration !== 'FULL' ? 0.5 : dayDiff;

      // BLOCK if PAID leave quota exceeded
      if (data.type === 'PAID') {
        const remainingQuota = Math.max(0, 1 - paidUsedThisMonth);

        if (remainingQuota <= 0 || requestedDays > remainingQuota) {
          alert(`🚫 KHÔNG THỂ GỬI ĐƠN!\n\nBạn đã sử dụng hết ${paidUsedThisMonth}/1 ngày phép có lương tháng này.\nMỗi tháng chỉ được nghỉ 1 ngày phép có lương, không cộng dồn.\n\nVui lòng chọn "Không lương" nếu vẫn muốn xin nghỉ.`);
          return;
        }
        // else: quota is sufficient, keep as PAID
      }

      const payload = {
        user_id: target.id,
        type: 'LEAVE',
        start_date: new Date(data.startDate).toISOString(),
        end_date: new Date(data.endDate).toISOString(),
        leave_type: finalLeaveType, // Use converted type
        leave_duration: data.duration,
        reason: data.reason,
        status: status
      };

      const newRequest: LeaveRequest = {
        id: Date.now().toString(),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        leaveType: finalLeaveType, // Use converted type
        duration: data.duration,
        reason: data.reason,
        status: status as RequestStatus,
        userId: target.id,
        userName: target.name,
        userAvatar: target.avatar,
        userRole: target.role
      };
      setLeaveRequests(prev => [...prev, newRequest]);
      setIsLeaveModalOpen(false);
      setLeaveRequestTargetUser(null); // Reset after submit

      const { error } = await supabase.from('requests').insert(payload);

      if (!error) {
        if (isAdminAction) {
          triggerNotification('Đã tạo đơn nghỉ phép', `Đã tạo và duyệt đơn cho ${target.name}`);
          // Notify employee
          sendPushToUser(target.id, '📋 Đơn nghỉ phép', `Admin đã tạo và duyệt đơn nghỉ phép cho bạn.`);
        } else {
          // Notify managers/admin
          sendPushToManagers('📋 Đơn nghỉ phép mới', `${target.name} đã gửi đơn xin nghỉ phép.`);
        }
      }
    }
  };

  // Bonus/Penalty Handlers
  const handleAddBonus = async (bonus: Omit<BonusFine, 'id'>) => {
    // Guard: Tháng đã chốt lương
    if (isMonthLocked(bonus.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    // Optimistic
    const tempId = Date.now().toString();
    const newBonus: BonusFine = { ...bonus, id: tempId };
    setBonuses(prev => [...prev, newBonus]);

    const { data, error } = await supabase.from('bonuses').insert([{
      user_id: bonus.userId,
      date: bonus.date.toISOString(),
      amount: bonus.amount,
      type: bonus.type,
      reason: bonus.reason
    }]).select().single();

    if (error) {
      alert("Lỗi thêm thưởng/phạt: " + error.message);
      setBonuses(prev => prev.filter(b => b.id !== tempId));
    } else {
      // Replace temp with real
      setBonuses(prev => prev.map(b => b.id === tempId ? { ...b, id: data.id } : b));
    }
  };

  const handleUpdateBonus = async (updatedBonus: BonusFine) => {
    // Guard: Tháng đã chốt lương
    if (isMonthLocked(updatedBonus.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    // Optimistic
    setBonuses(prev => prev.map(b => b.id === updatedBonus.id ? updatedBonus : b));

    // DB Update
    const { error } = await supabase.from('bonuses').update({
      amount: updatedBonus.amount,
      reason: updatedBonus.reason,
      type: updatedBonus.type,
      date: updatedBonus.date.toISOString(),
      user_id: updatedBonus.userId
    }).eq('id', updatedBonus.id);

    if (error) {
      console.error("Update bonus error:", error);
      alert("Lỗi cập nhật: " + error.message);
      // Rollback to come... strict rollback might need fetching or deep copy.
      // For now, accept optimistic deviation or refetch.
      fetchAllData();
    }
  };


  const handleBulkAddBonus = async (items: Omit<BonusFine, 'id'>[]) => {
    // Guard: Tháng đã chốt lương (kiểm tra tất cả items)
    const lockedItem = items.find(item => isMonthLocked(item.date, lockedMonths));
    if (lockedItem) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    const nowStr = new Date().toISOString();
    // 1. Prepare payloads
    const payloads = items.map(item => ({
      user_id: item.userId,
      date: item.date.toISOString(),
      amount: item.amount,
      type: item.type,
      reason: item.reason,
      created_at: nowStr
    }));

    // 2. Optimistic Update
    const tempItems = items.map((item, idx) => ({
      ...item,
      id: `temp_bulk_${Date.now()}_${idx}`,
      createdAt: new Date(nowStr)
    }));
    setBonuses(prev => [...prev, ...tempItems]);

    // 3. Send to Supabase
    const { data, error } = await supabase.from('bonuses').insert(payloads).select();

    if (error) {
      console.error("Bulk insert failed:", error);
      alert("Lỗi lưu danh sách: " + error.message);
      // Rollback
      const tempIds = tempItems.map(t => t.id);
      setBonuses(prev => prev.filter(b => !tempIds.includes(b.id)));
    } else {
      // 4. Update with real IDs
      // Since bulk insert might return in different order, we should probably just refetch or rely on IDs if mapped correctly. 
      // For simplicity/safety, let's just refetch all bonuses or keeping optimistic (IDs will be temp but data is correct).
      // Ideally we map back. Supabase returns inserted rows.
      if (data) {
        const realItems = data.map((b: any) => ({
          id: b.id,
          userId: b.user_id,
          date: new Date(b.date),
          amount: b.amount,
          type: b.type,
          reason: b.reason,
          createdAt: b.created_at ? new Date(b.created_at) : new Date(nowStr)
        }));

        // Remove temp and add real
        const tempIds = tempItems.map(t => t.id);
        setBonuses(prev => [...prev.filter(b => !tempIds.includes(b.id)), ...realItems]);

        setSuccessMsg(`✅ Đã lưu thành công ${data.length} mục!`);
        setIsSuccessModalOpen(true);
        setTimeout(() => setIsSuccessModalOpen(false), 3000);
      }
    }
  }; const handleDeleteBonus = async (id: string) => {
    // Guard: Tháng đã chốt lương
    const bonus = bonuses.find(b => b.id === id);
    if (bonus && isMonthLocked(bonus.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    setBonuses(prev => prev.filter(b => b.id !== id));
    await supabase.from('bonuses').delete().eq('id', id);
  };

  const handleDeleteBonusBatch = async (ids: string[]) => {
    // Guard: Tháng đã chốt lương
    const lockedBonus = bonuses.find(b => ids.includes(b.id) && isMonthLocked(b.date, lockedMonths));
    if (lockedBonus) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    setBonuses(prev => prev.filter(b => !ids.includes(b.id)));
    await supabase.from('bonuses').delete().in('id', ids);
  };

  const handleConfirmSalary = async () => {
    if (!currentUser) return;

    // Use last day of month as date
    const targetDate = new Date(currentSalaryMonth.getFullYear(), currentSalaryMonth.getMonth() + 1, 0);

    const newConfirm: BonusFine = {
      id: `confirm-${Date.now()}`,
      userId: currentUser.id,
      date: targetDate,
      amount: 0,
      type: 'BONUS',
      reason: 'CONFIRMATION: Salary Month ' + format(currentSalaryMonth, 'MM/yyyy'),
      createdAt: new Date()
    };

    // Optimistic
    setBonuses(prev => [...prev, newConfirm]);
    setIsSalaryConfirmModalOpen(false);

    const { data, error } = await supabase.from('bonuses').insert([{
      user_id: currentUser.id,
      date: targetDate.toISOString(),
      amount: 0,
      type: 'BONUS',
      reason: newConfirm.reason,
      created_at: newConfirm.createdAt?.toISOString()
    }]).select();

    if (error) {
      alert('Lỗi khi xác nhận: ' + error.message);
      setBonuses(prev => prev.filter(b => b.id !== newConfirm.id));
    } else {
      setBonuses(prev => prev.map(b => b.id === newConfirm.id ? { ...b, id: data[0].id } : b));
      setSuccessMsg('Đã xác nhận chốt lương thành công!');
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  };

  const handleImportBonuses = async (userId: string) => {
    // Simulate importing 2 records for the user
    const newBonuses: BonusFine[] = [
      {
        id: Date.now().toString() + '_1',
        userId: userId,
        date: new Date(),
        amount: 200000,
        type: 'BONUS',
        reason: 'Thưởng KPI tháng (Imported)'
      },
      {
        id: Date.now().toString() + '_2',
        userId: userId,
        date: new Date(),
        amount: 50000,
        type: 'PENALTY',
        reason: 'Đi muộn 3 lần (Imported)'
      }
    ];
    setBonuses(prev => [...prev, ...newBonuses]);

    // Persist
    const payload = newBonuses.map(b => ({
      user_id: b.userId,
      date: b.date.toISOString(),
      amount: b.amount,
      type: b.type,
      reason: b.reason
    }));
    await supabase.from('bonuses').insert(payload);
  };

  const handleImportBonusesGeneral = async () => {
    // Simulate bulk import for multiple users
    const newBonuses: BonusFine[] = [];
    employees.forEach(emp => {
      if (Math.random() > 0.7) { // 30% chance per employee
        newBonuses.push({
          id: Date.now().toString() + Math.random(),
          userId: emp.id,
          date: new Date(),
          amount: 500000,
          type: 'BONUS',
          reason: 'Thưởng tháng (File Excel)'
        });
      }
    });
    const payload = newBonuses.map(b => ({
      user_id: b.userId, // random ID might fail if not in auth/profiles? 
      // Wait, MOCK_EMPLOYEES might have IDs not in DB?
      // If these are real employees fetched from DB, they have real IDs.
      date: b.date.toISOString(),
      amount: b.amount,
      type: b.type,
      reason: b.reason
    }));

    setBonuses(prev => [...prev, ...newBonuses]);
    await supabase.from('bonuses').insert(payload);
    alert(`Đã nhập thành công ${newBonuses.length} mục từ Excel và lưu vào Database.`);
    setIsGeneralBonusModalOpen(false);
  };

  // Override Handler
  const handleSaveOverride = async (data: Omit<OverrideLog, 'id'>) => {
    // Guard: Tháng đã chốt lương
    if (isMonthLocked(data.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    const payload = {
      user_id: data.userId,
      date: format(data.date, 'yyyy-MM-dd'), // Explicit format for DATE column
      in1: data.in1,
      out1: data.out1,
      in2: data.in2,
      out2: data.out2,
      work_days: data.workDays,
      note: data.note
    };

    const newOverride: OverrideLog = {
      ...data,
      id: Date.now().toString()
    };
    // Replace existing override for same date/user if exists
    setOverrides(prev => {
      const filtered = prev.filter(o => !(o.userId === data.userId && isSameDay(o.date, data.date)));
      return [...filtered, newOverride];
    });

    try {
      // Use UPSERT to handle updates to existing overrides
      const { error } = await supabase
        .from('attendance_overrides')
        .upsert(payload, { onConflict: 'user_id, date' });

      if (error) {
        console.error("Failed to save override:", error);
        alert("Lỗi lưu điều chỉnh: " + error.message);
      } else {
        triggerNotification('Đã lưu điều chỉnh', `Đã cập nhật công ngày ${format(data.date, 'dd/MM')}`);
      }
    } catch (err: any) {
      console.error("Error saving override:", err);
      alert("Lỗi kết nối: " + err.message);
    }
  };

  const handleUpdateOtStatus = async (id: string, status: RequestStatus) => {
    // Guard: Tháng đã chốt lương
    const otReq = otRequests.find(r => r.id === id);
    if (otReq && isMonthLocked(otReq.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    // Optimistic Update
    setOtRequests(prev => prev.map(req =>
      req.id === id ? { ...req, status } : req
    ));
    // Persist
    await supabase.from('requests').update({ status }).eq('id', id);
    // Push notification
    if (otReq) {
      const label = status === 'APPROVED' ? '✅ Đã duyệt' : '❌ Bị từ chối';
      sendPushToUser(otReq.userId, `${label} đơn tăng ca`, `Đơn tăng ca của bạn đã được ${status === 'APPROVED' ? 'duyệt' : 'từ chối'}.`);
    }
  };

  const handleUpdateLateStatus = async (id: string, status: RequestStatus) => {
    // Guard: Tháng đã chốt lương
    const lateReq = lateRequests.find(r => r.id === id);
    if (lateReq && isMonthLocked(lateReq.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    // Optimistic Update
    setLateRequests(prev => prev.map(req =>
      req.id === id ? { ...req, status } : req
    ));
    // Persist
    await supabase.from('requests').update({ status }).eq('id', id);
    // Push notification
    if (lateReq) {
      const label = status === 'APPROVED' ? '✅ Đã duyệt' : '❌ Bị từ chối';
      sendPushToUser(lateReq.userId, `${label} giải trình đi trễ`, `Giải trình đi trễ của bạn đã được ${status === 'APPROVED' ? 'chấp nhận' : 'từ chối'}.`);
    }
  };

  const handleUpdateAdvanceStatus = async (id: string, status: RequestStatus) => {
    // Guard: Tháng đã chốt lương
    const advReq = advanceRequests.find(r => r.id === id);
    if (advReq && isMonthLocked(advReq.date, lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    // Optimistic Update
    setAdvanceRequests(prev => prev.map(req =>
      req.id === id ? { ...req, status } : req
    ));
    // Persist
    await supabase.from('requests').update({ status }).eq('id', id);
    // Push notification
    if (advReq) {
      const label = status === 'APPROVED' ? '✅ Đã duyệt' : '❌ Bị từ chối';
      sendPushToUser(advReq.userId, `${label} đơn ứng lương`, `Đơn ứng lương của bạn đã được ${status === 'APPROVED' ? 'duyệt' : 'từ chối'}.`);
    }
  };

  const handleUpdateLeaveStatus = async (id: string, status: RequestStatus) => {
    const request = leaveRequests.find(r => r.id === id);
    if (!request) return;

    // Guard: Tháng đã chốt lương
    if (isMonthLocked(new Date(request.startDate), lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    const oldStatus = request.status;

    // 1. Optimistic Update Request State
    setLeaveRequests(prev => prev.map(req =>
      req.id === id ? { ...req, status } : req
    ));

    // 2. Persist Request Status
    await supabase.from('requests').update({ status }).eq('id', id);

    // Push notification to employee
    const label = status === 'APPROVED' ? '✅ Đã duyệt' : '❌ Bị từ chối';
    sendPushToUser(request.userId, `${label} đơn nghỉ phép`, `Đơn nghỉ phép của bạn đã được ${status === 'APPROVED' ? 'duyệt' : 'từ chối'}.`);

    // 3. Handle Balance Logic (Only if PAID leave)
    if (request.leaveType === 'PAID') {
      // Calculate number of days
      const dayDiff = differenceInDays(new Date(request.endDate), new Date(request.startDate)) + 1;
      let daysToDeduct = dayDiff;
      if (dayDiff === 1 && request.duration !== 'FULL') {
        daysToDeduct = 0.5;
      }

      let newBalance: number | undefined;
      const affectedUserId = request.userId;
      const empProfile = employees.find(e => e.id === affectedUserId);

      // If approving
      if (status === 'APPROVED' && oldStatus !== 'APPROVED') {
        if (empProfile) {
          newBalance = (empProfile.leaveBalance || 0) - daysToDeduct;
        }
      }
      // If reverting (Approval -> Pending/Rejected)
      else if (oldStatus === 'APPROVED' && status !== 'APPROVED') {
        if (empProfile) {
          newBalance = (empProfile.leaveBalance || 0) + daysToDeduct;
        }
      }

      // Perform Update if Balance Changed
      if (newBalance !== undefined && empProfile) {
        // Optimistic Update Profile
        const updatedEmployees = employees.map(emp => {
          if (emp.id === affectedUserId) {
            return { ...emp, leaveBalance: newBalance };
          }
          return emp;
        });
        setEmployees(updatedEmployees);

        // Sync current user if needed
        if (currentUser && currentUser.id === affectedUserId) {
          const me = updatedEmployees.find(e => e.id === currentUser.id);
          if (me) setCurrentUser(me);
        }

        // Persist Profile Balance
        await supabase.from('profiles').update({ leave_balance: newBalance }).eq('id', affectedUserId);
      }
    }
  };

  const handleAddEmployee = async (emp: UserProfile) => {
    // 1. Optimistic Update
    setEmployees([...employees, emp]);

    // 2. Persist to DB
    try {
      const payload = {
        id: emp.id, // Crypto UUID from form
        name: emp.name,
        role: emp.role,
        avatar: emp.avatar,
        email: emp.email,
        base_salary: emp.baseSalary,
        allowance: emp.allowance,
        work_days: emp.workDays,
        leave_balance: emp.leaveBalance,
        insurance_salary: emp.insuranceSalary,
        contract_type: emp.contractType,
        contract_date: emp.contractDate,
        employee_code: emp.employeeCode,
        status: emp.status,
        date_of_birth: emp.dateOfBirth
      };

      const { error } = await supabase.from('profiles').insert(payload);

      if (error) {
        console.error("Add employee error:", error);
        alert("Lỗi khi lưu nhân viên mới: " + error.message);
        // Rollback optimistic update
        setEmployees(prev => prev.filter(e => e.id !== emp.id));
      }
    } catch (err: any) {
      console.error("System error adding employee:", err);
      alert("Lỗi hệ thống: " + err.message);
    }
  };

  const handleEditEmployee = async (emp: UserProfile) => {
    // 1. Optimistic Update
    // 1. Optimistic Update
    setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));

    // Sync Current User if they are editing themselves
    if (currentUser && currentUser.id === emp.id) {
      setCurrentUser(emp);
    }

    // 2. Send to Supabase
    try {
      const payload = {
        name: emp.name,
        role: emp.role,
        avatar: emp.avatar,
        email: emp.email,
        // password: emp.password, // Don't save password to profile plain text unless requested
        base_salary: emp.baseSalary,
        allowance: emp.allowance,
        work_days: emp.workDays,
        leave_balance: emp.leaveBalance,
        insurance_salary: emp.insuranceSalary,
        contract_type: emp.contractType,
        contract_date: emp.contractDate,

        employee_code: emp.employeeCode, // Save to DB
        status: emp.status, // Fix: Save Status to DB
        date_of_birth: emp.dateOfBirth, // Save DOB
        used_leave_legacy: emp.usedLeaveLegacy, // Save Legacy Leave
        resignation_date: emp.resignationDate || null // Save Resignation Date
      };

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', emp.id);

      if (error) {
        console.error("Error updating profile:", error);
        alert("Lỗi lưu thông tin nhân viên: " + error.message);
        // Rollback?
      } else {
        // Success
      }
    } catch (err: any) {
      alert("Lỗi hệ thống: " + err.message);
    }
  };

  const handleSalaryChange = async (data: { baseSalary: number; allowance: number; insuranceSalary: number; effectiveDate: string; reason: string }) => {
    if (!viewingEmployee) return;

    // Guard: Tháng đã chốt lương
    if (isMonthLocked(new Date(data.effectiveDate), lockedMonths)) {
      alert(LOCKED_MONTH_MSG);
      return;
    }

    try {
      // 1. Insert into history
      const newChange: SalaryChange = {
        id: Date.now().toString(),
        userId: viewingEmployee.id,
        baseSalary: data.baseSalary,
        allowance: data.allowance,
        insuranceSalary: data.insuranceSalary,
        effectiveDate: data.effectiveDate,
        reason: data.reason,
        createdAt: new Date().toISOString()
      };

      // Optimistic Update History (Handle Add or Edit)
      setSalaryChanges(prev => {
        const index = prev.findIndex(c => c.userId === newChange.userId && c.effectiveDate === newChange.effectiveDate);
        if (index >= 0) {
          // Update existing
          const updated = [...prev];
          updated[index] = newChange;
          return updated;
        }
        // Add new
        return [...prev, newChange];
      });

      // DB Insert or Update (Upsert)
      const { error } = await supabase.from('salary_changes').upsert({
        user_id: newChange.userId,
        base_salary: newChange.baseSalary,
        allowance: newChange.allowance,
        insurance_salary: newChange.insuranceSalary,
        effective_date: newChange.effectiveDate,
        reason: newChange.reason
      }, { onConflict: 'user_id,effective_date' });

      if (error) throw error;

      // 2. Check if Effective Immediately (<= Today)
      // Comparison: effectiveDate (YYYY-MM-DD string) vs today
      // Logic: If effective date is in the past or today, we update the current profile values to be consistent.
      // But simpler: just compare Date objects.
      const isEffectiveNow = new Date(data.effectiveDate) <= new Date();

      if (isEffectiveNow) {
        // Update Profile
        const updatedProfile = {
          ...viewingEmployee,
          baseSalary: data.baseSalary,
          allowance: data.allowance,
          insuranceSalary: data.insuranceSalary
        };

        // Optimistic Update Employees
        setEmployees(prev => prev.map(e => e.id === viewingEmployee.id ? updatedProfile : e));
        if (currentUser?.id === viewingEmployee.id) setCurrentUser(updatedProfile);
        setViewingEmployee(updatedProfile); // Update view as well

        // DB Update
        await supabase.from('profiles').update({
          base_salary: data.baseSalary,
          allowance: data.allowance,
          insurance_salary: data.insuranceSalary
        }).eq('id', viewingEmployee.id);

        triggerNotification('Đã cập nhật lương', `Lương mới đã được áp dụng ngay lập tức.`);
      } else {
        triggerNotification('Đã lên lịch tăng lương', `Lương mới sẽ áp dụng từ ngày ${format(new Date(data.effectiveDate), 'dd/MM/yyyy')}`);
      }

    } catch (err: any) {
      console.error("Error saving salary change:", err);
      alert("Lỗi lưu thay đổi lương: " + err.message);
    }
  };

  const handleDeleteSalaryChange = async (id: string, userId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa mốc lịch sử lương này không?")) return;

    try {
      // Optimistic Update
      setSalaryChanges(prev => prev.filter(c => c.id !== id));

      // DB Delete
      const { error } = await supabase.from('salary_changes').delete().eq('id', id);
      if (error) throw error;

      triggerNotification('Đã xóa', 'Đã xóa bản ghi lịch sử lương.');

      // Note: If the deleted record was the "current" one, the profile data in DB might be out of sync until next update.
      // Ideally we should re-calculate effective salary here, but letting user manage it is acceptable for this hotfix.

    } catch (err: any) {
      alert("Lỗi xóa: " + err.message);
      // Revert optimistic? 
      fetchAllData();
    }
  };

  const handleDeleteEmployee = async (id: string) => {

    // 1. Optimistic Update
    setEmployees(employees.map(e => e.id === id ? { ...e, status: 'LOCKED' } : e));
    // 2. Persist
    await supabase.from('profiles').update({ status: 'LOCKED' }).eq('id', id);
    alert("Đã khóa tài khoản nhân viên (Soft Delete). Bạn có thể khôi phục ở mục 'Tài khoản đang khóa'.");
  };

  const handleRestoreEmployee = async (id: string) => {
    // 1. Optimistic Update
    setEmployees(employees.map(e => e.id === id ? { ...e, status: 'ACTIVE' } : e));
    // 2. Persist
    await supabase.from('profiles').update({ status: 'ACTIVE' }).eq('id', id);
    alert("Đã khôi phục tài khoản nhân viên thành công.");
  };

  const handlePermanentDeleteEmployee = async (id: string) => {
    if (!window.confirm("CẢNH BÁO CAO ĐỘ:\nHành động này sẽ xóa VĨNH VIỄN toàn bộ dữ liệu lịch sử chấm công, lương thưởng của nhân viên này.\n\nDữ liệu sẽ KHÔNG THỂ khôi phục được.\nBạn có chắc chắn muốn tiếp tục?")) {
      return;
    }

    // 1. Optimistic Update
    setEmployees(employees.filter(e => e.id !== id));

    // 2. Persist
    const { error } = await supabase.from('profiles').delete().eq('id', id);

    if (error) {
      console.error("Delete failed:", error);
      alert("Xóa thất bại (Có thể do ràng buộc dữ liệu): " + error.message);
      fetchAllData(); // Re-sync
    } else {
      alert("Đã hủy hồ sơ nhân viên vĩnh viễn.");
    }
  };

  const handleViewEmployee = (emp: UserProfile) => {
    setViewingEmployee(emp);
  };

  const handleBackFromView = () => {
    setViewingEmployee(null);
  };

  const processAttendance = async (type: AttendanceType, note?: string): Promise<boolean> => {
    if (!currentUser) return false;
    if (isProcessingAttendance) return false; // Prevent double-tap
    setIsProcessingAttendance(true);

    const isValidDistance = distance !== null && distance <= companyConfig.allowedRadiusMeters;
    const isValidIp = currentIp === companyConfig.allowedIpPrefix || (companyConfig.allowedIpPrefix && currentIp.startsWith(companyConfig.allowedIpPrefix));
    const isValid = isValidDistance || isValidIp;

    const newLogPayload = {
      user_id: currentUser.id,
      type,
      timestamp: new Date().toISOString(),
      location_lat: currentLocation?.latitude ?? null,
      location_lng: currentLocation?.longitude ?? null,
      ip: currentIp,
      is_valid_location: isValid,
      note: note
    };

    // Optimistic UI Update
    const tempId = 'temp-' + Date.now().toString();
    const newLog: AttendanceLog = {
      id: tempId,
      userId: currentUser.id,
      type,
      timestamp: new Date(),
      location: {
        lat: currentLocation?.latitude || 0,
        lng: currentLocation?.longitude || 0
      },
      ip: currentIp,
      isValidLocation: isValid,
      note: note
    };
    setLogs(prev => [newLog, ...prev]);

    // Send to Supabase
    try {
      console.log("Attempting to insert log:", newLogPayload);
      const { data, error } = await supabase.from('attendance_logs').insert([newLogPayload]).select();

      if (error) {
        console.error("Failed to save log:", error);
        alert(`Lỗi lưu chấm công (DEBUG):\nMã lỗi: ${error.code}\nChi tiết: ${error.message}\nHint: ${error.hint || 'N/A'}`);
        // Rollback optimistic update
        setLogs(prev => prev.filter(l => l.id !== tempId));
        setIsProcessingAttendance(false);
        return false;
      }

      // Check for RLS silent failure (insert returns success but no data)
      if (!data || data.length === 0) {
        console.error("RLS silent failure: insert returned no data", data);
        alert("⚠️ CHẤM CÔNG THẤT BẠI!\n\nHệ thống không ghi nhận được log.\nVui lòng liên hệ Admin để kiểm tra quyền truy cập database.");
        setLogs(prev => prev.filter(l => l.id !== tempId));
        setIsProcessingAttendance(false);
        return false;
      }

      console.log("INSERT SUCCESS. Saved Data:", data);

      // Replace temp ID with real DB ID
      if (data[0]?.id) {
        setLogs(prev => prev.map(l => l.id === tempId ? { ...l, id: data[0].id.toString() } : l));
      }

      // Show Success Notification based on Type
      const msg = type.includes('IN') ? "Đã vào ca thành công!" : (type.includes('OUT') ? "Đã ra ca thành công!" : "Chấm công thành công!");
      setSuccessMsg(msg);
      setIsSuccessModalOpen(true);

      // Auto-close after 3 seconds
      setTimeout(() => setIsSuccessModalOpen(false), 3000);

      setIsProcessingAttendance(false);
      return true;
    } catch (err: any) {
      console.error("System Exception:", err);
      alert("Lỗi hệ thống (Exception): " + (err.message || JSON.stringify(err)));
      setLogs(prev => prev.filter(l => l.id !== tempId));
      setIsProcessingAttendance(false);
      return false;
    }

  };

  const handleAddHoliday = async (startDate: string, endDate: string, name: string, duration: 'FULL' | 'MORNING' | 'AFTERNOON') => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Generate each day
    const days = eachDayOfInterval({ start, end });

    // Prepare payload
    const payload = days.map(d => ({
      date: format(d, 'yyyy-MM-dd'),
      name: name,
      duration: duration // Add duration to payload
    }));

    // Optimistic Update
    const tempHolidays: Holiday[] = payload.map(p => ({
      id: crypto.randomUUID(),
      date: new Date(p.date),
      name: p.name,
      duration: duration // Add duration to local state
    }));
    setHolidays(prev => [...prev, ...tempHolidays]);

    // Persist
    const { error } = await supabase.from('holidays').insert(payload);

    if (error) {
      console.error("Add holiday error:", error);
      alert("Lỗi khi lưu ngày lễ: " + error.message);
      fetchAllData(); // Revert
    } else {
      // Re-fetch to get real IDs
      const { data } = await supabase.from('holidays').select('*');
      if (data) {
        setHolidays(data.map((h: any) => ({
          id: h.id,
          date: new Date(h.date),
          name: h.name,
          duration: h.duration // Fetch duration from DB
        })));
      }
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    // Optimistic
    setHolidays(prev => prev.filter(h => h.id !== id));

    // Persist
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) {
      alert("Lỗi khi xóa ngày lễ: " + error.message);
      fetchAllData();
    }
  };

  const handleGenerateReport = async () => {
    if (!currentUser) return;
    setIsGeneratingReport(true);
    const report = await generateAttendanceReport(logs, currentUser.name);
    setAiReport(report);
    setIsGeneratingReport(false);
  };

  // Salary Report Calculation (Current User)
  const salaryReport = useMemo(() => {
    if (activeTab === 'salary' && currentUser) {
      return calculateMonthlySalary(
        currentSalaryMonth,
        myLogs,
        myOtRequests,
        myLateRequests,
        myAdvanceRequests,
        myBonuses,
        currentUser,
        myOverrides,
        holidays,
        salaryChanges,
        myLeaveRequests
      );
    }
    return null;
  }, [activeTab, myLogs, myOtRequests, myLateRequests, myAdvanceRequests, myBonuses, currentSalaryMonth, currentUser, holidays, myOverrides, salaryChanges, myLeaveRequests]);

  // Check Auth Loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  // PASSWORD RESET SCREEN
  if (showResetPassword) {
    const handleResetSubmit = async () => {
      setResetError('');
      if (!resetNewPassword || !resetConfirmPassword) {
        setResetError('Vui lòng nhập đầy đủ mật khẩu.');
        return;
      }
      if (resetNewPassword.length < 6) {
        setResetError('Mật khẩu phải có ít nhất 6 ký tự.');
        return;
      }
      if (resetNewPassword !== resetConfirmPassword) {
        setResetError('Mật khẩu xác nhận không khớp.');
        return;
      }
      try {
        const { error } = await supabase.auth.updateUser({ password: resetNewPassword });
        if (error) throw error;
        setResetSuccess(true);
        setTimeout(async () => {
          await supabase.auth.signOut();
          setShowResetPassword(false);
          setResetSuccess(false);
          setResetNewPassword('');
          setResetConfirmPassword('');
          setCurrentUser(null);
        }, 2000);
      } catch (err: any) {
        setResetError(err.message || 'Đặt lại mật khẩu thất bại.');
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
            <Lock size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Đặt lại mật khẩu</h2>
          <p className="text-sm text-gray-500 mb-6">Nhập mật khẩu mới cho tài khoản của bạn</p>

          {resetSuccess ? (
            <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm font-medium">
              ✅ Đổi mật khẩu thành công! Đang chuyển về trang đăng nhập...
            </div>
          ) : (
            <>
              {resetError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">{resetError}</div>
              )}
              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                  <input
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
                  <input
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <button
                  onClick={handleResetSubmit}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors active:scale-95"
                >
                  Xác nhận đổi mật khẩu
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // If not logged in, show Auth Screen
  if (!currentUser) {
    return (
      <AuthScreen
        employees={employees}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  // NEW: Block Pending Users
  if (currentUser.status === 'PENDING') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <div className="mx-auto w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-4">
            <Lock size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Tài khoản chờ duyệt</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Xin chào <b className="text-gray-900">{currentUser.name}</b>,<br />
            Tài khoản của bạn đang chờ Quản lý phê duyệt.<br />
            Vui lòng liên hệ Admin để được kích hoạt.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors active:scale-95"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  // Find current user's actual data in the employees array to get real-time Leave Balance
  const currentUserEmployee = employees.find(e => e.id === currentUser.id) || currentUser;
  const isAdmin = currentUser.role === 'Admin';

  const isAtCompany = distance !== null && distance <= companyConfig.allowedRadiusMeters;

  const pendingCount =
    otRequests.filter(r => r.status === 'PENDING').length +
    lateRequests.filter(r => r.status === 'PENDING').length +
    advanceRequests.filter(r => r.status === 'PENDING').length +
    leaveRequests.filter(r => r.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col items-center">

      {/* Mobile Container Limit */}
      <div className="w-full max-w-md bg-white h-screen shadow-2xl flex flex-col relative overflow-hidden">

        {/* DEBUG BANNER - TEMP */}
        {/*
        <div className="bg-black text-[10px] text-white p-1 text-center z-50 opacity-80 absolute top-0 w-full left-0 pointer-events-none">
           Role: {currentUser?.role} | Manual: {isManualMode.toString()} | AdminCheck: {(currentUser?.role === 'Admin').toString()} | IP: {currentIp}
        </div>
        */}

        {/* Header Background Pattern */}
        <div className="absolute top-0 left-0 w-full h-48 bg-gradient-to-br from-brand-600 to-brand-700 rounded-b-[40px] z-0"></div>

        {/* Top Bar (User & Admin) */}
        <div className="z-20 px-6 pt-8 pb-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <img
              src={currentUser.avatar}
              alt="User"
              className="w-12 h-12 rounded-full border-2 border-white/50 shadow-md object-cover bg-white"
            />
            <div>
              <p className="text-brand-100 text-xs font-medium">Xin chào, ({currentUser.role})</p>
              <h1 className="text-lg font-bold leading-tight">{currentUser.name}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            {!isManualMode && (
              <button
                onClick={fetchRealLocationData}
                className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm"
              >
                <RefreshCw size={18} className={loadingLocation ? "animate-spin" : ""} />
              </button>
            )}

            {/* Admin Config Button - Only for Admin */}
            {isAdmin && (
              <button
                onClick={() => setIsAdminOpen(true)}
                className={`p-2 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm relative ${isManualMode ? 'bg-orange-500 text-white animate-pulse' : 'bg-white/10'}`}
                title="Cấu hình Admin"
              >
                <Settings size={18} />
              </button>
            )}

            <PushNotificationToggle userId={currentUser.id} />

            <button
              onClick={handleLogout}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm text-red-200 hover:text-red-100"
              title="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="z-10 flex flex-col flex-1 px-6 overflow-y-auto no-scrollbar pb-24" ref={containerRef}>

          {activeTab === 'today' && (
            <div className="animate-fade-in">
              {/* Clock & Status Card */}
              <div className="bg-white rounded-3xl shadow-xl p-6 mb-8 border border-gray-100/50 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"></div>

                <DigitalClock />

                {/* GPS/IP Status */}
                <div className="mt-4 pt-4 border-t border-dashed border-gray-200 grid grid-cols-2 gap-4">
                  {/* GPS Column */}
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className={`flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wide mb-1 ${isAtCompany ? 'text-green-600' : 'text-red-500'}`}>
                      <MapPin size={14} />
                      <span>{loadingLocation ? 'Định vị...' : (isAtCompany ? 'Hợp lệ' : 'Ngoài vùng')}</span>
                    </div>
                    {isManualMode ? (
                      <span className="text-[10px] text-gray-400">📍 Manual GPS</span>
                    ) : currentLocation && distance !== null ? (
                      <div className="flex flex-col items-center">
                        <span className={`text-[10px] ${isAtCompany ? 'text-gray-400' : 'text-red-500 font-bold'}`}>
                          {Math.round(distance)}m tới công ty
                        </span>
                        {!isAtCompany && (
                          <span className="text-[9px] text-red-400 italic mt-0.5 animate-pulse">
                            (Hãy di chuyển về công ty)
                          </span>
                        )}
                      </div>
                    ) : (
                      !loadingLocation && (
                        <button
                          onClick={fetchRealLocationData}
                          className="mt-1 flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-700 transition-all active:scale-95"
                        >
                          <Navigation size={12} /> Yêu cầu GPS
                        </button>
                      )
                    )}
                  </div>

                  {/* IP Column */}
                  <div className="flex flex-col items-center justify-center text-center border-l border-gray-100">
                    {(() => {
                      const isValidIp = currentIp === companyConfig.allowedIpPrefix || currentIp.startsWith(companyConfig.allowedIpPrefix);
                      return (
                        <>
                          <div className={`flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wide mb-1 ${isValidIp ? 'text-green-600' : 'text-red-500'}`}>
                            <Wifi size={14} />
                            <span>{isValidIp ? 'IP Hợp lệ' : 'Sai IP'}</span>
                          </div>
                          <span className={`text-[10px] ${isValidIp ? 'text-gray-400' : 'text-red-500 font-bold'}`}>
                            {currentIp.length > 15 ? currentIp.substring(0, 12) + '...' : currentIp}
                          </span>
                          {!isValidIp && !isManualMode && (
                            <span className="text-[9px] text-red-400 italic mt-0.5 animate-pulse">
                              (Hãy kết nối Wifi công ty)
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {errorMsg && (
                  <div className="mt-3 flex items-center justify-between text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} />
                      <span>{errorMsg}</span>
                    </div>
                    <button
                      onClick={fetchRealLocationData}
                      className="text-[10px] font-bold bg-white border border-red-200 px-2 py-1 rounded shadow-sm text-red-600 active:scale-95"
                    >
                      Cấp quyền GPS
                    </button>
                  </div>
                )}
              </div>

              {/* Request Leave Button */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setIsLeaveModalOpen(true)}
                  className="flex items-center gap-1 text-xs font-bold bg-green-500 text-white px-3 py-2 rounded-lg shadow hover:bg-green-600 active:scale-95 transition-all"
                >
                  <Calendar size={14} /> Xin nghỉ phép
                </button>
              </div>

              {/* Grid Buttons */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
                <TimeButton
                  label="Tăng ca sáng"
                  icon={Sunrise}
                  colorClass="bg-purple-500 hover:bg-purple-600"
                  onClick={() => handleAttendanceClick(AttendanceType.OT_MORNING)}
                />
                <TimeButton
                  label="Vào sáng"
                  icon={LogIn}
                  colorClass="bg-emerald-500 hover:bg-emerald-600"
                  onClick={() => handleAttendanceClick(AttendanceType.IN_MORNING)}
                />
                <TimeButton
                  label="Ra sáng"
                  icon={LogOut}
                  colorClass="bg-rose-500 hover:bg-rose-600"
                  onClick={() => handleAttendanceClick(AttendanceType.OUT_MORNING)}
                />

                <TimeButton
                  label="Tăng ca chiều"
                  icon={Sunset}
                  colorClass="bg-indigo-500 hover:bg-indigo-600"
                  onClick={() => handleAttendanceClick(AttendanceType.OT_AFTERNOON)}
                />
                <TimeButton
                  label="Vào chiều"
                  icon={LogIn}
                  colorClass="bg-blue-500 hover:bg-blue-600"
                  onClick={() => handleAttendanceClick(AttendanceType.IN_AFTERNOON)}
                />
                <TimeButton
                  label="Ra chiều"
                  icon={LogOut}
                  colorClass="bg-orange-500 hover:bg-orange-600"
                  onClick={() => handleAttendanceClick(AttendanceType.OUT_AFTERNOON)}
                />
              </div>

              {/* Today History */}
              <AttendanceHistory logs={myLogs} />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="animate-fade-in pt-4">
              <MonthlyHistory
                viewingMonth={viewingMonth}
                onPrevMonth={() => setViewingMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                onNextMonth={() => setViewingMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                currentMonthLogs={myLogs}
                otRequests={myOtRequests}
                lateRequests={myLateRequests}
                overrides={myOverrides}
                onExplainLate={handleExplainLate}
                holidays={holidays}
                userRole={currentUser.role}
                leaveRequests={myLeaveRequests}
                advanceRequests={myAdvanceRequests}
                onFetchMonthData={fetchMonthData}
              />
            </div>
          )}

          {/* Admin Only Tabs */}
          {activeTab === 'requests' && isAdmin && (
            <div className="animate-fade-in pt-4">
              <RequestApproval
                otRequests={otRequests}
                lateRequests={lateRequests}
                advanceRequests={advanceRequests}
                leaveRequests={leaveRequests}
                onUpdateOtStatus={handleUpdateOtStatus}
                onUpdateLateStatus={handleUpdateLateStatus}
                onUpdateAdvanceStatus={handleUpdateAdvanceStatus}
                onUpdateLeaveStatus={handleUpdateLeaveStatus}
              />
            </div>
          )}

          {activeTab === 'hr' && isAdmin && (
            <div className="animate-fade-in pt-4 h-full">
              {!viewingEmployee ? (
                <EmployeeManagement
                  employees={employees}
                  onAdd={handleAddEmployee}
                  onEdit={handleEditEmployee}
                  onDelete={handleDeleteEmployee}
                  onRestore={handleRestoreEmployee}
                  onPermanentDelete={handlePermanentDeleteEmployee}
                  onView={handleViewEmployee}
                  onQuickBonus={() => setIsGeneralBonusModalOpen(true)}
                  leaveRequests={leaveRequests}
                />
              ) : (
                <AdminEmployeeDetail
                  employee={viewingEmployee}
                  onBack={handleBackFromView}
                  otRequests={otRequests}
                  lateRequests={lateRequests}
                  advances={advanceRequests}
                  bonuses={bonuses}
                  onAddBonus={handleAddBonus}
                  onUpdateBonus={handleUpdateBonus} // New
                  onDeleteBonus={handleDeleteBonus}
                  onImportBonuses={handleImportBonuses}
                  overrides={overrides}
                  onSaveOverride={handleSaveOverride}
                  holidays={holidays}
                  salaryChanges={salaryChanges}
                  logs={logs.filter(l => l.userId === viewingEmployee.id)}
                  onAddSalaryChange={handleSalaryChange}
                  onDeleteSalaryChange={handleDeleteSalaryChange}
                  onRequestCreate={handleAdminCreateRequest}
                  leaveRequests={leaveRequests}
                  lockedMonths={lockedMonths} // Pass prop
                />
              )}
            </div>
          )}

          {activeTab === 'salary' && salaryReport && (
            <div className="animate-fade-in pt-4">
              <SalaryView
                report={salaryReport}
                user={currentUser}
                selectedMonth={currentSalaryMonth}
                onMonthChange={setCurrentSalaryMonth}
                onRequestAdvance={() => handleOpenAdvanceModal(null)}
                bonuses={(() => {
                  const vb = getVirtualBirthdayBonus(currentUser, currentSalaryMonth);
                  return vb ? [...bonuses, vb] : bonuses;
                })()}
                salaryChanges={salaryChanges}
                isConfirmed={bonuses.some(b => b.userId === currentUser.id && b.type === 'BONUS' && b.reason?.startsWith('CONFIRMATION:') && isSameMonth(b.date, currentSalaryMonth))}
                onConfirmSalary={() => setIsSalaryConfirmModalOpen(true)}
              />

            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="animate-fade-in pt-4">
              <CompanyCalendar
                leaveRequests={leaveRequests}
                employees={visibleEmployees}
                holidays={holidays}
                currentUser={currentUser}
              />
            </div>
          )}

          {activeTab === 'payroll' && isAdmin && (
            <div className="animate-fade-in pt-4">
              <AdminPayrollManagement
                employees={visibleEmployees}
                logs={logs}
                otRequests={otRequests}
                lateRequests={lateRequests}
                advanceRequests={advanceRequests}
                bonuses={bonuses}
                overrides={overrides}
                holidays={holidays}
                salaryChanges={salaryChanges}
                leaveRequests={leaveRequests}
                onBulkSaveBonus={handleBulkAddBonus}
                onDeleteBonusBatch={handleDeleteBonusBatch}
                lockedMonths={lockedMonths}
                onFetchMonthData={fetchMonthData}
              />
            </div>
          )}
        </div>

        {/* Floating Action Button for AI (Only on Today Tab) */}


        {/* PWA Install Prompt */}
        <InstallPrompt />

        {/* Bottom Navigation */}
        <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-200 px-1 py-2 flex justify-between items-center z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'today' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Home size={20} strokeWidth={activeTab === 'today' ? 2.5 : 2} />
            <span className="text-[9px] font-bold whitespace-nowrap">Chấm công</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'history' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <CalendarDays size={20} strokeWidth={activeTab === 'history' ? 2.5 : 2} />
            <span className="text-[9px] font-bold whitespace-nowrap">Lịch sử</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'calendar' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Calendar size={20} strokeWidth={activeTab === 'calendar' ? 2.5 : 2} />
            <span className="text-[9px] font-bold whitespace-nowrap">Lịch</span>
          </button>

          {/* Admin Only Buttons */}
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('requests')}
                className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors relative ${activeTab === 'requests' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <div className="relative">
                  <FileCheck size={20} strokeWidth={activeTab === 'requests' ? 2.5 : 2} />
                  {pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold shadow-sm animate-bounce">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold whitespace-nowrap">Duyệt đơn</span>
              </button>
              <button
                onClick={() => setActiveTab('hr')}
                className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'hr' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <Users size={20} strokeWidth={activeTab === 'hr' ? 2.5 : 2} />
                <span className="text-[9px] font-bold whitespace-nowrap">Nhân sự</span>
              </button>
              <button
                onClick={() => setActiveTab('payroll')}
                className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'payroll' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <Briefcase size={20} strokeWidth={activeTab === 'payroll' ? 2.5 : 2} />
                <span className="text-[9px] font-bold whitespace-nowrap">Tác vụ</span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab('salary')}
            className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'salary' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <DollarSign size={20} strokeWidth={activeTab === 'salary' ? 2.5 : 2} />
            <span className="text-[9px] font-bold whitespace-nowrap">Lương</span>
          </button>
        </div>

        {/* Admin Panel Modal */}
        {isAdmin && (
          <AdminPanel
            isOpen={isAdminOpen}
            onClose={() => setIsAdminOpen(false)}
            onSave={handleAdminSave}
            initialCoords={companyConfig.location}
            initialIp={companyConfig.allowedIpPrefix}
            holidays={holidays}
            onAddHoliday={handleAddHoliday}
            onDeleteHoliday={handleDeleteHoliday}
            onBackup={handleBackup}
            onImportExcel={handleImportExcel}
          />
        )}

        {/* In-App Toast Notification */}
        {notification && (
          <div className="fixed top-4 right-4 z-[60] bg-white rounded-xl shadow-2xl p-4 max-w-sm animate-slide-in-right border-l-4 border-brand-500 flex items-start gap-3 pointer-events-auto cursor-pointer" onClick={() => setActiveTab('requests')}>
            <div className="bg-brand-50 p-2 rounded-full text-brand-600 shrink-0">
              <Bell size={24} />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900 text-sm">{notification.title}</h4>
              <p className="text-xs text-gray-600 mt-1 leading-snug">{notification.body}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setNotification(null); }} className="text-gray-400 hover:text-red-500 p-1">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Failure Modal */}
        {isFailureModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden transform transition-all scale-100 border border-gray-100">

              {/* Simple Header with Icon */}
              <div className="px-6 pt-6 pb-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertCircle size={24} strokeWidth={2.5} />
                </div>
                <h2 className="text-lg font-extrabold text-red-600 uppercase tracking-wide">
                  Chấm công thất bại
                </h2>
              </div>

              {/* Body Content */}
              <div className="p-6 pt-2">
                <p className="font-bold text-gray-800 mb-2 text-sm">
                  Lý do:
                </p>
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 mb-4">
                  <ul className="space-y-2">
                    {failureReasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm font-medium text-gray-800">
                        <span className="font-bold text-red-500 mt-0.5">{idx + 1}.</span>
                        <span className="leading-snug">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-sm text-gray-500 italic mb-6 leading-relaxed">
                  Vui lòng di chuyển đến công ty hoặc kết nối Wifi văn phòng để thử lại.
                </p>

                {/* Footer Actions */}
                <div className="mt-4">
                  <button
                    onClick={() => setIsFailureModalOpen(false)}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 transition-all active:scale-95"
                  >
                    Đã hiểu
                  </button>
                </div>
              </div>
            </div>
          </div>

        )}

        {/* Success Modal */}
        {isSuccessModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden transform transition-all scale-100 border border-green-100">
              <div className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600 animate-bounce">
                  <CheckCircle size={32} strokeWidth={3} />
                </div>
                <h3 className="text-xl font-extrabold text-gray-800 mb-2">Thành Công!</h3>
                <p className="text-gray-600 font-medium mb-6">
                  {successMsg}
                </p>
                <button
                  onClick={() => setIsSuccessModalOpen(false)}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all active:scale-95"
                >
                  Tuyệt vời
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Holiday Alert Utility */}
        <HolidayAlert holidays={holidays} />
        <BirthdayAlert user={currentUser} employees={visibleEmployees} />

        {/* OT Request Modal */}
        <OTRequestModal
          isOpen={isOtModalOpen}
          onClose={() => setIsOtModalOpen(false)}
          onSubmit={handleSubmitOtRequest}
          type={pendingOtType}
        />

        {/* Late Explain Modal */}
        <LateExplanationModal
          isOpen={isLateModalOpen}
          onClose={() => setIsLateModalOpen(false)}
          onSubmit={handleSubmitLateExplanation}
          date={pendingLateDate}
          lateMinutes={pendingLateMinutes}
        />

        {/* Leave Request Modal */}
        {/* NEW: Calculate Advance Limit for Modal */}
        {(() => {
          // Logic to calculate max allowed
          const targetUser = requestTargetUser || currentUser;
          let netSalary = 0;
          const currentMonth = new Date();

          if (targetUser) {
            if (targetUser.id === currentUser?.id && salaryReport && isSameMonth(salaryReport.month, currentMonth)) {
              netSalary = salaryReport.netSalary;
            } else {
              const tempSalary = calculateMonthlySalary(
                currentMonth,
                logs.filter(l => l.userId === targetUser.id),
                otRequests.filter(r => r.userId === targetUser.id),
                lateRequests.filter(r => r.userId === targetUser.id),
                advanceRequests.filter(r => r.userId === targetUser.id),
                bonuses.filter(b => b.userId === targetUser.id),
                targetUser,
                overrides.filter(o => o.userId === targetUser.id),
                holidays,
                salaryChanges,
                leaveRequests.filter(r => r.userId === targetUser.id)
              );
              netSalary = tempSalary.netSalary;
            }
          }

          // User requested: Use net salary directly as the advance limit
          // Don't subtract pending advances - the validation will handle limits
          const maxAllowed = Math.max(0, typeof netSalary === 'number' && !isNaN(netSalary) ? netSalary : 0);

          return (
            <SalaryAdvanceModal
              isOpen={isAdvanceModalOpen}
              onClose={() => {
                setIsAdvanceModalOpen(false);
                setRequestTargetUser(null);
              }}
              onSubmit={handleSubmitAdvanceRequest}
              maxAllowed={maxAllowed} // Pass calculating limit
            />
          );
        })()}

        {/* Leave Request Modal */}
        {(() => {
          const finalLeaveUser = leaveRequestTargetUser || currentUser;
          return (
            <LeaveRequestModal
              isOpen={isLeaveModalOpen}
              onClose={() => {
                setIsLeaveModalOpen(false);
                setLeaveRequestTargetUser(null);
              }}
              onSubmit={handleSubmitLeaveRequest}
              currentBalance={finalLeaveUser ? calculateRemainingLeave(
                finalLeaveUser.contractDate || '',
                finalLeaveUser.id,
                leaveRequests.filter(req => req.userId === finalLeaveUser.id),
                finalLeaveUser.usedLeaveLegacy || 0,
                true
              ) : 0}
              leaveHistory={leaveRequests.filter(req => req.userId === finalLeaveUser?.id)}
              userName={finalLeaveUser?.name}
              paidLeaveUsedThisMonth={finalLeaveUser ? getPaidLeaveUsedThisMonth(finalLeaveUser.id, leaveRequests) : 0}
            />
          );
        })()}

        {/* General Bonus Modal (Quick Action from HR - Admin Only) */}
        {isAdmin && (() => {
          // Compute late warnings for all employees
          const lateWarnings: Record<string, { level: 3 | 6; message: string }> = {};
          if (isGeneralBonusModalOpen) {
            employees.forEach(emp => {
              const empReport = calculateMonthlySalary(
                new Date(),
                logs.filter(l => l.userId === emp.id),
                otRequests.filter(r => r.userId === emp.id),
                lateRequests.filter(r => r.userId === emp.id),
                advanceRequests.filter(r => r.userId === emp.id),
                bonuses.filter(b => b.userId === emp.id),
                emp,
                overrides.filter(o => o.userId === emp.id),
                holidays,
                salaryChanges,
                leaveRequests.filter(r => r.userId === emp.id)
              );
              if (empReport.isConsecutive6Months) {
                lateWarnings[emp.id] = {
                  level: 6,
                  message: `Nhân viên này đã đi trễ 6 tháng liên tiếp. Theo quy định, cần họp Ban Giám Đốc để đưa ra hình thức xử lý.`
                };
              } else if (empReport.isConsecutive3Months) {
                lateWarnings[emp.id] = {
                  level: 3,
                  message: `Nhân viên này đã đi trễ 3 tháng liên tiếp. Theo quy định, cần cắt thưởng các ngày lễ trong năm.`
                };
              }
            });
          }
          return (
            <BonusPenaltyModal
              isOpen={isGeneralBonusModalOpen}
              onClose={() => setIsGeneralBonusModalOpen(false)}
              onSubmit={(data) => handleAddBonus(data)}
              onImportExcel={handleImportBonusesGeneral}
              employees={visibleEmployees}
              lateWarnings={lateWarnings}
            />
          );
        })()}

        {/* AI Assistant Chatbot */}
        <AiAssistant
          user={currentUser}
          personalLogs={myLogs}
          allLogs={logs}
          employees={visibleEmployees}
          requests={[...leaveRequests, ...otRequests, ...lateRequests]}
        />


        <SalaryConfirmationModal
          isOpen={isSalaryConfirmModalOpen}
          onClose={() => setIsSalaryConfirmModalOpen(false)}
          onConfirm={handleConfirmSalary}
          month={format(currentSalaryMonth, 'MM/yyyy')}
        />

      </div>
    </div >
  );
};

export default App;
