"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import CtaButton from "@/components/learning/CtaButton";
import { handleCta } from "../lib/ctaFlow";

const MONO = "ui-monospace, Menlo, monospace";

const BOARDS = [
  { src: "/dong-tien/images/dong-tien/opt/DSC03034-abc5a1d7.webp", side: "left" },
  { src: "/dong-tien/images/dong-tien/opt/DSCF9220-6c53e409.webp", side: "right" },
  { src: "/dong-tien/images/dong-tien/opt/VIN_1429.webp", side: "left" },
  { src: "/dong-tien/images/dong-tien/opt/DSC04158-301d92ce.webp", side: "right" },
  { src: "/dong-tien/images/dong-tien/opt/board-c.webp", side: "left" },
  { src: "/dong-tien/images/dong-tien/opt/DSC01970-c334fb5f.webp", side: "right" },
];

export default function Gallery() {
  const router = useRouter();
  const wrapRef = useRef<HTMLElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const corrVW = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const cam = camRef.current;
    if (!wrap || !cam) return;

    const STEP = 760;
    const FIRST = 900;
    const boards = Array.from(cam.querySelectorAll<HTMLElement>("[data-corr-board]"));
    boards.forEach((b, i) => {
      const left = b.getAttribute("data-corr-side") === "left";
      b.dataset.z = String(-(FIRST + i * STEP));
      b.dataset.x = String(left ? -350 : 350);
      b.dataset.rot = String(left ? 26 : -26);
    });
    const endZ = -(FIRST + boards.length * STEP + 420);
    const total = -endZ - 200;

    const layout = () => {
      const vw = wrap.clientWidth || window.innerWidth;
      if (corrVW.current === vw) return;
      corrVW.current = vw;
      const w = Math.round(Math.max(300, Math.min(660, vw * 0.42)));
      const h = Math.round(w * 0.563);
      const xo = Math.round(Math.max(230, Math.min(760, vw * 0.38)));
      boards.forEach((b) => {
        const left = b.getAttribute("data-corr-side") === "left";
        b.dataset.rot = String(left ? 26 : -26);
        b.style.width = w + "px";
        b.style.marginLeft = -Math.round(w / 2) + "px";
        b.style.marginTop = -Math.round(h * 0.2) + "px";
        b.dataset.x = String(left ? -xo : xo);
        const pic = b.children[0] as HTMLElement | undefined;
        if (pic) pic.style.height = h + "px";
        const refl = b.children[1] as HTMLElement | undefined;
        if (refl) refl.style.height = Math.round(h * 0.27) + "px";
      });
    };

    const draw = () => {
      layout();
      const vh = window.innerHeight;
      const r = wrap.getBoundingClientRect();
      const span = Math.max(1, wrap.offsetHeight - vh);
      const p = Math.min(1, Math.max(0, (0 - r.top) / span));
      const travel = p * total;

      boards.forEach((b) => {
        const z = Number(b.dataset.z) + travel;
        b.style.transform =
          "translate3d(" + b.dataset.x + "px, 0, " + z.toFixed(1) + "px) rotateY(" + b.dataset.rot + "deg)";
        let o = 1;
        if (z > 140) o = Math.max(0, 1 - (z - 140) / 330);
        if (z > 470) o = 0;
        if (z < -5200) o = Math.max(0, 1 - (-z - 5200) / 1600);
        b.style.opacity = o.toFixed(3);
        b.style.visibility = o < 0.01 ? "hidden" : "visible";
      });

      const endEl = endRef.current;
      if (endEl) {
        const eo = Math.max(0, Math.min(1, (p - 0.82) / 0.12));
        endEl.style.opacity = eo.toFixed(3);
        endEl.style.transform = "translate(-50%, -50%) scale(" + (0.94 + 0.06 * eo).toFixed(3) + ")";
        endEl.style.pointerEvents = eo > 0.35 ? "auto" : "none";
      }
      const introEl = introRef.current;
      if (introEl) {
        const o = Math.max(0, Math.min(1, 1 - (p - 0.7) / 0.16));
        introEl.style.opacity = o.toFixed(3);
        introEl.style.pointerEvents = o < 0.2 ? "none" : "auto";
        introEl.style.transform =
          "translateX(-50%) translateY(" + (-34 * Math.max(0, (p - 0.7) / 0.16)).toFixed(1) + "px)";
      }
      const bgEl = bgRef.current;
      if (bgEl) {
        bgEl.style.transform = "scale(" + (1 + p * 0.55).toFixed(4) + ")";
        bgEl.style.filter = "brightness(" + (0.92 - p * 0.28).toFixed(3) + ") saturate(0.9)";
      }
      const hintEl = hintRef.current;
      if (hintEl) hintEl.style.opacity = Math.max(0, 1 - p / 0.09).toFixed(3);
    };

    draw();
    const t1 = window.setTimeout(draw, 80);
    const t2 = window.setTimeout(draw, 260);
    const t3 = window.setTimeout(draw, 700);
    const onScroll = () => draw();
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const loop = window.setInterval(() => draw(), 32);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearInterval(loop);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  return (
    <section
      data-screen-label="Hành lang ảnh"
      data-corr-wrap="true"
      ref={wrapRef}
      style={{ position: "relative", background: "#08080A", color: "#fff", height: "330vh" }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: "radial-gradient(120% 90% at 50% 50%, #101014 0%, #08080A 58%, #050506 100%)",
        }}
      >
        <div
          data-corr-bg="true"
          aria-hidden="true"
          ref={bgRef}
          style={{ position: "absolute", inset: "-8%", zIndex: 0, transformOrigin: "50% 46%", overflow: "hidden" }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#050506",
              backgroundImage: "url('/dong-tien/images/dong-tien/opt/hero-chatgpt.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center 46%",
            }}
          />
        </div>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background: "radial-gradient(80% 62% at 50% 46%, rgba(0,0,0,0) 0%, rgba(5,5,6,0.55) 62%, rgba(5,5,6,0.9) 100%)",
          }}
        />

        <div
          data-corr-world="true"
          style={{ position: "absolute", inset: 0, zIndex: 2, transformStyle: "preserve-3d", perspective: 1100, perspectiveOrigin: "50% 56%" }}
        >
          <div data-corr-cam="true" ref={camRef} style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
            {BOARDS.map((b, i) => (
              <div
                key={b.src}
                data-corr-board={String(i)}
                data-corr-side={b.side}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 380,
                  marginLeft: -190,
                  marginTop: -42,
                  transformOrigin: "50% 50%",
                  backfaceVisibility: "hidden",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    height: 214,
                    backgroundColor: "#14151A",
                    backgroundImage: "url('" + b.src + "')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14), 0 0 46px rgba(255,190,80,0.14)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.42) 100%)",
                    }}
                  />
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    height: 58,
                    backgroundColor: "#14151A",
                    backgroundImage: "url('" + b.src + "')",
                    backgroundSize: "cover",
                    backgroundPosition: "center bottom",
                    transform: "scaleY(-1)",
                    opacity: 0.26,
                    filter: "blur(1.1px)",
                    WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 96%)",
                    maskImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 96%)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          data-corr-intro="true"
          ref={introRef}
          style={{
            position: "absolute",
            left: "50%",
            top: "12vh",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 720,
            padding: "0 24px",
            boxSizing: "border-box",
            textAlign: "center",
            zIndex: 5,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(28px, 4vw, 44px)",
              lineHeight: 1.18,
              margin: "0 0 12px",
            }}
          >
            Hơn 20 năm,
            <br />
            chưa từng dừng lại
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.6)",
              margin: "0 auto",
              maxWidth: 480,
              textWrap: "pretty",
            }}
          >
            Từ những lớp học đầu tiên đến hôm nay - cùng một phương pháp, hàng nghìn người đã đi qua.
          </p>
        </div>

        <div
          data-corr-end="true"
          ref={endRef}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "min(760px, 100% - 40px)",
            transform: "translate(-50%, -50%)",
            boxSizing: "border-box",
            textAlign: "center",
            opacity: 0,
            zIndex: 8,
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(26px, 6.4vw, 40px)",
              lineHeight: 1.22,
              margin: 0,
              textWrap: "balance",
            }}
          >
            Đừng để 20 năm nữa
            <br />
            vẫn hỏi cùng một câu hỏi
          </p>
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.65,
              color: "rgba(255,255,255,0.6)",
              margin: "16px auto 0",
              maxWidth: 480,
              textWrap: "pretty",
            }}
          >
            Bạn đã đọc đến đây, tức là câu hỏi về tiền vẫn chưa được trả lời. Học hết bốn chương, bạn
            sẽ tự trả lời được.
          </p>
          <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 2, marginTop: 24 }}>
            <CtaButton
              onClick={() => handleCta(router)}
              ctaLabel="dong_tien_gallery_cta"
              className="w-fit! cursor-pointer"
            >
              <span className="block whitespace-nowrap text-[13px] leading-[19px] sm:text-[15px] sm:leading-[22px] uppercase">
                Bắt đầu chương 1
              </span>
            </CtaButton>
          </div>
        </div>

        <div
          data-corr-hint="true"
          aria-hidden="true"
          ref={hintRef}
          style={{
            position: "absolute",
            bottom: 22,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            zIndex: 5,
          }}
        >
          cuộn để đi sâu vào trong
        </div>
      </div>
    </section>
  );
}
