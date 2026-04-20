import React, { useState, useEffect } from 'react';
import { differenceInDays, isSameDay, isAfter, startOfDay, addDays } from 'date-fns';
import { Holiday } from '../types';
import { Calendar, X } from 'lucide-react';

interface Props {
    holidays: Holiday[];
}

export const HolidayAlert: React.FC<Props> = ({ holidays }) => {
    const [visible, setVisible] = useState(false);
    const [upcomingHoliday, setUpcomingHoliday] = useState<Holiday | null>(null);
    const [daysUntil, setDaysUntil] = useState<number>(0);

    useEffect(() => {
        const today = startOfDay(new Date());

        // Find the closest upcoming or current holiday (within 7 days upcoming, or currently happening)
        // Filter holidays that are:
        // 1. Today or in Future
        // 2. Within 7 days from today

        // Also include holidays effective TODAY.

        const relevantHolidays = holidays.filter(h => {
            const hDate = startOfDay(new Date(h.date));
            const diff = differenceInDays(hDate, today);
            return diff >= 0 && diff <= 7;
        });

        if (relevantHolidays.length > 0) {
            // Sort by date ascending to get the nearest one
            relevantHolidays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const nearest = relevantHolidays[0];
            const hDate = startOfDay(new Date(nearest.date));
            const diff = differenceInDays(hDate, today);

            setUpcomingHoliday(nearest);
            setDaysUntil(diff);
            setVisible(true);
        }
    }, [holidays]);

    if (!visible || !upcomingHoliday) return null;

    return (
        <div className="fixed top-20 right-4 z-50 animate-bounce-in">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-xl shadow-2xl max-w-sm border border-purple-400/30 flex items-start gap-3 relative overflow-hidden">

                {/* Background Decoration */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>

                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md shrink-0">
                    <Calendar size={24} className="text-white" />
                </div>

                <div className="flex-1 pr-6">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-200 mb-0.5">
                        {daysUntil === 0 ? 'Hôm nay là lễ!' : `Sắp tới ngày lễ (${daysUntil} ngày nữa)`}
                    </p>
                    <h3 className="text-lg font-bold leading-tight mb-1">{upcomingHoliday.name}</h3>
                    <p className="text-xs text-purple-100 opacity-90">
                        Chúc bạn và gia đình có một kỳ nghỉ lễ vui vẻ và hạnh phúc! 🎉
                    </p>
                </div>

                <button
                    onClick={() => setVisible(false)}
                    className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors text-white/70 hover:text-white"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};
