import type { NextRouter } from "next/router";
import { toast } from "sonner";
import dongTienApi from "@/lib/api";
import { learnPagePath } from "@/lib/brand";
import { firstLessonInChapter } from "@/lib/lessonNavigation";
import {
  checkSurveyAuth,
  getSurveyEmailCookie,
  setSurveyLoginSession,
} from "@/lib/auth";

export const OPEN_AUTH_EVENT = "dong-tien:open-auth";

/** Bật popup đăng ký / đăng nhập bằng custom event (SignupModal lắng nghe). */
export function openAuthPopup(tab?: "new" | "old" | "login" | "register") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { tab } }));
}

/**
 * Flow CTA chung cho /dong-tien:
 * 1. Đã đăng nhập (localStorage) → vào thẳng bài (chương tương ứng hoặc bài đầu).
 * 2. Chưa đăng nhập nhưng có email cookie → tự động đăng nhập rồi vào bài.
 * 3. Không có gì → mở popup đăng nhập / đăng ký.
 */
export async function handleCta(router: NextRouter, chapterIndex?: number) {
  try {
    if (checkSurveyAuth()) {
      const lessons = await dongTienApi.getLessons();
      const target = firstLessonInChapter(lessons, chapterIndex);
      router.push(target ? learnPagePath(target.id) : '/learn');
      return;
    }

    const savedEmail = getSurveyEmailCookie();
    if (savedEmail) {
      toast.loading("Đang tự động đăng nhập...", { id: "dong-tien-auto-login" });
      const response = await dongTienApi.loginUser({ email: savedEmail });
      if (response && response.access_token) {
        setSurveyLoginSession(response.access_token, response.user.email);
        const lessons = await dongTienApi.getLessons();
        toast.success("Đăng nhập thành công!", { id: "dong-tien-auto-login" });
        const target = firstLessonInChapter(lessons, chapterIndex);
        router.push(target ? learnPagePath(target.id) : '/learn');
        return;
      }
      toast.dismiss("dong-tien-auto-login");
    }
  } catch (err) {
    console.error("[dong-tien ctaFlow] auth error:", err);
  }

  openAuthPopup();
}
