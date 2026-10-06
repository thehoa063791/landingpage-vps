import { useRouter } from "next/router";
import CtaButton from "@/components/learning/CtaButton";
import { handleCta } from "../lib/ctaFlow";

export default function Mentor() {
  const router = useRouter();
  return (
    <section
      data-screen-label="Mentor"
      style={{ position: "relative", zIndex: 2, background: "#0B0B0C", color: "#fff", padding: "0 24px 0" }}
    >
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div
          aria-hidden="true"
          className="mentor-mark"
          style={{
            position: "absolute",
            left: "0vw",
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            lineHeight: 0.82,
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
            gap: 20,
          }}
        >
          <span
            style={{
              background:
                "linear-gradient(96deg, rgba(255,195,0,0.30) 0%, rgba(255,195,0,0.07) 46%, rgba(255,255,255,0.03) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              fontSize: 120,
              overflow: "visible",
            }}
          >
            Bản đồ
          </span>
          <span
            style={{
              background:
                "linear-gradient(96deg, rgba(255,195,0,0.17) 0%, rgba(255,255,255,0.05) 52%, rgba(255,255,255,0.02) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              fontSize: 120,
              overflow: "visible",
            }}
          >
            Xây dựng
          </span>
          <span
            style={{
              background:
                "linear-gradient(96deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.01) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              fontSize: 120,
              overflow: "visible",
            }}
          >
            Dòng tiền
          </span>
        </div>
      </div>

      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
        <div className="mentor-grid">
          <div className="mentor-portrait" style={{ overflow: "visible" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dong-tien/images/dong-tien/opt/mentor-portrait.webp"
              alt="Phạm Thành Biên"
              className="mentor-img"
            />
          </div>

          <div className="mentor-copy">
            <h2
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontWeight: 500,
                fontSize: "clamp(27px, 3.4vw, 40px)",
                lineHeight: 1.16,
                margin: "0 0 22px",
                textWrap: "pretty",
              }}
            >
              Phạm Thành Biên —
              <br />
              20 năm vẽ lại tấm bản đồ này
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 15,
                fontSize: 15,
                lineHeight: 1.72,
                color: "rgba(255,255,255,0.7)",
                maxWidth: 540,
              }}
            >
              <p style={{ margin: 0 }}>
                Tháng lương đầu tiên của ông là 320.000 đồng - một kỹ sư điện tử tự động hóa, thạc
                sĩ Bách Khoa, ở Hà Nội với một vợ một con. Ông làm thêm đủ nghề, có tuần kiếm 15–20
                triệu bằng cách phi xe xuống khu công nghiệp sửa máy.
              </p>
              <p style={{ margin: 0 }}>
                Rồi năm 2004, ông đổ bệnh vì lao lực - sáu mươi ngày nằm viện. Chính những ngày đó
                khiến ông nhận ra: đổi sức khỏe lấy tiền là con đường không có đích. Ra viện, ông tìm
                đến thị trường. Sáu năm học phí đắt, thắng đúng sóng 2005–2007 rồi thua sạch trên vàng
                và ngoại hối 2008–2010.
              </p>
              <p style={{ margin: 0 }}>
                Cuối 2010, ông đóng gói tất cả thành một quy trình. Đến nay, hơn trăm nghìn
                <strong>&nbsp;học viên</strong> đã học trực tiếp tại Hà Nội, TP.HCM và qua Zoom cho
                người Việt đang sinh sống ở nhiều quốc gia trên thế giới.
              </p>
            </div>

            <p
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontStyle: "italic",
                fontSize: "clamp(17px, 2vw, 21px)",
                lineHeight: 1.55,
                color: "#fff",
                margin: "26px 0 28px",
                paddingLeft: 18,
                borderLeft: "2px solid #FFC300",
                maxWidth: 540,
              }}
            >
              &ldquo;Người ta nhớ những năm tôi thành công. Tôi nhớ những năm tôi trắng tay - vì đó
              mới là lúc tôi thật sự học.&rdquo;
            </p>

            <div style={{ display: "flex" }}>
              <CtaButton
                onClick={() => handleCta(router)}
                iconRight={true}
                ctaLabel="dong_tien_mentor_cta"
                className="w-fit! cursor-pointer"
              >
                <span className="block whitespace-nowrap text-[13px] leading-[19px] sm:text-[15px] sm:leading-[22px] uppercase">
                  Và bạn không cần phải thế!
                </span>
              </CtaButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
