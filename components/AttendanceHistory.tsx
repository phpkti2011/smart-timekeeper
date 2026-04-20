import React from 'react';
import { format } from 'date-fns';
import { AttendanceLog } from '../types';
import { MapPin, CheckCircle, AlertTriangle } from 'lucide-react';

interface Props {
  logs: AttendanceLog[];
}

export const AttendanceHistory: React.FC<Props> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8 italic text-sm">
        Chưa có dữ liệu chấm công hôm nay
      </div>
    );
  }

  // Show most recent first (Logs are already DESC from App.tsx)
  const sortedLogs = [...logs].slice(0, 30);

  return (
    <div className="flex flex-col space-y-3 px-1 pb-20">
      <div className="mb-2">
        <span className="inline-block bg-white/90 backdrop-blur text-brand-600 px-3 py-1 rounded-full shadow-sm text-xs font-bold uppercase tracking-wider">
          Lịch sử hôm nay
        </span>
      </div>
      {sortedLogs.map((log) => (
        <div
          key={log.id}
          className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${log.isValidLocation ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
              {log.isValidLocation ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-gray-800 text-sm">{log.type}</span>
              <div className="flex items-center text-xs text-gray-400 mt-0.5">
                <MapPin size={10} className="mr-1" />
                {log.isValidLocation ? 'Văn phòng' : 'Từ xa'}
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="font-mono text-lg font-bold text-slate-700 leading-none">
              {format(log.timestamp, 'HH:mm')}
            </span>
            <span className="text-[10px] text-gray-400 font-medium mt-1">
              {format(log.timestamp, 'dd/MM/yyyy')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};