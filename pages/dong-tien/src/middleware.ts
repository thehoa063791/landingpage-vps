import { NextResponse, type NextRequest } from 'next/server';
import { attributionCookies, FT_COOKIE } from './lib/attribution';
import { ALL_CONTACT_PARAMS, CONTACT_COOKIE, CONTACT_COOKIE_SECONDS, CONTACT_PARAMS } from './lib/contactParams';
import { SITE_URL } from './lib/courses';

// Old hosts of the site (LEGACY_HOSTS, as in src/site.js of the root project): course pages
// opened there go to SITE_URL with a 301, same path and query, before anything else.
const LEGACY_HOSTS = (process.env.LEGACY_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(h => h && h !== new URL(SITE_URL).host);

// Course pages (/trading, /dong-tien):
// 1. First/last touch cookies (src/lib/attribution.ts), from the address as opened, so a
//    contact link's UTM counts before the redirect below.
// 2. Contact links (?email=&name=&phone=&khuvuc=): the server moves the fields into a 5-minute
//    cookie and redirects to the same address without them, so the address bar never shows
//    them. history.replaceState alone is not enough: in-app browsers (Messenger, Facebook,
//    Zalo, Instagram) keep showing the URL they opened. The <head> script (urlIdentity.ts)
//    reads the cookie once and deletes it; UTM and other parameters stay on the address.
export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const https = request.headers.get('x-forwarded-proto') === 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  if (LEGACY_HOSTS.includes(host.split(':')[0].toLowerCase()) && ['GET', 'HEAD'].includes(request.method)) {
    return NextResponse.redirect(`${SITE_URL}${url.pathname}${url.search}`, 301);
  }
  const page = (request.headers.get('accept') || '').includes('text/html') && !/\.[a-z0-9]{2,5}$/i.test(url.pathname);
  const touches = page ? attributionCookies({ params: url.searchParams, referer: request.headers.get('referer') || '', path: url.pathname, host, secure: https, ft: request.cookies.get(FT_COOKIE)?.value }) : [];

  if (!ALL_CONTACT_PARAMS.some(name => url.searchParams.has(name))) {
    const response = NextResponse.next();
    for (const cookie of touches) response.headers.append('Set-Cookie', cookie);
    return response;
  }
  const contact: Record<string, string> = {};
  for (const [field, names] of Object.entries(CONTACT_PARAMS)) {
    for (const name of names) {
      const value = (url.searchParams.get(name) || '').trim();
      if (value && !contact[field]) contact[field] = value.slice(0, 200);
    }
  }
  const clean = new URLSearchParams(url.search);
  for (const name of ALL_CONTACT_PARAMS) clean.delete(name);
  const query = clean.toString();
  // Next needs an absolute Location: the public host and scheme as nginx forwards them
  // (Host, X-Forwarded-Proto), not the proxy's own http://127.0.0.1:3002.
  const course = url.pathname.split('/')[1];
  const headers = new Headers({
    Location: `${https ? 'https' : url.protocol.replace(':', '')}://${host}${url.pathname}${query ? `?${query}` : ''}`,
    'Cache-Control': 'no-store',
  });
  // Percent-encoded JSON; the <head> script decodes it.
  headers.append('Set-Cookie', `${CONTACT_COOKIE}=${encodeURIComponent(JSON.stringify(contact))}; Path=/${course}; Max-Age=${CONTACT_COOKIE_SECONDS}; SameSite=Lax${https ? '; Secure' : ''}`);
  for (const cookie of touches) headers.append('Set-Cookie', cookie);
  return new NextResponse(null, { status: 302, headers });
}

// Course pages only; API routes, Next assets and files are left alone.
export const config = {
  matcher: ['/(dong-tien|trading)', '/(dong-tien|trading)/((?!api/|_next/).*)'],
};
