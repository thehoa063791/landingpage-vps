export type AcademicBrand = 'dong-tien' | 'thinh-vuong';

export const DEFAULT_ACADEMIC_BRAND: AcademicBrand = 'dong-tien';

export const ACADEMIC_BRANDS: AcademicBrand[] = ['dong-tien', 'thinh-vuong'];

let activeBrand: AcademicBrand = 'dong-tien';

export function getActiveBrand(): AcademicBrand {
  return activeBrand;
}

export function setActiveBrand(brand: AcademicBrand) {
  if (ACADEMIC_BRANDS.includes(brand)) {
    activeBrand = brand;
  }
}

export function ns(key: string): string {
  return `dong-tien_${key}`;
}

// ── Key helpers ──────────────────────────────────────────────
export const tokenKey = () => ns('academic_survey_token');
export const userEmailKey = () => ns('ebila_academic_current_user_email');
export const loginTimeKey = () => ns('academic_survey_login_time');
export const surveyUserKey = () => ns('academic_survey_user');
export const surveyAuthRequiredKey = () => ns('academic_survey_auth_required');
export const surveyEmailCookie = () => ns('academic_survey_email');
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

// ── Đường dẫn theo brand ────────────────────────────────────
export const learnBasePath = () => `/learn`;
export const landingPath = () => `/`;
export const registrationSource = () => `dong-tien-landing`;
export const learnPagePath = (lessonId: number | string) =>
  `/learn/${lessonId}`;
