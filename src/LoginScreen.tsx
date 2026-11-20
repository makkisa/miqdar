import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { configured, login } from "./firebase";

export default function LoginScreen({
  ar,
  ready,
  onLanguage,
  needRefresh,
  onUpdate,
}: {
  ar: boolean;
  ready: boolean;
  onLanguage: () => void;
  needRefresh: boolean;
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = (a: string, b: string) => (ar ? a : b);
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await login();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === "auth/popup-blocked"
          ? t(
              "اسمح بنافذة تسجيل الدخول في المتصفح، ثم حاول مرة أخرى.",
              "Allow the sign-in popup in your browser, then try again.",
            )
          : code === "auth/popup-closed-by-user" ||
              code === "auth/cancelled-popup-request"
            ? t(
                "لم يكتمل تسجيل الدخول. يمكنك المحاولة مجددًا.",
                "Sign-in wasn't completed. Please try again.",
              )
            : t(
                "تعذر تسجيل الدخول. تحقق من اتصالك وحاول مجددًا.",
                "Could not sign in. Check your connection and try again.",
              ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <button className="login-language" onClick={onLanguage}>
        {ar ? "EN" : "العربية"}
      </button>
      <section className="login-card" aria-labelledby="login-title">
        <img
          className="login-mark"
          src={`${import.meta.env.BASE_URL}icon-192.png`}
          width="80"
          height="80"
          alt=""
        />
        <p className="login-wordmark">
          مِقدر <span>MIQDAR</span>
        </p>
        <h1 id="login-title">
          {t("خطوتك الأولى نحو التوازن.", "Your first step toward balance.")}
        </h1>
        <p className="muted">
          {t(
            "سجّل دخولك لحفظ وجباتك ومتابعة السعرات والماكروز في مكان واحد.",
            "Sign in to save your meals and track calories and macros in one place.",
          )}
        </p>
        {!ready ? (
          <p role="status">
            {t("جارٍ التحقق من جلسة الدخول…", "Checking your session…")}
          </p>
        ) : (
          <>
            <button
              className="google-signin"
              disabled={busy || !configured}
              onClick={() => void signIn()}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.96c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
                />
              </svg>
              {busy
                ? t("جارٍ تسجيل الدخول…", "Signing in…")
                : t("تسجيل الدخول بحساب Google", "Sign in with Google")}
            </button>
            {!configured && (
              <p role="alert">
                {t(
                  "خدمة تسجيل الدخول غير مهيأة في هذه النسخة.",
                  "Sign-in is not configured for this build.",
                )}
              </p>
            )}
          </>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <p className="login-privacy">
          <LockKeyhole size={16} aria-hidden="true" />
          {t(
            "حسابك هو مفتاح الوصول إلى بياناتك.",
            "Your account is the key to your data.",
          )}
        </p>
        {needRefresh && (
          <button onClick={onUpdate}>{t("تحديث التطبيق", "Update app")}</button>
        )}
      </section>
    </main>
  );
}
