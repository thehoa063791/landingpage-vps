import axios from 'axios';
import {
  AcademicLessonPublic,
  AcademicUser,
  CourseCompletionStatusResponse,
  ProgressUpdatePayload,
  ProgressUpdateRequest,
  ProgressUpdateResponse,
  RegistrationTrackingData,
  SurveyLoginPayload,
  SurveySessionCreatePayload,
  SurveySubmitPayload,
  TokenResponse,
  UserVideoProgress,
  VideoStateResponse,
} from '../types';
import { clearSurveyLoginSession } from './auth';
import { getTrackingData } from './tracking';
import {
  getActiveBrand,
  tokenKey,
  surveyUserKey,
  surveyAuthRequiredKey,
} from './brand';

export const ACADEMIC_SURVEY_UNAUTHORIZED_EVENT = 'academic-survey:unauthorized';

const getBaseUrl = () => '/dong-tien/api/learning';

const BASE_URL = getBaseUrl();

const surveyClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Brand': 'dong-tien',
  },
});

surveyClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(tokenKey());
    if (token) config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

surveyClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error.response?.data as any;
    const message = data?.detail || data?.message || error.message || 'An unexpected error occurred';

    if (error.response?.status === 401) {
      const url: string = error.config?.url || '';
      const isAuthEndpoint =
        url.includes('/academic-survey/register') ||
        url.includes('/academic-survey/login') ||
        url.endsWith('/register') ||
        url.endsWith('/login');

      if (!isAuthEndpoint) {
        if (typeof window !== 'undefined') {
          clearSurveyLoginSession();
          try {
            localStorage.removeItem(surveyUserKey());
          } catch {
            /* ignore */
          }
          try {
            sessionStorage.setItem(surveyAuthRequiredKey(), '1');
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new CustomEvent(ACADEMIC_SURVEY_UNAUTHORIZED_EVENT));
        }
      }
    }

    const errObj = new Error(message) as any;
    if (error.response) {
      errObj.status = error.response.status;
      errObj.response = error.response;
    }
    return Promise.reject(errObj);
  }
);

export const dongTienApi = {
  registerUser: async (
    payload: SurveySessionCreatePayload & RegistrationTrackingData
  ): Promise<TokenResponse> => {
    const tracking = getTrackingData(true);
    const data = (await axios.post('/dong-tien/api/register', { ...payload, ...tracking.utm, ...tracking.click_ids, ...tracking.pixel, session_id: tracking.session_id, event_source_url: tracking.event_source_url })).data;
    // CRM ID identifies the browser conversion; repeated registrations do not convert again.
    if (data.event_id && typeof window !== 'undefined') window.FunnelTracking?.browserEvent('conversion', {}, data.event_id);
    return data;
  },

  loginUser: async (payload: SurveyLoginPayload): Promise<TokenResponse> => {
    return surveyClient.post<any, TokenResponse>('/login', payload);
  },

  getLessons: async (): Promise<AcademicLessonPublic[]> => {
    const lessons = await surveyClient.get<any, AcademicLessonPublic[]>(`/lessons?t=${Date.now()}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
    return (lessons || []).map((lesson) => ({
      ...lesson,
      unlocked: true,
    }));
  },

  updateProgress: async (payload: ProgressUpdatePayload): Promise<ProgressUpdateResponse> => {
    return surveyClient.post<any, ProgressUpdateResponse>('/position', payload);
  },

  submitSurvey: async (payload: SurveySubmitPayload): Promise<{ success: boolean; message?: string }> => {
    return surveyClient.post<any, { success: boolean; message?: string }>('/survey', payload);
  },

  getProfile: async (): Promise<AcademicUser> => {
    return surveyClient.get<any, AcademicUser>('/profile');
  },

  completeTour: async (): Promise<{ success: boolean; message?: string }> => {
    return surveyClient.post<any, { success: boolean; message?: string }>('/complete-tour');
  },

  saveVideoProgress: async (videoId: number, payload: ProgressUpdateRequest): Promise<UserVideoProgress> => {
    return surveyClient.post<any, UserVideoProgress>(`/videos/${videoId}/progress`, payload);
  },

  getVideoProgress: async (videoId: number): Promise<UserVideoProgress> => {
    return surveyClient.get<any, UserVideoProgress>(`/videos/${videoId}/progress`);
  },

  getCourseCompletionStatus: async (courseId: number): Promise<CourseCompletionStatusResponse> => {
    return surveyClient.get<any, CourseCompletionStatusResponse>(`/courses/${courseId}/completion-status`);
  },

  getVideoState: async (videoId: number): Promise<VideoStateResponse> => {
    return surveyClient.get<any, VideoStateResponse>(`/videos/${videoId}/state`);
  },
};

export default dongTienApi;
