import type { GetServerSideProps } from "next";
import OptinLanding, { type OptinContent } from "@/features/optin/OptinLanding";
import styles from "@/styles/dong-tien-v2.module.css";

const content: OptinContent = {
  metaTitle: "Phương pháp xây dựng dòng tiền hiệu quả của Phạm Thành Biên",
  metaDescription:
    "Phương pháp xây dựng dòng tiền được Phạm Thành Biên đúc rút từ hơn 20 năm thực chiến đầu tư và kinh doanh. Đăng ký để nhận miễn phí bộ video.",
  heroImage: "/dong-tien/images/thinh-vuong-landing/hero-dong-tien-2048.webp",
  // \u00a0 (no-break space): "tư duy" stays together when the title wraps.
  title: "Chương trình này sẽ làm thay đổi tư\u00a0duy tài chính của bạn mãi mãi",
  subtitle: (
    <>
      33 chiến lược quản lý tài chính cá nhân
      <br />
      đơn giản - dễ áp dụng - hiệu quả cao
    </>
  ),
  share: {
    title: "Phương pháp xây dựng dòng tiền | Phạm Thành Biên",
    description:
      "Miễn phí bộ video: phương pháp xây dựng dòng tiền được Phạm Thành Biên đúc rút từ hơn 20 năm thực chiến đầu tư và kinh doanh.",
    image: "/dong-tien/og-image.jpg",
    imageAlt: "Phạm Thành Biên trên sân khấu lớp học Phương pháp xây dựng dòng tiền",
  },
  limitCount: "29 người",
  limitLine: "(Đã có hơn 20 nghìn nhà đầu tư ứng dụng)",
  videoSrc:
    "https://player.vimeo.com/video/1228651465?dnt=1&portrait=0&title=0&color=fecd08&byline=0&autopause=0",
  videoTitle: "Phương Pháp Trading Hiệu Quả",
  offerNote: (
    <>
      Dành cho <span className={styles.heroLimitNum}>29 người</span> đăng ký sớm nhất
    </>
  ),
  submitLabel: "GỬI VIDEO NGAY CHO TÔI",
  socialProofMessage: "vừa đăng ký thành công Bộ video tư duy đầu tư",
};

export default function DongTienV2() {
  return <OptinLanding content={content} />;
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });
