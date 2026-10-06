import React from 'react';
import { Lock } from 'lucide-react';

interface VideoLockOverlayProps {
  message?: string;
}

export default function VideoLockOverlay({ message }: VideoLockOverlayProps) {
  return (
    <div className="absolute inset-0 bg-slate-950/95 z-35 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700/50 flex items-center justify-center mx-auto shadow-inner text-amber-500 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white tracking-wide">Bài học chưa mở khóa</h3>
          <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
            {message || "Vui lòng xem và hoàn thành bài giảng trước đó để mở khóa bài học này."}
          </p>
        </div>
      </div>
    </div>
  );
}
