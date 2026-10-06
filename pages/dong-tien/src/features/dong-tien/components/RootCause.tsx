import { useRouter } from "next/router";
import CtaButton from "@/components/learning/CtaButton";
import { handleCta } from "../lib/ctaFlow";

export default function RootCause() {
  const router = useRouter();
  return (
    <section data-screen-label="Lý do gốc" style={{ background: "#F2F1ED", padding: "96px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 60,
            alignItems: "start",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontWeight: 500,
                fontSize: "clamp(28px, 4vw, 44px)",
                lineHeight: 1.18,
                margin: "0 0 30px",
                textWrap: "pretty",
              }}
            >
              Vấn đề không nằm ở chỗ bạn kiếm được bao nhiêu?
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                fontSize: 16,
                lineHeight: 1.75,
                color: "#44454A",
              }}
            >
              <p style={{ margin: 0 }}>
                Năm 2002, một suất cơm hộp văn phòng ở Hà Nội có giá 2.500 đồng. Hôm nay, vẫn hộp
                cơm đó, bạn phải trả 50.000 đồng.
              </p>
              <p style={{ margin: 0 }}>
                Năm 2002, một chỉ vàng có vài trăm nghìn đồng. <br />
                Hôm nay, một chỉ vàng đã lên đến hơn chục triệu đồng.
              </p>
              <p style={{ margin: 0, color: "#111214", fontWeight: 600 }}>
                Không phải hộp cơm ngon hơn 20 lần. <br />
                Không phải vàng quý hơn 100 lần. <br />
                Mà là đồng tiền của bạn đã mất đi quá nhiều giá trị!
              </p>
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid #E2E0DA",
              borderRadius: 14,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              gap: 12,
            }}
          >
            <p className="m-0 text-center text-[18px] leading-[1.7] text-[#44454A]">
              Đây là lượng tiền được bơm ra<br className="block lg:hidden" /> lưu thông qua từng năm.{" "}
              <strong style={{ color: "#111214" }}>
                <br />
                Thu nhập của bạn có tăng<br className="block lg:hidden" /> theo đường cong này không?
              </strong>
            </p>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 280,
                borderRadius: 10,
                overflow: "hidden",
                background: "#FBFAF8",
                border: "1px solid #EDEBE5",
              }}
            >
              <img
                src="/dong-tien/images/dong-tien/m2-chart.png"
                alt="Biểu đồ cung tiền M2, ảnh chụp từ TradingView ngày 06/10/2026"
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 46 }}>
          <CtaButton
            onClick={() => handleCta(router)}
            iconRight={true}
            ctaLabel="dong_tien_root_cause_cta"
            className="w-fit! max-w-[640px] cursor-pointer"
          >
            <span className="block text-[13px] leading-[19px] sm:text-[15px] sm:leading-[22px]">
              Nếu câu trả lời là KHÔNG,
              <br className="block lg:hidden" />
              thì bạn cần xem tấm bản đồ này
            </span>
          </CtaButton>
        </div>
      </div>
    </section>
  );
}
