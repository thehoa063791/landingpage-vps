import { urlEmailKey } from './brand';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email/CRM links identify a learner with ?email= (as on ebila). This inline script
// runs in <head>, before the Pixel, GTM and funnel tracker read the address: it moves
// the email into tab storage and removes it from the URL, so it never reaches ad
// platforms, analytics or the referrer of outgoing requests.
export const URL_EMAIL_SCRIPT = `(function(){try{var u=new URL(location.href),e=(u.searchParams.get('email')||'').trim();if(!e)return;u.searchParams.delete('email');if(${EMAIL_RE}.test(e))sessionStorage.setItem(location.pathname.split('/')[1]+'_url_email',e.toLowerCase());history.replaceState(history.state,'',u.pathname+u.search+u.hash)}catch(_){}})();`;

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
