// A call to action on the lesson page, configured in the admin (Funnels › Khóa học › CTA).
export interface LessonCta {
  id: string;
  type: 'zalo' | 'link' | 'zoom' | 'message';
  title: string;
  body: string;
  button_label: string;
  url: string;
  image: string;
  trigger: 'time' | 'percent' | 'end';
  trigger_value: number;
  display: 'card' | 'overlay' | 'popup';
  // daisyUI card template, size and primary colour (src/learningCta.js).
  variant: 'basic' | 'badges' | 'bottom' | 'centered' | 'plain' | 'bordered' | 'dash' | 'color' | 'neutral' | 'close' | 'side' | 'imagefull' | 'pricing';
  size: 'sm' | 'md' | 'lg';
  color: 'auto' | 'zalo' | 'indigo' | 'amber' | 'green' | 'pink' | 'red' | 'neutral';
  repeat: 'every_view' | 'once_per_lesson' | 'once';
  hide_after_click: boolean;
}

export interface VideoProgress {
  watch_time: number;
  completed: boolean;
}

export interface AcademicLessonPublic {
  id: number;
  vimeo_video_id: string;
  title: string;
  description?: string;
  video_url?: string;
  thumbnail_url?: string;
  duration: number;
  progress?: {
    watch_time: number;
    completed: boolean;
  };
  unlocked: boolean;
  is_visible: boolean;
  ctas?: LessonCta[];
  stage_id?: number | null;
  stage_title?: string | null;
  stage_position?: number | null;
}

export interface AcademicUser {
  id: string | number;
  full_name: string;
  email: string;
  phone?: string;
  region?: string;
  interest?: string;
  tour_completed?: boolean;
}

export interface TokenResponse {
  event_id?: string;
  /** Set when a contact link signed an already registered learner in. */
  existing?: boolean;
  access_token: string;
  token_type: string;
  user: AcademicUser;
}

export interface SurveySessionCreatePayload {
  session_id?: string;
  event_source_url?: string;
  full_name: string;
  email: string;
  phone?: string;
  region?: string;
  interest?: string;
  /** Contact links: an email already in the funnel signs in instead of failing with 409. */
  signin_if_registered?: boolean;
}

export interface SurveyLoginPayload {
  email: string;
}

export interface ProgressUpdatePayload {
  video_id: number;
  watch_time: number;
}

export interface ProgressUpdateResponse {
  watch_time: number;
  completed: boolean;
  unlocked: boolean;
}

export interface CtaEventPayload {
  cta_id: string;
  lesson_id: number;
  action: 'view' | 'click';
}

// ─── Facebook CAPI Tracking Types ───────────────────────────────────────────

export interface UTMData {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  referrer: string;
}

export interface ClickIds {
  fbclid: string;
  gclid: string;
  ttclid: string;
  msclkid: string;
  twclid: string;
}

export interface PixelCookies {
  fbc: string;
  fbp: string;
  ga: string;
}

export interface TrackingData {
  session_id: string;
  event_source_url: string;
  utm: UTMData;
  click_ids: ClickIds;
  pixel: PixelCookies;
}

export type CAPIEventType =
  | 'pageview'
  | 'form_open'
  | 'form_submit'
  | 'cta_click'
  | 'conversion'
  | 'view_content';

export interface InternalTrackingPayload {
  event: CAPIEventType;
  page_id: string;
  tracking: TrackingData;
  lead?: {
    name?: string;
    email?: string;
    phone?: string;
    region?: string;
  };
  meta?: Record<string, any>;
  event_id?: string;
}

export interface InternalTrackingResponse {
  success: boolean;
  event_id?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export interface RegistrationWithTracking extends SurveySessionCreatePayload {
  tracking?: TrackingData;
  page_id?: string;
}

export interface RegistrationTrackingData {
  registration_source?: string;
  fbclid?: string;
  ip_address?: string;
  user_agent?: string;
  registration_status?: 'success' | 'pending' | 'failed';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  fbc?: string;
  fbp?: string;
  gclid?: string;
}

export interface UserEventRecord {
  user_id?: number | null;
  event_name: string;
  event_payload: Record<string, any>;
  sent_to_webhook?: 0 | 1 | 2;
  sent_to_capi?: 0 | 1 | 2;
  webhook_response?: string | null;
  capi_response?: string | null;
  page_url?: string | null;
  ip_address?: string | null;
}

export interface UserVideoProgress {
  id: string | number;
  user_id: string | number;
  course_id: number;
  lesson_id: number;
  duration: number;
  last_position: number;
  furthest_position: number;
  watched_ranges: number[][];
  watch_percent: number;
  is_completed: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  playback_speed: number;
}

export interface ProgressUpdateRequest {
  lesson_id: number;
  current_position: number;
  furthest_position: number;
  watched_ranges: number[][];
  playback_speed: number;
}

export interface CourseCompletionStatusResponse {
  course_id: number;
  total_videos: number;
  completed_videos: number;
  completion_percentage: number;
  video_details: {
    lesson_id: number;
    is_completed: boolean;
    watch_percent: number;
    completed_at?: string;
  }[];
}

export interface VideoStateResponse {
  lesson_id: number;
  current_position: number;
  duration: number;
  is_completed: boolean;
  should_resume: boolean;
  resume_position?: number | null;
}

export interface WatchProgressPayload {
  sessionId: number | undefined;
  userId?: string;
  videoId: number;
  watchedSeconds: number;
  totalDuration: number;
  updatedAt: string;
}
