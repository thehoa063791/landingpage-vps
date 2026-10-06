export default function Quote() {
  return (
    <section
      data-screen-label="Quote"
      style={{ background: "#FFC300", padding: "96px 24px 88px", position: "relative", overflow: "hidden" }}
    >
      <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", flexDirection: "column", gap: 40, position: "relative" }}>
        <p
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(27px, 4.2vw, 48px)",
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            color: "#0B0B0C",
            margin: 0,
            textAlign: "center",
            textWrap: "balance",
          }}
        >
          &ldquo;Tất cả những gì tôi chia sẻ là những thứ tôi{" "}
          <em style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(27px, 4.2vw, 48px)",
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            color: "#0B0B0C",
            margin: 0,
            textAlign: "center",
            textWrap: "balance",
          }}>đang làm</em>, và đang dạy cho chính gia đình, những
          người thân yêu và anh em đội nhóm.&rdquo;
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <span style={{ display: "block", width: 52, height: 1, background: "rgba(11,11,12,0.35)" }} />
          <span
            style={{
              fontFamily: "var(--font-bvp), system-ui, sans-serif",
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "0.01em",
              color: "#0B0B0C",
            }}
          >
            Phạm Thành Biên
          </span>
          <span style={{ display: "block", width: 52, height: 1, background: "rgba(11,11,12,0.35)" }} />
        </div>
      </div>
    </section>
  );
}
