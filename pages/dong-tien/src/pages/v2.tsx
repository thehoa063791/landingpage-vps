import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import styles from "@/styles/dong-tien-v2.module.css";
import dongTienApi from "@/lib/api";
import {
  setSurveyLoginSession,
  checkSurveyAuth,
  setStoredSurveyUser,
} from "@/lib/auth";
import { registrationSource, learnPagePath, userEmailKey } from "@/lib/brand";
import { getTrackingData } from "@/lib/tracking";

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

function SocialProofPopup() {
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

      setTimeout(show, Math.random() * 30000 + 30000);
    };

    const first = setTimeout(show, Math.random() * 5000 + 10000);

    return () => clearTimeout(first);
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

        <p className={styles.spMsg}>
          vừa đăng ký thành công Bộ video tư duy đầu tư
        </p>

        <p className={styles.spTime}>{current.time}</p>
      </div>
    </div>
  );
}

export interface DongTienV2Props {
  autoLoginData?: {
    token: string;
    email: string;
    targetLessonId: number;
  };
  autoLoginError?: string;
  emailParam?: string;
}

// ──────────────── Main Page ────────────────
export default function DongTienV2({
  autoLoginData,
  autoLoginError,
  emailParam = "",
}: DongTienV2Props) {
  const router = useRouter();
  const { hours, minutes, seconds } = useCountdown(2);

  const REGIONS = ["Hồ Chí Minh", "Hà Nội", "Khu vực khác"];


  const [mode, setMode] = useState<"register" | "login">(
    autoLoginError ? "login" : "register",
  );
  const [loginEmail, setLoginEmail] = useState(emailParam || "");

  const [form, setForm] = useState({
    name: "",
    email: emailParam || "",
    phone: "",
    region: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(autoLoginError || "");

  const [autoLoggingIn, setAutoLoggingIn] = useState(false);
  const autoLoginAttempted = useRef(false);

  const executeLogin = async (targetEmail: string, isAuto: boolean = false) => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = targetEmail.trim();
    if (!cleanEmail || !emailRe.test(cleanEmail)) {
      setError("Vui lòng nhập địa chỉ email hợp lệ để đăng nhập.");
      return;
    }

    setError("");
    setSubmitting(true);
    if (isAuto) {
      setAutoLoggingIn(true);
    }

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

        await router.replace('/learn');
      } else {
        throw new Error("Không nhận được token từ hệ thống.");
      }
    } catch (err: unknown) {
      console.warn("[DongTienV2] login rejected:", err);

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

      if (!message && err instanceof Error) {
        const raw = err.message?.trim();
        if (
          raw &&
          raw !== "An unexpected error occurred" &&
          raw !== "Network Error"
        ) {
          try {
            const parsed = JSON.parse(raw);
            message = parsed?.detail || parsed?.message || raw;
          } catch {
            message = raw;
          }
        }
      }

      if (!message || message === "An unexpected error occurred") {
        message =
          "Email chưa được đăng ký hoặc không đúng. Vui lòng kiểm tra lại.";
      }

      setError(message);
    } finally {
      setSubmitting(false);
      if (isAuto) {
        setAutoLoggingIn(false);
      }
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    await executeLogin(loginEmail);
  };

  useEffect(() => {
    if (typeof window === "undefined" || autoLoginAttempted.current) return;

    // Email links prefill the form without contacting the legacy backend.
    const email = new URLSearchParams(window.location.search).get("email") || "";
    if (email) { setForm((prev) => ({ ...prev, email })); setLoginEmail(email); }
    if (new URLSearchParams(window.location.search).get('action') === 'login') setMode('login');
  }, [autoLoginData, emailParam, router.isReady, router.query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Validate
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.name.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (!form.email.trim() || !emailRe.test(form.email)) {
      setError("Vui lòng nhập email hợp lệ.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Vui lòng nhập số điện thoại.");
      return;
    }
    if (!form.region) {
      setError("Vui lòng chọn khu vực.");
      return;
    }

    setError("");
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
      await router.push('/learn');
    } catch (err: unknown) {
      console.warn("[DongTienV2] registration rejected:", err);

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

      if (!message && err instanceof Error) {
        const raw = err.message?.trim();
        if (
          raw &&
          raw !== "An unexpected error occurred" &&
          raw !== "Network Error"
        ) {
          try {
            const parsed = JSON.parse(raw);
            message = parsed?.detail || parsed?.message || raw;
          } catch {
            message = raw;
          }
        }
      }

      if (!message || message === "An unexpected error occurred") {
        message = "Đã xảy ra lỗi vui lòng liên hệ bộ phận hỗ trợ";
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      <Head>
        <title>
          Phương pháp xây dựng dòng tiền hiệu quả của Phạm Thành Biên
        </title>
        <meta
          name="description"
          content="Phương pháp xây dựng dòng tiền được Phạm Thành Biên thực chiến hơn 20 năm qua. Chỉ tặng cho 27 người đăng ký sớm nhất!"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.pageRoot}>
        {/* ═══ HERO ═══ */}
        <section className={styles.hero}>
          {/* Background image */}
          <img
            src="/dong-tien/images/thinh-vuong-landing/a66d7b85296091f51efa75fe33681916c3f6a100.png"
            alt=""
            className={styles.heroBgImg}
            aria-hidden="true"
          />
          {/* Gradient blur overlay */}
          <div className={styles.heroBgOverlay} aria-hidden="true" />

          {/* Top heading - centered */}
          <div className={styles.heroTop}>
            <h1 className={styles.heroTitle}>
              Tư duy này sẽ làm thay đổi mạnh mẽ bức tranh tài chính của bạn
            </h1>
            <p className={styles.heroSub}>
              Tặng bạn bộ video được đúc rút từ 20 năm kinh nghiệm đầu tư và
              kinh doanh của{" "}
              <span style={{ whiteSpace: "nowrap" }}>Phạm Thành Biên</span>
            </p>
            <p className={styles.heroLimit}>
              Chỉ tặng cho <span className={styles.heroLimitNum}>27 người</span>{" "}
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
                    src="https://player.vimeo.com/video/1228651465?dnt=1&portrait=0&title=0&color=fecd08&byline=0&autopause=0"
                    referrerPolicy="no-referrer"
                    title="Phương Pháp Trading Hiệu Quả"
                    frameBorder={0}
                    allowFullScreen
                    loading="lazy"
                    className={styles.videoFrame}
                  />
                </div>
              </div>

              <ul className={styles.benefits}>
                {[
                  "Thực chiến, áp dụng được ngay",
                  "Học một lần dùng trọn đời",
                  "Xem lại mọi lúc mọi nơi",
                ].map((item) => (
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
              ) : autoLoggingIn ? (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}>🔄</div>
                  <h3 className={styles.successTitle}>
                    Đang tự động đăng nhập...
                  </h3>
                  <p className={styles.successMsg}>
                    {loginEmail || "Đang xác thực thông tin tài khoản..."}
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
                    onChange={(e) => setLoginEmail(e.target.value)}
                    disabled={submitting}
                  />

                  {error && <p className={styles.errorMsg}>{error}</p>}

                  <button
                    type="submit"
                    className={styles.ctaBtn}
                    id="v2-login-btn"
                    disabled={submitting}
                  >
                    {submitting ? "ĐANG XỬ LÝ..." : "ĐĂNG NHẬP"}
                  </button>

                  <p className={styles.formPrivacy}>
                    Chưa có tài khoản? Nhấn{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("register");
                        setError("");
                      }}
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
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    disabled={submitting}
                  />

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

                  <button
                    type="submit"
                    className={styles.ctaBtn}
                    id="v2-submit-btn"
                    disabled={submitting}
                  >
                    {submitting ? "ĐANG XỬ LÝ..." : "GỬI VIDEO NGAY CHO TÔI"}
                  </button>
                  <p className={styles.formPrivacy}>
                    <button type="button" className={styles.linkBtn} onClick={() => { setMode('login'); setError(''); }}>
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

        <SocialProofPopup />
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });
