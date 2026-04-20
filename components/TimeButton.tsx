import React from 'react';
import { LucideIcon } from 'lucide-react';

interface TimeButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  colorClass: string;
  disabled?: boolean;
}

export const TimeButton: React.FC<TimeButtonProps> = ({ label, icon: Icon, onClick, colorClass, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center 
        p-2 sm:p-4 rounded-2xl shadow-sm transition-all duration-200
        active:scale-95 border border-transparent hover:border-white/20
        ${colorClass} text-white
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'shadow-md'}
      `}
    >
      <Icon className="w-6 h-6 sm:w-8 sm:h-8 mb-1 sm:mb-2" strokeWidth={2} />
      <span className="text-[10px] sm:text-sm font-semibold text-center leading-tight whitespace-nowrap">
        {label}
      </span>
    </button>
  );
};