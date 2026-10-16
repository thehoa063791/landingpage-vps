import { useCallback, useEffect, useRef, useState } from 'react';
import dongTienApi from '../lib/api';
import { AcademicLessonPublic } from '../types';
import { checkSurveyAuth } from '../lib/auth';
import { useRouter } from 'next/router';
import { nextAvailableLesson } from '../lib/lessonNavigation';
import { learnPagePath } from '../lib/brand';

export function useSurveyProgress(videoId: number | undefined) {
  const router = useRouter();
  const [lesson, setLesson] = useState<AcademicLessonPublic | null>(null);
  const [lessons, setLessons] = useState<AcademicLessonPublic[]>([]);
  const [lessonIndex, setLessonIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [watchTime, setWatchTime] = useState<number>(0);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const lastReportedTimeRef = useRef<number>(-999);
  const lastCallTimestampRef = useRef<number>(0);
  const watchTimeRef = useRef<number>(0);
  const requestVersionRef = useRef(0);
  const loadedLessonIdRef = useRef<number | undefined>(undefined);

  const fetchVideo = useCallback(async (vId: number, background = false) => {
    const version = ++requestVersionRef.current;
    if (!checkSurveyAuth()) {
      setError('Phiên học của bạn đã hết hạn. Vui lòng đăng ký/đăng nhập lại.');
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    setError(null);
    try {
      const allLessons = await dongTienApi.getLessons();
      if (version !== requestVersionRef.current) return;
      setLessons(allLessons);
      const currentLesson = allLessons.find(l => l.id === vId);
      const currentLessonIndex = allLessons.findIndex(l => l.id === vId);

      if (!currentLesson) {
        setLesson(null);
        const replacement = nextAvailableLesson(allLessons);
        if (replacement) {
          setLoading(true);
          await router.replace(learnPagePath(replacement.id));
        } else {
          setError('Chưa có bài học đang hiển thị. Vui lòng thử lại sau khi danh sách được cập nhật.');
        }
        return;
      }

      setLesson(currentLesson);
      setLessonIndex(currentLessonIndex >= 0 ? currentLessonIndex : 0);

      const preservePosition = background && loadedLessonIdRef.current === vId;
      const currentWatchTime = preservePosition ? watchTimeRef.current : currentLesson.progress?.watch_time || 0;
      if (!preservePosition) {
        setWatchTime(currentWatchTime);
        watchTimeRef.current = currentWatchTime;
      }
      setIsUnlocked(currentLesson.unlocked);

      if (!preservePosition) lastReportedTimeRef.current = currentWatchTime;
      loadedLessonIdRef.current = vId;
    } catch (err: any) {
      if (version !== requestVersionRef.current) return;
      console.warn('Lesson catalog request failed:', err.message);
      if (!background) setError(err.message || 'Không thể tải thông tin bài học.');
    } finally {
      if (version === requestVersionRef.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (videoId) {
      setLesson(null);
      setIsUnlocked(false);
      watchTimeRef.current = 0;
      loadedLessonIdRef.current = undefined;
      fetchVideo(videoId);
    }
    return () => { requestVersionRef.current++; };
  }, [videoId, fetchVideo]);

  useEffect(() => {
    if (!videoId) return;
    const refresh = () => { if (document.visibilityState === 'visible') void fetchVideo(videoId, true); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [videoId, fetchVideo]);

  const reportProgress = useCallback(async (currentTime: number, forceSave = false) => {
    if (!videoId || !lesson || !checkSurveyAuth()) return;

    let roundedTime = Math.round(currentTime);
    const totalDuration = lesson.duration || 0;

    if (totalDuration > 0 && roundedTime >= Math.round(totalDuration * 0.95)) {
      roundedTime = totalDuration;
    }

    setWatchTime(prev => Math.max(prev, roundedTime));
    watchTimeRef.current = Math.max(watchTimeRef.current, roundedTime);

    const now = Date.now();
    const timeSinceLastCall = now - lastCallTimestampRef.current;

    if (
      forceSave ||
      (roundedTime > lastReportedTimeRef.current && timeSinceLastCall >= 2000)
    ) {
      lastCallTimestampRef.current = now;
      lastReportedTimeRef.current = roundedTime;

      try {
        const response = await dongTienApi.updateProgress({
          video_id: videoId,
          watch_time: roundedTime
        });

        const targetLessonInList = lessons.find(l => l.id === videoId);
        const wasUnlockedInList = targetLessonInList?.unlocked || false;

        let needsLessonsRefresh = false;

        if (response.unlocked && (!isUnlocked || !wasUnlockedInList)) {
          setIsUnlocked(true);
          needsLessonsRefresh = true;
        }

        if (response.completed) {
          needsLessonsRefresh = true;
        } else if (response.unlocked && (!isUnlocked || !wasUnlockedInList)) {
          setIsUnlocked(true);
          needsLessonsRefresh = true;
        }

        if (needsLessonsRefresh) {
          const updatedLessons = await dongTienApi.getLessons();
          setLessons(updatedLessons);
          const currentLesson = updatedLessons.find(l => l.id === videoId);
          if (currentLesson) {
            setLesson(currentLesson);
            setWatchTime(currentLesson.progress?.watch_time || 0);
            watchTimeRef.current = currentLesson.progress?.watch_time || 0;
            setIsUnlocked(currentLesson.unlocked);
          }
        }

        return response;
      } catch (err) {
        console.error('Failed to report watch progress:', err);
        throw err;
      }
    }
  }, [videoId, lesson, isUnlocked, lessons]);

  useEffect(() => {
    return () => {
      if (videoId && watchTimeRef.current > lastReportedTimeRef.current) {
        const finalTime = watchTimeRef.current;
        lastReportedTimeRef.current = finalTime;
        dongTienApi.updateProgress({
          video_id: videoId,
          watch_time: finalTime
        }).catch(err => {
          console.warn('Failed to send final progress on unmount:', err);
        });
      }
    };
  }, [videoId]);

  const mockSession = lesson ? {
    session_id: String(videoId),
    watch_time: watchTime,
    completed: !!lesson.progress?.completed,
    is_unlocked: isUnlocked,
    lesson: lesson,
  } : null;

  return {
    session: mockSession,
    lessons,
    lessonIndex,
    loading,
    error,
    watchTime,
    isUnlocked,
    reportProgress,
    refreshSession: () => videoId && fetchVideo(videoId)
  };
}
