import {
  tokenKey,
  userEmailKey,
  loginTimeKey,
  surveyUserKey,
  surveyEmailCookie,
  progressCachePrefix,
  notePrefix,
} from './brand';
import type { AcademicUser } from '../types';

export function checkSurveyAuth(): boolean {
  if (typeof window === 'undefined') return false;

  const token = localStorage.getItem(tokenKey());
  const email = localStorage.getItem(userEmailKey());
  const loginTimeStr = localStorage.getItem(loginTimeKey());

  if (!token || !email || !loginTimeStr) {
    return false;
  }

  const loginTime = Number(loginTimeStr);
  const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  if (isNaN(loginTime) || Date.now() - loginTime > oneDayInMs) {
    localStorage.removeItem(tokenKey());
    localStorage.removeItem(userEmailKey());
    localStorage.removeItem(loginTimeKey());
    localStorage.removeItem(surveyUserKey());
    return false;
  }

  return true;
}

export function setSurveyLoginSession(token: string, email: string) {
  if (typeof window === 'undefined') return;

  localStorage.setItem(tokenKey(), token);
  localStorage.setItem(userEmailKey(), email);
  localStorage.setItem(loginTimeKey(), String(Date.now()));

  const expirationDays = 30;
  const expires = new Date();
  expires.setTime(expires.getTime() + expirationDays * 24 * 60 * 60 * 1000);
  document.cookie = `${surveyEmailCookie()}=${encodeURIComponent(email)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

export function getStoredSurveyUser(): AcademicUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(surveyUserKey());
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

export function setStoredSurveyUser(user: AcademicUser): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(surveyUserKey(), JSON.stringify(user));
  } catch {
    // ignore
  }
}

export function clearSurveyLoginSession() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(tokenKey());
  localStorage.removeItem(userEmailKey());
  localStorage.removeItem(loginTimeKey());
  localStorage.removeItem(surveyUserKey());

  document.cookie = `${surveyEmailCookie()}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;

  const prefixes = [progressCachePrefix(), notePrefix()];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && prefixes.some((p) => key.startsWith(p))) {
      localStorage.removeItem(key);
    }
  }
}

export function getSurveyEmailCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${surveyEmailCookie()}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
