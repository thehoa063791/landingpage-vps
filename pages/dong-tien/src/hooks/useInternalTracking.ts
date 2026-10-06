import { useCallback } from 'react';
import { trackEvent } from '../lib/internalTracking.api';
import { getTrackingData } from '../lib/tracking';
import { getStoredSurveyUser } from '../lib/auth';
import { getActiveBrand } from '../lib/brand';


type Lead = { name?: string; email?: string; phone?: string; region?: string };
type LessonMeta = {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  value?: number;
  currency?: string;
  lesson_id?: number | string;
  lesson_title?: string;
  url?: string;
};
const eventId = (name: string) => `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// All events use the same-origin API and are stored in the admin database.
export function useInternalTracking() {
  const pageId = getActiveBrand();
  const getTracking = useCallback((refresh = false) => getTrackingData(refresh), []);
  const trackViewContent = useCallback(async (meta?: LessonMeta, lead?: Lead) => {
    if (meta?.content_category !== 'lesson' && meta?.lesson_id === undefined) return '';
    const id = eventId('view_content');
    await trackEvent({ event: 'view_content', page_id: pageId, tracking: getTracking(true), event_id: id, meta, lead: lead as any });
    return id;
  }, [getTracking, pageId]);
  const trackLearningView = useCallback(async (lesson: { id: number | string; title: string }, lead?: Lead) => {
    const user = getStoredSurveyUser();
    return trackViewContent({ content_name: lesson.title, content_category: 'lesson', lesson_id: lesson.id, lesson_title: lesson.title, url: typeof window !== 'undefined' ? window.location.href : `/dong-tien/learn/${lesson.id}` }, lead || (user ? { name: user.full_name, email: user.email, phone: user.phone, region: user.region } : undefined));
  }, [trackViewContent]);
  const trackCtaClick = useCallback(async (label?: string) => {
    await trackEvent({ event: 'cta_click', page_id: pageId, tracking: getTracking(), meta: { button_label: label || 'unknown' }, event_id: eventId('cta_click') });
  }, [getTracking, pageId]);
  const trackFormOpen = useCallback(async () => {
    await trackEvent({ event: 'form_open', page_id: pageId, tracking: getTracking(true), event_id: eventId('form_open') });
  }, [getTracking, pageId]);
  return { getTracking, trackViewContent, trackLearningView, trackFormOpen, trackCtaClick };
}
