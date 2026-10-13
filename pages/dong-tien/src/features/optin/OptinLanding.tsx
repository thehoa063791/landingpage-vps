import Head from "next/head";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import styles from "@/styles/dong-tien-v2.module.css";
import dongTienApi from "@/lib/api";
import {
  setSurveyLoginSession,
  checkSurveyAuth,
  getSurveyEmailCookie,
  setStoredSurveyUser,
  wantsToStayOnLanding,
} from "@/lib/auth";
import { registrationSource, learnBasePath, learnPagePath, surveyAuthRequiredKey, userEmailKey } from "@/lib/brand";
import { getTrackingData } from "@/lib/tracking";
import { useCourse } from "@/lib/courseContext";
import { SITE_URL } from "@/lib/courses";
import { nextAvailableLesson } from "@/lib/lessonNavigation";
import { requestedAuthMode, shortAuthLink, takeUrlEmail } from "@/lib/urlIdentity";

// Opt-in landing shared by the course funnels: content comes from each course page,
// registration, login, URL identification and measurement are identical.
export interface OptinContent {
  metaTitle: string;
  metaDescription: string;
  heroImage: string;
  title: ReactNode;
  subtitle: ReactNode;
  limitCount: string;
  videoSrc: string;
  videoTitle: string;
  benefits: string[];
  submitLabel: string;
  privacyNote?: string;
  socialProofMessage: string;
  /** Share preview (Zalo, Messenger, Facebook): 1200x630 image under /public. */
  share?: { title: string; description: string; image: string; imageAlt: string };
  /** Darker top band for bright photos, so the heading stays readable. */
  dimHeroTop?: boolean;
  /** Keeps title, subtitle and limit on one line each from tablet width up. */
  singleLineHeading?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Automatic sign-in screen, as on ebila.ai/dong-tien: the spinner runs at least
// AUTO_SPIN_MS, then turns into a check mark held for AUTO_DONE_MS before the lesson opens.
const AUTO_SPIN_MS = 1500;
const AUTO_DONE_MS = 800;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function AutoLoginScreen({ done, email, courseTitle }: { done: boolean; email: string; courseTitle: string }) {
  return (
    <>
      <Head>
        <title>{`Đang thiết lập lớp học - ${courseTitle}`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-['Montserrat',sans-serif] px-4">
        <div className="flex flex-col items-center gap-8 max-w-md w-full relative z-10" role="status" aria-live="polite">
          {done ? (
            <div className={styles.doneCircle} aria-label="Đăng nhập thành công">
              <svg viewBox="0 0 52 52" className={styles.doneCheck} aria-hidden="true">
                <path d="M14 27 l8 8 l16 -18" />
              </svg>
            </div>
          ) : (
            <div className="relative">
              <div className="w-16 h-16 border-4 border-slate-800 rounded-full" />
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-t-amber-500 border-r-amber-400 border-b-transparent border-l-transparent rounded-full animate-spin" />
            </div>
          )}
          <div className="text-center space-y-3">
            <h1 className="text-2xl font-black text-white tracking-tight">Chào mừng bạn quay lại!</h1>
            {email && (
              <p className="text-sm text-slate-300 font-medium">
                Bạn đã đăng nhập bằng email{" "}
                <span className="font-bold text-amber-400 break-all">{email}</span>
              </p>
            )}
            <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto min-h-[40px] transition-all duration-300">
              {done
                ? "Đăng nhập thành công! Đang mở bài học..."
                : "Hệ thống đang tự động đăng nhập và mở bài học bạn đang học dở..."}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

const REGIONS = ["Hồ Chí Minh", "Hà Nội", "Khu vực khác"];

// Typo hint for the most common mail domains ("gmial.com" → "gmail.com"): a mistyped
// address registers a lead that can never sign in or be reached.
const MAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "yahoo.com.vn"];
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
function suggestEmail(value: string) {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || !EMAIL_RE.test(email)) return "";
  const domain = email.slice(at + 1);
  if (MAIL_DOMAINS.includes(domain)) return "";
  const match = MAIL_DOMAINS.find((known) => editDistance(domain, known) <= 2);
  return match ? `${email.slice(0, at)}@${match}` : "";
}

function EmailSuggestion({ email, onPick }: { email: string; onPick: (email: string) => void }) {
  const suggestion = suggestEmail(email);
  if (!suggestion) return null;
  return (
    <p className={styles.emailHint}>
      Có phải ý bạn là{" "}
      <button type="button" className={styles.linkBtn} onClick={() => onPick(suggestion)}>
        {suggestion}
      </button>
      ?
    </p>
  );
}

type AuthNotice = { kind: "registered" | "missing"; email: string };

// The learning API answers 409 already_registered / 404 not_registered.
function authFailure(err: unknown): AuthNotice["kind"] | null {
  const e = err as { status?: number; response?: { status?: number; data?: { code?: string } } } | null;
  const code = e?.response?.data?.code;
  const status = e?.status ?? e?.response?.status;
  if (code === "already_registered" || status === 409) return "registered";
  if (code === "not_registered" || status === 404) return "missing";
  return null;
}

function AuthNoticeBox({ notice, onAction }: { notice: AuthNotice; onAction: () => void }) {
  const registered = notice.kind === "registered";
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.noticeTitle}>
        {registered ? (
          "Email này đã được đăng ký trên hệ thống."
        ) : (
          <>
            Email <span className={styles.noticeEmail}>{notice.email}</span> chưa có trên hệ thống.
          </>
        )}
      </p>
      <p className={styles.noticeText}>
        {registered ? (
          <>
            Vui lòng <strong>ĐĂNG NHẬP</strong> để vào học ngay
          </>
        ) : (
          <>
            Nếu bạn chưa đăng ký, vui lòng <strong>ĐĂNG KÝ</strong> để nhận video
          </>
        )}
      </p>
      <button type="button" className={styles.noticeBtn} onClick={onAction}>
        {registered ? "ĐĂNG NHẬP NGAY" : "ĐĂNG KÝ MỚI"}
      </button>
    </div>
  );
}

// ──────────────── Countdown Timer ────────────────
function useCountdown(hoursDuration: number = 2) {
  const [time, setTime] = useState({
    hours: hoursDuration,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const targetTime = Date.now() + hoursDuration * 60 * 60 * 1000;
    const calc = () => {
      const diff = Math.max(0, targetTime - Date.now());
      return {
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      };
    };

    setTime(calc());
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [hoursDuration]);

  return time;
}

// ──────────────── Social Proof Popup ────────────────
const NAMES = [
  "Nguyễn Minh Anh",
  "Trần Quốc Huy",
  "Lê Hoàng Nam",
  "Phạm Minh Tuấn",
  "Nguyễn Thu Hà",
  "Đỗ Đức Anh",
  "Vũ Minh Khang",
  "Trần Ngọc Mai",
  "Nguyễn Hoàng Long",
  "Phạm Quang Huy",
  "Lê Minh Đức",
  "Trần Minh Anh",
  "Nguyễn Quốc Việt",
  "Hoàng Minh Tuấn",
  "Phạm Ngọc Anh",
];

function SocialProofPopup({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState({
    name: NAMES[0],
    time: "Vừa xong",
  });

  const available = useRef([...NAMES]);

  useEffect(() => {
    const times = [
      "Vừa xong",
      "1 phút trước",
      "2 phút trước",
      "3 phút trước",
      "5 phút trước",
    ];
    let timer: ReturnType<typeof setTimeout>;

    const show = () => {
      if (!available.current.length) {
        available.current = [...NAMES];
      }

      const idx = Math.floor(Math.random() * available.current.length);

      const name = available.current.splice(idx, 1)[0];
      const time = times[Math.floor(Math.random() * times.length)];

      setCurrent({ name, time });
      setVisible(true);

      setTimeout(() => setVisible(false), 6000);

      timer = setTimeout(show, Math.random() * 30000 + 30000);
    };

    timer = setTimeout(show, Math.random() * 5000 + 10000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`${styles.socialProof} ${
        visible ? styles.socialProofShow : ""
      }`}
    >
      <div className={styles.spIcon}>🔔</div>

      <div className={styles.spBody}>
        <p className={styles.spName}>Chúc mừng {current.name}</p>

        <p className={styles.spMsg}>{message}</p>

        <p className={styles.spTime}>{current.time}</p>
      </div>
    </div>
  );
}

function errorMessage(err: unknown, fallback: string) {
  let message = "";
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, any>;
    const resDetail =
      anyErr.response?.data?.detail ||
      anyErr.response?.data?.message ||
      anyErr.detail;
    if (typeof resDetail === "string" && resDetail.trim()) {
      message = resDetail.trim();
    }
  }

  const anyErr = err as { response?: unknown; request?: unknown; message?: string } | null;
  if (!message && anyErr && !anyErr.response && (anyErr.request || anyErr.message === "Network Error")) {
    return "Không kết nối được tới hệ thống. Vui lòng kiểm tra mạng và thử lại.";
  }

  if (!message && err instanceof Error) {
    const raw = err.message?.trim();
    if (raw && raw !== "An unexpected error occurred" && raw !== "Network Error") {
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.detail || parsed?.message || raw;
      } catch {
        message = raw;
      }
    }
  }

  return !message || message === "An unexpected error occurred" ? fallback : message;
}

// ──────────────── Main Page ────────────────
export default function OptinLanding({ content }: { content: OptinContent }) {
  const router = useRouter();
  const course = useCourse();
  const { hours, minutes, seconds } = useCountdown(2);

  const [mode, setMode] = useState<"register" | "login">("register");
  const [loginEmail, setLoginEmail] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    region: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  const [autoLogin, setAutoLogin] = useState<{ status: "loading" | "success"; email: string } | null>(null);
  const autoLoginAttempted = useRef(false);

  const startAutoLogin = (email: string) => {
    // This visit only signs a returning learner in: the funnel report keeps it out of
    // landing traffic. Child effects run before the route pageview in _app.
    (window as Window & { __FUNNEL_PAGEVIEW_DETAILS__?: Record<string, unknown> }).__FUNNEL_PAGEVIEW_DETAILS__ = { returning_learner: true };
    setAutoLogin({ status: "loading", email });
    return Date.now();
  };

  // Opens the first unfinished lesson directly, after the spinner and the check mark.
  const finishAutoLogin = async (startedAt: number, email: string) => {
    let target = learnBasePath();
    try {
      const lessons = await dongTienApi.getLessons();
      if (lessons.length) target = learnPagePath(nextAvailableLesson(lessons).id);
    } catch {
      /* the learn page resolves the lesson itself */
    }
    await wait(Math.max(0, AUTO_SPIN_MS - (Date.now() - startedAt)));
    setAutoLogin({ status: "success", email });
    await wait(AUTO_DONE_MS);
    await router.replace(target);
  };

  // A live session needs no request; it shows the same confirmation before the course.
  const resumeSession = (email: string) => {
    setSubmitted(true);
    setMode("login");
    finishAutoLogin(startAutoLogin(email), email);
  };

  const executeLogin = async (targetEmail: string, isAuto: boolean = false) => {
    const cleanEmail = targetEmail.trim();
    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      setError("Vui lòng nhập địa chỉ email hợp lệ để đăng nhập.");
      return;
    }

    setError("");
    setNotice(null);
    setSubmitting(true);
    const startedAt = isAuto ? startAutoLogin(cleanEmail) : 0;

    try {
      const response = await dongTienApi.loginUser({
        email: cleanEmail,
      });
      if (response && response.access_token) {
        setSurveyLoginSession(response.access_token, response.user.email);
        if (response.user) {
          setStoredSurveyUser(response.user);
        }
        setSubmitted(true);

        if (isAuto) await finishAutoLogin(startedAt, response.user.email);
        else await router.replace(learnBasePath());
      } else {
        throw new Error("Không nhận được token từ hệ thống.");
      }
    } catch (err: unknown) {
      console.warn("[OptinLanding] login rejected:", err);
      if (isAuto) {
        setAutoLogin(null);
      }
      const failure = authFailure(err);
      if (isAuto && failure === "missing") {
        // An email link (or saved email) of someone not registered yet opens registration.
        setMode("register");
        setForm((prev) => ({ ...prev, email: cleanEmail }));
        setError("Email này chưa đăng ký. Vui lòng điền thông tin bên dưới để nhận video.");
      } else if (failure === "missing") {
        setNotice({ kind: "missing", email: cleanEmail });
      } else {
        setError(
          errorMessage(err, "Email chưa được đăng ký hoặc không đúng. Vui lòng kiểm tra lại."),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: "register" | "login", email?: string) => {
    setMode(next);
    setError("");
    setNotice(null);
    if (email && next === "login") setLoginEmail(email);
    if (email && next === "register") setForm((prev) => ({ ...prev, email }));
  };

  const handleNoticeAction = () => {
    if (!notice) return;
    if (notice.kind === "registered") {
      // Same email, one click: sign in and open the course.
      switchMode("login", notice.email);
      executeLogin(notice.email);
    } else {
      switchMode("register", notice.email);
      setTimeout(() => document.getElementById("v2-name")?.focus(), 0);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    await executeLogin(loginEmail);
  };

  // Layout effect: the sign-in decision (and its returning-learner pageview flag) comes
  // before the route pageview of _app and before the landing is painted.
  useIsomorphicLayoutEffect(() => {
    if (!router.isReady || autoLoginAttempted.current) return;
    autoLoginAttempted.current = true;

    const requested = requestedAuthMode();
    if (requested) setMode(requested);

    const urlEmail = takeUrlEmail();
    if (urlEmail) {
      setLoginEmail(urlEmail);
      setForm((prev) => ({ ...prev, email: urlEmail }));
      const currentEmail = checkSurveyAuth() ? localStorage.getItem(userEmailKey()) : null;
      if (currentEmail?.toLowerCase() === urlEmail) {
        resumeSession(urlEmail);
        return;
      }
      setMode("login");
      executeLogin(urlEmail, true);
      return;
    }

    // Returning learners go straight to their lessons (as on ebila): a live session
    // opens the course, otherwise the 14-day email cookie signs in again. Logging out
    // clears both; ?action=register keeps the form for registering someone else.
    if (requested === "register") return;
    // "Trang chủ" from the course: show the landing, prefilled, without signing back in.
    if (wantsToStayOnLanding()) {
      const email = (checkSurveyAuth() && localStorage.getItem(userEmailKey())) || getSurveyEmailCookie();
      if (email) {
        (window as Window & { __FUNNEL_PAGEVIEW_DETAILS__?: Record<string, unknown> }).__FUNNEL_PAGEVIEW_DETAILS__ = { returning_learner: true };
        setLoginEmail(email);
        setMode("login");
      }
      return;
    }
    // ?dang-nhap shows the login form itself, prefilled from the cookie, without redirecting.
    if (shortAuthLink() === "login") {
      const saved = getSurveyEmailCookie();
      if (saved) setLoginEmail(saved);
      return;
    }
    if (checkSurveyAuth()) {
      resumeSession(localStorage.getItem(userEmailKey()) || "");
      return;
    }
    const savedEmail = getSurveyEmailCookie();
    if (savedEmail) {
      setLoginEmail(savedEmail);
      setMode("login");
      // Just rejected in this tab (401): prefill only, so a server fault cannot loop.
      let rejected = false;
      try {
        rejected = sessionStorage.getItem(surveyAuthRequiredKey()) === "1";
        sessionStorage.removeItem(surveyAuthRequiredKey());
      } catch {
        /* storage unavailable */
      }
      if (!rejected) executeLogin(savedEmail, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.name.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (!form.email.trim() || !EMAIL_RE.test(form.email)) {
      setError("Vui lòng nhập email hợp lệ.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Vui lòng nhập số điện thoại.");
      return;
    }
    if (!/^\d{9,11}$/.test(form.phone.replace(/\D/g, ""))) {
      setError("Số điện thoại chưa đúng, vui lòng nhập 9–11 chữ số.");
      return;
    }
    if (!form.region) {
      setError("Vui lòng chọn khu vực.");
      return;
    }

    setError("");
    setNotice(null);
    setSubmitting(true);

    try {
      const trackingData = getTrackingData();
      const response = await dongTienApi.registerUser({
        full_name: form.name,
        email: form.email,
        phone: form.phone,
        region: form.region,
        interest: "",
        registration_source: registrationSource(),
        fbclid: trackingData?.click_ids?.fbclid || "",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        registration_status: "success",
        utm_source: trackingData?.utm?.utm_source || "",
        utm_medium: trackingData?.utm?.utm_medium || "",
        utm_campaign: trackingData?.utm?.utm_campaign || "",
        utm_content: trackingData?.utm?.utm_content || "",
        utm_term: trackingData?.utm?.utm_term || "",
        referrer: trackingData?.utm?.referrer || "",
        fbc: trackingData?.pixel?.fbc || "",
        fbp: trackingData?.pixel?.fbp || "",
        gclid: trackingData?.click_ids?.gclid || "",
        session_id: trackingData?.session_id || "",
        event_source_url: trackingData?.event_source_url || "",
      });

      if (!response.access_token) throw new Error("Không lưu được đăng ký.");
      setSurveyLoginSession(response.access_token, response.user.email);
      setStoredSurveyUser(response.user);
      setSubmitted(true);
      await router.push(learnBasePath());
    } catch (err: unknown) {
      console.warn("[OptinLanding] registration rejected:", err);
      if (authFailure(err) === "registered") {
        setNotice({ kind: "registered", email: form.email.trim().toLowerCase() });
        return;
      }
      setError(errorMessage(err, "Đã xảy ra lỗi vui lòng liên hệ bộ phận hỗ trợ"));
    } finally {
      setSubmitting(false);
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  if (autoLogin) {
    return <AutoLoginScreen done={autoLogin.status === "success"} email={autoLogin.email} courseTitle={course.title} />;
  }

  return (
    <>
      <Head>
        <title>{content.metaTitle}</title>
        <meta name="description" content={content.metaDescription} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${SITE_URL}/${course.id}`} />
        {content.share && (
          <>
            <meta property="og:type" content="website" />
            <meta property="og:locale" content="vi_VN" />
            <meta property="og:site_name" content="Phạm Thành Biên" />
            <meta property="og:url" content={`${SITE_URL}/${course.id}`} />
            <meta property="og:title" content={content.share.title} />
            <meta property="og:description" content={content.share.description} />
            <meta property="og:image" content={`${SITE_URL}${content.share.image}`} />
            <meta property="og:image:secure_url" content={`${SITE_URL}${content.share.image}`} />
            <meta property="og:image:type" content="image/jpeg" />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:image:alt" content={content.share.imageAlt} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={content.share.title} />
            <meta name="twitter:description" content={content.share.description} />
            <meta name="twitter:image" content={`${SITE_URL}${content.share.image}`} />
          </>
        )}
      </Head>

      <div className={styles.pageRoot}>
        {/* ═══ HERO ═══ */}
        <section className={`${styles.hero} ${content.dimHeroTop ? styles.heroDimTop : ""}`}>
          {/* Background image */}
          <img
            src={content.heroImage}
            alt=""
            className={styles.heroBgImg}
            aria-hidden="true"
          />
          {/* Gradient blur overlay */}
          <div className={styles.heroBgOverlay} aria-hidden="true" />

          {/* Top heading - centered */}
          <div className={`${styles.heroTop} ${content.singleLineHeading ? styles.heroTopSingleLine : ""}`}>
            <h1 className={styles.heroTitle}>{content.title}</h1>
            <p className={styles.heroSub}>{content.subtitle}</p>
            <p className={styles.heroLimit}>
              Chỉ tặng cho{" "}
              <span className={styles.heroLimitNum}>{content.limitCount}</span>{" "}
              đăng ký sớm nhất!
            </p>
          </div>

          {/* Two columns */}
          <div
            className={`${styles.heroColumns} ${mode === "login" ? "items-center" : ""}`}
          >
            {/* LEFT: video + bullets */}
            <div className={styles.heroLeft}>
              <div className={styles.videoWrap}>
                <div className={styles.videoInner}>
                  <iframe
                    src={content.videoSrc}
                    referrerPolicy="no-referrer"
                    title={content.videoTitle}
                    frameBorder={0}
                    allowFullScreen
                    loading="lazy"
                    className={styles.videoFrame}
                  />
                </div>
              </div>

              <ul className={styles.benefits}>
                {content.benefits.map((item) => (
                  <li key={item} className={styles.benefitItem}>
                    <span className={styles.bulletDot} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* RIGHT: form + countdown */}
            <div className={styles.heroRight}>
              {submitted ? (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}>🎉</div>
                  <h3 className={styles.successTitle}>
                    {mode === "login"
                      ? "Đăng nhập thành công!"
                      : "Đăng ký thành công!"}
                  </h3>
                  <p className={styles.successMsg}>
                    Cảm ơn bạn! Đang chuyển bạn đến trang học...
                  </p>
                </div>
              ) : mode === "login" ? (
                <form
                  onSubmit={handleLoginSubmit}
                  className={styles.form}
                  noValidate
                >
                  <input
                    id="v2-login-email"
                    type="email"
                    className={styles.fieldInput}
                    placeholder="Nhập địa chỉ email của bạn"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      setNotice(null);
                    }}
                    disabled={submitting}
                  />
                  <EmailSuggestion email={loginEmail} onPick={(email) => { setLoginEmail(email); setNotice(null); }} />

                  {error && <p className={styles.errorMsg}>{error}</p>}

                  {notice ? (
                    <AuthNoticeBox notice={notice} onAction={handleNoticeAction} />
                  ) : (
                    <button
                      type="submit"
                      className={styles.ctaBtn}
                      id="v2-login-btn"
                      disabled={submitting}
                    >
                      {submitting ? "ĐANG XỬ LÝ..." : "ĐĂNG NHẬP"}
                    </button>
                  )}

                  <p className={styles.formPrivacy}>
                    Chưa có tài khoản? Nhấn{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className={styles.linkBtn}
                    >
                      vào đây
                    </button>{" "}
                    để đăng ký mới
                  </p>
                </form>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className={styles.form}
                  noValidate
                >
                  <input
                    id="v2-name"
                    type="text"
                    className={styles.fieldInput}
                    placeholder="Họ và tên"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={submitting}
                  />

                  <input
                    id="v2-email"
                    type="email"
                    className={styles.fieldInput}
                    placeholder="Email"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setNotice(null);
                    }}
                    disabled={submitting}
                  />
                  <EmailSuggestion email={form.email} onPick={(email) => { setForm((prev) => ({ ...prev, email })); setNotice(null); }} />

                  <input
                    id="v2-phone"
                    type="tel"
                    className={styles.fieldInput}
                    placeholder="Số điện thoại"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    disabled={submitting}
                  />

                  <div className={styles.selectWrap}>
                    <select
                      id="v2-area"
                      className={styles.fieldSelect}
                      value={form.region}
                      onChange={(e) =>
                        setForm({ ...form, region: e.target.value })
                      }
                      disabled={submitting}
                    >
                      <option value="">Chọn khu vực</option>
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <span className={styles.selectArrow}>▼</span>
                  </div>

                  {error && <p className={styles.errorMsg}>{error}</p>}

                  {notice ? (
                    <AuthNoticeBox notice={notice} onAction={handleNoticeAction} />
                  ) : (
                    <button
                      type="submit"
                      className={styles.ctaBtn}
                      id="v2-submit-btn"
                      disabled={submitting}
                    >
                      {submitting ? "ĐANG XỬ LÝ..." : content.submitLabel}
                    </button>
                  )}
                  {content.privacyNote && (
                    <p className={styles.formPrivacy}>{content.privacyNote}</p>
                  )}
                  <p className={styles.formPrivacy}>
                    <button type="button" className={styles.linkBtn} onClick={() => switchMode("login", form.email.trim() || undefined)}>
                      Đã đăng ký? Đăng nhập
                    </button>
                  </p>
                </form>
              )}

              {/* Countdown */}
              <div className={styles.countdown} suppressHydrationWarning>
                <div className={styles.countdownRow}>
                  <div className={styles.countdownGroup}>
                    <span
                      className={styles.countdownDigit}
                      suppressHydrationWarning
                    >
                      {pad(hours)}
                    </span>
                    <span className={styles.countdownUnit}>GIỜ</span>
                  </div>
                  <span className={styles.countdownSep}>:</span>
                  <div className={styles.countdownGroup}>
                    <span
                      className={styles.countdownDigit}
                      suppressHydrationWarning
                    >
                      {pad(minutes)}
                    </span>
                    <span className={styles.countdownUnit}>PHÚT</span>
                  </div>
                  <span className={styles.countdownSep}>:</span>
                  <div className={styles.countdownGroup}>
                    <span
                      className={styles.countdownDigit}
                      suppressHydrationWarning
                    >
                      {pad(seconds)}
                    </span>
                    <span className={styles.countdownUnit}>GIÂY</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <p className={styles.footerDisclaimer}>
              Chúng tôi, VINMOC không tin vào những chương trình làm giàu nhanh.
              Chúng tôi tin vào làm việc chăm chỉ, trao giá trị và phục vụ nhiều
              người. Kết quả sẽ phụ thuộc vào bạn. Nếu bạn muốn học những bí
              quyết giao dịch của chúng tôi, bạn có thể tham gia các chương
              trình đào tạo. Không có gì là đảm bảo 100% trong đầu tư. Tất cả
              rủi ro và trách nhiệm là của chính bạn. Chúng tôi chỉ cung cấp
              công cụ và kiến thức, không đảm bảo kết quả cụ thể.
            </p>
            <p className={styles.footerContact}>
              <a href="tel:0862421919" className={styles.footerLink}>
                0862421919
              </a>{" "}
              {"-"}{" "}
              <a href="mailto:support@vinmoc.com" className={styles.footerLink}>
                support@vinmoc.com
              </a>
            </p>
            <p className={styles.footerCopy}>©2026 Vinmoc Group.</p>
          </div>
        </footer>

        <SocialProofPopup message={content.socialProofMessage} />
      </div>
    </>
  );
}
