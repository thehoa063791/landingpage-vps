import type { GetServerSideProps } from "next";
import OptinLanding, { type OptinContent } from "@/features/optin/OptinLanding";

// Copy follows https://phamthanhbien.com/trading/ until the final page is approved.
const content: OptinContent = {
  metaTitle: "Phương pháp giao dịch hiệu quả của Phạm Thành Biên",
  metaDescription:
    "Phương pháp giao dịch được Phạm Thành Biên thực chiến hơn 20 năm qua. Chỉ tặng cho 27 người đăng ký sớm nhất!",
  heroImage: "/trading/hero-bg.jpg",
  title: "PHƯƠNG PHÁP TRADING HIỆU QUẢ CHO TRADER",
  subtitle: "Phương pháp giao dịch được Phạm Thành Biên thực chiến hơn 20 năm qua",
  singleLineHeading: true,
  limitCount: "27 người",
  videoSrc:
    "https://player.vimeo.com/video/1228651465?dnt=1&portrait=0&title=0&color=fecd08&byline=0&autopause=0",
  videoTitle: "Phương pháp Trading hiệu quả",
  benefits: [
    "Phương pháp đơn giản dễ dùng",
    "Học một lần dùng trọn đời",
    "Kiến tạo dòng tiền ở mọi lúc mọi nơi!",
  ],
  submitLabel: "NHẬN MIỄN PHÍ NGAY",
  privacyNote: "Thông tin của bạn được bảo mật tuyệt đối.",
  socialProofMessage: "vừa đăng ký nhận Phương pháp Trading hiệu quả",
};

export default function TradingLanding() {
  return <OptinLanding content={content} />;
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });
