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
    meal?: Entry["meal"];
  } | null>(null);
  const [query, setQuery] = useState("");
  const [similar, setSimilar] = useState<Product[]>([]);
  const [searched, setSearched] = useState(false);
  const [ratios, setRatios] = useState({ protein: 25, carbs: 45, fat: 30 });
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
    try {
      const value = JSON.parse(
        localStorage.getItem(`macro-ratios-${uid ?? "guest"}`) || "null",
      );
      if (
        value &&
        [value.protein, value.carbs, value.fat].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 100,
        )
      )
        setRatios(value);
      else setRatios({ protein: 25, carbs: 45, fat: 30 });
    } catch {
      setRatios({ protein: 25, carbs: 45, fat: 30 });
    }
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
    meal: Entry["meal"] = entry?.meal ?? "lunch",
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
      meal,
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
                    <section className="calorie-card calorie-compact">
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
                      <section className="macro-card">
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
                  </div>
                  <div className="lower-grid">
                    <section className="day-meals">
                      {(["breakfast", "lunch", "dinner"] as const).map(
                        (meal) => {
                          const mealEntries = entries.filter(
                            (entry) => entry.meal === meal,
                          );
                          const mealName = {
                            breakfast: t("الفطور", "Breakfast"),
                            lunch: t("الغداء", "Lunch"),
                            dinner: t("العشاء", "Dinner"),
                          }[meal];
                          return (
                            <section className="panel meal-section" key={meal}>
                              <div className="card-top">
                                <h2>{mealName}</h2>
                                <button
                                  className="meal-add"
                                  aria-label={`${t("إضافة إلى", "Add to")} ${mealName}`}
                                  onClick={() => setEditor({ meal })}
                                >
                                  <Plus size={18} />
                                </button>
                              </div>
                              {mealEntries.length ? (
                                mealEntries.map((e) => (
                                  <div className="food-row" key={e.id}>
                                    <div className="food-icon">
                                      <BookOpen size={20} />
                                    </div>
                                    <div className="food-name">
                                      <strong>{e.product.name}</strong>
                                      <small>
                                        {e.quantity} {e.product.basis} ·{" "}
                                        {Math.round(
                                          scale(e.product.nutrients, e.quantity)
                                            .kcal ?? 0,
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
                                          meal: e.meal,
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
                                <button
                                  className="meal-empty"
                                  onClick={() => setEditor({ meal })}
                                >
                                  {t("أضف وجبة", "Add food")}
                                </button>
                              )}
                            </section>
                          );
                        },
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
                          setSearched(true);
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
                  {searched && !busy && similar.length === 0 && (
                    <p className="notice" role="status">
                      {t(
                        "تعذر العثور على المنتج. جرّب اسمًا آخر أو باركودًا، أو أضفه يدويًا.",
                        "Product not found. Try another name or barcode, or add it manually.",
                      )}
                    </p>
                  )}
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
                          "وضع الضيف يحفظ البيانات على هذا الجهاز فقط.",
                          "Guest mode saves data on this device only.",
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
                  <h2>
                    {t("أهداف السعرات والماكروز", "Calorie & macro goals")}
                  </h2>
                  <p className="muted">
                    {t(
                      "حدد هدف السعرات، ثم عدّل نسب الماكروز؛ الغرامات تتغير فورًا.",
                      "Set a calorie target and adjust macro shares; grams update instantly.",
                    )}
                  </p>
                  <div className="grid2">
                    {(["kcal"] as (keyof Goals)[]).map((k) => (
                      <label key={k}>
                        {t("السعرات اليومية", k)}
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={goals[k]}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n > 0 && n <= 10000) {
                              const g = {
                                ...goals,
                                kcal: n,
                                protein: Math.round((n * ratios.protein) / 400),
                                carbs: Math.round((n * ratios.carbs) / 400),
                                fat: Math.round((n * ratios.fat) / 900),
                              };
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
                  <div className="macro-goals">
                    {(["protein", "carbs", "fat"] as const).map((key) => {
                      const factor = key === "fat" ? 9 : 4;
                      const name = {
                        protein: t("البروتين", "Protein"),
                        carbs: t("الكربوهيدرات", "Carbs"),
                        fat: t("الدهون", "Fat"),
                      }[key];
                      return (
                        <label className="macro-slider" key={key}>
                          {name}
                          <b>
                            {ratios[key]}٪ ·{" "}
                            {Math.round(
                              (goals.kcal * ratios[key]) / 100 / factor,
                            )}{" "}
                            g
                          </b>
                          <input
                            aria-label={name}
                            type="range"
                            min="0"
                            max="100"
                            value={ratios[key]}
                            onChange={(e) => {
                              const next = {
                                ...ratios,
                                [key]: Number(e.target.value),
                              };
                              setRatios(next);
                              localStorage.setItem(
                                `macro-ratios-${uid ?? "guest"}`,
                                JSON.stringify(next),
                              );
                              const g = {
                                ...goals,
                                protein: Math.round(
                                  (goals.kcal * next.protein) / 400,
                                ),
                                carbs: Math.round(
                                  (goals.kcal * next.carbs) / 400,
                                ),
                                fat: Math.round((goals.kcal * next.fat) / 900),
                              };
                              setGoals(g);
                              localStorage.setItem(
                                `goals-${uid}`,
                                JSON.stringify(g),
                              );
                            }}
                          />
                        </label>
                      );
                    })}
                    <p
                      className={`ratio-total ${ratios.protein + ratios.carbs + ratios.fat > 100 ? "over" : ""}`}
                      aria-live="polite"
                    >
                      {t("مجموع النسب", "Total ratio")}{" "}
                      {ratios.protein + ratios.carbs + ratios.fat}٪ ·{" "}
                      {t(
                        "السعرات محسوبة من الماكروز",
                        "Calories calculated from macros",
                      )}
                    </p>
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
                                "حذف جميع بيانات الحساب نهائيًا؟",
                                "Permanently delete all account data?",
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
            meal={editor.meal ?? editor.entry?.meal}
            onSave={(p, q, operationId, meal) =>
              record(p, q, editor.entry, operationId, meal)
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
