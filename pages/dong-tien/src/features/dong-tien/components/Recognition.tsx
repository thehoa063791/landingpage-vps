"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const CARDS = [
  {
    title: "Người đi làm",
    body: (
      <>
        Làm việc chăm chỉ hơn 10 năm.
        <br />
        Thu nhập ngày càng tăng.
        <br />
        Nhưng cuối năm nhìn lại...
        <br />
        Tài sản gần như không thay đổi.
      </>
    ),
  },
  {
    title: "Chủ doanh nghiệp",
    body: (
      <>
        Doanh thu tốt qua nhiều năm.
        <br />
        Nhưng phần lớn tài sản lại nằm trong xe, đồng hồ, cửa hàng...
        <br />
        Những thứ liên tục mất giá theo thời gian.
      </>
    ),
  },
  {
    title: "Nhà đầu tư",
    body: (
      <>
        Đã từng đầu tư chứng khoán.
        <br />
        Đã từng mua vàng.
        <br />
        Đã từng giao dịch Crypto.
        <br />
        Có lúc thắng. Có lúc thua.
        <br />
        Nhưng cộng cả năm... tài khoản vẫn không tăng.
      </>
    ),
  },
  {
    title: "Người trong ngành",
    body: (
      <>
        Bạn làm ngân hàng, môi giới bất động sản, tư vấn tài chính. Bạn giúp người khác mua tài sản
        mỗi ngày. Còn chính bạn chưa sở hữu một mét vuông nào.
      </>
    ),
  },
];

export default function Recognition() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const activeRef = useRef(-1);
  const apply = (v: number) => {
    activeRef.current = v;
    setActive(v);
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll("[data-pic]"));
    if (!cards.length) return;

    let timer: number | null = null;
    let userTook = false;
    let n = 0;

    const over = (e: MouseEvent) => {
      const g = gridRef.current;
      if (!g) return;
      const t = e.target as HTMLElement | null;
      const card = t && t.closest ? t.closest("[data-pic]") : null;
      if (card && g.contains(card)) {
        userTook = true;
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
        apply(Number(card.getAttribute("data-pic")));
      } else if (userTook && !(t && t.closest && t.closest("[data-pic-grid]"))) {
        if (activeRef.current !== -1) apply(-1);
      }
    };
    document.addEventListener("mouseover", over, { passive: true });

    const startAuto = () => {
      if (timer || userTook) return;
      apply(0);
      n = 0;
      timer = window.setInterval(() => {
        if (userTook) {
          if (timer) window.clearInterval(timer);
          timer = null;
          return;
        }
        n = (n + 1) % cards.length;
        apply(n);
      }, 2100);
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) startAuto();
            else if (timer) {
              window.clearInterval(timer);
              timer = null;
              apply(-1);
            }
          });
        },
        { threshold: 0.35 }
      );
      io.observe(grid);
    } else {
      startAuto();
    }

    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("mouseover", over);
      if (io) io.disconnect();
    };
  }, []);

  return (
    <section data-screen-label="Nhận diện" style={{ background: "#ffffff", padding: "96px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(28px, 4vw, 44px)",
            lineHeight: 1.18,
            margin: "0 0 52px",
            maxWidth: 620,
            textWrap: "pretty",
            color: "#000000",
          }}
        >
          Bạn có đang thấy mình thuộc
          <br />
          <b style={{ color: "#FFC300" }}>một trong bốn bức tranh này?</b>
        </h2>

        <div
          data-pic-grid="true"
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          {CARDS.map((card, i) => {
            const on = i === active;
            const cardStyle: CSSProperties = {
              position: "relative",
              isolation: "isolate",
              border: "1px solid #E6E4DF",
              borderRadius: 14,
              padding: "34px 28px 44px",
              minHeight: 300,
              display: "flex",
              flexDirection: "column",
              background: on ? "#FFFCF4" : "#FAF9F6",
              transition:
                "transform 480ms cubic-bezier(.2,.8,.2,1), box-shadow 480ms cubic-bezier(.2,.8,.2,1), border-color 480ms ease, background 480ms ease",
              willChange: "transform",
              transform: on ? "translateY(-10px) scale(1.035)" : "translateY(0) scale(1)",
              zIndex: on ? 3 : 1,
              boxShadow: on
                ? "0 26px 54px -18px rgba(60,38,0,0.45), 0 4px 14px rgba(17,16,14,0.08)"
                : "none",
              borderColor: on ? "rgba(255,195,0,0)" : "#E6E4DF",
            };
            const glowStyle: CSSProperties = {
              position: "absolute",
              inset: 0,
              zIndex: -1,
              borderRadius: 14,
              opacity: on ? 1 : 0,
              transform: on ? "scale(1) translateY(0)" : "scale(1.04) translateY(10px)",
              transition: "opacity 520ms cubic-bezier(.2,.8,.2,1), transform 620ms cubic-bezier(.2,.8,.2,1)",
              background:
                "radial-gradient(115% 85% at 80% 116%, #FF7A18 0%, #FFA524 26%, #FFC300 50%, rgba(255,195,0,0) 76%), radial-gradient(95% 70% at 18% 108%, rgba(255,195,0,0.6) 0%, rgba(255,195,0,0) 72%)",
            };
            return (
              <div key={card.title} data-pic={String(i)} style={cardStyle}>
                <div data-pic-glow="true" aria-hidden="true" style={glowStyle} />
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px" }}>{card.title}</h3>
                <p
                  data-pic-body="true"
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.7,
                    color: on ? "#3B3527" : "#55565A",
                    margin: 0,
                    transition: "color 420ms ease",
                  }}
                >
                  {card.body}
                </p>
              </div>
            );
          })}
        </div>

        <p
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: "clamp(19px, 2.2vw, 24px)",
            lineHeight: 1.55,
            margin: "46px 0 0",
            maxWidth: 600,
            color: "#111214",
          }}
        >
          Cả bốn bức tranh đều có chung một nguyên nhân.
          <br />
          Và chắc chắn&nbsp;<b>không phải</b> do bạn chưa đủ chăm chỉ.
        </p>
      </div>
    </section>
  );
}
