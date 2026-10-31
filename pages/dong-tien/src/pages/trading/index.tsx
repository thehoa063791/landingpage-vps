import type { GetServerSideProps } from "next";
import OptinLanding, { type OptinContent } from "@/features/optin/OptinLanding";
import styles from "@/styles/dong-tien-v2.module.css";

// Copy follows https://phamthanhbien.com/trading/ until the final page is approved.
const content: OptinContent = {
  metaTitle: "Phương pháp giao dịch hiệu quả của Phạm Thành Biên",
  metaDescription:
    "Phương pháp giao dịch được Phạm Thành Biên thực chiến hơn 20 năm qua. Đăng ký để nhận miễn phí 4 video.",
  heroImage: "/trading/hero-classroom.webp",
  // \u00a0 (no-break space): "TẠO RA" and "MỖI TUẦN" stay together when the title wraps.
  title: "BÍ MẬT PHƯƠNG PHÁP TRADING TẠO\u00a0RA HÀNG NGHÌN ĐÔ-LA MỖI\u00a0TUẦN",
  subtitle: "Quy trình giao dịch theo 4 bước được Phạm Thành Biên thực chiến hơn 15 năm qua",
  singleLineHeading: true,
  dimHeroTop: true,
  share: {
    title: "Phương pháp Trading hiệu quả cho Trader | Phạm Thành Biên",
    description:
      "Phương pháp trading được Phạm Thành Biên thực chiến hơn 20 năm qua ứng dụng cho Vàng và Chứng khoán",
    image: "/trading/og-image.jpg",
    imageAlt: "Phạm Thành Biên giảng dạy phương pháp Trading hiệu quả",
  },
  limitCount: "27 người",
  limitLine: "(Đã có hơn 20 nghìn nhà đầu tư ứng dụng)",
  videoSrc:
    "https://player.vimeo.com/video/1228651465?dnt=1&portrait=0&title=0&color=fecd08&byline=0&autopause=0",
  videoTitle: "Phương pháp Trading hiệu quả",
  offerNote: (
    <>
      Dành cho <span className={styles.heroLimitNum}>27 người</span> đăng ký sớm nhất
    </>
  ),
  submitLabel: "GỬI NGAY CHO TÔI",
  privacyNote: "Thông tin của bạn được bảo mật tuyệt đối.",
  socialProofMessage: "vừa đăng ký nhận Phương pháp Trading hiệu quả",
};

export default function TradingLanding() {
  return <OptinLanding content={content} />;
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });
