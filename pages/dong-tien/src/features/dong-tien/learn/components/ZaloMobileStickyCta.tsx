import React from 'react';
import { useCourse } from '@/lib/courseContext';

interface ZaloMobileStickyCtaProps {
  onOpenModal?: () => void;
}

export default function ZaloMobileStickyCta({ onOpenModal }: ZaloMobileStickyCtaProps) {
  const zaloUrl = useCourse().zalo.url;
  return (
    <div
      className="om-sticky-cta fixed bottom-0 left-0 right-0 z-40 block sm:hidden bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Bên trái: "hỗ trợ, tư vấn và giáp đáp các thắc mắc về chương trình" (chia thành 2 dòng) */}
        <div
          onClick={onOpenModal}
          className="flex-1 min-w-0 cursor-pointer text-left select-none"
        >
          <div className="t-footnote !font-normal text-[#424245]">
            <div>Hỗ trợ, tư vấn và giáp đáp</div>
            <div>các thắc mắc về chương trình</div>
          </div>
        </div>

        {/* Bên phải: Nút "Tham gia nhóm ZALO" */}
        <a
          href={zaloUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-[#0068FF] px-3.5 py-2 t-footnote !font-semibold text-white shadow-sm shadow-[#0068FF]/25 hover:bg-[#0052cc] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          Tham gia nhóm ZALO
        </a>
      </div>
    </div>
  );
}
