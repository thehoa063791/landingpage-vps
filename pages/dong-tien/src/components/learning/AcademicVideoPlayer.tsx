import React, { useEffect, useRef, useState } from 'react';
import type Player from '@vimeo/player';
import { toast } from '@/components/ui/sonner';

interface AcademicVideoPlayerProps {
  videoId: string;
  onProgress: (seconds: number, playbackSpeed?: number) => void;
  initialWatchTime: number;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onEnded?: () => void;
  playerInstanceRef?: React.MutableRefObject<any>;
  autoplay?: boolean;
}

export default function AcademicVideoPlayer({
  videoId,
  onProgress,
  initialWatchTime,
  onPlayStateChange,
  onEnded,
  playerInstanceRef,
  autoplay = true,
}: AcademicVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const maxTimeRef = useRef<number>(initialWatchTime);
  const lastTimeRef = useRef<number>(initialWatchTime);
  const currentRateRef = useRef<number>(1.0);
  const [duration, setDuration] = useState(0);

  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const onPlayStateChangeRef = useRef(onPlayStateChange);
  useEffect(() => {
    onPlayStateChangeRef.current = onPlayStateChange;
  }, [onPlayStateChange]);

  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const lastVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    const isNewVideo = videoId !== lastVideoIdRef.current;
    if (isNewVideo) {
      maxTimeRef.current = initialWatchTime;
      lastTimeRef.current = initialWatchTime;
      currentRateRef.current = 1.0;
    } else if (initialWatchTime > maxTimeRef.current) {
      maxTimeRef.current = initialWatchTime;
      lastTimeRef.current = initialWatchTime;
    }
    lastVideoIdRef.current = videoId;

    let playerInstance: Player | null = null;
    let isDestroyed = false;

    const initVimeoPlayer = async () => {
      if (!containerRef.current) return;

      try {
        containerRef.current.innerHTML = '';

        const VimeoPlayer = (await import('@vimeo/player')).default;

        if (isDestroyed || !containerRef.current) return;

        let value = String(videoId);
        if (/^https?:\/\//.test(value)) {
          const url = new URL(value);
          if (!['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) throw new Error('Invalid Vimeo host');
          value = url.pathname.replace(/^\/(?:video\/)?/, '') + (url.searchParams.get('h') ? `/${url.searchParams.get('h')}` : '');
        }
        const match = /^(\d+)(?:\/([a-zA-Z0-9]+))?$/.exec(value);
        if (!match) throw new Error('Invalid Vimeo video ID');
        const source = new URL(`https://player.vimeo.com/video/${match[1]}`);
        source.search = new URLSearchParams({ dnt: '1', autoplay: autoplay ? '1' : '0', controls: '1', byline: '0', title: '0', portrait: '0', ...(match[2] ? { h: match[2] } : {}) }).toString();
        // Construct the iframe directly, avoiding an external oEmbed request
        // from the application document. Only playback messages go to Vimeo.
        const frame = document.createElement('iframe');
        frame.src = source.toString();
        frame.title = 'Video bài học';
        frame.allow = 'autoplay; fullscreen; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'no-referrer';
        frame.style.cssText = 'width:100%;height:100%;border:0';
        containerRef.current.appendChild(frame);
        playerInstance = new VimeoPlayer(frame);
        const activePlayer = playerInstance;
        playerRef.current = playerInstance;
        if (playerInstanceRef) {
          playerInstanceRef.current = playerInstance;
        }

        try {
          await playerInstance.ready();
          if (maxTimeRef.current > 0 && !isDestroyed) {
            await playerInstance.setCurrentTime(maxTimeRef.current);
          }
        } catch (err) {
          console.warn('[VimeoPlayer] Failed to seek to initial watch time:', err);
        }

        playerInstance.getDuration().then((dur) => {
          if (!isDestroyed) setDuration(dur);
        }).catch((err) => {
          console.warn('[VimeoPlayer] Failed to retrieve duration:', err);
        });

        playerInstance.on('timeupdate', (data) => {
          if (isDestroyed) return;

          const time = data.seconds;
          const dur = data.duration || 0;
          if (dur > 0 && dur !== duration) {
            setDuration(dur);
          }

          if (time > maxTimeRef.current) {
            maxTimeRef.current = time;
          }
          lastTimeRef.current = time;
          onProgressRef.current(time, currentRateRef.current);
        });

        playerInstance.on('seeked', (data) => {
          if (isDestroyed) return;
          const time = data.seconds;
          if (time > maxTimeRef.current + 3) {
            toast.warning("Bạn không thể tua nhanh qua phần chưa xem.");
            activePlayer.setCurrentTime(maxTimeRef.current).catch(() => {});
          } else {
            lastTimeRef.current = time;
            onProgressRef.current(time, currentRateRef.current);
          }
        });

        playerInstance.on('playbackratechange', (data) => {
          if (isDestroyed) return;
          currentRateRef.current = data.playbackRate || 1.0;
          activePlayer.getCurrentTime().then((time) => {
            onProgressRef.current(time, currentRateRef.current);
          }).catch(() => {});
        });

        activePlayer.on('play', () => {
          if (isDestroyed) return;
          onPlayStateChangeRef.current?.(true);
        });

        activePlayer.on('pause', () => {
          if (isDestroyed) return;
          onPlayStateChangeRef.current?.(false);
          activePlayer.getCurrentTime().then((time) => {
            if (time > maxTimeRef.current) {
              maxTimeRef.current = time;
            }
            onProgressRef.current(time, currentRateRef.current);
          }).catch(() => {});
        });

        activePlayer.on('ended', () => {
          if (isDestroyed) return;
          onPlayStateChangeRef.current?.(false);
          activePlayer.getDuration().then((dur) => {
            if (isDestroyed) return;
            maxTimeRef.current = dur;
            onProgressRef.current(dur, currentRateRef.current);
            onEndedRef.current?.();
          }).catch((err) => {
            console.warn('[VimeoPlayer] Ended event getDuration error:', err);
            onEndedRef.current?.();
          });
        });

        playerInstance.on('loaded', () => {
          if (isDestroyed) return;
          playerInstance?.getDuration().then((dur) => {
            setDuration(dur);
          }).catch((err) => console.warn('[VimeoPlayer] Loaded getDuration error:', err));
        });

        playerInstance.on('error', (error) => {
          if (isDestroyed) return;
          const isAutoplayBlocked =
            error?.name === 'Error' &&
            String(error?.message || '').toLowerCase().includes('autoplay');
          if (isAutoplayBlocked) {
            console.warn('[VimeoPlayer] Autoplay blocked by browser, waiting for user play:', error);
          } else {
            console.error('[VimeoPlayer] Playback error:', error);
          }
        });

      } catch (err) {
        console.error('[VimeoPlayer] Initialization failed:', err);
      }
    };

    initVimeoPlayer();

    return () => {
      isDestroyed = true;
      if (playerInstanceRef) {
        playerInstanceRef.current = null;
      }
      if (playerInstance) {
        playerInstance.unload()
          .then(() => playerInstance?.destroy())
          .catch((err) => {
            console.warn('[VimeoPlayer] Error during destroy cleanup:', err);
          });
      }
      playerRef.current = null;
    };
  }, [videoId]);

  return (
    <div className="w-full h-full bg-black relative">
      <div ref={containerRef} className="w-full h-full bg-black [&>div]:w-full [&>div]:h-full [&>iframe]:w-full [&>iframe]:h-full" />
    </div>
  );
}
