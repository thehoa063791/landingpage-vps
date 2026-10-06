import dongTienApi, { ACADEMIC_SURVEY_UNAUTHORIZED_EVENT } from "@/lib/api";
import type { AcademicBrand } from "@/lib/brand";
import { progressCacheKey, userEmailKey } from "@/lib/brand";
import { getLearnTheme, withAlpha } from "@/lib/learnTheme";
import { useInternalTracking } from "@/hooks/useInternalTracking";
import { useSurveyProgress } from "@/hooks/useSurveyProgress";
import { useVideoWatchTracker } from "@/hooks/useVideoWatchTracker";
import AcademicVideoPlayer from "@/components/learning/AcademicVideoPlayer";
import LessonSurvey from "@/components/learning/LessonSurvey";
import ScalpingPopup from "@/components/learning/ScalpingPopup";
import ScalpingPopupIcon from "@/components/learning/ScalpingPopupIcon";
import TransitionModal from "@/components/learning/TransitionModal";
import VideoLockOverlay from "@/components/learning/VideoLockOverlay";
import VideoSidebar from "@/components/learning/VideoSidebar";
import {
  checkSurveyAuth,
  clearSurveyLoginSession,
  getStoredSurveyUser,
  setStoredSurveyUser,
} from "@/lib/auth";
import LearnOnboardingTour from "@/features/dong-tien/learn/components/LearnOnboardingTour";
import SocialProofPopup from "@/features/dong-tien/learn/components/SocialProofPopup";
import ZaloGroupModal from "@/features/dong-tien/learn/components/ZaloGroupModal";
import ZaloMobileStickyCta from "@/features/dong-tien/learn/components/ZaloMobileStickyCta";
import type { AcademicUser } from "@/types";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "phosphor-react";
import {
  CheckCircle,
  Clock,
  HelpCircle,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

const RESET_THRESHOLD = 5;

interface LearningPageProps {
  brand?: AcademicBrand;
}

export default function LearningPage({
  brand = "dong-tien",
}: LearningPageProps) {
  const theme = getLearnTheme(brand);
  const router = useRouter();
  const { sessionId } = router.query;

  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    clearSurveyLoginSession();
    toast.success("Đăng xuất thành công");
    router.push("/");
  };

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isIconPopupOpen, setIsIconPopupOpen] = useState(false);
  const [isZaloModalOpen, setIsZaloModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const previousTimeRef = useRef<number>(0);
  const hasTriggeredRef = useRef<boolean>(false);
  const playerInstanceRef = useRef(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const checkedResumeRef = useRef<boolean>(false);

  const [restartTourSignal, setRestartTourSignal] = useState(0);

  // Auto-play Transition States
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingNextLesson, setPendingNextLesson] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transitionDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { trackLearningView } = useInternalTracking();

  const [userProfile, setUserProfile] = useState<AcademicUser | null>(() => {
    return getStoredSurveyUser();
  });

  const leadData = useMemo(() => {
    const active = userProfile || getStoredSurveyUser();
    if (active) {
      return {
        name: active.full_name || "",
        email: active.email || "",
        phone: active.phone || "",
        region: active.region || "",
      };
    }
    return undefined;
  }, [userProfile]);

  React.useEffect(() => {
    if (typeof window !== "undefined" && router.isReady) {
      const isAuth = checkSurveyAuth();
      if (!isAuth) {
        router.push("/");
      } else {
        dongTienApi
          .getProfile()
          .then((profile) => {
            setUserProfile(profile);
            setStoredSurveyUser(profile);
          })
          .catch((err) => {
            console.error("Failed to load user profile:", err);
          });
      }
    }
  }, [brand, router.isReady, router]);

  React.useEffect(() => {
    const handleUnauthorized = () => {
      router.push("/");
    };
    window.addEventListener(
      ACADEMIC_SURVEY_UNAUTHORIZED_EVENT,
      handleUnauthorized,
    );
    return () => {
      window.removeEventListener(
        ACADEMIC_SURVEY_UNAUTHORIZED_EVENT,
        handleUnauthorized,
      );
    };
  }, [router]);

  useEffect(() => {
    if (transitionDelayTimeoutRef.current) {
      clearTimeout(transitionDelayTimeoutRef.current);
      transitionDelayTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setPendingNextLesson(null);
    hasTriggeredRef.current = false;
    previousTimeRef.current = 0;
    checkedResumeRef.current = false;
    setIsPopupOpen(false);
    setIsIconPopupOpen(false);
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [sessionId]);


  const resolvedSessionId =
    router.isReady && sessionId ? Number(sessionId) : undefined;
  const {
    session,
    lessons,
    lessonIndex,
    loading,
    error,
    watchTime,
    reportProgress,
    submitAnswers,
    submittingSurvey,
    surveySubmitted,
  } = useSurveyProgress(resolvedSessionId);

  const viewContentFiredRef = useRef(false);
  useEffect(() => {
    if (session?.lesson?.id && !viewContentFiredRef.current) {
      viewContentFiredRef.current = true;
      trackLearningView(
        {
          id: session.lesson.id,
          title: session.lesson.title,
        },
        leadData
      );
    }
  }, [session?.lesson?.id, session?.lesson?.title, trackLearningView, leadData]);

  useEffect(() => {
    viewContentFiredRef.current = false;
  }, [sessionId]);

  const isAlreadyCompleted = session?.completed === true;

  const startAutoPlayCountdown = (targetLesson: {
    id: number;
    title: string;
  }) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setPendingNextLesson(targetLesson);
    setCountdown(5);

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          if (targetLesson) {
            router.push(`/learn/${targetLesson.id}`);
          }
          setPendingNextLesson(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCancelTransition = () => {
    if (transitionDelayTimeoutRef.current) {
      clearTimeout(transitionDelayTimeoutRef.current);
      transitionDelayTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setPendingNextLesson(null);
  };

  const handleConfirmTransition = async () => {
    if (transitionDelayTimeoutRef.current) {
      clearTimeout(transitionDelayTimeoutRef.current);
      transitionDelayTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (pendingNextLesson && session?.lesson?.id) {
      try {
        await forceReport();
      } catch (e) {
        console.warn("[TransitionModal] Failed to report progress:", e);
      }
      router.push(`/learn/${pendingNextLesson.id}`);
    }
    setCountdown(null);
    setPendingNextLesson(null);
  };

  useEffect(() => {
    return () => {
      if (transitionDelayTimeoutRef.current) {
        clearTimeout(transitionDelayTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handleVideoEnded = async () => {
    let latestLessons = lessons;
    if (session?.lesson?.id) {
      try {
        await forceReport();

        try {
          latestLessons = await dongTienApi.getLessons();
        } catch (refreshErr) {
          console.warn("[VideoEnded] Failed to refresh lessons:", refreshErr);
        }

        if (typeof forceReport === "function") {
          await forceReport();
        }
      } catch (e) {
        console.warn("Failed to report progress on video end:", e);
      }
    }

    const nextLessonIndex = lessonIndex + 1;
    const latestNextLesson = latestLessons && latestLessons[nextLessonIndex];

    if (latestNextLesson) {
      if (transitionDelayTimeoutRef.current) {
        clearTimeout(transitionDelayTimeoutRef.current);
      }
      transitionDelayTimeoutRef.current = setTimeout(() => {
        startAutoPlayCountdown(latestNextLesson);
      }, 3000);
    }
  };

  const [resumePosition, setResumePosition] = useState(0);

  const currentLessonFromList = useMemo(() => {
    if (!lessons || !session?.lesson) return null;
    return lessons.find((l) => l.id === session.lesson.id) || null;
  }, [lessons, session?.lesson]);
  const isLessonLocked = currentLessonFromList
    ? !currentLessonFromList.unlocked
    : false;

  const { updateWatchTime, forceReport } = useVideoWatchTracker({
    videoId: session?.lesson?.id,
    sessionId: resolvedSessionId,
    initialWatchTime: watchTime,
    duration: session?.lesson?.duration || 0,
    isPlaying,
    isAlreadyCompleted,
    onReportProgress: async (payload) => {
      await reportProgress(payload.watchedSeconds, true);
    },
  });

  useEffect(() => {
    if (!resolvedSessionId || isAlreadyCompleted) {
      return;
    }

    if (checkedResumeRef.current) return;

    const checkResumeState = async () => {
      let savedPosition = 0;

      if (typeof window !== "undefined") {
        const email = localStorage.getItem(userEmailKey()) || "";
        const cachedStr = localStorage.getItem(
          progressCacheKey(email, resolvedSessionId),
        );
        if (cachedStr) {
          try {
            const cached = JSON.parse(cachedStr);
            if (
              cached &&
              cached.current_position > 5 &&
              cached.current_position < (session?.lesson?.duration || 9999)
            ) {
              savedPosition = cached.current_position;
            }
          } catch {}
        }
      }

      if (savedPosition === 0 && navigator.onLine) {
        try {
          const state = await dongTienApi.getVideoState(resolvedSessionId);
          if (
            state &&
            state.should_resume &&
            state.resume_position &&
            state.resume_position > 5
          ) {
            savedPosition = state.resume_position;
          }
        } catch {}
      }

      if (savedPosition > 5) {
        setResumePosition(savedPosition);
      }
      checkedResumeRef.current = true;
    };

    checkResumeState();
  }, [resolvedSessionId, isAlreadyCompleted, session?.lesson?.duration]);

  const handleProgress = (currentTime: number, playbackSpeed?: number) => {
    updateWatchTime(currentTime, playbackSpeed);

    if (!session?.lesson || session.lesson.show_popup === false) return;

    const triggerTime = session.lesson.unlock_after_seconds;
    const previousTime = previousTimeRef.current;

    if (
      currentTime >= triggerTime &&
      (triggerTime === 0 || previousTime < triggerTime) &&
      !hasTriggeredRef.current
    ) {
      hasTriggeredRef.current = true;
      setIsPopupOpen(true);
      setIsIconPopupOpen(!session.hidden_content?.questions?.length);
      reportProgress(currentTime);
    }

    previousTimeRef.current = currentTime;
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
  };

  const formatDuration = (secs: number) => {
    if (!secs) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <Head>
        <title>
          {session
            ? `${session.lesson.title} | Ebila Learning`
            : "Đang tải bài giảng... | Ebila Learning"}
        </title>
        <meta
          name="description"
          content={
            session
              ? `Học ${session.lesson.title} - Video bài giảng chất lượng cao từ Ebila. Nâng cao kiến thức của bạn với các bài học chuyên sâu.`
              : "Hệ thống học tập trực tuyến Ebila - Xem video bài giảng và nâng cao kiến thức của bạn"
          }
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="index, follow" />
      </Head>

      <div
        className="h-screen bg-white text-slate-800 flex flex-col font-['Figtree',sans-serif] overflow-hidden"
        style={{
          ["--accent" as string]: theme.accent,
          ["--accent-hover" as string]: theme.accentHover,
          ["--accent-soft" as string]: theme.accentSoft,
          ["--accent-text" as string]: theme.accentText,
        }}
      >
        <main className="flex-grow flex flex-col lg:flex-row h-full overflow-y-auto lg:overflow-hidden relative min-h-0">
          {/* Loading state */}
          {loading && (
            <div className="flex-grow w-full h-full flex flex-col lg:flex-row bg-white min-h-0">
              <div className="lg:flex-grow lg:w-[72%] xl:w-[75%] p-5 sm:p-7 lg:p-10 space-y-6 lg:space-y-8 min-h-0">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-24 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-3.5 w-20 bg-slate-100 rounded-full animate-pulse" />
                </div>
                <div className="aspect-video rounded-xl bg-slate-100 animate-pulse" />
                <div className="space-y-3">
                  <div className="h-3 w-32 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-6 w-3/4 max-w-lg bg-slate-200/70 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex-grow flex flex-col items-center justify-center min-h-[400px] text-center max-w-sm mx-auto space-y-6 w-full h-full px-4 bg-white">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center ring-1 ring-red-100 text-red-500">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-base font-bold text-slate-800 font-['Montserrat',sans-serif]">
                  Không thể tải bài giảng
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                  {error}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.reload();
                }}
                className="text-white px-5 py-2.5 rounded-lg text-[13px] font-bold transition-colors duration-200 cursor-pointer shadow-sm"
                style={{
                  backgroundColor: theme.accent,
                  boxShadow: `0 1px 2px ${withAlpha(theme.accent, 0.1)}`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    theme.accentHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    theme.accent;
                }}
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Normal state */}
          {!loading && !error && session && (
            <>
              {/* Main Content Area */}
              <div
                ref={mainContentRef}
                data-lenis-prevent
                className="w-full lg:w-[72%] xl:w-[75%] flex flex-col shrink-0 lg:shrink lg:h-full lg:overflow-y-auto p-5 sm:p-7 lg:p-10 space-y-6 lg:space-y-8 relative z-10 min-h-0 bg-white"
              >
                {/* Top bar */}
                <div className="flex flex-wrap-reverse items-center justify-between gap-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push("/");
                    }}
                    className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition-colors hover:text-[var(--accent)] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                    Trang chủ
                  </button>

                  <div className="flex items-center gap-1">
                    {theme.showTour && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRestartTourSignal((s) => s + 1);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Xem lại hướng dẫn
                      </button>
                    )}
                    {brand === "dong-tien" && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsZaloModalOpen(true);
                        }}
                        className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#0068FF] bg-[#0068FF]/10 hover:bg-[#0068FF]/15 transition-colors cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Tham gia nhóm ZALO
                      </button>
                    )}
                    <button
                      onClick={handleLogout}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-400 transition-colors hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Đăng xuất
                    </button>
                  </div>
                </div>

                {/* Video Player Container */}
                <div className="relative w-full aspect-video">
                  <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-slate-900/10 bg-slate-950">
                    {isLessonLocked ? (
                      <VideoLockOverlay />
                    ) : (
                      <AcademicVideoPlayer
                        videoId={session.lesson.vimeo_video_id}
                        onProgress={handleProgress}
                        initialWatchTime={isAlreadyCompleted ? 0 : watchTime}
                        autoplay={resumePosition <= 5}
                        onPlayStateChange={setIsPlaying}
                        onEnded={handleVideoEnded}
                        playerInstanceRef={playerInstanceRef}
                      />
                    )}
                  </div>
                </div>

                {/* Lesson Meta */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="hidden lg:flex text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {lessons.length > 0
                        ? `Bài ${lessonIndex + 1} / ${lessons.length}`
                        : "Bài học"}
                      {" · "}
                      {formatDuration(session.lesson.duration)}
                    </div>
                    <p className="text-xl sm:text-2xl lg:text-[26px] font-bold tracking-tight leading-snug text-slate-900">
                      {session.lesson.title}
                    </p>
                  </div>

                  {isAlreadyCompleted ? (
                    <span
                      className="w-[max-content] inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-white"
                      style={{ backgroundColor: theme.accent }}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Đã hoàn thành
                    </span>
                  ) : (
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold w-[max-content]"
                      style={{
                        backgroundColor: theme.accentSoft,
                        color: theme.accentText,
                        boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.25)}`,
                      }}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Đang học
                    </span>
                  )}
                </div>

                {/* Scalping Inline Section — shown below lesson title when triggered */}
                {session.hidden_content?.questions?.length && (isPopupOpen || surveySubmitted) && session.lesson.show_popup !== false ? (
                  <LessonSurvey lessonId={session.lesson.id} questions={session.hidden_content.questions} submitted={surveySubmitted} submitting={submittingSurvey} onSubmit={submitAnswers} onClose={handleClosePopup} />
                ) : null}
                {session?.is_unlocked && !session.hidden_content?.questions?.length && (
                  <ScalpingPopup
                    isOpen={isPopupOpen}
                    onClose={handleClosePopup}
                  />
                )}
              </div>

              {/* Sidebar Navigation */}
              <aside
                id="tour-sidebar"
                data-lenis-prevent
                className="w-full lg:w-[28%] xl:w-[25%] shrink-0 lg:shrink lg:h-full border-t lg:border-t-0 lg:border-l border-slate-200/70 bg-[#F8FAFC] p-4 sm:p-5 flex flex-col min-h-0 pb-20 lg:pb-5"
              >
                <VideoSidebar
                  currentLessonId={session.lesson.id}
                  lessonsList={lessons}
                  courseTitle={theme.courseTitle}
                  courseSubtitle={theme.courseSubtitle}
                />
              </aside>
            </>
          )}
        </main>
      </div>

      <TransitionModal
        isOpen={countdown !== null && pendingNextLesson !== null}
        countdown={countdown || 0}
        nextLessonTitle={pendingNextLesson?.title || ""}
        onConfirm={handleConfirmTransition}
        onCancel={handleCancelTransition}
      />

      <ScalpingPopupIcon
        isOpen={isIconPopupOpen}
        onClose={() => setIsIconPopupOpen(false)}
      />

      {brand === "dong-tien" && (
        <>
          <SocialProofPopup />
          <ZaloGroupModal
            isOpen={isZaloModalOpen}
            onClose={() => setIsZaloModalOpen(false)}
          />
          <ZaloMobileStickyCta onOpenModal={() => setIsZaloModalOpen(true)} />
        </>
      )}

      {theme.showTour && (
        <LearnOnboardingTour
          enabled={!loading && !error && !!session}
          restartSignal={restartTourSignal}
          tourCompletedFromProfile={userProfile?.tour_completed}
          onFirstTimeCloseStep1={() => setIsZaloModalOpen(true)}
        />
      )}
    </>
  );
}
