import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EVENTS, STATUS, useJoyride } from "react-joyride";
import type { TooltipRenderProps } from "react-joyride";
import { X } from "lucide-react";
import { onboardingTourSeenKey, userEmailKey } from "@/lib/brand";
import { checkSurveyAuth } from "@/lib/auth";
import dongTienApi from "@/lib/api";
import {
  resolveStepPlacement,
  resolveStepTarget,
  TOUR_STEPS,
  TOUR_TEXT,
} from "@/features/dong-tien/config/onboardingTour";

/**
 * - Tự động chạy lần đầu (cờ đã_xem_tour lưu theo tài khoản/email).
 * - "Xem lại hướng dẫn": tăng restartSignal để chạy lại bất cứ lúc nào.
 * - Mobile (<lg): trước mỗi bước highlight sidebar, tự mở sidebar rồi mới định vị.
 * - ESC / X / Bỏ qua → skip tour + set cờ đã xem. Riêng "Để sau" ở màn chào
 *   chỉ tạm dừng (không set cờ) → lần sau vào vẫn hiện lại.
 */

interface LearnOnboardingTourProps {
  /** Tour chỉ chạy khi trang học đã load xong (session sẵn sàng, anchors tồn tại). */
  enabled: boolean;
  /** Mở/đóng sidebar — giữ để backward compatible nếu gọi từ nơi khác. */
  onMobileOpenSidebar?: (open: boolean) => void;
  /** Tăng 1 để chạy lại tour (nút "Xem lại hướng dẫn"). */
  restartSignal: number;
  /** Trạng thái tour đã hoàn thành từ profile người dùng */
  tourCompletedFromProfile?: boolean;
  /** Callback kích hoạt khi bấm nút đóng X ở step 1 trong lần đầu mở tour */
  onFirstTimeCloseStep1?: () => void;
}

interface LearnTourTooltipProps extends TooltipRenderProps {
  onCloseClick?: (stepId: string | number, index: number) => void;
}

function LearnTourTooltip(props: LearnTourTooltipProps) {
  const {
    backProps,
    closeProps,
    controls,
    index,
    primaryProps,
    skipProps,
    step,
    tooltipProps,
    onCloseClick,
  } = props;

  const joyrideStyle = step.styles?.tooltip;

  const combinedStyle: React.CSSProperties = {
    ...joyrideStyle,
    padding: 0,
    width: "100%",
    maxWidth: "calc(100vw - 24px)",
  };

  const stepId = step.id;
  const spec =
    stepId === "welcome"
      ? {
          emoji: TOUR_TEXT.welcome.emoji,
          title: TOUR_TEXT.welcome.title,
          content: TOUR_TEXT.welcome.content,
        }
      : stepId === "finish"
        ? { emoji: "", title: "", content: "" }
        : stepId === "current-lesson"
          ? {
              emoji: TOUR_TEXT.step2.emoji,
              title: TOUR_TEXT.step2.title,
              content: TOUR_TEXT.step2.content,
            }
          : {
              emoji: TOUR_TEXT.step1.emoji,
              title: TOUR_TEXT.step1.title,
              content: TOUR_TEXT.step1.content,
            };

  const primaryLabel = TOUR_TEXT.common.next;

  return (
    <div
      {...tooltipProps}
      style={combinedStyle}
      className="relative flex w-full max-w-[min(650px,calc(100vw-24px))] max-w-[650px] flex-col overflow-hidden rounded-xl bg-white font-['Figtree',sans-serif] ring-1 ring-slate-900/10 shadow-xl"
    >
      <button
        {...closeProps}
        onClick={(e) => {
          onCloseClick?.(stepId ?? "", index);
          if (closeProps.onClick) {
            closeProps.onClick(e);
          }
        }}
        aria-label={TOUR_TEXT.common.close}
        className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="p-4 sm:p-5 max-w-[650px]">
        {spec.title && (
          <div className="flex items-center gap-3 pr-6">
            <span
              className="text-[22px] sm:text-[26px] leading-none shrink-0"
              aria-hidden="true"
            >
              {spec.emoji}
            </span>
            <div className="font-['Montserrat',sans-serif] text-[15px] sm:text-[16px] font-black leading-snug tracking-tight text-slate-900">
              {spec.title}
            </div>
          </div>
        )}

        {spec.content && (
          <p className="mt-2.5 sm:mt-3 text-[13px] sm:text-[13.5px] font-medium leading-relaxed text-slate-600">
            {spec.content}
          </p>
        )}

        {stepId === "welcome" && (
          <div className="mt-4 sm:mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => controls.stop()}
              className="rounded-md px-3.5 py-1.5 text-[12.5px] sm:text-[13px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              {TOUR_TEXT.welcome.defer}
            </button>
            <button
              {...primaryProps}
              aria-label={TOUR_TEXT.welcome.start}
              title={TOUR_TEXT.welcome.start}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B] px-3.5 py-1.5 text-[12.5px] sm:text-[13px] font-bold text-white shadow-sm shadow-[#F59E0B]/30 transition-colors hover:bg-[#D97706]"
            >
              {TOUR_TEXT.welcome.start}
            </button>
          </div>
        )}

        {stepId !== "welcome" && stepId !== "finish" && (
          <div className="mt-4 sm:mt-5 flex items-center justify-between gap-1.5 sm:gap-2">
            {index === 1 ? (
              <button
                {...skipProps}
                onClick={(e) => {
                  onCloseClick?.(stepId ?? "", index);
                  if (skipProps.onClick) {
                    skipProps.onClick(e);
                  }
                }}
                aria-label={TOUR_TEXT.common.skip}
                title={TOUR_TEXT.common.skip}
                className="rounded-md px-2 py-1.5 text-[12px] sm:text-[12.5px] font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                {TOUR_TEXT.common.skip}
              </button>
            ) : (
              <button
                {...backProps}
                aria-label={TOUR_TEXT.common.prev}
                title={TOUR_TEXT.common.prev}
                className="rounded-md px-2 py-1.5 text-[12px] sm:text-[12.5px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                {TOUR_TEXT.common.prev}
              </button>
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="font-['Montserrat',sans-serif] text-[11px] font-bold tabular-nums text-slate-400">
                {index}/2
              </span>
              <button
                {...primaryProps}
                aria-label={primaryLabel}
                title={primaryLabel}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#F59E0B] px-3 sm:px-4 py-1.5 text-[12.5px] sm:text-[13px] font-bold text-white shadow-sm shadow-[#F59E0B]/30 transition-colors hover:bg-[#D97706]"
              >
                {primaryLabel}
              </button>
            </div>
          </div>
        )}

        {stepId === "finish" && (
          <>
            <div className="flex flex-col-reverse items-center gap-3.5">
              <img
                src={TOUR_TEXT.finish.zaloQrImage}
                alt="QR Zalo"
                className="w-48 h-48 sm:w-72 sm:h-72 object-contain rounded-lg border border-slate-200 bg-white shrink-0 shadow-sm"
              />
              <div className="flex-1 text-center sm:text-left">
                <div className="font-['Montserrat',sans-serif] text-[13px] sm:text-[13.5px] font-bold text-slate-900 leading-snug">
                  {TOUR_TEXT.finish.zaloTitle}
                </div>
                <p className="mt-1 text-[11.5px] sm:text-[12px] text-slate-600 leading-relaxed font-medium">
                  {TOUR_TEXT.finish.zaloContent}
                </p>
              </div>
            </div>

            <div className="mt-4 sm:mt-5 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
              <button
                {...primaryProps}
                aria-label={TOUR_TEXT.finish.cta}
                title={TOUR_TEXT.finish.cta}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-[#F59E0B] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-[#F59E0B]/30 transition-colors hover:bg-[#D97706]"
              >
                {TOUR_TEXT.finish.cta}
              </button>
              <a
                href={TOUR_TEXT.finish.zaloUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-[#0068FF] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-[#0068FF]/30 transition-colors hover:bg-[#0052cc]"
              >
                {TOUR_TEXT.finish.zaloCta}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LearnOnboardingTour({
  enabled,
  onMobileOpenSidebar,
  restartSignal,
  tourCompletedFromProfile,
  onFirstTimeCloseStep1,
}: LearnOnboardingTourProps) {
  const autoStartedRef = useRef(false);
  const isFirstTimeRunRef = useRef(false);

  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );

  // Theo dõi viewport: thay đổi placement nếu xoay màn hình / mở devtools giữa tour.
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const tourWidth = useMemo(() => {
    if (!isMobile) return 450;
    if (typeof window !== "undefined") {
      return Math.min(340, window.innerWidth - 24);
    }
    return 320;
  }, [isMobile]);

  const steps = useMemo(
    () =>
      TOUR_STEPS.map((step) => ({
        ...step,
        target: resolveStepTarget(step, isMobile),
        placement: resolveStepPlacement(step, isMobile),
        content: "",
        before: async () => {
          if (typeof window === "undefined") return;

          const isMobileViewport = window.innerWidth < 1024;
          const targetSelector = resolveStepTarget(step, isMobileViewport);

          if (step.id === "welcome") {
            const mainEl = document.querySelector("main");
            if (mainEl) mainEl.scrollTop = 0;

            // Thu hết menu sidebar lại (đóng tất cả các chương đang mở) trước khi bắt đầu tour
            const openStageTriggers = document.querySelectorAll(
              '#tour-sidebar button[aria-expanded="true"]',
            );
            if (openStageTriggers.length > 0) {
              openStageTriggers.forEach((btn) =>
                (btn as HTMLButtonElement).click(),
              );
              await new Promise((resolve) => setTimeout(resolve, 350));
            } else {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            return;
          }

          if (step.id === "sidebar-list") {
            // Đảm bảo menu sidebar được thu gọn nếu bất kỳ chương nào mở
            const openStageTriggers = document.querySelectorAll(
              '#tour-sidebar button[aria-expanded="true"]',
            );
            if (openStageTriggers.length > 0) {
              openStageTriggers.forEach((btn) =>
                (btn as HTMLButtonElement).click(),
              );
              await new Promise((resolve) => setTimeout(resolve, 350));
            }
          }

          if (step.data?.requiresSidebar) {
            // 1. Expand the stage containing the target lesson if it is collapsed
            const targetEl = document.querySelector(targetSelector);
            if (targetEl) {
              const sectionEl = targetEl.closest("section");
              const triggerBtn = sectionEl?.querySelector(
                "button[aria-expanded]",
              );
              if (
                triggerBtn &&
                triggerBtn.getAttribute("aria-expanded") === "false"
              ) {
                (triggerBtn as HTMLButtonElement).click();
                // Wait for accordion expansion animation (transition is 320ms, wait 400ms for safety)
                await new Promise((resolve) => setTimeout(resolve, 400));
              }
            }

            // 2. Scroll target into view
            const finalTargetEl = document.querySelector(targetSelector);
            if (finalTargetEl) {
              // Handle playlist inner scroll container
              const playlistScroll = finalTargetEl.closest(
                ".custom-playlist-scrollbar",
              );
              if (playlistScroll) {
                const itemTop = (finalTargetEl as HTMLElement).offsetTop;
                playlistScroll.scrollTo({
                  top: Math.max(0, itemTop - 40),
                  behavior: "auto",
                });
              }

              // On mobile, scroll outer <main> container to position target in viewport
              const mainEl = document.querySelector("main");
              if (mainEl && isMobileViewport) {
                if (step.id === "sidebar-list") {
                  const sidebarEl = document.querySelector("#tour-sidebar");
                  if (sidebarEl) {
                    const sidebarTop = (sidebarEl as HTMLElement).offsetTop;
                    mainEl.scrollTo({
                      top: Math.max(0, sidebarTop - 16),
                      behavior: "auto",
                    });
                  }
                } else {
                  const targetRect = finalTargetEl.getBoundingClientRect();
                  const mainRect = mainEl.getBoundingClientRect();
                  const targetTopInMain =
                    targetRect.top - mainRect.top + mainEl.scrollTop;
                  mainEl.scrollTo({
                    top: Math.max(0, targetTopInMain - 100),
                    behavior: "auto",
                  });
                }
              } else {
                finalTargetEl.scrollIntoView({
                  behavior: "auto",
                  block: "center",
                  inline: "nearest",
                });
              }

              // Wait 250ms for layout & scroll to finish
              await new Promise((resolve) => setTimeout(resolve, 250));

              // Trigger window resize event so Joyride recalculates the spotlight position
              window.dispatchEvent(new Event("resize"));
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }

          if (step.id === "finish") {
            const mainEl = document.querySelector("main");
            if (mainEl && isMobileViewport) {
              mainEl.scrollTop = 0;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        },
      })),
    [isMobile],
  );

  const handleCloseClick = useCallback(
    (stepId: string | number, index: number) => {
      if (isFirstTimeRunRef.current && (index === 0 || index === 1)) {
        onFirstTimeCloseStep1?.();
      }
      isFirstTimeRunRef.current = false;
    },
    [onFirstTimeCloseStep1],
  );

  const { controls, on, state, Tour } = useJoyride({
    continuous: true,
    steps,
    tooltipComponent: (props) => (
      <LearnTourTooltip {...props} onCloseClick={handleCloseClick} />
    ),
    locale: {
      skip: TOUR_TEXT.common.skip,
      next: TOUR_TEXT.common.next,
      back: TOUR_TEXT.common.prev,
      last: TOUR_TEXT.common.startLesson,
      close: TOUR_TEXT.common.close,
    },
    options: {
      // overlayClickAction mặc định 'close' (chặn click xuyên qua overlay khi tour chạy)
      closeButtonAction: "skip",
      dismissKeyAction: false,
      overlayColor: "rgba(15, 23, 42, 0.6)",
      primaryColor: "#F59E0B",
      arrowColor: "#ffffff",
      zIndex: 200,
      spotlightPadding: 6,
      spotlightRadius: 12,
      scrollDuration: 400,
      loaderDelay: 600,
      targetWaitTimeout: 2500,
      width: tourWidth,
      offset: 16,
    },
    styles: {
      spotlight: { stroke: "#F59E0B", strokeWidth: 3 },
      floater: {
        maxWidth: "calc(100vw - 24px)",
      },
      tooltip: {
        maxWidth: "calc(100vw - 24px)",
      },
    },
  });

  const markTourSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    const email = localStorage.getItem(userEmailKey());
    localStorage.setItem(onboardingTourSeenKey(email), "true");

    if (checkSurveyAuth()) {
      dongTienApi.completeTour().catch((err) => {
        console.warn("Failed to mark tour as completed on backend:", err);
      });
    }
  }, []);

  const isTourSeen = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (typeof tourCompletedFromProfile === "boolean") {
      return tourCompletedFromProfile;
    }
    const email = localStorage.getItem(userEmailKey());
    if (email) {
      return localStorage.getItem(onboardingTourSeenKey(email)) === "true";
    }
    return false;
  }, [tourCompletedFromProfile]);

  // Tự chạy lần đầu khi trang học sẵn sàng và chưa xem tour.
  useEffect(() => {
    if (!enabled || autoStartedRef.current) return;
    if (isTourSeen()) {
      autoStartedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      autoStartedRef.current = true;
      isFirstTimeRunRef.current = true;
      controls.start();
    }, 150);
    return () => clearTimeout(timer);
  }, [enabled, controls, isTourSeen]);

  // Nút "Xem lại hướng dẫn" → chạy lại từ đầu.
  useEffect(() => {
    if (restartSignal === 0 || !enabled) return;
    isFirstTimeRunRef.current = false;
    controls.start(0);
  }, [restartSignal, enabled, controls]);

  // Tour kết thúc (finished/skipped) → đánh dấu đã xem.
  useEffect(() => {
    return on(EVENTS.TOUR_END, () => {
      markTourSeen();
    });
  }, [on, markTourSeen]);

  // ESC đóng tour (skip → set cờ). Joyride default ESC chỉ advance bước,
  // nên tự xử lý với dismissKeyAction: false.
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || state.status !== STATUS.RUNNING) return;
      if (
        isFirstTimeRunRef.current &&
        (state.index === 0 || state.index === 1)
      ) {
        onFirstTimeCloseStep1?.();
      }
      isFirstTimeRunRef.current = false;
      controls.skip(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, state.status, controls, onFirstTimeCloseStep1]);

  // Lắng nghe sự kiện scroll của <main> khi tour đang chạy để đồng bộ vị trí spotlight real-time
  useEffect(() => {
    if (state.status !== STATUS.RUNNING) return;
    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
          ticking = false;
        });
        ticking = true;
      }
    };

    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => mainEl.removeEventListener("scroll", handleScroll);
  }, [state.status]);

  // Dọn dẹp khi rời trang giữa chừng.
  useEffect(() => {
    return () => controls.stop();
  }, [controls]);

  return Tour;
}
