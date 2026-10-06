"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/router";
import CtaButton from "@/components/learning/CtaButton";
import { CHAPTERS, CONFIG } from "@/features/dong-tien/lib/config";
import { handleCta } from "../lib/ctaFlow";

const MONO = "ui-monospace, Menlo, monospace";

interface Row {
  n: number;
  num: string;
  t: string;
  unlocked: boolean;
  locked: boolean;
  rowStyle: CSSProperties;
}

interface Layer {
  title: string;
  intro: string;
  lessons: Row[];
  unlocked: boolean;
  locked: boolean;
  mediaNote: string;
  ctaLabel: string;
  cardStyle: CSSProperties;
}

const PLAY_ICON = (
  <span
    style={{
      justifySelf: "end",
      display: "flex",
      width: 24,
      height: 24,
      borderRadius: "50%",
      background: "#FFC300",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <span
      style={{
        width: 0,
        height: 0,
        borderLeft: "7px solid #0B0B0C",
        borderTop: "4.5px solid transparent",
        borderBottom: "4.5px solid transparent",
        marginLeft: 2,
      }}
    />
  </span>
);

const LOCK_ICON = (
  <span
    style={{
      justifySelf: "end",
      display: "flex",
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.24)",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <span
      style={{
        position: "relative",
        display: "block",
        width: 9,
        height: 7,
        borderRadius: 2,
        background: "rgba(255,255,255,0.55)",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 1.5,
          top: -4.5,
          display: "block",
          width: 6,
          height: 5,
          border: "1.5px solid rgba(255,255,255,0.55)",
          borderBottom: "none",
          borderRadius: "3px 3px 0 0",
        }}
      />
    </span>
  </span>
);

const LOCK_MEDIA = (
  <div
    style={{
      width: 62,
      height: 62,
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.22)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ width: 20, height: 16, borderRadius: 4, background: "rgba(255,255,255,0.5)", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 4.5,
          top: -9,
          width: 11,
          height: 11,
          border: "2px solid rgba(255,255,255,0.5)",
          borderBottom: "none",
          borderRadius: "6px 6px 0 0",
        }}
      />
    </div>
  </div>
);

const PLAY_MEDIA = (
  <div
    style={{
      width: 62,
      height: 62,
      borderRadius: "50%",
      background: "#FFC300",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        width: 0,
        height: 0,
        borderLeft: "18px solid #0B0B0C",
        borderTop: "12px solid transparent",
        borderBottom: "12px solid transparent",
        marginLeft: 5,
      }}
    />
  </div>
);

export default function Story() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const [vp, setVp] = useState(0);
  const [pinFallback, setPinFallback] = useState(false);
  const [jsReady, setJsReady] = useState(false);
  const [mobActive, setMobActive] = useState(0);
  const [seen, setSeen] = useState<Record<number, boolean>>({});
  const [hoveredLesson, setHoveredLesson] = useState<number | null>(null);

  const vpRef = useRef(0);
  const pinFallbackRef = useRef(false);
  const mobActiveRef = useRef(0);
  const seenRef = useRef<Record<number, boolean>>({});
  const stickyMissRef = useRef(0);
  const animRef = useRef({ targetSet: false, pos: 0, target: 0, from: 0, t0: 0 });

  const ease = (t: number) => t * t * t * (t * (6 * t - 15) + 10);

  const applyLayers = (pos: number, k: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const layers = wrap.querySelectorAll<HTMLElement>("[data-story-layer]");
    const bgs = wrap.querySelectorAll<HTMLElement>("[data-story-bg]");
    for (let i = 0; i < layers.length; i++) {
      const d = pos - i;
      const ad = Math.abs(d);
      const st = layers[i].style;
      const base = Math.max(0, Math.min(1, 1 - ad));
      st.opacity = Math.pow(base, d > 0 ? 2.2 : 0.6).toFixed(3);
      st.transform =
        "translate3d(0," + (-d * 26 * k).toFixed(1) + "px,0) scale(" + (1 + Math.min(ad, 1) * 0.02 * k).toFixed(4) + ")";
      st.filter = "blur(" + Math.min(ad * (d > 0 ? 20 : 9) * k, 10).toFixed(2) + "px)";
      st.pointerEvents = ad < 0.5 ? "auto" : "none";
    }
    for (let i = 0; i < bgs.length; i++) {
      bgs[i].style.opacity = Math.max(0, Math.min(1, 1 - Math.abs(pos - i))).toFixed(3);
    }
  };

  const tick = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const vpNow = window.innerHeight;
    const r = wrap.getBoundingClientRect();
    const span = wrap.offsetHeight - vpNow;
    const raw = span > 0 ? Math.min(1, Math.max(0, (0 - r.top) / span)) : 0;
    const y = Math.round(Math.max(0, Math.min(span, 0 - r.top)));

    // giữ nguyên chương phần lớn hành trình, chuyển nhanh quanh mốc 25/50/75%
    let target = 0;
    if (raw >= 0.76) target = 3;
    else if (raw >= 0.51) target = 2;
    else if (raw >= 0.26) target = 1;
    const a = animRef.current;
    if (!a.targetSet) {
      a.targetSet = true;
      a.pos = target;
      a.target = target;
      a.from = target;
    }
    if (target !== a.target) {
      a.from = a.pos;
      a.target = target;
      a.t0 = performance.now();
    }
    const now = performance.now();
    const dur = 520;
    if (now - a.t0 < dur) {
      const t = ease((now - a.t0) / dur);
      a.pos = a.from + (a.target - a.from) * t;
    } else {
      a.pos = a.target;
    }
    const pos = a.pos;

    const pin = pinRef.current;
    if (pin) {
      if (pinFallbackRef.current) {
        pin.style.transform = "translate3d(0," + y + "px,0)";
      } else {
        if (pin.style.transform) pin.style.transform = "";
        if (raw > 0.06 && raw < 0.94) {
          const off = pin.getBoundingClientRect().top - 0;
          if (Math.abs(off) > 4) {
            stickyMissRef.current = (stickyMissRef.current || 0) + 1;
            if (stickyMissRef.current > 3) {
              pinFallbackRef.current = true;
              setPinFallback(true);
            }
          } else {
            stickyMissRef.current = 0;
          }
        }
      }
    }
    const stage = stageRef.current;
    if (stage && stage.style.transform) stage.style.transform = "";
    const k = window.innerWidth < 1200 ? 0.6 : 1;
    applyLayers(pos, k);

    const fill = fillRef.current;
    if (fill) fill.style.width = (Math.min(raw / 0.76, 1) * 100).toFixed(2) + "%";

    const cards = wrap.querySelectorAll<HTMLElement>("[data-story-navcard]");
    const nvDots = wrap.querySelectorAll<HTMLElement>("[data-story-navdot]");
    const nvNames = wrap.querySelectorAll<HTMLElement>("[data-story-navname]");
    const nvTitles = wrap.querySelectorAll<HTMLElement>("[data-story-navtitle]");
    const act = Math.round(pos);
    for (let i = 0; i < cards.length; i++) {
      const done = pos >= i - 0.4;
      const on = i === act;
      const cs = cards[i].style;
      cs.background = on ? "rgba(255,195,0,0.1)" : "rgba(255,255,255,0.05)";
      cs.borderColor = on ? "rgba(255,195,0,0.55)" : "rgba(255,255,255,0.1)";
      cs.transform = on ? "translateY(-3px)" : "translateY(0)";
      if (nvDots[i]) {
        nvDots[i].style.background = done ? "#FFC300" : "rgba(255,255,255,0.28)";
        nvDots[i].style.boxShadow = on ? "0 0 0 4px rgba(255,195,0,0.2)" : "none";
      }
      if (nvNames[i]) nvNames[i].style.color = on ? "#FFC300" : "rgba(255,255,255,0.5)";
      if (nvTitles[i]) nvTitles[i].style.color = on ? "#fff" : "rgba(255,255,255,0.72)";
    }

    if (Math.abs(vpNow - vpRef.current) > 1) {
      vpRef.current = vpNow;
      setVp(vpNow);
    }

    const mCards = (wrap.closest("section") || document).querySelectorAll<HTMLElement>("[data-story-card]");
    if (mCards.length) {
      const vh = window.innerHeight;
      const nextSeen = { ...seenRef.current };
      let changed = false;
      let active = mobActiveRef.current;
      let bestD = Infinity;
      for (let i = 0; i < mCards.length; i++) {
        const cr = mCards[i].getBoundingClientRect();
        if (cr.top < vh * 0.88 && cr.bottom > 0 && !nextSeen[i]) {
          nextSeen[i] = true;
          changed = true;
        }
        const d = Math.abs(cr.top + cr.height / 2 - vh / 2);
        if (d < bestD) {
          bestD = d;
          active = i;
        }
      }
      if (changed || active !== mobActiveRef.current) {
        seenRef.current = nextSeen;
        mobActiveRef.current = active;
        setSeen(nextSeen);
        setMobActive(active);
      }
    }
  };

  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    setJsReady(true);
    const loop = () => {
      tickRef.current();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const timer = window.setInterval(() => tickRef.current(), 50);
    const onScroll = () => tickRef.current();
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearInterval(timer);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("touchmove", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const rafRef = useRef(0);

  // sau mỗi render của React, áp lại trạng thái cuối cùng (React ghi đè style mỗi lần render)
  useLayoutEffect(() => {
    tickRef.current();
  });

  const jump = (i: number) => () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const vpH = window.innerHeight;
    const span = wrap.offsetHeight - vpH;
    const target = [0.1, 0.36, 0.61, 0.9][i] * span;
    window.scrollTo({ top: wrap.getBoundingClientRect().top + window.scrollY + target, behavior: "smooth" });
  };

  // Click logic giống /thinh-vuong: đã đăng nhập → vào bài học của chương,
  // chưa đăng nhập → auto-login hoặc mở popup đăng ký (handleCta).
  const runCta = (chapterIndex: number) => () => handleCta(router, chapterIndex);
  const onKeyEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  };

  const unlockAll = CONFIG.unlockAll;
  const layers: Layer[] = CHAPTERS.map((c, i) => {
    const unlocked = unlockAll || i === 0;
    return {
      title: c.title,
      intro: c.intro,
      lessons: c.lessons.map((ls) => ({
        n: ls.n,
        num: (ls.n < 10 ? "0" : "") + ls.n,
        t: ls.t,
        unlocked,
        locked: !unlocked,
        rowStyle: {
          display: "grid",
          gridTemplateColumns: "58px 1fr 26px",
          alignItems: "center",
          gap: "clamp(10px, 1.4vh, 14px)",
          padding: "clamp(8px, 1.2vh, 12px) 14px",
          borderRadius: 10,
          background: unlocked ? "rgba(255,195,0,0.06)" : "rgba(255,255,255,0.03)",
          border: "1px solid " + (unlocked ? "rgba(255,195,0,0.22)" : "rgba(255,255,255,0.08)"),
        },
      })),
      unlocked,
      locked: !unlocked,
      mediaNote: c.playerNote,
      ctaLabel: unlocked ? "Xem Chương " + (i + 1) + " ngay" : "Mở khóa Chương " + (i + 1),
      cardStyle: {},
    };
  });

  const deskStyle: CSSProperties = vp
    ? { position: "relative", height: Math.round(vp * 2.8) + "px" }
    : { position: "relative" };

  const pinStyle: CSSProperties = !vp
    ? { position: "relative", minHeight: "88vh", display: "flex", flexDirection: "column" }
    : pinFallback
      ? {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: vp + "px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        willChange: "transform",
      }
      : {
        position: "sticky",
        top: 0,
        height: vp + "px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      };

  const mobLayers: Layer[] = CHAPTERS.map((c, i) => {
    const vis = jsReady ? !!seen[i] : true;
    const unlocked = unlockAll || i === 0;
    return {
      title: c.title,
      intro: c.intro,
      lessons: c.lessons.map((ls) => ({
        n: ls.n,
        num: (ls.n < 10 ? "0" : "") + ls.n,
        t: ls.t,
        unlocked,
        locked: !unlocked,
        rowStyle: {
          display: "grid",
          gridTemplateColumns: "30px 1fr 22px",
          alignItems: "center",
          gap: 12,
          padding: "11px 12px",
          borderRadius: 10,
          background: unlocked ? "rgba(255,195,0,0.06)" : "rgba(255,255,255,0.03)",
          border: "1px solid " + (unlocked ? "rgba(255,195,0,0.22)" : "rgba(255,255,255,0.08)"),
        },
      })),
      unlocked,
      locked: !unlocked,
      mediaNote: c.playerNote,
      ctaLabel: unlocked ? "Xem Chương " + (i + 1) + " ngay" : "Mở khóa Chương " + (i + 1),
      cardStyle: {
        background: i % 2 ? "#101113" : "#141518",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        padding: "26px 22px 24px",
        opacity: vis ? 1 : 0,
        transform: vis ? "translate3d(0,0,0)" : "translate3d(0,22px,0)",
        transition: "opacity .6s cubic-bezier(.22,.61,.36,1), transform .6s cubic-bezier(.22,.61,.36,1)",
      },
    };
  });

  const mobFillStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    height: "100%",
    background: "#FFC300",
    transition: "width .4s ease",
    willChange: "width",
    width: ((mobActive + 1) / 4) * 100 + "%",
  };

  const renderLessonRow = (ls: Row, i: number, mobile: boolean, chapterIndex: number) => {
    const isHovered = !mobile && hoveredLesson === ls.n;
    const dynamicRowStyle = {
      ...ls.rowStyle,
      cursor: "pointer",
      background: isHovered
        ? "rgba(255,195,0,0.14)"
        : ls.unlocked
          ? "rgba(255,195,0,0.06)"
          : "rgba(255,255,255,0.03)",
      borderColor: isHovered
        ? "rgba(255,195,0,0.6)"
        : ls.unlocked
          ? "rgba(255,195,0,0.22)"
          : "rgba(255,255,255,0.08)",
      transform: isHovered ? "translateX(6px)" : "none",
      transition: "background 0.25s ease, border-color 0.25s ease, transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1)",
    };

    return (
      <div
        key={ls.num}
        role="button"
        tabIndex={0}
        className="story-lesson-row"
        aria-label={ls.unlocked ? `Xem bài ${ls.num}` : `Mở khóa chương để xem bài ${ls.num}`}
        onClick={runCta(chapterIndex)}
        onKeyDown={onKeyEnter(runCta(chapterIndex))}
        onMouseEnter={() => {
          if (!mobile) setHoveredLesson(ls.n);
        }}
        onMouseLeave={() => {
          if (!mobile) setHoveredLesson(null);
        }}
        style={dynamicRowStyle}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: mobile ? 11.5 : 12,
            letterSpacing: "0.06em",
            color: "#FFC300",
            whiteSpace: "nowrap",
          }}
        >
          {mobile ? ls.num : "Bài " + ls.num}
        </span>
        <span style={{ fontSize: mobile ? 14 : 14.5, lineHeight: 1.45, color: "rgba(255,255,255,0.88)" }}>
          {ls.t}
        </span>
        {ls.unlocked ? PLAY_ICON : LOCK_ICON}
      </div>
    );
  };

  return (
    <section data-screen-label="Bốn chương" style={{ background: "#0B0B0C", color: "#fff" }}>
      {/* ---------- Desktop: scroll storytelling ---------- */}
      <div className="story-desk" data-story-scroll="true" ref={wrapRef} style={deskStyle}>
        <div data-story-pin="true" ref={pinRef} style={pinStyle}>
          <div
            data-story-bg="0"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#0B0B0C",
              backgroundImage: "url('/dong-tien/images/dong-tien/chang-1.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center 40%",
              opacity: 1,
              willChange: "opacity",
            }}
          />
          <div
            data-story-bg="1"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#0B0B0C",
              backgroundImage: "url('/dong-tien/images/dong-tien/chang-2.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center 42%",
              opacity: 0,
              willChange: "opacity",
            }}
          />
          <div
            data-story-bg="2"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#0B0B0C",
              backgroundImage: "url('/dong-tien/images/dong-tien/chang-3.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center 30%",
              opacity: 0,
              willChange: "opacity",
            }}
          />
          <div
            data-story-bg="3"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#0B0B0C",
              backgroundImage: "url('/dong-tien/images/dong-tien/chang-4.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center 44%",
              opacity: 0,
              willChange: "opacity",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "linear-gradient(180deg, rgba(8,8,9,0.6) 0%, rgba(8,8,9,0.82) 46%, rgba(8,8,9,1) 100%)",
            }}
          />

          <div
            style={{
              position: "relative",
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 24px 24px",
            }}
          >
            <div
              data-story-stage="true"
              ref={stageRef}
              style={{ position: "relative", width: "100%", maxWidth: 1080, height: "100%", willChange: "transform" }}
            >
              {layers.map((L, i) => (
                <div
                  key={i}
                  data-story-layer="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "safe center",
                    overflowY: "auto",
                    opacity: 0,
                    willChange: "transform, opacity, filter",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.05fr 1fr",
                      gap: "clamp(28px, 4vw, 56px)",
                      alignItems: "center",
                      width: "100%",
                      maxHeight: "100%",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontFamily: "var(--font-playfair), Georgia, serif",
                          fontWeight: 500,
                          fontSize: "clamp(20px, 2.15vw, 31px)",
                          lineHeight: 1.2,
                          margin: "0 0 clamp(10px, 1.5vh, 16px)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {L.title}
                      </h3>
                      <p
                        style={{
                          fontSize: 15.5,
                          lineHeight: 1.65,
                          color: "rgba(255,255,255,0.68)",
                          margin: "0 0 clamp(12px, 2vh, 20px)",
                          maxWidth: 480,
                          textWrap: "pretty",
                        }}
                      >
                        {L.intro}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "clamp(5px, 0.9vh, 8px)",
                          marginBottom: "clamp(14px, 2.4vh, 24px)",
                          maxWidth: 480,
                        }}
                      >
                        {L.lessons.map((ls, li) => renderLessonRow(ls, li, false, i))}
                      </div>
                      <div style={{ display: "flex" }}>
                        <CtaButton
                          onClick={() => handleCta(router, i)}
                          ctaLabel={`dong_tien_story_chapter_${i + 1}`}
                          className="w-fit! cursor-pointer"
                        >
                          <span className="block whitespace-nowrap text-[13px] leading-[19px] sm:text-[15px] sm:leading-[22px] uppercase">
                            {L.ctaLabel}
                          </span>
                        </CtaButton>
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      className="story-media-click"
                      aria-label={L.unlocked ? `Xem Chương ${i + 1} ngay` : `Mở khóa Chương ${i + 1}`}
                      onClick={runCta(i)}
                      onKeyDown={onKeyEnter(runCta(i))}
                      style={{
                        position: "relative",
                        width: "100%",
                        maxHeight: "58vh",
                        aspectRatio: "4 / 3",
                        borderRadius: 14,
                        overflow: "hidden",
                        // backgroundColor: "#17181a",
                        // backgroundImage: "repeating-linear-gradient(135deg, rgba(255,195,0,0.08) 0 10px, transparent 10px 20px)",
                        // border: "1px solid rgba(255,255,255,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "clamp(8px, 1.6vh, 14px)",
                        marginTop: "135px",
                      }}
                    >
                      {/* Thumbnail background images for each lesson in the chapter */}
                      {CHAPTERS[i].lessons.map((ls) => {
                        const isFirstOfChapter = ls.n === CHAPTERS[i].lessons[0].n;
                        const isSelected = hoveredLesson === ls.n || (hoveredLesson === null && isFirstOfChapter);
                        return (
                          <img
                            key={ls.n}
                            src={`/dong-tien/images/dong-tien/thumb/bai-${ls.n}.png`}
                            alt={ls.t}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "max-content",
                              height: "max-content",
                              objectFit: "contain",
                              opacity: isSelected ? 1 : 0,
                              transition: "opacity 0.4s ease",
                              zIndex: 0,
                              borderRadius: 14,
                            }}
                          />
                        );
                      })}
                      {/* Content overlay */}
                      <div
                        style={{
                          position: "relative",
                          zIndex: 2,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "clamp(8px, 1.6vh, 14px)",
                          marginTop: "-50px",
                        }}
                      >
                        {L.unlocked ? PLAY_MEDIA : LOCK_MEDIA}
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "rgba(255,255,255,0.45)",
                          }}
                        >
                          {L.mediaNote}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "relative", flex: "none", padding: "0 24px 42px" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto" }}>
              <div style={{ position: "relative", height: 2, background: "rgba(255,255,255,0.14)", margin: "0 0 16px" }}>
                <div
                  data-story-fill="true"
                  ref={fillRef}
                  style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "0%", background: "#FFC300", willChange: "width" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {CHAPTERS.map((c, i) => (
                  <div
                    key={i}
                    onClick={jump(i)}
                    role="button"
                    tabIndex={0}
                    data-story-navcard="true"
                    style={{
                      cursor: "pointer",
                      borderRadius: 14,
                      padding: "14px 16px 15px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      backdropFilter: "blur(10px)",
                      transition: "background .3s ease, border-color .3s ease, transform .3s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                      <span
                        data-story-navdot="true"
                        style={{
                          flex: "none",
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.28)",
                          transition: "background .3s ease, box-shadow .3s ease",
                        }}
                      />
                      <span
                        data-story-navname="true"
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.5)",
                          transition: "color .3s ease",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Chương {i + 1}
                      </span>
                    </div>
                    <div
                      data-story-navtitle="true"
                      style={{ fontSize: 13.5, lineHeight: 1.4, color: "rgba(255,255,255,0.72)", transition: "color .3s ease" }}
                    >
                      {c.title}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        letterSpacing: "0.06em",
                        color: "rgba(255,255,255,0.36)",
                        marginTop: 7,
                      }}
                    >
                      {c.lessons.length} bài
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Mobile / tablet (<=1199px) ---------- */}
      <div className="story-mob" style={{ padding: "64px 20px 76px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "rgba(11,11,12,0.92)",
              backdropFilter: "blur(6px)",
              padding: "14px 0 16px",
              marginBottom: 30,
            }}
          >
            <div style={{ position: "relative", height: 2, background: "rgba(255,255,255,0.14)", margin: "0 4px 12px" }}>
              <div style={mobFillStyle} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {CHAPTERS.map((_, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: "0.1em",
                    color: i <= mobActive ? "#FFC300" : "rgba(255,255,255,0.35)",
                    transition: "color .3s ease",
                  }}
                >
                  0{i + 1}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {mobLayers.map((L, i) => (
              <div key={i} data-story-card="true" style={L.cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                  {L.unlocked ? (
                    <div
                      role="button"
                      tabIndex={0}
                      className="story-media-click"
                      aria-label={`Xem Chương ${i + 1} ngay`}
                      onClick={runCta(i)}
                      onKeyDown={onKeyEnter(runCta(i))}
                      style={{
                        flex: "none",
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: "#FFC300",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "13px solid #0B0B0C",
                          borderTop: "8px solid transparent",
                          borderBottom: "8px solid transparent",
                          marginLeft: 4,
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      className="story-media-click"
                      aria-label={`Mở khóa Chương ${i + 1}`}
                      onClick={runCta(i)}
                      onKeyDown={onKeyEnter(runCta(i))}
                      style={{
                        flex: "none",
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,0.22)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div style={{ width: 15, height: 12, borderRadius: 3, background: "rgba(255,255,255,0.5)", position: "relative" }}>
                        <div
                          style={{
                            position: "absolute",
                            left: 3.5,
                            top: -7,
                            width: 8,
                            height: 8,
                            border: "2px solid rgba(255,255,255,0.5)",
                            borderBottom: "none",
                            borderRadius: "4px 4px 0 0",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-playfair), Georgia, serif",
                    fontWeight: 500,
                    fontSize: 25,
                    lineHeight: 1.22,
                    margin: "0 0 14px",
                    textWrap: "pretty",
                  }}
                >
                  {L.title}
                </h3>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.68)", margin: "0 0 18px" }}>
                  {L.intro}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
                  {L.lessons.map((ls, li) => renderLessonRow(ls, li, true, i))}
                </div>
                <CtaButton
                  onClick={() => handleCta(router, i)}
                  ctaLabel={`dong_tien_story_mob_chapter_${i + 1}`}
                  className="cursor-pointer"
                >
                  <span className="block whitespace-nowrap text-[14px] leading-[20px] uppercase">
                    {L.ctaLabel}
                  </span>
                </CtaButton>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
