import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { BookOpen, Loader2, Check, Clock, Lock, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AcademicLessonPublic } from '@/types';
import dongTienApi from '@/lib/api';
import { tokenKey, landingPath, learnPagePath } from '@/lib/brand';
import { getLearnTheme, withAlpha } from '@/lib/learnTheme';

interface VideoSidebarProps {
  currentLessonId: number;
  lessonsList?: AcademicLessonPublic[];
  courseTitle?: string;
  courseSubtitle?: string;
}

export default function VideoSidebar({
  currentLessonId,
  lessonsList,
  courseTitle = 'Khóa học',
  courseSubtitle = 'Khóa học đặc biệt',
}: VideoSidebarProps) {
  const router = useRouter();
  const theme = getLearnTheme('dong-tien');
  const [lessons, setLessons] = useState<AcademicLessonPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  /** Các chương đang mở (mở-nhiều). Rỗng ban đầu → active stage tự mở khi list load. */
  const [openStages, setOpenStages] = useState<Set<number>>(new Set());

  // Mở (thêm vào) chương chứa bài hiện tại — đảm bảo chương bài đang chạy luôn hiển thị.
  const ensureActiveStageOpen = useCallback(
    (lessonList: AcademicLessonPublic[]) => {
      const activeLesson = lessonList.find((l) => l.id === currentLessonId);
      const activeStageId = Number(activeLesson?.stage_id ?? 0);
      if (Number.isNaN(activeStageId)) return;
      setOpenStages((prev) => {
        if (prev.has(activeStageId)) return prev;
        const next = new Set(prev);
        next.add(activeStageId);
        return next;
      });
    },
    [currentLessonId]
  );

  useEffect(() => {
    if (lessonsList && lessonsList.length > 0) {
      setLessons(lessonsList);
      setLoading(false);
      ensureActiveStageOpen(lessonsList);
      return;
    }

    const loadSidebarData = async () => {
      try {
        const lessonsData = await dongTienApi.getLessons();
        setLessons(lessonsData);
        ensureActiveStageOpen(lessonsData);
      } catch (err) {
        console.error('Failed to load sidebar data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSidebarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLessonId, lessonsList]);

  const toggleStage = (stageId: number) => {
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const handleLessonClick = async (lesson: AcademicLessonPublic) => {
    if (lesson.id === currentLessonId) return; // Already on this lesson
    if (!lesson.unlocked) {
      toast.warning("Bạn cần hoàn thành bài giảng trước đó để mở khóa bài học này.");
      return;
    }

    setSwitchingId(lesson.id);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem(tokenKey()) : null;
      if (!token) {
        // No user logged in, redirect to landing
        router.push(landingPath());
        return;
      }

      router.push(learnPagePath(lesson.id));
    } catch (err) {
      console.error('Failed to switch lesson:', err);
    } finally {
      setSwitchingId(null);
    }
  };

  // Format seconds to MM:SS
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate overall course progress details
  const progressStats = useMemo(() => {
    if (lessons.length === 0) return { completedCount: 0, percent: 0 };
    const completedCount = lessons.filter(l => l.progress?.completed === true).length;
    const percent = Math.round((completedCount / lessons.length) * 100);
    return { completedCount, percent };
  }, [lessons]);

  const stageGroups = useMemo(() => {
    const groups = new Map<number, { id: number; title: string; position: number; lessons: AcademicLessonPublic[] }>();
    lessons.forEach((lesson) => {
      const id = Number(lesson.stage_id ?? 0);
      const existing = groups.get(id);
      if (existing) {
        existing.lessons.push(lesson);
        return;
      }
      groups.set(id, {
        id,
        title: lesson.stage_title || 'Chương chưa phân loại',
        position: Number(lesson.stage_position ?? Number.MAX_SAFE_INTEGER),
        lessons: [lesson],
      });
    });
    return Array.from(groups.values()).sort((a, b) => a.position - b.position || a.id - b.id);
  }, [lessons]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-[350px] w-full">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: theme.accent }} />
        <span className="text-xs text-slate-400 font-medium">Đang đồng bộ dữ liệu khóa học...</span>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 flex flex-col w-full">
      {/* Playlist Header */}
      <div className="px-1 sm:px-2 pb-5 border-b border-slate-200/70 space-y-3.5">
        <div className="space-y-1.5">
          <p className="text-[15px] font-bold text-slate-900 font-['Montserrat',sans-serif] tracking-tight leading-snug">
            {courseTitle}
          </p>
          <p className="hidden lg:flex text-[12px] font-semibold text-slate-500 flex items-center gap-1.5 font-['Montserrat',sans-serif]">
            <BookOpen className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            {courseSubtitle} • {lessons.length} bài
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2 pt-0.5">
          <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 font-['Montserrat',sans-serif]">
            <span>Tiến độ học tập</span>
            <span className="tabular-nums">
              {progressStats.completedCount}/{lessons.length} · {progressStats.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500 ease-out rounded-full"
              style={{
                width: `${progressStats.percent}%`,
                background: `linear-gradient(90deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Playlist Items List */}
      <div className="min-h-0 flex-grow overflow-y-auto custom-playlist-scrollbar">
        {stageGroups.map((stage, stageIndex) => {
          const completedInStage = stage.lessons.filter((lesson) => lesson.progress?.completed === true).length;
          const isStageOpen = openStages.has(stage.id);
          const panelId = `stage-panel-${stage.id}-${stageIndex}`;
          const triggerId = `stage-trigger-${stage.id}-${stageIndex}`;

          return (
            <section key={stage.id || `fallback-${stageIndex}`} className="border-b border-slate-200/80 last:border-b-0">
              {/* Stage header — click to toggle */}
              <button
                id={triggerId}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleStage(stage.id);
                }}
                aria-expanded={isStageOpen}
                aria-controls={panelId}
                className="sticky top-0 z-10 w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-white/60 backdrop-blur-sm border-b border-white/50 text-left cursor-pointer transition-colors duration-200 hover:bg-slate-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--stage-accent)]"
                style={{ ['--stage-accent' as string]: theme.accent }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-800 truncate" style={{ color: theme.accentText }}>{stage.title}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 pl-2">
                  <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                    {completedInStage}/{stage.lessons.length}
                  </span>
                  <ChevronDown
                    className="w-4 h-4 text-slate-500 transition-transform duration-300 ease-out"
                    style={{ transform: isStageOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </div>
              </button>

              {/* Lesson list — smooth expand/collapse */}
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="stage-collapse"
                style={{
                  display: 'grid',
                  gridTemplateRows: isStageOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 240ms ease',
                  opacity: isStageOpen ? 1 : 0,
                }}
              >
                <div className="overflow-hidden min-h-0">
                  <div className="divide-y divide-slate-100">
                    {stage.lessons.map((lesson) => {
                      const index = lessons.findIndex((item) => item.id === lesson.id);
                      const isActive = lesson.id === currentLessonId;
                      const isCompleted = lesson.progress?.completed === true;
                      const isLocked = !lesson.unlocked;
                      const isSwitching = switchingId === lesson.id;

                      return (
                        <button
                          key={lesson.id}
                          onClick={() => handleLessonClick(lesson)}
                          disabled={isSwitching}
                          data-tour-active-lesson={isActive ? '' : undefined}
                          data-tour-first-lesson={index === 0 ? '' : undefined}
                          className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors duration-200 group relative ${isActive
                            ? ''
                            : isLocked
                              ? 'bg-slate-50 cursor-not-allowed'
                              : 'hover:bg-slate-100 cursor-pointer'
                            }`}
                          style={isActive ? { backgroundColor: withAlpha(theme.accent, 0.12) } : undefined}
                        >
                          {/* Active left border indicator */}
                          {isActive && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: theme.accent }} />
                          )}

                          {/* Left Column: Video Thumbnail / Status Badge */}
                          <div className="w-16 sm:w-20 h-10 sm:h-12 rounded-lg overflow-hidden relative shrink-0 border border-slate-200/80 shadow-xs bg-slate-900 group-hover:border-slate-300 transition-all duration-200">
                            {lesson.thumbnail_url ? (
                              <img
                                src={lesson.thumbnail_url}
                                alt={lesson.title}
                                className={`w-full h-full object-cover transition-transform duration-300 ${isLocked ? 'opacity-40 grayscale' : 'group-hover:scale-105'}`}
                              />
                            ) : (
                              <div
                                className={`w-full h-full flex items-center justify-center font-extrabold font-mono text-xs text-white/90 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 ${isLocked ? 'opacity-50' : ''}`}
                              >
                                <span>{String(index).padStart(2, '0')}</span>
                              </div>
                            )}

                            {/* Status Overlay */}
                            {isSwitching ? (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                              </div>
                            ) : isActive ? (
                              <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center backdrop-blur-[1px]">
                                {/* Equalizer Wave bar animation */}
                                <div className="flex items-end justify-center gap-0.5 h-3.5 mb-[1px]">
                                  <span className="w-0.5 h-2.5 rounded-full animate-wave-bar" style={{ backgroundColor: theme.accent, animationDelay: '0s' }}></span>
                                  <span className="w-0.5 h-3.5 rounded-full animate-wave-bar" style={{ backgroundColor: theme.accent, animationDelay: '0.25s' }}></span>
                                  <span className="w-0.5 h-1.5 rounded-full animate-wave-bar" style={{ backgroundColor: theme.accent, animationDelay: '0.5s' }}></span>
                                </div>
                              </div>
                            ) : isLocked ? (
                              <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center backdrop-blur-[1px]">
                                <Lock className="w-3.5 h-3.5 text-slate-300" />
                              </div>
                            ) : isCompleted ? (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500/90 text-white flex items-center justify-center shadow-xs">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            ) : null}
                          </div>

                          {/* Lesson Title & Metadata */}
                          <div className="flex-grow space-y-1 min-w-0">
                            <div
                              className={`text-sm leading-snug transition-colors duration-200 line-clamp-2 font-['Montserrat',sans-serif] ${isActive
                                ? 'text-slate-900 font-extrabold'
                                : isLocked
                                  ? 'text-slate-500 font-bold'
                                  : 'text-slate-700 group-hover:text-slate-900 font-bold'
                                }`}
                            >
                              {lesson.title}
                            </div>

                            <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 shrink-0" />
                                {formatDuration(lesson.duration)}
                              </span>

                              {isCompleted ? (
                                <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded tracking-wide uppercase shrink-0">
                                  Hoàn thành
                                </span>
                              ) : isLocked ? (
                                <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded tracking-wide uppercase shrink-0">
                                  Đang khóa
                                </span>
                              ) : (
                                <span className="text-slate-400">Bài {index}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <style jsx global>{`
        .custom-playlist-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-playlist-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-playlist-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.08);
          border-radius: 9px;
        }
        .custom-playlist-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.16);
        }
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1.2); }
        }
        .animate-wave-bar {
          animation: wave 1.2s ease-in-out infinite;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
}
