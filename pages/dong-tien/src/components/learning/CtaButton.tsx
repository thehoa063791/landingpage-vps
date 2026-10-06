import { HandPointingIcon } from "@phosphor-icons/react";
import { ArrowRight } from "lucide-react";
import { Open_Sans } from "next/font/google";
import React, { ReactNode } from "react";

const openSans = Open_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

interface CtaButtonProps {
  children: ReactNode;
  className?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ctaLabel?: string;
  iconRight?: boolean;
  iconLeft?: boolean;
}

export default function CtaButton({
  children,
  className = "",
  onClick,
  ctaLabel,
  iconRight = false,
  iconLeft = true,
}: CtaButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      data-cta-label={ctaLabel}
      className={`${openSans.className} !font-bold w-full rounded-[56px] bg-gradient-to-r from-[#e52d27] to-[#b31217] hover:from-[#ff3a30] hover:to-[#d31015] px-6 py-4 text-white drop-shadow-[0px_6px_15px_rgba(229,45,39,0.45)] transition-all duration-300 hover:scale-[1.03] active:scale-[0.99] flex items-center justify-center gap-3 relative overflow-hidden group ${className}`}
    >
      {/* Pulse ring animation on hover */}
      <span className="absolute inset-0 rounded-[56px] border border-white/30 opacity-0 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500 pointer-events-none" />

      <div className="relative hand-wrapper">
        <span className="hand-ripple ripple-1" />
        <span className="hand-ripple ripple-2" />

        {iconLeft && (
          <HandPointingIcon
            size={22}
            weight="fill"
            color="#FFD700"
            className="hand-click"
          />
        )}
      </div>

      <div className={`flex flex-col text-center ${openSans.className}`}>
        {children}
      </div>

      {/* Arrow right icon that shifts right on hover */}
      {iconRight && (
        <ArrowRight className="h-5 w-5 text-white transition-transform duration-300 group-hover:translate-x-1.5 flex-shrink-0" />
      )}
    </button>
  );
}
