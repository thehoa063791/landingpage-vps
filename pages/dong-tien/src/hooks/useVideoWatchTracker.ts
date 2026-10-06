import { useState, useEffect, useRef, useCallback } from 'react';
import dongTienApi from '../lib/api';
import { userEmailKey, tokenKey, progressCacheKey, getActiveBrand, offlineProgressKey } from '../lib/brand';
import { ProgressUpdateRequest, WatchProgressPayload } from '../types';

export type { WatchProgressPayload };

function mergeRanges(ranges: number[][]): number[][] {
  if (ranges.length === 0) return [];
  const sorted = ranges
    .map(r => [Number(r[0]), Number(r[1])])
    .sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr[0] <= last[1]) {
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

interface UseVideoWatchTrackerParams {
  videoId: number | undefined;
  sessionId: number | undefined;
  initialWatchTime: number;
  duration: number;
  isPlaying: boolean;
  isSuspended?: boolean;
  isAlreadyCompleted?: boolean;
  onReportProgress?: (payload: WatchProgressPayload) => Promise<any>;
}

export function useVideoWatchTracker({
  videoId,
  sessionId,
  initialWatchTime,
  duration,
  isPlaying,
  isSuspended = false,
  isAlreadyCompleted = false,
  onReportProgress,
}: UseVideoWatchTrackerParams) {
  const [watchTime, setWatchTime] = useState<number>(isAlreadyCompleted ? duration : initialWatchTime);

  const isPlayingRef = useRef(isPlaying);
  const watchTimeRef = useRef(isAlreadyCompleted ? duration : initialWatchTime);
  const lastReportedTimeRef = useRef(isAlreadyCompleted ? duration : initialWatchTime);
  const lastCallTimestampRef = useRef<number>(0);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const lastTickTimeRef = useRef<number>(Date.now());
  const isFocusedRef = useRef<boolean>(true);

  const lastCacheSaveTimeRef = useRef<number>(0);
  const currentSegmentRef = useRef<[number, number] | null>(null);
  const watchedRangesRef = useRef<number[][]>(isAlreadyCompleted ? [[0, duration]] : []);
  const furthestPositionRef = useRef<number>(isAlreadyCompleted ? duration : initialWatchTime);
  const playbackSpeedRef = useRef<number>(1.0);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const lastLoadedVideoIdRef = useRef<number | undefined>(undefined);

  const onReportProgressRef = useRef(onReportProgress);
  const durationRef = useRef(duration);
  const videoIdRef = useRef(videoId);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    onReportProgressRef.current = onReportProgress;
  }, [onReportProgress]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!videoId) return;

    if (lastLoadedVideoIdRef.current === videoId) return;
    lastLoadedVideoIdRef.current = videoId;

    const loadInitialState = async () => {
      if (isAlreadyCompleted) {
        furthestPositionRef.current = duration;
        watchedRangesRef.current = [[0, duration]];
        setWatchTime(duration);
        watchTimeRef.current = duration;
        lastReportedTimeRef.current = duration;
        currentSegmentRef.current = null;
        lastTimeRef.current = undefined;
        return;
      }

      let cachedData: any = null;
      if (typeof window !== 'undefined') {
        const email = localStorage.getItem(userEmailKey()) || '';
        const cachedStr = localStorage.getItem(progressCacheKey(email, videoId));
        if (cachedStr) {
          try {
            cachedData = JSON.parse(cachedStr);
          } catch (e) {}
        }
      }

      if (cachedData) {
        furthestPositionRef.current = cachedData.furthest_position;
        watchedRangesRef.current = cachedData.watched_ranges;
        playbackSpeedRef.current = cachedData.playback_speed;
        setWatchTime(Math.round(cachedData.current_position));
        watchTimeRef.current = cachedData.current_position;
        lastReportedTimeRef.current = Math.round(cachedData.current_position);
      } else {
        furthestPositionRef.current = initialWatchTime;
        watchedRangesRef.current = [];
        playbackSpeedRef.current = 1.0;
        setWatchTime(initialWatchTime);
        watchTimeRef.current = initialWatchTime;
        lastReportedTimeRef.current = initialWatchTime;
      }

      currentSegmentRef.current = null;
      lastTimeRef.current = undefined;

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const state = await dongTienApi.getVideoProgress(videoId);
          if (videoIdRef.current !== videoId) return;
          if (state) {
            furthestPositionRef.current = Math.max(furthestPositionRef.current, state.furthest_position);
            watchedRangesRef.current = mergeRanges([...watchedRangesRef.current, ...state.watched_ranges]);
            playbackSpeedRef.current = state.playback_speed / 100;
            if (!cachedData || new Date(state.updated_at).getTime() >= (cachedData.updatedAt || 0)) {
              setWatchTime(state.last_position);
              watchTimeRef.current = state.last_position;
            }
          }
        } catch (e) {
          console.warn('[WatchTracker] Failed to fetch backend video progress:', e);
        }
      }
    };

    loadInitialState();

    lastCallTimestampRef.current = Date.now();
    lastInteractionTimeRef.current = Date.now();
    lastTickTimeRef.current = Date.now();
  }, [videoId, initialWatchTime, isAlreadyCompleted, duration]);

  const addToOfflineQueue = useCallback((vId: number, data: ProgressUpdateRequest) => {
    if (typeof window === 'undefined') return;
    try {
      const queueStr = localStorage.getItem(offlineProgressKey(localStorage.getItem(userEmailKey()) || '')) || '{}';
      const queue = JSON.parse(queueStr);
      queue[vId] = {
        ...data,
        timestamp: Date.now()
      };
      localStorage.setItem(offlineProgressKey(localStorage.getItem(userEmailKey()) || ''), JSON.stringify(queue));
    } catch (e) {
      console.warn('[WatchTracker] Failed to write to offline queue:', e);
    }
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (isAlreadyCompleted || typeof window === 'undefined' || !navigator.onLine) return;
    const owner = localStorage.getItem(userEmailKey()) || '';
    if (!owner) return;
    const queueKey = offlineProgressKey(owner);
    try {
      const queueStr = localStorage.getItem(queueKey);
      if (!queueStr) return;
      const queue = JSON.parse(queueStr);
      const keys = Object.keys(queue);
      if (keys.length === 0) return;

      for (const key of keys) {
        if (localStorage.getItem(userEmailKey()) !== owner) return;
        const item = queue[key];
        try {
          await dongTienApi.saveVideoProgress(item.lesson_id, {
            lesson_id: item.lesson_id,
            current_position: item.current_position,
            furthest_position: item.furthest_position,
            watched_ranges: item.watched_ranges,
            playback_speed: item.playback_speed,
          });
          delete queue[key];
        } catch (itemErr: any) {
          const isTerminalError = itemErr.status === 404 ||
                                  itemErr.response?.status === 404 ||
                                  (itemErr.message && itemErr.message.toLowerCase().includes('not found')) ||
                                  (itemErr.message && itemErr.message.toLowerCase().includes('404'));
          if (isTerminalError) {
            delete queue[key];
          }
        }
      }
      localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch (e) {
      console.warn('[WatchTracker] Failed to flush offline queue:', e);
    }
  }, [isAlreadyCompleted]);

  const resetProgressToZero = useCallback(async () => {
    const vId = videoIdRef.current;
    const sId = sessionIdRef.current;
    if (!vId || !sId) return;

    setWatchTime(0);
    watchTimeRef.current = 0;
    lastReportedTimeRef.current = 0;
    furthestPositionRef.current = 0;
    watchedRangesRef.current = [];
    currentSegmentRef.current = null;
    lastTimeRef.current = undefined;
    lastCallTimestampRef.current = Date.now();

    if (typeof window !== 'undefined') {
      localStorage.removeItem(progressCacheKey(localStorage.getItem(userEmailKey()) || '', vId));
      try {
        const queueStr = localStorage.getItem(offlineProgressKey(localStorage.getItem(userEmailKey()) || '')) || '{}';
        const queue = JSON.parse(queueStr);
        if (queue[vId]) {
          delete queue[vId];
          localStorage.setItem(offlineProgressKey(localStorage.getItem(userEmailKey()) || ''), JSON.stringify(queue));
        }
      } catch (e) {
        console.warn('[WatchTracker] Failed to clear offline queue for reset:', e);
      }
    }

    const payload: ProgressUpdateRequest = {
      lesson_id: vId,
      current_position: 0,
      furthest_position: 0,
      watched_ranges: [],
      playback_speed: 1.0,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      addToOfflineQueue(vId, payload);
      return;
    }

    if (onReportProgressRef.current) {
      onReportProgressRef.current({
        sessionId: sId,
        userId: typeof window !== 'undefined' ? localStorage.getItem(userEmailKey()) || undefined : undefined,
        videoId: vId,
        watchedSeconds: 0,
        totalDuration: durationRef.current,
        updatedAt: new Date().toISOString()
      }).catch(err => console.warn('[WatchTracker] reset callback failed:', err));
    }

    dongTienApi.saveVideoProgress(vId, payload).catch((err) => {
      console.warn('[WatchTracker] Failed to reset progress on server:', err);
      addToOfflineQueue(vId, payload);
    });
  }, [addToOfflineQueue]);

  useEffect(() => {
    if (isAlreadyCompleted || typeof window === 'undefined') return;
    window.addEventListener('online', processOfflineQueue);
    processOfflineQueue();
    return () => {
      window.removeEventListener('online', processOfflineQueue);
    };
  }, [processOfflineQueue, isAlreadyCompleted]);

  const reportProgress = useCallback(async (force = false) => {
    if (isAlreadyCompleted) return;
    const vId = videoIdRef.current;
    const sId = sessionIdRef.current;
    if (!vId || !sId) return;

    const roundedTime = Math.round(watchTimeRef.current);
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTimestampRef.current;

    const minSaveInterval = 10000;
    if (force || timeSinceLastCall >= minSaveInterval) {
      lastCallTimestampRef.current = now;
      lastReportedTimeRef.current = roundedTime;

      const activeRanges = [...watchedRangesRef.current];
      if (currentSegmentRef.current) {
        activeRanges.push(currentSegmentRef.current);
      }
      const mergedRanges = mergeRanges(activeRanges);

      const payload: ProgressUpdateRequest = {
        lesson_id: vId,
        current_position: watchTimeRef.current,
        furthest_position: furthestPositionRef.current,
        watched_ranges: mergedRanges,
        playback_speed: playbackSpeedRef.current,
      };

      if (typeof window !== 'undefined') {
        const email = localStorage.getItem(userEmailKey()) || '';
        localStorage.setItem(progressCacheKey(email, vId), JSON.stringify({
          ...payload,
          updatedAt: Date.now()
        }));
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        addToOfflineQueue(vId, payload);
        return;
      }

      try {
        await dongTienApi.saveVideoProgress(vId, payload);
        if (onReportProgressRef.current) {
          await onReportProgressRef.current({
            sessionId: sId,
            userId: typeof window !== 'undefined' ? localStorage.getItem(userEmailKey()) || undefined : undefined,
            videoId: vId,
            watchedSeconds: roundedTime,
            totalDuration: durationRef.current,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        addToOfflineQueue(vId, payload);
      }
    }
  }, [addToOfflineQueue, isAlreadyCompleted]);

  const reportProgressKeepAlive = useCallback(() => {
    if (isAlreadyCompleted) return;
    const vId = videoIdRef.current;
    if (!vId) return;

    const activeRanges = [...watchedRangesRef.current];
    if (currentSegmentRef.current) {
      activeRanges.push(currentSegmentRef.current);
    }
    const mergedRanges = mergeRanges(activeRanges);

    const payload: ProgressUpdateRequest = {
      lesson_id: vId,
      current_position: watchTimeRef.current,
      furthest_position: furthestPositionRef.current,
      watched_ranges: mergedRanges,
      playback_speed: playbackSpeedRef.current,
    };

    const token = typeof window !== 'undefined' ? localStorage.getItem(tokenKey()) : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Brand': getActiveBrand(),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queueKey = offlineProgressKey(localStorage.getItem(userEmailKey()) || '');
    addToOfflineQueue(vId, payload);
    fetch('/dong-tien/api/learning/videos/' + vId + '/progress', {
      method: 'POST', headers, body: JSON.stringify(payload), keepalive: true,
    }).then(response => {
      if (response.ok) {
        const queue = JSON.parse(localStorage.getItem(queueKey) || '{}');
        if (queue[vId]?.current_position === payload.current_position) { delete queue[vId]; localStorage.setItem(queueKey, JSON.stringify(queue)); }
      }
    }).catch(() => {});
  }, [addToOfflineQueue, isAlreadyCompleted]);

  useEffect(() => {
    if (isAlreadyCompleted || typeof window === 'undefined') return;

    const handleFocus = () => {
      isFocusedRef.current = true;
    };

    const handleBlur = () => {
      isFocusedRef.current = false;
      reportProgress(true);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [reportProgress, isAlreadyCompleted]);

  useEffect(() => {
    if (isAlreadyCompleted) return;
    const handleInteraction = () => {
      lastInteractionTimeRef.current = Date.now();
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((event) => {
      window.addEventListener(event, handleInteraction, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, [isAlreadyCompleted]);

  // Vimeo timeupdate drives watched ranges; wall-clock timers do not invent playback.

  useEffect(() => {
    if (isAlreadyCompleted) return;
    const heartbeat = setInterval(() => {
      reportProgress(false);
    }, 10000);

    return () => clearInterval(heartbeat);
  }, [reportProgress, isAlreadyCompleted]);

  useEffect(() => {
    if (isAlreadyCompleted) return;
    if (!isPlaying) {
      reportProgress(true);
    }
  }, [isPlaying, reportProgress, isAlreadyCompleted]);

  useEffect(() => {
    if (isAlreadyCompleted) return;
    const handleBeforeUnload = () => {
      reportProgressKeepAlive();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      reportProgressKeepAlive();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [videoId, reportProgressKeepAlive, isAlreadyCompleted]);

  const updateWatchTime = useCallback((time: number, speed?: number) => {
    if (isAlreadyCompleted) return;

    if (speed !== undefined) {
      playbackSpeedRef.current = speed;
    }

    const lastTime = lastTimeRef.current;
    lastTimeRef.current = time;

    const maxAllowedGap = Math.max(2.5, playbackSpeedRef.current * 2.5);
    const isSequential = lastTime !== undefined && (time - lastTime >= 0) && (time - lastTime <= maxAllowedGap);

    if (isSequential) {
      if (currentSegmentRef.current) {
        currentSegmentRef.current[1] = time;
      } else {
        currentSegmentRef.current = [lastTime, time];
      }
    } else {
      if (currentSegmentRef.current) {
        watchedRangesRef.current.push(currentSegmentRef.current);
        watchedRangesRef.current = mergeRanges(watchedRangesRef.current);
      }
      currentSegmentRef.current = [time, time];
    }

    if (time > furthestPositionRef.current) {
      furthestPositionRef.current = time;
    }

    const roundedTime = Math.round(time);
    if (roundedTime !== Math.round(watchTimeRef.current)) {
      setWatchTime(roundedTime);
    }
    watchTimeRef.current = time;

    const now = Date.now();
    if (typeof window !== 'undefined' && videoIdRef.current && (now - lastCacheSaveTimeRef.current >= 2000)) {
      lastCacheSaveTimeRef.current = now;
      const activeRanges = [...watchedRangesRef.current];
      if (currentSegmentRef.current) {
        activeRanges.push(currentSegmentRef.current);
      }
      const cached = {
        lesson_id: videoIdRef.current,
        current_position: time,
        furthest_position: furthestPositionRef.current,
        watched_ranges: mergeRanges(activeRanges),
        playback_speed: playbackSpeedRef.current,
        updatedAt: now
      };
      const email = localStorage.getItem(userEmailKey()) || '';
      localStorage.setItem(progressCacheKey(email, videoIdRef.current), JSON.stringify(cached));
    }
  }, [isAlreadyCompleted]);

  const finalWatchTime = isAlreadyCompleted ? duration : Math.round(watchTime);
  const progressPercent = durationRef.current > 0 ? Math.min(100, Math.round((finalWatchTime / durationRef.current) * 100)) : 0;

  return {
    watchTime: finalWatchTime,
    progressPercent,
    forceReport: () => reportProgress(true),
    resetProgressToZero,
    updateWatchTime,
  };
}
