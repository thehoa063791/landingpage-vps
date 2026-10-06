import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import CtaButton from "@/components/learning/CtaButton";
import { handleCta } from "../lib/ctaFlow";

interface Hero2Props {
  onOpenAuthPopup?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const images = {
  heroBg:
    "/dong-tien/images/thinh-vuong-landing/a66d7b85296091f51efa75fe33681916c3f6a100.png",
};

const mont = "font-['Montserrat',sans-serif] font-normal";
const montBold = "font-['Montserrat',sans-serif] font-bold";
const noLetterSpacing = { letterSpacing: 0 };

export default function Hero2({ onOpenAuthPopup }: Hero2Props) {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleUnmute = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      try {
        win.postMessage(
          JSON.stringify({ method: 'setVolume', value: 1 }),
          "https://player.vimeo.com",
        );
        win.postMessage(
          JSON.stringify({ method: 'play' }),
          "https://player.vimeo.com",
        );
      } catch {
        /* ignore */
      }
    }
    setIsMuted(false);
  };

  useEffect(() => {
    const doAutoClick = () => {
      if (btnRef.current) {
        btnRef.current.click();
      } else {
        handleUnmute();
      }
    };

    doAutoClick();
    const t1 = setTimeout(doAutoClick, 100);
    const t2 = setTimeout(doAutoClick, 400);

    const handleGlobalClick = () => handleUnmute();
    const events = [
      "click",
      "touchstart",
      "pointerdown",
      "mousemove",
      "scroll",
    ];
    events.forEach((evt) =>
      window.addEventListener(evt, handleGlobalClick, {
        passive: true,
        once: true,
      }),
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      events.forEach((evt) =>
        window.removeEventListener(evt, handleGlobalClick),
      );
    };
  }, []);

  const handleCtaClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onOpenAuthPopup) {
      onOpenAuthPopup(e);
    } else {
      handleCta(router);
    }
  };

  return (
    <section className="relative w-full overflow-hidden">
      <img
        src={images.heroBg}
        alt=""
        className="absolute inset-0 size-full object-cover object-[center_40%]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(0,0,0,0.6)] to-black" />
      <div className="relative mx-auto max-w-[1300px] px-5 py-14 md:px-10 md:py-20">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-10">
          <div className="w-full">
            <div className="relative aspect-video w-full overflow-hidden rounded-[6px] border border-[#8f8f8f] bg-black">
              <iframe
                ref={iframeRef}
                className="absolute inset-0 size-full"
                src="https://player.vimeo.com/video/1228651465?dnt=1&autoplay=1&muted=1&playsinline=1&title=0&byline=0&portrait=0"
                referrerPolicy="no-referrer"
                title="Phương pháp xây dựng dòng tiền"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              {isMuted && (
                <button
                  ref={btnRef}
                  type="button"
                  onClick={handleUnmute}
                  className="absolute inset-0 z-10 flex size-full cursor-pointer items-center justify-center bg-black/25 transition-all hover:bg-black/10"
                >
                  <div className="flex items-center gap-2 rounded-full bg-[#FFC300] px-5 py-2.5 font-['Montserrat',sans-serif] font-bold text-black shadow-lg transition-transform hover:scale-105 animate-bounce">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    </svg>
                    <span className="text-xs uppercase tracking-wide sm:text-sm">
                      Bấm để bật âm thanh
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-5 text-white">
            <div
              className={`${montBold} text-center`}
              style={{ ...noLetterSpacing, fontSize: 20, lineHeight: "29px" }}
            >
              Tiền không lớn lên nhờ may mắn, mà nhờ chiến lược
              <br />
              Vậy tiền của bạn đang làm việc hay chỉ đang nằm yên?
            </div>
            <p
              className={`${montBold} text-[14px] italic leading-[22px] text-center`}
            >
              Tham gia ngay hôm nay để nhận trọn bộ lộ trình hoàn toàn MIỄN PHÍ!
            </p>
            <p className={`${mont} text-[16px] leading-[24px]`}>
              <strong className="font-bold text-[#FFC300]">
                Hệ thống 4 lớp lọc dòng tiền
              </strong>{" "}
              giúp bạn biết{" "}
              <strong className="font-bold text-[#FFC300]">
                tiền nên ở đâu trong từng giai đoạn của thị trường
              </strong>{" "}
              – khi nào tích lũy, khi nào gia tăng lợi nhuận và khi nào bảo vệ
              thành quả.
            </p>
            <CtaButton
              onClick={handleCtaClick}
              ctaLabel="dong_tien_hero_cta"
              className="mt-2 cursor-pointer"
            >
              <span className="block whitespace-nowrap text-[12px] leading-[18px] sm:text-[14px] sm:leading-[21px]">
                NHẬN PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN NGAY!
              </span>
            </CtaButton>
          </div>
        </div>
      </div>
    </section>
  );
}
