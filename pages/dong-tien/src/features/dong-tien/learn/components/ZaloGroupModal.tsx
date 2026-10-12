import React, { useEffect } from "react";
import { X } from "lucide-react";
import { useCourse } from "@/lib/courseContext";

interface ZaloGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}


export default function ZaloGroupModal({
  isOpen,
  onClose,
}: ZaloGroupModalProps) {
  const { zalo } = useCourse();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[600px] rounded-md bg-white p-6 sm:p-8 shadow-md border border-slate-100 transition-all text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng X */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Đóng"
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tiêu đề & Mô tả */}
        <div className="text-center px-1 sm:px-2">
          <p className="text-base sm:text-[18px] font-bold text-slate-900 leading-snug tracking-tight">
            Tham gia nhóm ZALO {zalo.groupName}
          </p>
          <p className="mt-1.5 text-xs sm:text-[13px] text-slate-500 font-medium leading-relaxed">
            Tham gia nhóm ngay để được hỗ trợ, tư vấn và giáp đáp các thắc mắc
            về chương trình
          </p>
        </div>

        {/* Khung QR Code */}
        {zalo.qrImage && (
          <div className="mt-5 flex justify-center">
            <div className="w-full max-w-[340px] rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm flex items-center justify-center">
              <img
                src={zalo.qrImage}
                alt={`QR Tham gia nhóm Zalo ${zalo.groupName}`}
                className="w-full h-auto max-h-[340px] object-contain rounded-xl"
              />
            </div>
          </div>
        )}

        {/* Nút hành động ở dưới — chỉ giữ nút "Tham gia nhóm ZALO" (đã bỏ nút "Tôi đã sẵn sàng") */}
        <div className="mt-6 flex items-center justify-center">
          <a
            href={zalo.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#0068FF] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[#0068FF]/25 hover:bg-[#0052cc] active:scale-[0.98] transition-all cursor-pointer"
          >
            Tham gia nhóm ZALO
          </a>
        </div>
      </div>
    </div>
  );
}
