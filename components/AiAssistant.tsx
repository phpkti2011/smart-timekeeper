import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Sparkles, User, Bot } from 'lucide-react';
import { chatWithAi, ChatMessage } from '../services/geminiService';
import { UserProfile, AttendanceLog, LeaveRequest, AttendanceType } from '../types';
import { isSameDay, format, differenceInDays, isSameMonth, startOfWeek, endOfWeek, isWithinInterval, getDate, getMonth, startOfDay, subMonths } from 'date-fns';

interface Props {
    user: UserProfile;
    personalLogs?: AttendanceLog[];
    allLogs?: AttendanceLog[];
    employees?: UserProfile[];
    requests?: any[]; // Mixed requests
}

export const AiAssistant: React.FC<Props> = ({
    user,
    personalLogs = [],
    allLogs = [],
    employees = [],
    requests = []
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialize Greeting based on Status & Admin Alerts
    useEffect(() => {
        // 1. Personal Analysis
        const today = new Date();
        const todayPersonalLogs = personalLogs.filter(l => isSameDay(l.timestamp, today));

        // Check Personal Late
        let personalSection = '';
        const morningIn = todayPersonalLogs.find(l => l.type === AttendanceType.IN_MORNING);

        if (morningIn) {
            const checkInTime = format(morningIn.timestamp, 'HH:mm');
            if (checkInTime > '08:05') {
                personalSection = `⚠️ **Cá nhân:** Hôm nay bạn check-in lúc ${checkInTime} (Đã TRỄ).`;
            }
        } else if (!morningIn && format(today, 'HH:mm') > '08:05' && format(today, 'HH:mm') < '12:00') {
            personalSection = `⚠️ **Cá nhân:** Bạn chưa check-in sáng nay!`;
        }

        // 2. Admin Analysis (Only if Admin)
        let adminSection = '';
        if (user.role === 'Admin') {
            // a. Check Late Employees Today
            const lateEmployees: string[] = [];
            const todayAllLogs = allLogs.filter(l => isSameDay(l.timestamp, today));

            // Group logs by userId to find their earliest check-in
            const userCheckIns = new Map<string, Date>();
            todayAllLogs.forEach(log => {
                if (log.type === AttendanceType.IN_MORNING) {
                    const current = userCheckIns.get(log.userId || '');
                    // Keep earliest
                    if (!current || log.timestamp < current) {
                        userCheckIns.set(log.userId || '', log.timestamp);
                    }
                }
            });

            userCheckIns.forEach((time, userId) => {
                if (format(time, 'HH:mm') > '08:05') {
                    const emp = employees.find(e => e.id === userId);
                    if (emp && emp.role !== 'Admin') lateEmployees.push(`${emp.name} (${format(time, 'HH:mm')})`);
                }
            });

            if (lateEmployees.length > 0) {
                adminSection += `🚨 **Báo cáo Đi trễ:**\nCó ${lateEmployees.length} nhân viên đi muộn hôm nay:\n- ${lateEmployees.join('\n- ')}`;
            }
        }

        // 3. General Announcements (For EVERYONE) - Weekly Leaves
        let generalSection = '';
        const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
        const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 1 });

        const weeklyLeaves = requests.filter(req => {
            if (!req.startDate || !req.leaveType) return false;
            const r = req as LeaveRequest;
            if (r.status !== 'APPROVED') return false;

            const leaveDate = new Date(r.startDate);
            // Check if leave is inside this week
            // Check if leave is inside this week AND not in the past
            return isWithinInterval(leaveDate, { start: startOfCurrentWeek, end: endOfCurrentWeek }) && leaveDate >= startOfDay(today);
        });

        if (weeklyLeaves.length > 0) {
            const uniqueLeaves = weeklyLeaves.map((req: any) =>
                `- ${req.userName}: ${format(new Date(req.startDate), 'dd/MM')} (${req.leaveType === 'FULL' ? 'Cả ngày' : 'Nửa ngày'})`
            );
            generalSection = `📢 **Tin nổi bật trong tuần:**\nDanh sách nhân sự nghỉ phép:\n${uniqueLeaves.join('\n')}`;
        }

        // 4. Birthday Announcements
        const birthdayEmployees = employees.filter(e => {
            if (!e.dateOfBirth) return false;
            const dob = new Date(e.dateOfBirth);
            return dob.getMonth() === today.getMonth(); // Same month
        }).sort((a, b) => new Date(a.dateOfBirth!).getDate() - new Date(b.dateOfBirth!).getDate());

        let birthdaySection = '';
        if (birthdayEmployees.length > 0) {
            // Check if anyone has birthday TODAY
            const todayBirthdays = birthdayEmployees.filter(e => getDate(new Date(e.dateOfBirth!)) === getDate(today));

            if (todayBirthdays.length > 0) {
                birthdaySection = `🎂 **CHÚC MỪNG SINH NHẬT:**\nHôm nay là sinh nhật của: ${todayBirthdays.map(e => e.name).join(', ')}! 🎁`;
            } else {
                // Or just list monthly birthdays if context allows, but maybe keep it concise?
                // User asked "chúc mừng những nhân viên có sinh nhật trong tháng".
                // Let's list upcoming birthdays in next 7 days maybe? Or just generic monthly.
                // Let's put a small footer about monthly birthdays.
                birthdaySection = `🎂 **Sinh nhật tháng ${format(today, 'MM')}:**\n${birthdayEmployees.map(e => `- ${e.name} (${format(new Date(e.dateOfBirth!), 'dd/MM')})`).join('\n')}`;
            }
        }

        // Combine sections
        const parts = [`Xin chào ${user.name}! Tôi là trợ lý ảo P&D.`];
        if (birthdaySection) parts.push(birthdaySection);
        if (generalSection) parts.push(generalSection); // General news first
        if (personalSection) parts.push(personalSection);
        if (adminSection) parts.push(adminSection);
        parts.push("Bạn cần hỗ trợ gì không?");

        setMessages(prev => {
            // Only update greeting if user hasn't started chatting yet
            const hasUserInteraction = prev.some(m => m.role === 'user');
            if (hasUserInteraction) return prev;

            return [{ role: 'model', text: parts.join('\n\n') }];
        });
    }, [user.id, personalLogs, allLogs]); // Fixed: removed messages.length

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');

        const newHistory: ChatMessage[] = [
            ...messages,
            { role: 'user', text: userMsg }
        ];
        setMessages(newHistory);
        setIsLoading(true);

        try {
            // Re-calculate context for the prompt

            // Generate Performance Context (New for "Evaluation")
            const currentMonth = new Date();
            const personalMonthLogs = personalLogs.filter(l => isSameMonth(l.timestamp, currentMonth));

            // Calculate Late Count & Last Late
            let lateCount = 0;
            let lastLateDateStr = '';
            const seenLateDays = new Set<string>();
            const uniqueWorkDays = new Set<string>();

            // Sort logs to find latest late date easily
            personalMonthLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            personalMonthLogs.forEach(l => {
                const dayStr = format(l.timestamp, 'yyyy-MM-dd');
                uniqueWorkDays.add(dayStr);

                if (l.type === AttendanceType.IN_MORNING) {
                    const checkInTime = format(l.timestamp, 'HH:mm');
                    if (checkInTime > '08:05') {
                        if (!seenLateDays.has(dayStr)) {
                            lateCount++;
                            lastLateDateStr = format(l.timestamp, 'dd/MM');
                            seenLateDays.add(dayStr);
                        }
                    }
                }
            });

            // Summary String
            let performanceReport = `Dữ liệu chấm công tháng ${format(currentMonth, 'MM/yyyy')}:
- Tổng số ngày đi làm: ${uniqueWorkDays.size} ngày.
- Số lần đi trễ: ${lateCount} lần.`;

            if (lateCount > 0) {
                performanceReport += `\n- Lần trễ gần nhất là ngày: ${lastLateDateStr}.`;
            }

            // ... (Existing Current Month Logic)

            // --- HISTORICAL DATA (Last Month) ---
            const lastMonthDate = subMonths(currentMonth, 1);
            const lastMonthStr = format(lastMonthDate, 'MM/yyyy');

            // Personal History
            const personalLastMonthLogs = personalLogs.filter(l => isSameMonth(l.timestamp, lastMonthDate));
            let personalLastMonthLateCount = 0;
            const uniqueWorkDaysLastMonth = new Set<string>();

            personalLastMonthLogs.forEach(l => {
                const dayStr = format(l.timestamp, 'yyyy-MM-dd');
                uniqueWorkDaysLastMonth.add(dayStr);
                if (l.type === AttendanceType.IN_MORNING) {
                    if (format(l.timestamp, 'HH:mm') > '08:05') {
                        // Simple check, assumes 1 late per day max or just counts occurrences
                        personalLastMonthLateCount++;
                    }
                }
            });

            let historicalReport = `Dữ liệu tháng trước (${lastMonthStr}):
- Cá nhân: Đi làm ${uniqueWorkDaysLastMonth.size} ngày. Đi trễ ${personalLastMonthLateCount} lần.`;

            // Admin History (If Admin)
            if (user.role === 'Admin') {
                const allLastMonthLogs = allLogs.filter(l => isSameMonth(l.timestamp, lastMonthDate));

                // Count Lates
                let totalLateLastMonth = 0;
                // We need to group by day+user to be accurate, but strict log counting is okay for "General Assistant"
                // Let's count IN_MORNING > 08:05 occurrences
                totalLateLastMonth = allLastMonthLogs.filter(l => l.type === AttendanceType.IN_MORNING && format(l.timestamp, 'HH:mm') > '08:05').length;

                historicalReport += `\n- Toàn công ty: Tổng số lần đi trễ là ${totalLateLastMonth}.`;
            }

            // ... (Existing Admin Logic for TODAY) ...
            // Add Admin context if needed
            let adminReport = "";
            if (user.role === 'Admin') {
                const today = new Date();
                const todayLogs = allLogs.filter(l => isSameDay(l.timestamp, today));

                // 1. Late Analysis
                const userCheckIns = new Map<string, Date>();
                todayLogs.forEach(log => {
                    if (log.type === AttendanceType.IN_MORNING) {
                        const current = userCheckIns.get(log.userId || '');
                        if (!current || log.timestamp < current) {
                            userCheckIns.set(log.userId || '', log.timestamp);
                        }
                    }
                });

                const lateList: string[] = [];
                userCheckIns.forEach((time, uid) => {
                    if (format(time, 'HH:mm') > '08:05') {
                        const e = employees.find(em => em.id === uid);
                        if (e && e.role !== 'Admin') lateList.push(`${e.name} (${format(time, 'HH:mm')})`);
                    }
                });

                // 2. Absent Analysis (No Check-in Morning)
                const absentList = employees
                    .filter(e => !userCheckIns.has(e.id) && e.status === 'ACTIVE' && e.role !== 'Admin')
                    .map(e => e.name);

                adminReport = `Tình hình nhân sự hôm nay (${format(today, 'dd/MM')}):\n`;
                adminReport += `- Đi trễ (${lateList.length}): ${lateList.length > 0 ? lateList.join(', ') : 'Không có'}.\n`;
                adminReport += `- Chưa check-in/Vắng (${absentList.length}): ${absentList.length > 0 ? absentList.join(', ') : 'Không có'}.\n`;
            }

            // 1a. General News (Weekly Leaves)
            const today = new Date();
            const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
            const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 1 });
            const weeklyLeaves = requests.filter(req => {
                if (!req.startDate || !req.leaveType) return false;
                const r = req as LeaveRequest;
                return r.status === 'APPROVED' && isWithinInterval(new Date(r.startDate), { start: startOfCurrentWeek, end: endOfCurrentWeek }) && new Date(r.startDate) >= startOfDay(today);
            });
            const generalNews = weeklyLeaves.length > 0
                ? `Nhân sự nghỉ tuần này:\n${weeklyLeaves.map((req: any) => `- ${req.userName} nghỉ ${format(new Date(req.startDate), 'dd/MM')}`).join('\n')}`
                : "Tuần này không có ai nghỉ phép.";


            const response = await chatWithAi(userMsg, messages, {
                userName: user.name,
                userRole: user.role,
                dailyStatus: messages[0]?.text || "Không có thông báo đặc biệt.",
                performanceReport: performanceReport,
                adminReport: adminReport,
                historicalReport: historicalReport, // PASS NEW DATA
                generalNews: generalNews
            });

            setMessages([...newHistory, { role: 'model', text: response }]);
        } catch (error) {
            setMessages([...newHistory, { role: 'model', text: 'Xin lỗi, tôi đang gặp lỗi kết nối.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to render bold text
    const renderMessageText = (text: string) => {
        return text.split(/(\*\*.*?\*\*)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    return (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end pointer-events-none">
            {/* Search/Toggle Button */}
            <div className="pointer-events-auto">
                {!isOpen && (
                    <button
                        onClick={() => setIsOpen(true)}
                        className="group relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-brand-500 to-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-all active:scale-95 animate-bounce-slow"
                    >
                        <Sparkles size={28} className="animate-pulse" />
                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[10px] items-center justify-center text-white font-bold">1</span>
                        </span>
                    </button>
                )}
            </div>

            {/* Chat Window */}
            {isOpen && (
                <div className="pointer-events-auto w-[90vw] max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col animate-scale-in origin-bottom-right h-[500px]">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-brand-600 to-indigo-700 p-4 flex items-center justify-between text-white shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Bot size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-shadow">Trợ lý P&D</h3>
                                <span className="text-xs text-brand-100 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                                    Online
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-4">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-brand-100 text-brand-600'
                                    }`}>
                                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>

                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-br-none'
                                    : 'bg-white border border-gray-100 text-gray-700 shadow-sm rounded-bl-none'
                                    }`}>
                                    {renderMessageText(msg.text)}
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center shrink-0">
                                    <Bot size={16} />
                                </div>
                                <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-bl-none shadow-sm flex gap-1 items-center">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-gray-100 shrink-0">
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-full border border-gray-200 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100 transition-all"
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Hỏi gì đó đi..."
                                className="flex-1 bg-transparent px-4 py-2 outline-none text-sm text-gray-800 placeholder-gray-400 min-w-0"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="p-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                <Send size={18} />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
