"use client";

import { useRouter } from "next/router";
import { CONFIG } from "@/features/dong-tien/lib/config";
import { handleCta } from "../lib/ctaFlow";

export default function StickyCta() {
  const router = useRouter();
  if (!CONFIG.showStickyCta) return null;
  return (
    <div
      className="om-sticky-cta"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background: "rgba(11,11,12,0.94)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        padding: "12px 16px",
        display: "flex",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", textTransform: "uppercase" }}>Tiền vẫn đang mất giá mỗi ngày</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255)" }}>Học cách giữ và nhân nó lên, miễn phí</div>
      </div>
      <button
        type="button"
        onClick={() => handleCta(router)}
        style={{
          flex: "none",
          background: "linear-gradient(90deg, #e52d27 0%, #b31217 100%)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "inherit",
          border: "none",
          padding: "14px 22px",
          borderRadius: 999,
          boxShadow: "0 8px 24px rgba(229,45,39,0.45)",
          cursor: "pointer",
          transition: "box-shadow .2s ease, transform .2s ease, filter .2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(90deg, #ff3a30 0%, #d31015 100%)";
          e.currentTarget.style.transform = "scale(1.03)";
          e.currentTarget.style.boxShadow = "0 12px 28px rgba(229,45,39,0.6)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(90deg, #e52d27 0%, #b31217 100%)";
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(229,45,39,0.45)";
        }}
      >
        Nhận bản đồ
      </button>
    </div>
  );
}
