import { NextResponse, type NextRequest } from 'next/server';
import { ALL_CONTACT_PARAMS, CONTACT_COOKIE, CONTACT_COOKIE_SECONDS, CONTACT_PARAMS } from './lib/contactParams';

// Contact links (?email=&name=&phone=&khuvuc=): the server moves the fields into a 5-minute
// cookie and redirects to the same address without them, so the address bar never shows
// them. history.replaceState alone is not enough: in-app browsers (Messenger, Facebook,
// Zalo, Instagram) keep showing the URL they opened. The <head> script (urlIdentity.ts)
// reads the cookie once and deletes it; UTM and other parameters stay on the address.
export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  if (!ALL_CONTACT_PARAMS.some(name => url.searchParams.has(name))) return NextResponse.next();
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
  const https = request.headers.get('x-forwarded-proto') === 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const secure = https ? '; Secure' : '';
  return new NextResponse(null, { status: 302, headers: {
    Location: `${https ? 'https' : url.protocol.replace(':', '')}://${host}${url.pathname}${query ? `?${query}` : ''}`,
    'Cache-Control': 'no-store',
    // Percent-encoded JSON; the <head> script decodes it.
    'Set-Cookie': `${CONTACT_COOKIE}=${encodeURIComponent(JSON.stringify(contact))}; Path=/${course}; Max-Age=${CONTACT_COOKIE_SECONDS}; SameSite=Lax${secure}`,
  } });
}

// Course pages only; API routes, Next assets and files are left alone.
export const config = {
  matcher: ['/(dong-tien|trading)', '/(dong-tien|trading)/((?!api/|_next/).*)'],
};
