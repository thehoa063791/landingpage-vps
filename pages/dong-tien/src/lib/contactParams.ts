// Contact fields a course link may carry (CRM emails, the AI customer-care bot):
// ?email=&name=&phone=&khuvuc=. Shared by the middleware (no browser APIs here) and the
// <head> script in urlIdentity.ts.
export const CONTACT_PARAMS: Record<string, string[]> = {
  email: ['email'],
  name: ['name', 'hoten', 'ho_ten', 'full_name'],
  phone: ['phone', 'sdt', 'so_dien_thoai'],
  region: ['khuvuc', 'khu_vuc', 'region'],
};
export const ALL_CONTACT_PARAMS = Object.values(CONTACT_PARAMS).flat();
// Short-lived cookie that carries the fields across the redirect to the clean address.
export const CONTACT_COOKIE = 'ptb_url_contact';
export const CONTACT_COOKIE_SECONDS = 300;
