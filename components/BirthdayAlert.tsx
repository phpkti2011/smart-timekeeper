import React, { useState, useEffect } from 'react';
import { isSameDay, isSameMonth } from 'date-fns';
import { UserProfile } from '../types';
import { Gift, X, PartyPopper } from 'lucide-react';
import { isWorkingEmployee } from '../utils/employeeFilters';

interface Props {
    user: UserProfile | null;
    employees?: UserProfile[];
}

export const BirthdayAlert: React.FC<Props> = ({ user, employees = [] }) => {
    const [showMyBirthday, setShowMyBirthday] = useState(false);
    const [showColleagueBirthday, setShowColleagueBirthday] = useState(false);
    const [birthdayColleagues, setBirthdayColleagues] = useState<UserProfile[]>([]);

    useEffect(() => {
        const today = new Date();

        // 1. Check My Birthday
        if (user && user.dateOfBirth) {
            const dob = new Date(user.dateOfBirth);
            if (today.getDate() === dob.getDate() && today.getMonth() === dob.getMonth()) {
                setShowMyBirthday(true);
            }
        }

        // 2. Check Colleagues Birthdays
        if (employees.length > 0) {
            const others = employees.filter(e => {
                if (!isWorkingEmployee(e)) return false;
                if (!e.dateOfBirth) return false;
                // Exclude myself
                if (user && e.id === user.id) return false;

                const dob = new Date(e.dateOfBirth);
                return today.getDate() === dob.getDate() && today.getMonth() === dob.getMonth();
            });

            if (others.length > 0) {
                setBirthdayColleagues(others);
                setShowColleagueBirthday(true);
            }
        }
    }, [user, employees]);

    if (!showMyBirthday && !showColleagueBirthday) return null;

    return (
        <div className="fixed top-20 left-4 z-50 flex flex-col gap-4">

            {/* My Birthday Alert */}
            {showMyBirthday && user && (
                <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-4 rounded-xl shadow-2xl max-w-sm border border-pink-400/30 flex items-start gap-3 relative overflow-hidden animate-bounce-in">
                    <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="absolute bottom-0 right-0 opacity-20 transform rotate-12">
                        <PartyPopper size={64} />
                    </div>

                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md shrink-0 z-10">
                        <Gift size={24} className="text-white" />
                    </div>

                    <div className="flex-1 pr-6 z-10">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-pink-200 mb-0.5">
                            Happy Birthday! 🎂
                        </p>
                        <h3 className="text-lg font-bold leading-tight mb-1">Chúc mừng sinh nhật, {user.name}!</h3>
                        <p className="text-xs text-pink-100 opacity-90 leading-relaxed">
                            Công ty chúc bạn một tuổi mới thật nhiều niềm vui, sức khỏe và thành công! 🎁✨
                            <br />
                            <span className="italic opacity-70 block mt-1">(Đã gửi tặng bạn món quà nhỏ trong bảng lương tháng này)</span>
                        </p>
                    </div>

                    <button
                        onClick={() => setShowMyBirthday(false)}
                        className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors text-white/70 hover:text-white z-20"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Colleagues Birthday Alert */}
            {showColleagueBirthday && birthdayColleagues.length > 0 && (
                <div className="bg-gradient-to-r from-orange-400 to-amber-500 text-white p-4 rounded-xl shadow-2xl max-w-sm border border-orange-300/30 flex items-start gap-3 relative overflow-hidden animate-bounce-in">
                    <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>

                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md shrink-0 z-10">
                        <PartyPopper size={24} className="text-white" />
                    </div>

                    <div className="flex-1 pr-6 z-10">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-100 mb-0.5">
                            Tin vui trong ngày 🎉
                        </p>
                        <h3 className="text-sm font-bold leading-tight mb-1">Hôm nay là sinh nhật của:</h3>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {birthdayColleagues.map(c => (
                                <span key={c.id} className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-semibold">
                                    {c.name}
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-orange-50 opacity-90 italic">
                            Hãy cùng gửi những lời chúc tốt đẹp nhất đến đồng nghiệp của mình nhé! 🤝❤️
                        </p>
                    </div>

                    <button
                        onClick={() => setShowColleagueBirthday(false)}
                        className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors text-white/70 hover:text-white z-20"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

        </div>
    );
};
