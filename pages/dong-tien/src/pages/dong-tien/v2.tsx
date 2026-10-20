import type { GetServerSideProps } from "next";
import OptinLanding, { type OptinContent } from "@/features/optin/OptinLanding";

const content: OptinContent = {
  metaTitle: "Phương pháp xây dựng dòng tiền hiệu quả của Phạm Thành Biên",
  metaDescription:
    "Phương pháp xây dựng dòng tiền được Phạm Thành Biên đúc rút từ hơn 20 năm thực chiến đầu tư và kinh doanh. Đăng ký để nhận miễn phí bộ video.",
  heroImage: "/dong-tien/images/thinh-vuong-landing/hero-dong-tien-2048.webp",
  title: "Tư duy này sẽ làm thay đổi mạnh mẽ bức tranh tài chính của bạn",
  subtitle: (
    <>
      Tặng bạn bộ video được đúc rút từ 20 năm kinh nghiệm đầu tư và kinh doanh của{" "}
      <span style={{ whiteSpace: "nowrap" }}>Phạm Thành Biên</span>
    </>
  ),
  share: {
    title: "Phương pháp xây dựng dòng tiền | Phạm Thành Biên",
    description:
      "Miễn phí bộ video: phương pháp xây dựng dòng tiền được Phạm Thành Biên đúc rút từ hơn 20 năm thực chiến đầu tư và kinh doanh.",
    image: "/dong-tien/og-image.jpg",
    imageAlt: "Phạm Thành Biên trên sân khấu lớp học Phương pháp xây dựng dòng tiền",
  },
  limitCount: "27 người",
  videoSrc:
    "https://player.vimeo.com/video/1228651465?dnt=1&portrait=0&title=0&color=fecd08&byline=0&autopause=0",
  videoTitle: "Phương Pháp Trading Hiệu Quả",
  benefits: [
    "Thực chiến, áp dụng được ngay",
    "Học một lần dùng trọn đời",
    "Xem lại mọi lúc mọi nơi",
  ],
  submitLabel: "GỬI VIDEO NGAY CHO TÔI",
  socialProofMessage: "vừa đăng ký thành công Bộ video tư duy đầu tư",
};

export default function DongTienV2() {
  return <OptinLanding content={content} />;
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });
