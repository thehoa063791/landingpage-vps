export default function Footer() {
  return (
    <footer
      data-screen-label="Footer"
      style={{
        background: "linear-gradient(100deg, #4B4FA8 0%, #7A4B9E 34%, #A8407C 66%, #C9315A 100%)",
        color: "#fff",
        padding: "44px 24px 40px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" }}>
          Công ty Cổ phần Tập đoàn VINMOC
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.94)" }}>Mã số doanh nghiệp: 0107136243</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.94)" }}>
          Địa chỉ: C53711 Tầng 37, Tòa nhà C5, lô HH, KĐT Đông Nam,
          <br />
          Trần Duy Hưng, Phường Yên Hòa, Thành Phố Hà Nội.
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.94)" }}>
          Hotline: 086 242 1919 Email: support@vinmoc.com
        </div>
      </div>
      <div style={{ height: 56 }} />
    </footer>
  );
}
