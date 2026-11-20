import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ScanLine,
  Camera,
  Plus,
  Home,
  BookOpen,
  Sparkles,
  Settings,
  Star,
  Trash2,
  Pencil,
  ChevronLeft,
  Cloud,
  WifiOff,
  Check,
  Search,
  LogOut,
} from "lucide-react";
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth";
import {
  waitForPendingWrites,
  terminate,
  clearIndexedDbPersistence,
} from "firebase/firestore";
import { auth, cloud, configured, login, redirectResult } from "./firebase";
import { subscribe, save, type Data } from "./store";
import {
  backupSchema,
  localDate,
  scale,
  type Product,
  type Entry,
  type Nutrients,
} from "./domain";
import { lookup, searchOFF } from "./products";
import { useRegisterSW } from "virtual:pwa-register/react";
import LoginScreen from "./LoginScreen";
const Editor = lazy(() => import("./Editor"));
const Scanner = lazy(() => import("./Scanner"));
const AI = lazy(() => import("./AI"));
type Goals = { kcal: number; protein: number; carbs: number; fat: number };
export default function App() {
  const [ar, setAr] = useState(localStorage.getItem("language") !== "en");
  const t = (a: string, b: string) => (ar ? a : b);
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(!auth);
  const [page, setPage] = useState("home");
  const [data, setData] = useState<Data>({
    entries: [],
    products: [],
    pending: false,
    cached: true,
  });
  const [date, setDate] = useState(localDate());
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{
    p?: Product;
    q?: number;
    entry?: Entry;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [similar, setSimilar] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<Entry | null>(null);
  const [goals, setGoals] = useState<Goals>({
    kcal: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
  });
  const controller = useRef<AbortController | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const fail = (_e?: unknown) =>
    setError(
      t(
        "تعذر إتمام العملية. بياناتك المحفوظة لم تُحذف؛ تحقق من الاتصال أو الإعدادات.",
        "Could not complete the operation. Saved data remains; check connection or configuration.",
      ),
    );
  useEffect(() => {
    document.documentElement.lang = ar ? "ar" : "en";
    document.documentElement.dir = ar ? "rtl" : "ltr";
    localStorage.setItem("language", ar ? "ar" : "en");
  }, [ar]);
  useEffect(() => {
    void redirectResult().catch(fail);
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setData({ entries: [], products: [], pending: false, cached: true });
      setEditor(null);
      setUndo(null);
      setPage("home");
      setUid(u?.uid ?? null);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready || !uid) return;
    return subscribe(uid, setData, fail);
  }, [uid, ready]);
  useEffect(() => {
    try {
      const g = JSON.parse(
        localStorage.getItem(`goals-${uid ?? "guest"}`) || "null",
      );
      if (g && Object.values(g).every((v) => typeof v === "number" && v > 0))
        setGoals(g);
      else setGoals({ kcal: 2000, protein: 150, carbs: 200, fat: 65 });
    } catch {}
  }, [uid]);
  useEffect(() => {
    const f = () => setOnline(navigator.onLine);
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    const interval = setInterval(() => {
      if (!document.hidden && date === localDate(new Date(Date.now() - 60000)))
        setDate(localDate());
    }, 60000);
    return () => {
      window.removeEventListener("online", f);
      window.removeEventListener("offline", f);
      clearInterval(interval);
    };
  }, [date]);
  useEffect(() => () => controller.current?.abort(), []);
  const entries = data.entries
    .filter((e) => !e.deleted && e.date === date)
    .sort((a, b) => b.createdAt - a.createdAt);
  const totals = entries.reduce(
    (sum, e) => {
      const n = scale(e.product.nutrients, e.quantity);
      for (const k of Object.keys(sum) as (keyof Nutrients)[])
        sum[k] = (sum[k] ?? 0) + (n[k] ?? 0);
      return sum;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 } as Nutrients,
  );
  const remaining = Object.fromEntries(
    Object.entries(goals).map(([k, v]) => [
      k,
      v - (totals[k as keyof Nutrients] ?? 0),
    ]),
  ) as Nutrients;
  async function record(
    p: Product,
    q: number,
    entry?: Entry,
    operationId?: string,
  ) {
    if (Object.values(p.nutrients).some((n) => n === null)) {
      setEditor({ p, q, entry });
      throw Error("missing-nutrition");
    }
    const e: Entry = {
      id: entry?.id ?? operationId ?? crypto.randomUUID(),
      product: p,
      quantity: q,
      date: entry?.date ?? date,
      createdAt: entry?.createdAt ?? Date.now(),
      deleted: false,
    };
    await save(uid, "entries", e, fail);
    await save(uid, "products", { ...p, lastQuantity: q }, fail);
    navigator.vibrate?.(15);
    setPage("home");
  }
  async function remove(e: Entry) {
    await save(uid, "entries", { ...e, deleted: true }, fail);
    setUndo(e);
  }
  async function scan(code: string) {
    setPage("library");
    setBusy(true);
    setError("");
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const cached = data.products.find((p) => p.barcode === code);
      const p = cached ?? (await lookup(code, controller.current.signal));
      if (p) setEditor({ p });
      else
        setError(
          t(
            "لم نجد منتجًا مطابقًا. ابحث بالاسم أدناه أو صوّر الملصق.",
            "No exact match. Search by name below or photograph the label.",
          ),
        );
    } catch (e) {
      if ((e as Error).name !== "AbortError") fail();
    } finally {
      setBusy(false);
    }
  }
  const recent = [...data.products].sort((a, b) => {
    const last = (p: Product) =>
      Math.max(
        0,
        ...data.entries
          .filter((e) => e.product.id === p.id)
          .map((e) => e.createdAt),
      );
    return last(b) - last(a);
  });
  const productRow = (p: Product) => (
    <div className="food-row" key={p.id}>
      <div className="food-icon">
        <BookOpen size={20} />
      </div>
      <button className="food-name" onClick={() => setEditor({ p })}>
        <strong>{p.name}</strong>
        <small>
          {p.source} · {p.lastQuantity} {p.basis}
        </small>
      </button>
      <button
        className={p.favorite ? "favorite" : "icon-button"}
        aria-label={t("مفضلة", "Favorite")}
        onClick={() =>
          void save(uid, "products", { ...p, favorite: !p.favorite }, fail)
        }
      >
        <Star size={18} fill={p.favorite ? "currentColor" : "none"} />
      </button>
      <button
        className="add-small"
        aria-label={t("إعادة تسجيل", "Log again")}
        onClick={() => void record(p, p.lastQuantity).catch(fail)}
      >
        <Plus size={20} />
      </button>
    </div>
  );
  if (!ready || !uid) {
    return (
      <LoginScreen
        ar={ar}
        onLanguage={() => setAr(!ar)}
        ready={ready}
        needRefresh={needRefresh}
        onUpdate={() => void updateServiceWorker(true)}
      />
    );
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <p className="muted">
          {t("كل يوم، أقرب لهدفك.", "Every day, closer to your goal.")}
        </p>
        {[
          ["home", Home, t("نظرة اليوم", "Today")],
          ["library", BookOpen, t("مكتبتي", "My foods")],
          ["ai", Sparkles, t("المساعد الذكي", "AI assistant")],
          ["settings", Settings, t("الإعدادات", "Settings")],
        ].map(([id, Icon, label]) => {
          const I = Icon as typeof Home;
          return (
            <button
              className={page === id ? "nav-item active" : "nav-item"}
              key={String(id)}
              onClick={() => setPage(String(id))}
            >
              <I size={21} />
              {String(label)}
            </button>
          );
        })}
        <div className="sidebar-bottom">
          <span className="eyebrow">BUILT FOR YOUR EVERYDAY</span>
          <p>
            Small habits.
            <br />
            <strong>Stronger you.</strong>
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="desktop-label">
            {t("مساحتك الغذائية", "YOUR NUTRITION SPACE")}
          </span>
          <div className="header-actions">
            <span className="sync">
              {!online ? (
                <WifiOff size={15} />
              ) : uid ? (
                <Cloud size={15} />
              ) : (
                <Check size={15} />
              )}{" "}
              {t(
                !online
                  ? "دون اتصال"
                  : uid
                    ? data.pending
                      ? "بانتظار المزامنة"
                      : data.cached
                        ? "نسخة محلية"
                        : "متزامن"
                    : "محفوظ على الجهاز",
                !online
                  ? "Offline"
                  : uid
                    ? data.pending
                      ? "Sync pending"
                      : data.cached
                        ? "Cached"
                        : "Synced"
                    : "On this device",
              )}
            </span>
            <button className="language" onClick={() => setAr(!ar)}>
              {ar ? "EN" : "عربي"}
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="notice" role="alert">
              {error}
              <button
                onClick={() => setError("")}
                aria-label={t("إغلاق", "Close")}
              >
                ×
              </button>
            </div>
          )}
          {needRefresh && (
            <div className="notice">
              {t("تحديث جديد جاهز.", "An update is ready.")}
              <button
                disabled={data.pending}
                onClick={() => void updateServiceWorker(true)}
              >
                {t("تحديث", "Update")}
              </button>
            </div>
          )}
          {!ready ? (
            <p>{t("جارٍ فتح حسابك…", "Opening your account…")}</p>
          ) : (
            <>
              {page === "home" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {t(
                          "خطوة صغيرة. فرق كبير.",
                          "SMALL STEPS. REAL PROGRESS.",
                        )}
                      </span>
                      <h1>{t("يومك، بتوازن.", "Your day, in balance.")}</h1>
                      <p className="muted">
                        {t(
                          "غذاؤك أوضح، وهدفك أقرب.",
                          "A clearer picture of your nutrition.",
                        )}
                      </p>
                    </div>
                    <label className="date-label">
                      <input
                        aria-label={t("التاريخ", "Date")}
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="dashboard">
                    <section className="calorie-card">
                      <div className="card-top">
                        <span>{t("السعرات الحرارية", "Daily calories")}</span>
                        <Activity size={22} />
                      </div>
                      <div className="calorie-content">
                        <div
                          className="ring"
                          style={
                            {
                              "--progress": `${Math.min(100, ((totals.kcal ?? 0) / goals.kcal) * 100)}%`,
                            } as React.CSSProperties
                          }
                        >
                          <div>
                            <span className="muted">
                              {t("المستهلكة", "CONSUMED")}
                            </span>
                            <strong>
                              {Math.round(totals.kcal ?? 0).toLocaleString(
                                ar ? "ar" : "en",
                              )}
                            </strong>
                            <small>kcal</small>
                          </div>
                        </div>
                        <div className="calorie-stats">
                          <div>
                            <span>{t("المتبقي اليوم", "Remaining today")}</span>
                            <strong>
                              {Math.round(remaining.kcal ?? 0).toLocaleString(
                                ar ? "ar" : "en",
                              )}{" "}
                              <small>kcal</small>
                            </strong>
                          </div>
                          <div>
                            <span>{t("هدفك اليومي", "Daily target")}</span>
                            <b>
                              {goals.kcal.toLocaleString(ar ? "ar" : "en")}{" "}
                              <small>kcal</small>
                            </b>
                          </div>
                        </div>
                      </div>
                      <div className="card-foot">
                        {entries.length === 0
                          ? t(
                              "بداية جديدة. سجّل وجبتك الأولى.",
                              "A fresh start. Log your first meal.",
                            )
                          : t(
                              `${entries.length} أطعمة مسجلة اليوم`,
                              `${entries.length} foods logged today`,
                            )}
                      </div>
                    </section>
                    <section className="macro-card panel">
                      <div className="card-top">
                        <h2>{t("الماكروز", "Your macros")}</h2>
                        <span className="muted">g</span>
                      </div>
                      {(["protein", "carbs", "fat"] as const).map((k, i) => (
                        <div className={`macro macro-${i}`} key={k}>
                          <div>
                            <span>
                              <i />
                              {t(
                                ["البروتين", "الكربوهيدرات", "الدهون"][i],
                                ["Protein", "Carbs", "Fat"][i],
                              )}
                            </span>
                            <b>
                              {Math.round(totals[k] ?? 0)}{" "}
                              <small>/ {goals[k]}</small>
                            </b>
                          </div>
                          <progress value={totals[k] ?? 0} max={goals[k]} />
                          <small>
                            {t("المتبقي", "Remaining")}{" "}
                            {Math.round(remaining[k] ?? 0)} g
                          </small>
                        </div>
                      ))}
                    </section>
                  </div>
                  <div className="quick-actions">
                    <button
                      className="scan-action"
                      onClick={() => setPage("scan")}
                    >
                      <ScanLine />
                      <span>
                        <strong>{t("مسح باركود", "Scan barcode")}</strong>
                        <small>
                          {t("امسح، حدّد، سجّل", "Scan. Portion. Log.")}
                        </small>
                      </span>
                    </button>
                    <button onClick={() => setPage("ai")}>
                      <Camera />
                      <span>
                        <strong>{t("صوّر طعامك", "Snap your food")}</strong>
                        <small>
                          {t("تحليل ومراجعة ذكية", "Analyze & review")}
                        </small>
                      </span>
                    </button>
                    <button onClick={() => setEditor({})}>
                      <Plus />
                      <span>
                        <strong>{t("تسجيل يدوي", "Log manually")}</strong>
                        <small>
                          {t("وجبتك، بتفاصيلها", "Make every meal count")}
                        </small>
                      </span>
                    </button>
                  </div>
                  <div className="lower-grid">
                    <section className="panel">
                      <div className="card-top">
                        <h2>{t("سجل اليوم", "Today’s food")}</h2>
                        <span className="pill">
                          {entries.length} {t("أطعمة", "items")}
                        </span>
                      </div>
                      {entries.length ? (
                        entries.map((e) => (
                          <div className="food-row" key={e.id}>
                            <div className="food-icon">
                              <BookOpen size={20} />
                            </div>
                            <div className="food-name">
                              <strong>{e.product.name}</strong>
                              <small>
                                {e.quantity} {e.product.basis} ·{" "}
                                {Math.round(
                                  scale(e.product.nutrients, e.quantity).kcal ??
                                    0,
                                )}{" "}
                                kcal
                              </small>
                            </div>
                            <button
                              aria-label={t("تعديل", "Edit")}
                              onClick={() =>
                                setEditor({
                                  p: e.product,
                                  q: e.quantity,
                                  entry: e,
                                })
                              }
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              aria-label={t("حذف", "Delete")}
                              onClick={() => void remove(e).catch(fail)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty">
                          <div className="empty-icon">
                            <BookOpen size={30} />
                          </div>
                          <h3>
                            {t(
                              "يومك يبدأ بأول وجبة",
                              "Your day starts with a meal",
                            )}
                          </h3>
                          <p>
                            {t(
                              "أضف ما أكلته، وسنحسب الباقي.",
                              "Add what you ate. We’ll do the math.",
                            )}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => setEditor({})}
                          >
                            {t("سجّل طعامك الأول", "Log your first food")}{" "}
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="panel">
                      <div className="card-top">
                        <h2>{t("إضافة سريعة", "Quick add")}</h2>
                        <button
                          onClick={() => setPage("library")}
                          aria-label={t("المكتبة", "Library")}
                        >
                          <ChevronLeft size={20} />
                        </button>
                      </div>
                      <p className="muted">
                        {t(
                          "أطعمتك المفضلة والأخيرة، بضغطة.",
                          "Your favorites and recent foods, one tap away.",
                        )}
                      </p>
                      {recent.length ? (
                        recent.slice(0, 4).map(productRow)
                      ) : (
                        <div className="empty compact">
                          <Star size={26} />
                          <p>
                            {t(
                              "أطعمتك المتكررة ستظهر هنا بعد تسجيلها.",
                              "Your go-to foods will appear here after logging.",
                            )}
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              {page === "library" && (
                <section className="panel">
                  <h1>{t("مكتبتي الغذائية", "My food library")}</h1>
                  <label className="search">
                    <Search size={20} />
                    <input
                      aria-label={t("بحث", "Search")}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        controller.current?.abort();
                        setSimilar([]);
                      }}
                      placeholder={t(
                        "ابحث عن طعام محفوظ أو منتج…",
                        "Search your foods or a product…",
                      )}
                    />
                  </label>
                  <div className="row">
                    <button onClick={() => setEditor({})}>
                      <Plus size={18} />
                      {t("طعام جديد", "New food")}
                    </button>
                    <button
                      disabled={query.trim().length < 2 || busy}
                      onClick={async () => {
                        controller.current?.abort();
                        controller.current = new AbortController();
                        setBusy(true);
                        try {
                          setSimilar(
                            await searchOFF(query, controller.current.signal),
                          );
                        } catch (e) {
                          if ((e as Error).name !== "AbortError") fail();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t("البحث في Open Food Facts", "Search Open Food Facts")}
                    </button>
                  </div>
                  {busy && <p role="status">{t("جارٍ البحث…", "Searching…")}</p>}
                  {recent
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
                    .map(productRow)}
                  {similar.length > 0 && (
                    <>
                      <p className="notice">
                        {t(
                          "هذه منتجات مشابهة وليست مطابقة. اختر وراجع قبل التسجيل.",
                          "Similar products, not exact matches. Choose and review before logging.",
                        )}
                      </p>
                      {similar.map((p) => (
                        <button
                          className="similar"
                          key={p.id}
                          onClick={() => setEditor({ p })}
                        >
                          {p.name} · {t("مراجعة", "Review")}
                        </button>
                      ))}
                    </>
                  )}
                </section>
              )}
              {page === "scan" && (
                <Suspense
                  fallback={<p>{t("فتح الماسح…", "Opening scanner…")}</p>}
                >
                  <Scanner ar={ar} onCode={(code) => void scan(code)} />
                </Suspense>
              )}
              {page === "ai" && (
                <Suspense fallback={<p>…</p>}>
                  <AI
                    ar={ar}
                    entries={entries}
                    remaining={remaining}
                    onProduct={(p, q) => setEditor({ p, q })}
                    onAction={async (type, id, q) => {
                      const e = entries.find((x) => x.id === id);
                      if (!e) throw Error("id");
                      if (type === "delete") await remove(e);
                      else {
                        if (!q) throw Error("quantity");
                        await record(e.product, q, e);
                      }
                    }}
                  />
                </Suspense>
              )}
              {page === "settings" && (
                <section className="panel settings">
                  <h1>{t("على مقاس هدفك", "Make it yours")}</h1>
                  <h2>{t("الحساب والمزامنة", "Account & sync")}</h2>
                  <div className="account-card">
                    <span className="account-mark">
                      <Cloud size={28} />
                    </span>
                    <div>
                      <span className="eyebrow">MIQDAR CLOUD</span>
                      <h3>
                        {t(
                          "بياناتك معك، أينما كنت.",
                          "Your progress, wherever you go.",
                        )}
                      </h3>
                      <p>
                        {configured
                          ? t(
                              "حساب Google واحد لمزامنة سجل طعامك بأمان.",
                              "One Google account to securely sync your food diary.",
                            )
                          : t(
                              "الربط السحابي بانتظار إعداد مشروع Firebase. يمكنك الاستمرار محليًا الآن.",
                              "Cloud connection awaits Firebase project setup. You can keep using local mode.",
                            )}
                      </p>
                    </div>
                  </div>
                  <p>
                    {uid
                      ? auth?.currentUser?.email
                      : t(
                          "وضع الضيف: محفوظ محليًا فقط. صدّر نسخة احتياطية قبل تغيير الجهاز.",
                          "Guest mode: saved locally only. Export a backup before switching devices.",
                        )}
                  </p>
                  {!uid ? (
                    <button
                      className="primary"
                      disabled={!configured}
                      onClick={() => void login().catch(fail)}
                    >
                      {t("تسجيل الدخول بحساب Google", "Sign in with Google")}
                    </button>
                  ) : (
                    <button
                      disabled={data.pending || !online}
                      onClick={async () => {
                        try {
                          if (!cloud || !auth) return;
                          await waitForPendingWrites(cloud);
                          await terminate(cloud);
                          await clearIndexedDbPersistence(cloud);
                          await signOut(auth);
                          location.reload();
                        } catch {
                          fail();
                        }
                      }}
                    >
                      <LogOut size={18} />
                      {t(
                        "تسجيل خروج ومسح نسخة الحساب",
                        "Sign out & clear account cache",
                      )}
                    </button>
                  )}
                  {!configured && (
                    <p className="setup-note">
                      {t("لصاحب التطبيق: ", "App owner: ")}
                      <a
                        href="https://console.firebase.google.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t(
                          "فتح Firebase وتسجيل الدخول بقوقل",
                          "Open Firebase and sign in with Google",
                        )}
                      </a>
                    </p>
                  )}
                  <p className="muted">
                    {t(
                      "تسجيل الخروج يتطلب مزامنة التغييرات أولًا. بيانات الضيف منفصلة ولا تنتقل تلقائيًا للحساب.",
                      "Sign-out requires pending changes to sync. Guest data is separate and is not imported automatically.",
                    )}
                  </p>
                  <h2>{t("الأهداف اليومية", "Daily targets")}</h2>
                  <p className="muted">
                    {t(
                      "قيم بداية قابلة للتعديل، وليست توصية غذائية شخصية.",
                      "Editable starting values, not personal dietary advice.",
                    )}
                  </p>
                  <div className="grid2">
                    {(Object.keys(goals) as (keyof Goals)[]).map((k, i) => (
                      <label key={k}>
                        {t(
                          ["السعرات", "البروتين", "الكربوهيدرات", "الدهون"][i],
                          k,
                        )}
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={goals[k]}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n > 0 && n <= 10000) {
                              const g = { ...goals, [k]: n };
                              setGoals(g);
                              localStorage.setItem(
                                `goals-${uid ?? "guest"}`,
                                JSON.stringify(g),
                              );
                            }
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <h2>{t("نسختك الاحتياطية", "Your backup")}</h2>
                  <div className="row">
                    <button
                      onClick={() => {
                        const blob = new Blob(
                          [
                            JSON.stringify(
                              {
                                version: 1,
                                entries: data.entries,
                                products: data.products,
                              },
                              null,
                              2,
                            ),
                          ],
                          { type: "application/json" },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `مِقدر-${date}.json`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      {t("تصدير JSON", "Export JSON")}
                    </button>
                    <label className="file-button">
                      {t("استيراد JSON", "Import JSON")}
                      <input
                        type="file"
                        accept="application/json"
                        onChange={async (e) => {
                          try {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.size > 10000000) throw Error("size");
                            const backup = backupSchema.parse(
                              JSON.parse(await f.text()),
                            );
                            const existing = new Set(
                              data.entries.map((x) => x.id),
                            );
                            for (const row of backup.entries)
                              if (!existing.has(row.id))
                                await save(uid, "entries", row, fail);
                            const products = new Set(
                              data.products.map((x) => x.id),
                            );
                            for (const p of backup.products)
                              if (!products.has(p.id))
                                await save(uid, "products", p, fail);
                          } catch {
                            fail();
                          } finally {
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  </div>
                  <h2>{t("التثبيت على iPhone", "Install on iPhone")}</h2>
                  <p>
                    {t(
                      "افتح الموقع في Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية. يعمل محليًا بعد الفتح الأول؛ الكاميرا تتطلب HTTPS.",
                      "Open in Safari → Share → Add to Home Screen. Local features work offline after first load; the camera requires HTTPS.",
                    )}
                  </p>
                  {uid && (
                    <>
                      <h2>{t("حذف الحساب", "Delete account")}</h2>
                      <button
                        className="danger"
                        disabled={!online || data.pending}
                        onClick={async () => {
                          if (
                            !confirm(
                              t(
                                "حذف جميع بيانات الحساب نهائيًا؟ صدّر نسخة أولًا إن أردت.",
                                "Permanently delete all account data? Export a backup first if needed.",
                              ),
                            )
                          )
                            return;
                          try {
                            const user = auth?.currentUser;
                            if (!user) return;
                            const r = await fetch(
                              `${import.meta.env.VITE_API_BASE || ""}/api/account`,
                              {
                                method: "DELETE",
                                headers: {
                                  Authorization: `Bearer ${await user.getIdToken()}`,
                                },
                              },
                            );
                            if (!r.ok) throw Error("delete");
                            await deleteUser(user);
                            if (cloud) {
                              await terminate(cloud);
                              await clearIndexedDbPersistence(cloud);
                            }
                            localStorage.removeItem(`goals-${uid}`);
                            location.reload();
                          } catch {
                            fail();
                          }
                        }}
                      >
                        {t("حذف حسابي وبياناتي", "Delete my account and data")}
                      </button>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </main>
        <footer>
          مِقدر <span>·</span>{" "}
          {t("خطوة أقرب، كل يوم.", "A little closer, every day.")}
        </footer>
      </div>
      <nav className="bottom-nav">
        {[
          ["home", Home, t("اليوم", "Today")],
          ["library", BookOpen, t("مكتبتي", "Foods")],
          ["scan", ScanLine, t("مسح", "Scan")],
          ["ai", Sparkles, t("مساعد", "AI")],
          ["settings", Settings, t("الإعدادات", "Settings")],
        ].map(([id, Icon, label]) => {
          const I = Icon as typeof Home;
          return (
            <button
              key={String(id)}
              className={page === id ? "active" : ""}
              onClick={() => setPage(String(id))}
            >
              <I size={21} />
              <span>{String(label)}</span>
            </button>
          );
        })}
      </nav>
      {editor && (
        <Suspense fallback={<p>…</p>}>
          <Editor
            ar={ar}
            product={editor.p}
            quantity={editor.q}
            onClose={() => setEditor(null)}
            onSave={(p, q, operationId) =>
              record(p, q, editor.entry, operationId)
            }
          />
        </Suspense>
      )}
      {undo && (
        <div className="toast">
          {t("حُذف الطعام", "Food deleted")}
          <button
            onClick={() => {
              void save(uid, "entries", undo, fail);
              setUndo(null);
            }}
          >
            {t("تراجع", "Undo")}
          </button>
          <button onClick={() => setUndo(null)}>×</button>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol" aria-hidden="true">
        مِ
      </span>
      <span className="brand-word">
        مِقدر<small>MIQDAR</small>
      </span>
    </div>
  );
}
