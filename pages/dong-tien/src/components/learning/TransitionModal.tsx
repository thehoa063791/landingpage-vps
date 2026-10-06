import { ArrowRight, X } from 'lucide-react';
import { useEffect } from 'react';
import { getLearnTheme, withAlpha } from '@/lib/learnTheme';

interface TransitionModalProps {
  isOpen: boolean;
  countdown: number;
  nextLessonTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TransitionModal({
  isOpen,
  countdown,
  nextLessonTitle,
  onConfirm,
  onCancel,
}: TransitionModalProps) {
  const theme = getLearnTheme('dong-tien');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (countdown / 5) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onCancel}
      />

      <div className="relative bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl transition-all duration-300 transform scale-100 flex flex-col items-center text-center">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          aria-label="Hủy chuyển bài"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative w-20 h-20 mb-2 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-slate-100 fill-none"
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="fill-none transition-all duration-1000 ease-linear"
              style={{ stroke: theme.accent }}
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-2xl font-extrabold text-slate-800 font-mono">
            {countdown}
          </span>
        </div>

        <div className="space-y-2 mb-8">
          <span
            className="text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full"
            style={{ color: theme.accentText, backgroundColor: withAlpha(theme.accent, 0.1) }}
          >
            Bài tiếp theo
          </span>
          <p className="text-lg font-extrabold text-slate-900 line-clamp-2 px-2 mt-4">
            {nextLessonTitle}
          </p>
          <p className="text-xs text-slate-500">
            Hệ thống đang chuẩn bị phát tự động bài tiếp theo
          </p>
        </div>

        <div className="flex w-full gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            style={{
              backgroundColor: theme.accent,
              boxShadow: `0 4px 6px -1px ${withAlpha(theme.accent, 0.2)}`,
            }}
          >
            <span>Học ngay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
