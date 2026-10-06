"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import dongTienApi from "@/lib/api";
import { setSurveyLoginSession, setStoredSurveyUser } from "@/lib/auth";
import { registrationSource, learnPagePath } from "@/lib/brand";
import { getTrackingData } from "@/lib/tracking";
import { OPEN_AUTH_EVENT } from "../lib/ctaFlow";

type Tab = "new" | "old";

// Shared styling classes from ThinhVuongAuthPopup
const inputBase =
  "w-full border text-black rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-200 placeholder-gray-500 bg-white/5 shadow-sm";
const inputNormal =
  "border-white/15 focus:border-[#FFCC00] focus:ring-2 focus:ring-[#FFCC00]/20";
const inputError =
  "border-red-500/60 focus:border-[#FFCC00] focus:ring-2 focus:ring-[#FFCC00]/20";

const labelClass = "block text-sm font-semibold text-gray-600 mb-2";
const submitClass =
  "w-full rounded-xl bg-[#FFCC00] py-3 text-sm font-bold text-black transition-all duration-200 shadow-[0_4px_20px_rgba(255,204,0,0.3)] hover:shadow-[0_4px_28px_rgba(255,204,0,0.45)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer";
const alertClass =
  "bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400";

export default function SignupModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("new");
  const [note, setNote] = useState("");
  const [noteColor, setNoteColor] = useState("#8A8B8F");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const REGIONS = ["Hồ Chí Minh", "Hà Nội", "Khu vực khác"];

  const updateActionUrlParam = (actionValue: "login" | "register") => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("action", actionValue);
    [
      "auth",
      "popup",
      "modal",
      "tab",
      "mode",
      "login",
      "register",
      "signup",
    ].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState(null, "", url.toString());
  };

  const removeActionUrlParam = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const authKeys = [
      "action",
      "auth",
      "popup",
      "modal",
      "tab",
      "mode",
      "login",
      "register",
      "signup",
    ];
    let modified = false;
    authKeys.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        modified = true;
      }
    });

    const hash = url.hash.toLowerCase();
    if (
      ["#dangky", "#dangnhap", "#login", "#register", "#signup"].includes(hash)
    ) {
      url.hash = "";
      modified = true;
    }

    if (modified) {
      window.history.replaceState(null, "", url.toString());
    }
  };

  const handleClose = () => {
    setOpen(false);
    removeActionUrlParam();
  };

  const handleSwitchTab = (newTab: Tab) => {
    setTab(newTab);
    setNote("");
    updateActionUrlParam(newTab === "old" ? "login" : "register");
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      const cta = t.closest(
        'a[href="#dangky"], a[href="#dangnhap"], a[href="#login"], a[href="#register"], [data-signup-open]',
      );
      if (cta) {
        e.preventDefault();
        const href = (cta as HTMLAnchorElement).getAttribute?.("href") || "";
        let targetTab: Tab = "new";
        if (href === "#dangnhap" || href === "#login") {
          targetTab = "old";
        } else if (href === "#dangky" || href === "#register") {
          targetTab = "new";
        }
        setTab(targetTab);
        setOpen(true);
        updateActionUrlParam(targetTab === "old" ? "login" : "register");
        return;
      }
      if (
        t.closest("[data-signup-close]") ||
        t.closest("[data-signup-backdrop]")
      ) {
        setOpen(false);
        removeActionUrlParam();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        removeActionUrlParam();
      }
    };
    const onOpenAuth = (e: Event) => {
      setOpen(true);
      const detail = (e as CustomEvent)?.detail;
      let targetTab: Tab = "new";
      if (
        detail?.tab === "old" ||
        detail?.tab === "login" ||
        detail?.tab === "dangnhap"
      ) {
        targetTab = "old";
      } else if (
        detail?.tab === "new" ||
        detail?.tab === "register" ||
        detail?.tab === "signup" ||
        detail?.tab === "dangky"
      ) {
        targetTab = "new";
      }
      setTab(targetTab);
      updateActionUrlParam(targetTab === "old" ? "login" : "register");
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_AUTH_EVENT, onOpenAuth);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_AUTH_EVENT, onOpenAuth);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkUrlParams = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hash = (window.location.hash || "").toLowerCase();

      const emailQuery =
        searchParams.get("email") ||
        (typeof router.query.email === "string" ? router.query.email : "") ||
        "";
      if (emailQuery && emailQuery.trim()) {
        setEmail(emailQuery.trim());
      }

      const action = (
        searchParams.get("action") ||
        searchParams.get("auth") ||
        searchParams.get("popup") ||
        searchParams.get("modal") ||
        searchParams.get("tab") ||
        searchParams.get("mode") ||
        ""
      ).toLowerCase();

      const isLogin =
        ["login", "dangnhap", "signin", "old"].includes(action) ||
        searchParams.get("login") === "true" ||
        searchParams.get("login") === "1" ||
        hash === "#dangnhap" ||
        hash === "#login";

      const isRegister =
        ["register", "signup", "dangky", "new"].includes(action) ||
        searchParams.get("register") === "true" ||
        searchParams.get("signup") === "true" ||
        searchParams.get("register") === "1" ||
        hash === "#dangky" ||
        hash === "#register" ||
        hash === "#signup";

      if (isLogin) {
        setTab("old");
        setOpen(true);
        updateActionUrlParam("login");
      } else if (isRegister) {
        setTab("new");
        setOpen(true);
        updateActionUrlParam("register");
      }
    };

    checkUrlParams();
  }, [router.isReady, router.query]);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (open) {
      const f = document.querySelector<HTMLInputElement>(
        "[data-signup-modal] input",
      );
      if (f) window.setTimeout(() => f.focus(), 60);
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const isOld = tab === "old";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Form dùng noValidate — tự validate thủ công theo tab đang active.
    // (Trước đây các field required bị ẩn khi tab login khiến browser chặn submit:
    //  "An invalid form control with name='region' is not focusable")
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (isOld) {
      if (!email.trim()) {
        setNote("Vui lòng nhập địa chỉ email để đăng nhập.");
        setNoteColor("#E0322F");
        return;
      }
      if (!emailRe.test(email)) {
        setNote("Email không hợp lệ. Vui lòng kiểm tra lại.");
        setNoteColor("#E0322F");
        return;
      }
    } else {
      if (!name.trim()) {
        setNote("Vui lòng nhập họ và tên.");
        setNoteColor("#E0322F");
        return;
      }
      if (!email.trim()) {
        setNote("Vui lòng nhập địa chỉ email.");
        setNoteColor("#E0322F");
        return;
      }
      if (!emailRe.test(email)) {
        setNote("Email không hợp lệ. Vui lòng kiểm tra lại.");
        setNoteColor("#E0322F");
        return;
      }
      if (!phone.trim()) {
        setNote("Vui lòng nhập số điện thoại.");
        setNoteColor("#E0322F");
        return;
      }
      if (!region) {
        setNote("Vui lòng chọn khu vực sinh sống.");
        setNoteColor("#E0322F");
        return;
      }
    }

    setSubmitting(true);
    setNoteColor("#E0322F");
    try {
      let response;
      if (isOld) {
        response = await dongTienApi.loginUser({ email });
      } else {
        const trackingData = getTrackingData();
        response = await dongTienApi.registerUser({
          full_name: name,
          email,
          phone,
          region,
          interest: "",
          registration_source: registrationSource(),
          fbclid: trackingData?.click_ids?.fbclid || "",
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : "",
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
      }

      if (!response?.access_token) throw new Error('Registration failed');
      setSurveyLoginSession(response.access_token, response.user.email);
      setStoredSurveyUser(response.user);
      await router.push('/learn');
    } catch (err) {
      console.warn("[SignupModal] auth rejected:", err);
      setNote(
        err instanceof Error ? err.message : "Đã xảy ra lỗi. Vui lòng thử lại.",
      );
      setNoteColor("#E0322F");
    } finally {
      setSubmitting(false);
    }
  };

  // Error highlighting checks mapped to standard validation messages
  const isNameError = tab === "new" && note === "Vui lòng nhập họ và tên.";
  const isEmailError =
    note === "Vui lòng nhập địa chỉ email." ||
    note === "Email không hợp lệ. Vui lòng kiểm tra lại." ||
    note === "Vui lòng nhập địa chỉ email để đăng nhập.";
  const isPhoneError = tab === "new" && note === "Vui lòng nhập số điện thoại.";
  const isRegionError =
    tab === "new" && note === "Vui lòng chọn khu vực sinh sống.";

  return (
    <div
      data-signup-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label="Đăng ký nhận bản đồ"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ display: open ? "flex" : "none" }}
    >
      <div
        data-signup-backdrop="true"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div
        data-signup-card="true"
        className="relative w-full max-w-4xl bg-[#0A0A0A] shadow-[0_0_60px_rgba(255,204,0,0.12)] border border-[#2A2A2A] overflow-hidden flex flex-col md:flex-row gap-6 md:gap-10 p-6 md:p-10 bg-white"
        style={{ borderRadius: "40px" }}
      >
        <button
          type="button"
          data-signup-close="true"
          aria-label="Đóng"
          className="h-close"
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            zIndex: 2,
            width: 34,
            height: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            lineHeight: 1,
            color: "#6B6C70",
            background: "rgba(255,255,255,0.9)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            transition: "background .18s ease, color .18s ease",
          }}
        >
          ×
        </button>

        {/* ===== Left panel: gradient image ===== */}
        <div className="hidden md:flex relative w-2/4 shrink-0 justify-center items-center bg-gradient-to-br from-[#FFCC00]/20 to-[#FFCC00]/5">
          <img
            src="/dong-tien/images/thinh-vuong-landing/auth-side.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover [transform:scaleY(-1)]"
            style={{ borderRadius: "30px" }}
          />
          {/* Overlay branding - fixed at top */}
          <div className="absolute top-6 left-4 !text-3xl text-white font-extrabold leading-tight text-left px-4">
            Bất kỳ ai cũng có thể
            <br />
            đạt được tự do tài chính
          </div>
        </div>

        {/* ===== Right panel: form ===== */}
        <div className="relative flex-1 w-full mt-6">
          <div className="space-y-4 md:space-y-0 md:mt-0">
            {/* Header */}
            <div>
              <div className="!text-2xl md:!text-3xl font-bold text-black mb-2">
                {tab === "new"
                  ? "Nếu được học và thực hành đúng phương pháp"
                  : "Đăng nhập"}
              </div>
              <p className="!text-sm md:!text-md text-gray-400 mb-2">
                {tab === "new"
                  ? "Nhập thông tin để bắt đầu học"
                  : "Nhập email để tiếp tục học"}
              </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex bg-white/5 p-1 rounded-xl mb-2 md:mb-4 border border-white/10">
              <button
                type="button"
                data-signup-tab="new"
                onClick={() => handleSwitchTab("new")}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-200 rounded-lg cursor-pointer ${
                  tab === "new"
                    ? "bg-[#FFCC00] text-black shadow-[0_2px_12px_rgba(255,204,0,0.35)]"
                    : "text-gray-400 hover:text-black"
                }`}
              >
                Đăng ký mới
              </button>
              <button
                type="button"
                data-signup-tab="old"
                onClick={() => handleSwitchTab("old")}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-200 rounded-lg cursor-pointer ${
                  tab === "old"
                    ? "bg-[#FFCC00] text-black shadow-[0_2px_12px_rgba(255,204,0,0.35)]"
                    : "text-gray-400 hover:text-black"
                }`}
              >
                Đã có tài khoản
              </button>
            </div>

            {/* Form Content */}
            <form
              data-signup-form="true"
              noValidate
              onSubmit={handleSubmit}
              className="space-y-4 md:space-y-5"
            >
              {/* Full Name */}
              <div style={{ display: isOld ? "none" : "block" }}>
                <label className={labelClass}>
                  Họ và tên <span className="text-[#FFCC00]">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (note) setNote("");
                  }}
                  placeholder="Nguyễn Văn A"
                  className={`${inputBase} ${isNameError ? inputError : inputNormal}`}
                />
              </div>

              {/* Email */}
              <div>
                <label className={labelClass}>
                  Địa chỉ Email <span className="text-[#FFCC00]">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (note) setNote("");
                  }}
                  placeholder="email@example.com"
                  className={`${inputBase} ${isEmailError ? inputError : inputNormal}`}
                />
              </div>

              {/* Phone */}
              <div style={{ display: isOld ? "none" : "block" }}>
                <label className={labelClass}>
                  Số điện thoại <span className="text-[#FFCC00]">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  required
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (note) setNote("");
                  }}
                  placeholder="0912 345 678"
                  className={`${inputBase} ${isPhoneError ? inputError : inputNormal}`}
                />
              </div>

              {/* Region */}
              <div
                style={{ display: isOld ? "none" : "block" }}
                data-signup-region="true"
              >
                <label className={labelClass}>
                  Khu vực sinh sống <span className="text-[#FFCC00]">*</span>
                </label>
                <select
                  name="region"
                  required
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    if (note) setNote("");
                  }}
                  style={{ colorScheme: "light" }}
                  className={`${inputBase} ${
                    isRegionError ? inputError : inputNormal
                  } ![color-scheme:light] cursor-pointer appearance-none bg-white text-black bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat`}
                >
                  <option value="" disabled className="bg-white text-gray-500">
                    -- Chọn khu vực --
                  </option>
                  {REGIONS.map((r) => (
                    <option
                      key={r}
                      value={r}
                      className="bg-white text-black"
                      style={{
                        backgroundColor: "#fff",
                        color: "#000",
                      }}
                    >
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error / Status Alert */}
              {note && (
                <div
                  className={
                    noteColor === "#E0322F"
                      ? alertClass
                      : "text-sm text-gray-400 text-center"
                  }
                >
                  {note}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className={`${submitClass} ${submitting ? "cursor-wait opacity-70" : ""}`}
              >
                {submitting
                  ? isOld
                    ? "Đang xác thực..."
                    : "Đang đăng ký..."
                  : isOld
                    ? "Đăng nhập"
                    : "Đăng ký"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
