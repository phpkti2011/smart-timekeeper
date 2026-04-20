import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

export const DigitalClock: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[time.getDay()];
  const dateString = format(time, 'dd/MM/yyyy');

  return (
    <div className="flex flex-col items-center justify-center py-6 text-slate-800">
      <div className="text-5xl font-bold tracking-tight text-slate-800">
        {format(time, 'HH:mm')}
      </div>
      <div className="text-lg text-slate-500 font-medium mt-1 uppercase tracking-wide">
        {dayName}, {dateString}
      </div>
    </div>
  );
};