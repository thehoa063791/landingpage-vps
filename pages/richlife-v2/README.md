# Richlife v2

- Landing page: `/richlife-v2`
- Thank-you: `/richlife-v2/thank-you`
- Static files served by existing `/p` middleware.
- Form uses existing `POST /api/register`, with `page_id: richlife-v2` and `attendance: RichLife`.
- Calculator is browser-only, with no persistence or financial-input tracking.

## Content awaiting organizer details

Confirmed schedule: Hanoi, Saturday 26 September 2026, 08:00–20:00; Ho Chi Minh City, Sunday 4 October 2026 (time pending). Exact venues, capacity and deadline remain pending. The former 120-minute outline is now an untimed agenda. Registration requires a city selection saved in the API region field.

The official Excel file is not present. The preview is explicitly illustrative; there is no fake download or claim that email was sent. Add the real file, email delivery and calendar link when event details are available. Existing webhook filters may need to include the new `richlife-v2` page ID.

Existing local photo shows Pham Thanh Bien at Cashching 2022, not a past Richlife event. The speaker section labels it accordingly. Personal anecdotes requiring confirmation in the brief are omitted.

## Verification

Checked JS syntax and HTTP 200 for landing, thank-you, CSS, JS and unchanged `/richlife`. Browser checked at 1440px and 390px; calculator tested at 3, 6 and 13 months and zero expenses; no horizontal overflow or browser JS errors observed. API success, failure, invalid phone, UTM forwarding and exclusion of financial inputs checked with an in-memory mocked request; no test leads sent to the live registration system. Real database/webhook/email delivery not exercised.

## Tracking and SEO

`tracking.js` runs before the shared `/js/meta-pixel.js` on both pages. It owns attribution, session/cookies and `/api/track`; the shared loader owns the browser PageView. `app.js` remains the sole registration submit handler. CompleteRegistration uses the API-returned ID, value 0 VND, and a short-lived session-backed retry on the thank-you page. The server already records the conversion and sends CAPI/webhooks, so the browser does not POST a second conversion event.

Tracked interactions: first form focus, valid form submit attempt, registration/Zalo CTA clicks, 25/50/75/100 percent scroll. No calculator values or typed form contact details are sent with interaction events. Registration contact fields continue through the existing registration API and server-side integrations.

Canonical, Open Graph and Twitter metadata point at `https://event.phamthanhbien.com/richlife-v2`. `social-preview.jpg` is the existing, unchanged Richlife banner (515 × 250). The thank-you page remains noindex.

Run `node scripts/test-richlife-v2-tracking.cjs` for isolated tracking tests without network calls to Meta or webhooks. Local Meta configuration includes a test event code; verify the intended production environment and actual Meta Events Manager delivery after deployment. These checks do not prove external delivery.
