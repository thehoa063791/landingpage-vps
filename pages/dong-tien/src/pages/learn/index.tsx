import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import dongTienApi from "@/lib/api";
import { checkSurveyAuth } from "@/lib/auth";
import { nextAvailableLesson } from "@/lib/lessonNavigation";

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};

export default function LearnIndexPage() {
  const router = useRouter();
  const [statusText, setStatusText] = useState(
    "Đang tìm kiếm thông tin phiên học...",
  );

  useEffect(() => {
    const handleRedirect = async () => {
      if (typeof window === "undefined") return;

      const isAuth = checkSurveyAuth();

      if (!isAuth) {
        setStatusText(
          "Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Đang chuyển tới trang đăng ký...",
        );
        setTimeout(() => {
          router.push("/");
        }, 1500);
        return;
      }

      try {
        const lessons = await dongTienApi.getLessons();

        if (lessons.length > 0) {
          const targetLesson = nextAvailableLesson(lessons);
          setStatusText("Đang mở bài học gần đây nhất của bạn...");
          router.replace(`/learn/${targetLesson.id}`);
        } else {
          setStatusText(
            "Danh sách bài học đang được cập nhật. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.",
          );
        }
      } catch (err) {
        console.error("Redirect error:", err);
        setStatusText("Chưa tải được danh sách bài học. Vui lòng tải lại trang.");
      }
    };

    handleRedirect();
  }, [router]);

  return (
    <>
      <Head>
        <title>Đang tải - Phương pháp xây dựng dòng tiền</title>
        <meta name="description" content="Đang tải bài học của bạn" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-['Montserrat',sans-serif] px-4">
        <div className="flex flex-col items-center gap-8 max-w-md w-full relative z-10">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-800 rounded-full" />
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-t-amber-500 border-r-amber-400 border-b-transparent border-l-transparent rounded-full animate-spin" />
          </div>

          <div className="text-center space-y-3">
            <h1 className="text-2xl font-black text-white tracking-tight">
              Đang thiết lập lớp học
            </h1>
            <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto min-h-[40px] transition-all duration-300">
              {statusText}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
