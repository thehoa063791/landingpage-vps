import { useEffect } from "react";
import Footer from "@/features/dong-tien/components/Footer";
import Gallery from "@/features/dong-tien/components/Gallery";
import Hero2 from "@/features/dong-tien/components/Hero2";
import Manifesto from "@/features/dong-tien/components/Manifesto";
import Mentor from "@/features/dong-tien/components/Mentor";
import Quote from "@/features/dong-tien/components/Quote";
import Recognition from "@/features/dong-tien/components/Recognition";
import RootCause from "@/features/dong-tien/components/RootCause";
import SignupModal from "@/features/dong-tien/components/SignupModal";
import StickyCta from "@/features/dong-tien/components/StickyCta";
import Story from "@/features/dong-tien/components/Story";
import Head from "next/head";

export default function DongTienLanding() {

  return (
    <>
      <Head>
        <title>Phương pháp xây dựng dòng tiền — Phạm Thành Biên</title>
        <meta
          name="description"
          content="Hệ thống 4 lớp lọc dòng tiền giúp bạn biết tiền nên ở đâu trong từng giai đoạn của thị trường – khi nào tích lũy, khi nào gia tăng lợi nhuận và khi nào bảo vệ thành quả."
        />
        <meta
          name="keywords"
          content="Phương pháp xây dựng dòng tiền, dòng tiền, tự do tài chính, Phạm Thành Biên, đầu tư tài chính, tích lũy, quản trị vốn"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ebila.ai/dong-tien" />
        <meta
          property="og:title"
          content="Phương pháp xây dựng dòng tiền — Phạm Thành Biên"
        />
        <meta
          property="og:description"
          content="Hệ thống 4 lớp lọc dòng tiền: khi nào tích lũy, khi nào gia tăng lợi nhuận và khi nào bảo vệ thành quả."
        />
        <meta
          property="og:image"
          content="/dong-tien/images/dong-tien/opt/DSC01970.webp"
        />
        <meta property="twitter:card" content="summary_large_image" />
        <meta
          property="twitter:title"
          content="Phương pháp xây dựng dòng tiền — Phạm Thành Biên"
        />
        <meta
          property="twitter:description"
          content="Hệ thống 4 lớp lọc dòng tiền giúp bạn biết tiền nên ở đâu trong từng giai đoạn của thị trường."
        />
        <meta
          property="twitter:image"
          content="/dong-tien/images/dong-tien/opt/DSC01970.webp"
        />
      </Head>

      <div
        className="dong-tien-root"
        style={{ width: "100%", overflowX: "clip", color: "#111214" }}
      >
        <Hero2 />
        <Recognition />
        <RootCause />
        <Mentor />
        <Story />
        <Quote />
        <Manifesto />
        <Gallery />
        <Footer />
        <StickyCta />
        <SignupModal />
      </div>
    </>
  );
}
