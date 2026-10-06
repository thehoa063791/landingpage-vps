import { useRouter } from "next/router";
import CtaButton from "@/components/learning/CtaButton";
import { handleCta } from "../lib/ctaFlow";

const ROWS = [
  {
    title: "Không hứa hẹn giàu nhanh",
    body: "Đây là hành trình xây dựng kiến thức, kỹ năng và tư duy giao dịch bài bản. Bạn có thể đi nhanh hơn khi có người hướng dẫn, nhưng kết quả vẫn cần thời gian và sự rèn luyện.",
  },
  {
    title: "Không cam kết mức lợi nhuận cố định",
    body: "Thị trường luôn biến động và không có con số lợi nhuận nào được đảm bảo mỗi tháng. Điều quan trọng là học cách quản trị rủi ro và duy trì sự ổn định lâu dài.",
  },
  {
    title: "Không phím mã, không “mua ngay tối nay”.",
    body: "Bạn sẽ được hướng dẫn cách phân tích và tự đưa ra quyết định, thay vì chỉ chờ người khác báo mua gì, bán gì.",
  },
  {
    title: "Không dành cho tất cả mọi người.",
    body: "Chương trình dành cho những ai muốn hiểu thị trường từ nền tảng, xây dựng phương pháp rõ ràng và từng bước nâng cao năng lực giao dịch.",
  },
];

export default function Manifesto() {
  const router = useRouter();
  return (
    <section data-screen-label="Tuyên ngôn" style={{ background: "#ffffff", color: "#111214", padding: "76px 24px 72px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <h2
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(28px, 4vw, 46px)",
            lineHeight: 1.16,
            margin: "0 auto 26px",
            maxWidth: 660,
            textWrap: "pretty",
            textAlign: "center",
          }}
        >
          Tấm bản đồ có thể làm
          <br />
          vài người thất vọng bởi vì
        </h2>

        <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid #EDEBE5" }}>
          {ROWS.map((row) => (
            <div
              key={row.title}
              style={{
                display: "grid",
                gridTemplateColumns: "34px 1fr",
                gap: 20,
                alignItems: "start",
                padding: "12px 0",
                borderStyle: "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: 19,
                  lineHeight: 1.4,
                  color: "#B9B7B0",
                }}
              >
                ✕
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p
                  style={{
                    fontSize: "clamp(18px, 2.1vw, 22px)",
                    fontWeight: 700,
                    lineHeight: 1.35,
                    color: "#111214",
                    margin: 0,
                  }}
                >
                  {row.title}
                </p>
                <div
                  style={{
                    fontSize: 15.5,
                    lineHeight: 1.72,
                    color: "#55565B",
                    margin: 0,
                    maxWidth: 660,
                    textWrap: "pretty",
                  }}
                >
                  <div>{row.body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(17px, 2vw, 21px)",
            lineHeight: 1.45,
            color: "#111214",
            margin: "40px 0 0",
            maxWidth: 720,
            textWrap: "pretty",
          }}
        >
          Điều khóa học mang lại không chỉ là kiến thức, mà còn là góc nhìn được đúc kết từ hơn 20
          năm trải nghiệm trên thị trường của Biên, cùng một lộ trình rõ ràng để bạn xây dựng năng
          lực đầu tư của mình.
        </p>

        <p
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(17px, 2vw, 21px)",
            lineHeight: 1.55,
            color: "#111214",
            margin: "30px 0 32px",
            paddingLeft: 18,
            borderLeft: "2px solid #FFC300",
            maxWidth: 640,
          }}
        >
          &ldquo;Đầu tư tài chính là một lĩnh vực khó. Vì vậy, để đi đường dài, bạn cần sự nghiêm
          túc, kỷ luật và một hệ thống kiến thức bài bản.&rdquo;
        </p>

        <div style={{ alignSelf: "start", display: "flex" }}>
          <CtaButton
            onClick={() => handleCta(router)}
            ctaLabel="dong_tien_manifesto_cta"
            className="w-fit! cursor-pointer"
          >
            <span className="block whitespace-nowrap text-[13px] leading-[19px] sm:text-[14px] sm:leading-[21px] uppercase">
              Tôi sẵn sàng xem nghiêm túc
            </span>
          </CtaButton>
        </div>
      </div>
    </section>
  );
}
