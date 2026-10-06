export interface SurveyQuestionOption {
  value: string;
  label: string;
}

export interface SurveyQuestion {
  id: string;
  type: 'single_choice' | 'text';
  text: string;
  options?: SurveyQuestionOption[];
  required?: boolean;
}

export interface SurveyHiddenContent {
  questions: SurveyQuestion[];
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
  unlock_after_seconds: number;
  progress?: {
    watch_time: number;
    completed: boolean;
    survey_submitted?: boolean;
  };
  unlocked: boolean;
  hidden_content?: string;
  is_visible: boolean;
  show_unlock_time: boolean;
  show_popup: boolean;
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
  survey_answers?: Record<string, any>;
  tour_completed?: boolean;
}

export interface TokenResponse {
  event_id?: string;
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
  hidden_content?: string;
}

export interface SurveySubmitPayload {
  lesson_id: number;
  answers: Record<string, any>;
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
