import { COURSES, courseFromPath, DEFAULT_COURSE, type CourseId } from './courses';

export type AcademicBrand = CourseId;

// The first URL segment selects the course, so storage keys, API calls and links
// always follow the page the learner is on. Server rendering uses the default course
// only for markup; every storage/API call runs in the browser.
export function getActiveBrand(): CourseId {
  return typeof window === 'undefined' ? DEFAULT_COURSE : courseFromPath(window.location.pathname);
}

export const getActiveCourse = () => COURSES[getActiveBrand()];

// Keys keep the original "dong-tien_" prefix, so existing Dòng Tiền sessions survive.
export function ns(key: string): string {
  return `${getActiveBrand()}_${key}`;
}

// ── Key helpers ──────────────────────────────────────────────
export const tokenKey = () => ns('academic_survey_token');
export const userEmailKey = () => ns('ebila_academic_current_user_email');
export const loginTimeKey = () => ns('academic_survey_login_time');
export const surveyUserKey = () => ns('academic_survey_user');
export const surveyAuthRequiredKey = () => ns('academic_survey_auth_required');
export const surveyEmailCookie = () => ns('academic_survey_email');
export const urlEmailKey = () => ns('url_email');
export const progressCachePrefix = () => ns('user_video_progress_v2_');
export const offlineProgressPrefix = () => ns('pending_learning_progress_v2_');
export const offlineProgressKey = (email: string) => `${offlineProgressPrefix()}${email.toLowerCase()}`;
export const notePrefix = () => ns('ebila_tv_note_');
export const progressCacheKey = (email: string, videoId: number | string) =>
  `${progressCachePrefix()}${email}_${videoId}`;
export const noteKey = (sessionId: string | number) => `${notePrefix()}${sessionId}`;

// ── Onboarding tour flag ─────────────────────────────────
export const onboardingTourSeenPrefix = () => ns('ebila_learning_tour_seen');
export const onboardingTourSeenKey = (email?: string | null) =>
  email ? `${onboardingTourSeenPrefix()}_${email}` : onboardingTourSeenPrefix();

// ── Đường dẫn theo khóa học ─────────────────────────────────
export const apiBasePath = () => `/${getActiveBrand()}/api`;
export const learnBasePath = () => `/${getActiveBrand()}/learn`;
export const landingPath = () => `/${getActiveBrand()}`;
export const registrationSource = () => `${getActiveBrand()}-landing`;
export const learnPagePath = (lessonId: number | string) =>
  `${learnBasePath()}/${lessonId}`;
