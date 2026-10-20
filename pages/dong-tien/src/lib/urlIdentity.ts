import { urlContactKey, urlEmailKey } from './brand';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Contact fields a link may carry (CRM emails, the AI customer-care bot): ?email=&name=&phone=&khuvuc=.
const CONTACT_PARAMS: Record<string, string[]> = {
  email: ['email'],
  name: ['name', 'hoten', 'ho_ten', 'full_name'],
  phone: ['phone', 'sdt', 'so_dien_thoai'],
  region: ['khuvuc', 'khu_vuc', 'region'],
};
const ALL_CONTACT_PARAMS = Object.values(CONTACT_PARAMS).flat();

// This inline script runs in <head>, before the Pixel, GTM and funnel tracker read the
// address: it moves the contact fields into tab storage and removes them from the URL,
// so they never reach ad platforms, analytics or the referrer of outgoing requests.
// UTM parameters stay for attribution.
export const URL_EMAIL_SCRIPT = `(function(){try{var u=new URL(location.href),k=${JSON.stringify(CONTACT_PARAMS)},a=${JSON.stringify(ALL_CONTACT_PARAMS)},c={},f=false;for(var n in k){for(var i=0;i<k[n].length;i++){var v=(u.searchParams.get(k[n][i])||'').trim();if(v&&!c[n])c[n]=v.slice(0,200)}}a.forEach(function(p){if(u.searchParams.has(p)){u.searchParams.delete(p);f=true}});if(!f)return;var s=location.pathname.split('/')[1];if(c.email&&${EMAIL_RE}.test(c.email)){c.email=c.email.toLowerCase();sessionStorage.setItem(s+'_url_email',c.email)}else delete c.email;sessionStorage.setItem(s+'_url_contact',JSON.stringify(c));history.replaceState(history.state,'',u.pathname+u.search+u.hash)}catch(_){}})();`;

/** Returns the email from the landing URL once; later calls return ''. */
export function takeUrlEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    const email = sessionStorage.getItem(urlEmailKey()) || '';
    sessionStorage.removeItem(urlEmailKey());
    return EMAIL_RE.test(email) ? email : '';
  } catch {
    return '';
  }
}

export interface UrlContact { email: string; name: string; phone: string; region: string }

/** Returns the contact fields of the landing URL once (empty strings when absent). */
export function takeUrlContact(): UrlContact {
  const empty = { email: '', name: '', phone: '', region: '' };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = JSON.parse(sessionStorage.getItem(urlContactKey()) || '{}') || {};
    sessionStorage.removeItem(urlContactKey());
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    return { email: text(raw.email), name: text(raw.name), phone: text(raw.phone), region: text(raw.region) };
  } catch {
    return empty;
  }
}

/** Phone as the form expects it: digits only, +84/84 turned into a leading 0. */
export function normalizePhone(value: string): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

/** Maps free-text regions (HN, TP.HCM, Sài Gòn...) to the form's three choices. */
export function normalizeRegion(value: string): string {
  const key = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!key) return '';
  const compact = key.replace(/ /g, '');
  if (['hanoi', 'hn', 'tphanoi', 'thanhphohanoi'].includes(compact)) return 'Hà Nội';
  if (['hochiminh', 'hcm', 'tphcm', 'tphochiminh', 'thanhphohochiminh', 'saigon', 'sg', 'hcmc'].includes(compact)) return 'Hồ Chí Minh';
  return 'Khu vực khác';
}

/** Short links for staff: ?dang-nhap opens the login form, ?dang-ky the registration form. */
export function shortAuthLink(): 'login' | 'register' | '' {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  if (params.has('dang-nhap') || params.has('dangnhap')) return 'login';
  if (params.has('dang-ky') || params.has('dangky')) return 'register';
  return '';
}

/** ?action=login (and the ebila aliases) opens the login form instead of registration. */
export function requestedAuthMode(): 'login' | 'register' | '' {
  if (typeof window === 'undefined') return '';
  const shortLink = shortAuthLink();
  if (shortLink) return shortLink;
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();
  const action = (params.get('action') || params.get('auth') || params.get('mode') || params.get('tab') || '').toLowerCase();
  if (['login', 'dangnhap', 'signin', 'old'].includes(action) || ['true', '1'].includes(params.get('login') || '') || ['#login', '#dangnhap'].includes(hash)) return 'login';
  if (['register', 'signup', 'dangky', 'new'].includes(action) || ['true', '1'].includes(params.get('register') || params.get('signup') || '') || ['#register', '#dangky', '#signup'].includes(hash)) return 'register';
  return '';
}
