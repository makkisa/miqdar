import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ScanLine,
  Camera,
  ClipboardList,
  Utensils,
  Plus,
  Home,
  BookOpen,
  Settings,
  Star,
  Trash2,
  Pencil,
  Cloud,
  WifiOff,
  Check,
  Search,
  PackageSearch,
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
import { lookup, searchFoods } from "./products";
import PercentWheel from "./PercentWheel";
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
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [aiMode, setAiMode] = useState<"label" | "meal">("meal");
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
  useEffect(() => {
    const firestore = cloud;
    if (!uid || !firestore) return;
    const key = `daily-sync-checkpoint-${uid}`;
    let timer: number | undefined;
    let active = true;
    let running = false;
    const checkpointDay = () => {
      const now = new Date();
      if (now.getHours() > 23 || (now.getHours() === 23 && now.getMinutes() >= 59))
        return localDate(now);
      const previous = new Date(now);
      previous.setDate(previous.getDate() - 1);
      return localDate(previous);
    };
    const checkpoint = async () => {
      if (!active || running || !navigator.onLine) return;
      const day = checkpointDay();
      if (localStorage.getItem(key) === day) return;
      running = true;
      try {
        await waitForPendingWrites(firestore);
        if (active) localStorage.setItem(key, day);
      } catch {
        // Firestore keeps retrying pending writes; the next foreground/online
        // checkpoint will wait for them again.
      } finally {
        running = false;
      }
    };
    const schedule = () => {
      const next = new Date();
      next.setHours(23, 59, 0, 0);
      if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
      timer = window.setTimeout(() => {
        void checkpoint().finally(schedule);
      }, next.getTime() - Date.now());
    };
    const onActive = () => {
      if (!document.hidden) void checkpoint();
    };
    void checkpoint();
    schedule();
    window.addEventListener("online", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("online", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [uid]);
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
    if (!/^\d{8,14}$/.test(code)) {
      setError(
        t(
          "تمت قراءة الرمز، لكن قاعدة المنتجات تدعم باركودات الطعام الرقمية فقط. جرّب EAN أو UPC أو ابحث باسم المنتج.",
          "Code read, but the food database supports numeric product barcodes only. Try EAN/UPC or search by product name.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    setBarcodeProduct(null);
    setSimilar([]);
    setSearched(false);
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const cached = data.products.find((p) => p.barcode === code);
      const p = cached ?? (await lookup(code, controller.current.signal));
      const complete = (candidate: Product) =>
        [
          candidate.nutrients.protein,
          candidate.nutrients.carbs,
          candidate.nutrients.fat,
        ].every((n) => n !== null);
      if (p && complete(p)) {
        setEditor({ p });
        return;
      }
      if (p) setBarcodeProduct(p);
      setQuery(p?.name && p.name !== code ? p.name : "");
      const matches = await searchFoods(
        p?.name && p.name !== code ? p.name : code,
        controller.current.signal,
      );
      const exact = matches.find(
        (candidate) => candidate.barcode === code && complete(candidate),
      );
      if (exact) {
        setEditor({ p: exact });
        return;
      }
      setSimilar(
        matches
          .filter(
            (candidate) => candidate.barcode !== code && complete(candidate),
          )
          .slice(0, 6),
      );
      setSearched(true);
      setError("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setSearched(true);
        setError(
          t(
            "تعذر البحث الآن. أدخل اسم المنتج للبحث عن بياناته أو منتج قريب.",
            "Search is unavailable. Enter the product name to find its data or a similar item.",
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function updateMacroRatio(key: "protein" | "carbs" | "fat", value: number) {
    const next = {
      ...ratios,
      [key]: Math.max(0, Math.min(100, Math.round(value))),
    };
    setRatios(next);
    localStorage.setItem(
      `macro-ratios-${uid ?? "guest"}`,
      JSON.stringify(next),
    );
    const g = {
      ...goals,
      protein: Math.round((goals.kcal * next.protein) / 400),
      carbs: Math.round((goals.kcal * next.carbs) / 400),
      fat: Math.round((goals.kcal * next.fat) / 900),
    };
    setGoals(g);
    localStorage.setItem(`goals-${uid ?? "guest"}`, JSON.stringify(g));
  }
  function updateCalorieGoal(value: number) {
    const kcal = Math.max(500, Math.min(10000, Math.round(value / 50) * 50));
    const g = {
      ...goals,
      kcal,
      protein: Math.round((kcal * ratios.protein) / 400),
      carbs: Math.round((kcal * ratios.carbs) / 400),
      fat: Math.round((kcal * ratios.fat) / 900),
    };
    setGoals(g);
    localStorage.setItem(`goals-${uid ?? "guest"}`, JSON.stringify(g));
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
          {[p.brand, p.source, `${p.lastQuantity} ${p.basis}`]
            .filter(Boolean)
            .join(" · ")}
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
        {[
          ["home", Home, t("نظرة اليوم", "Today")],
          ["library", BookOpen, t("مكتبتي", "My foods")],
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
        <main key={page}>
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
                        {t("مقدار اليوم", "TODAY AT A GLANCE")}
                      </span>
                      <h1>{t("ملخص اليوم", "Daily overview")}</h1>
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
                      className="scan-action action-tile scan-tile"
                      onClick={() => setPage("scan")}
                    >
                      <ScanLine />
                      <span>
                        <strong>{t("مسح باركود", "Scan barcode")}</strong>
                        <small>
                          {t("بحث مباشر عن المنتج", "Find product by code")}
                        </small>
                      </span>
                    </button>
                    <button
                      className="action-tile label-tile"
                      onClick={() => {
                        setAiMode("label");
                        setPage("ai");
                      }}
                    >
                      <ClipboardList />
                      <span>
                        <strong>
                          {t("صوّر الملصق الغذائي", "Scan nutrition label")}
                        </strong>
                        <small>
                          {t(
                            "استخراج القيم ومراجعتها",
                            "Extract and review values",
                          )}
                        </small>
                      </span>
                    </button>
                    <button
                      className="action-tile meal-photo-tile"
                      onClick={() => {
                        setAiMode("meal");
                        setPage("ai");
                      }}
                    >
                      <Camera />
                      <span>
                        <strong>{t("صوّر طعامك", "Photo your meal")}</strong>
                        <small>
                          {t("أضف وصف الوجبة", "Add a meal description")}
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
                                      <small className="food-source">
                                        {t("المصدر: ", "Source: ")}{e.product.source === "manual"
                                          ? t("إدخال يدوي", "Manual entry")
                                          : e.product.source}
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
                  <div className="library-heading">
                    <div>
                      <span className="eyebrow">
                        {t("الأطعمة المحفوظة وقواعد البيانات", "SAVED FOODS & DATABASES")}
                      </span>
                      <h1>{t("ابحث عن طعام", "Find a food")}</h1>
                    </div>
                    <PackageSearch size={30} aria-hidden="true" />
                  </div>
                  <div className="food-search">
                    <label className="search search-field">
                      <Search size={22} aria-hidden="true" />
                      <input
                        aria-label={t("بحث عن طعام", "Search foods")}
                        value={query}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && query.trim().length >= 2) {
                            event.preventDefault();
                            controller.current?.abort();
                            const active = new AbortController();
                            controller.current = active;
                            setBusy(true);
                            setSearched(true);
                            setSimilar([]);
                            void searchFoods(query, active.signal)
                              .then(setSimilar)
                              .catch((e) => {
                                if ((e as Error).name !== "AbortError") fail();
                              })
                              .finally(() => {
                                if (!active.signal.aborted) setBusy(false);
                              });
                          }
                        }}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          controller.current?.abort();
                          setSimilar([]);
                          setSearched(false);
                          setBarcodeProduct(null);
                        }}
                        placeholder={t(
                          "اكتب اسم الطعام أو العلامة التجارية",
                          "Food name or brand",
                        )}
                      />
                      {query && (
                        <button
                          type="button"
                          className="search-clear"
                          aria-label={t("مسح البحث", "Clear search")}
                          onClick={() => {
                            controller.current?.abort();
                            setQuery("");
                            setSimilar([]);
                            setSearched(false);
                            setBarcodeProduct(null);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </label>
                    <button
                      className="primary search-submit"
                      disabled={query.trim().length < 2 || busy}
                      onClick={() => {
                        controller.current?.abort();
                        const active = new AbortController();
                        controller.current = active;
                        setBusy(true);
                        setSearched(true);
                        setSimilar([]);
                        void searchFoods(query, active.signal)
                          .then(setSimilar)
                          .catch((e) => {
                            if ((e as Error).name !== "AbortError") fail();
                          })
                          .finally(() => {
                            if (!active.signal.aborted) setBusy(false);
                          });
                      }}
                    >
                      <Search size={21} />
                      {t("ابحث", "Search")}
                    </button>
                  </div>
                  <div className="search-sources" aria-label={t("مصادر البحث", "Search sources")}>
                    <span><span className="source-dot" /> Open Food Facts</span>
                    <span><span className="source-dot secondary" /> USDA FoodData Central</span>
                  </div>
                  {barcodeProduct && (
                    <div className="barcode-gap-card">
                      <span className="eyebrow">
                        {t("بيانات المنتج", "PRODUCT DATA")}
                      </span>
                      <h2>{barcodeProduct.name}</h2>
                      <p>
                        {t(
                          `وجدنا الباركود، لكن بيانات الماكروز ناقصة في ${barcodeProduct.source}.`,
                          `The barcode matched, but this ${barcodeProduct.source} record is missing macro data.`,
                        )}
                      </p>
                      <small className="muted">
                        {t(
                          `المصدر: ${barcodeProduct.source} · الناقص: `,
                          `Source: ${barcodeProduct.source} · Missing: `,
                        )}
                        {(["protein", "carbs", "fat"] as const)
                          .filter(
                            (key) => barcodeProduct.nutrients[key] === null,
                          )
                          .map(
                            (key) =>
                              ({
                                protein: t("البروتين", "protein"),
                                carbs: t("الكربوهيدرات", "carbs"),
                                fat: t("الدهون", "fat"),
                              })[key],
                          )
                          .join("، ") || t("السعرات", "calories")}
                      </small>
                      {similar.length === 0 && searched ? (
                        <div className="barcode-fallback">
                          <p>
                            {t(
                              "لم نجد سجلًا كاملًا أو منتجًا قريبًا ببيانات موثوقة. صوّر جدول القيم الغذائية لإدخاله بدقة.",
                              "No complete record or reliable similar product was found. Photograph the nutrition label to enter it accurately.",
                            )}
                          </p>
                          <button
                            className="primary"
                            onClick={() => {
                              setAiMode("label");
                              setPage("ai");
                            }}
                          >
                            <Camera size={18} />{" "}
                            {t(
                              "تصوير جدول القيم",
                              "Photograph nutrition label",
                            )}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="library-actions">
                    <button onClick={() => setEditor({})}>
                      <Plus size={18} />
                      {t("طعام جديد", "New food")}
                    </button>
                  </div>
                  {busy && <p role="status">{t("جارٍ البحث…", "Searching…")}</p>}
                  {searched &&
                    !busy &&
                    similar.length === 0 &&
                    !barcodeProduct && (
                      <p className="notice" role="status">
                        {t(
                          "لم نجد تطابقًا كاملًا ببيانات موثوقة في Open Food Facts أو USDA. لا نعرض تخمينًا من رقم الباركود؛ ابحث باسم المنتج أو صوّر الملصق.",
                          "No complete, reliable match was found in Open Food Facts or USDA. We do not guess from a barcode; search by product name or photograph the label.",
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
                      <p className="search-results-label">
                        {barcodeProduct
                          ? t(
                              "هذه اقتراحات مشابهة وليست مطابقة للباركود. راجع الملصق قبل التسجيل.",
                              "These are similar suggestions, not barcode matches. Verify the label before logging.",
                            )
                          : t(
                              "نتائج قريبة من عبارتك ببيانات ماكروز كاملة. راجع الاسم والقيم قبل التسجيل.",
                              "Relevant results with complete macros. Review the food and values before logging.",
                            )}
                      </p>
                      <div className="search-results">
                        {similar.map((p) => (
                          <button
                            className="search-result"
                            key={p.id}
                            onClick={() => setEditor({ p })}
                          >
                            <span className="search-result-icon">
                              <Utensils size={23} aria-hidden="true" />
                            </span>
                            <span className="search-result-copy">
                              <strong>{p.name}</strong>
                              {p.brand && <small>{p.brand}</small>}
                              <small className="search-source-label">
                                {p.source} · {t("لكل 100", "per 100")} {p.basis}
                              </small>
                              <span className="search-macros" aria-label={t("القيم الغذائية", "Nutrition values")}>
                                <b>{p.nutrients.kcal === null ? "—" : Math.round(p.nutrients.kcal)} <small>kcal</small></b>
                                <b>PRO {Math.round(p.nutrients.protein ?? 0)}<small>g</small></b>
                                <b>CARB {Math.round(p.nutrients.carbs ?? 0)}<small>g</small></b>
                                <b>FAT {Math.round(p.nutrients.fat ?? 0)}<small>g</small></b>
                              </span>
                            </span>
                            <span className="search-result-action">{t("راجع", "Review")}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {searched &&
                    !busy &&
                    similar.length === 0 &&
                    !barcodeProduct && (
                      <button
                        className="label-fallback-button"
                        onClick={() => {
                          setAiMode("label");
                          setPage("ai");
                        }}
                      >
                        <Camera size={18} />{" "}
                        {t(
                          "تصوير الملصق الغذائي",
                          "Photograph nutrition label",
                        )}
                      </button>
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
                    key={aiMode}
                    ar={ar}
                    initialMode={aiMode}
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
                  <h1>{t("الإعدادات", "Settings")}</h1>
                  <h2>{t("الحساب", "Account")}</h2>
                  <div className="account-card">
                    <span className="account-mark">
                      <Cloud size={28} />
                    </span>
                    <div>
                      <span className="eyebrow">MIQDAR CLOUD</span>
                      <h3>{t("حساب Google", "Google account")}</h3>
                      <ul className="account-points">
                        <li>{t("مزامنة تلقائية يومية عند توفر الاتصال", "Daily automatic sync when online")}</li>
                        <li>{t("حفظ التغييرات محليًا عند انقطاع الشبكة", "Keep changes locally while offline")}</li>
                        <li>{configured ? t("بيانات منفصلة وآمنة لكل حساب", "Private data per account") : t("الربط السحابي يحتاج إعداد Firebase", "Cloud sync needs Firebase setup")}</li>
                      </ul>
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
                  <h2>
                    {t("أهداف السعرات والماكروز", "Calorie & macro goals")}
                  </h2>
                  <p className="muted">
                    {t(
                      "حدد هدف السعرات، ثم عدّل نسب الماكروز؛ الغرامات تتغير فورًا.",
                      "Set a calorie target and adjust macro shares; grams update instantly.",
                    )}
                  </p>
                  <div className="goal-stepper-card">
                    <div className="calorie-goal-copy">
                      <span>{t("هدف السعرات اليومي", "DAILY ENERGY")}</span>
                      <strong>{t("السعرات", "CALORIES")}</strong>
                      <small>kcal · {t("خطوة 50", "50 per step")}</small>
                    </div>
                    <PercentWheel
                      label={t("هدف السعرات اليومي", "Daily calorie goal")}
                      value={goals.kcal}
                      min={500}
                      max={10000}
                      step={50}
                      suffix=""
                      orientation="horizontal"
                      onChange={updateCalorieGoal}
                    />
                  </div>{" "}
                  <div className="macro-goals">
                    {(["protein", "carbs", "fat"] as const).map((key) => {
                      const factor = key === "fat" ? 9 : 4;
                      const name = {
                        protein: t("البروتين", "Protein"),
                        carbs: t("الكربوهيدرات", "Carbs"),
                        fat: t("الدهون", "Fat"),
                      }[key];
                      const shortName = {
                        protein: "PRO",
                        carbs: "CARB",
                        fat: "FAT",
                      }[key];
                      return (
                        <div className="macro-stepper" key={key}>
                          <div className="macro-stepper-head">
                            <strong>{shortName}</strong>
                            <span>{name}</span>
                          </div>
                          <b className="macro-grams">
                            {Math.round(
                              (goals.kcal * ratios[key]) / 100 / factor,
                            )}
                            <small>g</small>
                          </b>
                          <PercentWheel
                            label={name}
                            value={ratios[key]}
                            onChange={(value) => updateMacroRatio(key, value)}
                          />
                        </div>
                      );
                    })}
                    <p
                      className={`ratio-total ${ratios.protein + ratios.carbs + ratios.fat > 100 ? "over" : ""}`}
                      aria-live="polite"
                    >
                      {t("مجموع النسب", "Total ratio")}{" "}
                      {ratios.protein + ratios.carbs + ratios.fat}٪ ·{" "}
                      {ratios.protein + ratios.carbs + ratios.fat > 100
                        ? t("تجاوزت 100٪", "Over 100%")
                        : ratios.protein + ratios.carbs + ratios.fat < 100
                          ? t(
                              "أكمل التوزيع حتى 100٪",
                              "Complete the split to 100%",
                            )
                          : t("اكتمل التوزيع", "Balanced")}
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
          مِقدار <span>·</span> {t("تتبّع السعرات والماكروز", "Calories & macros")}
        </footer>
      </div>
      <nav className="bottom-nav">
        {[
          ["home", Home, t("اليوم", "Today")],
          ["library", BookOpen, t("مكتبتي", "Foods")],
          ["scan", ScanLine, t("مسح", "Scan")],
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
      <img
        className="brand-symbol"
        src={`${import.meta.env.BASE_URL}brand.svg`}
        alt=""
      />
      <span className="brand-word">
        مِقدار<small>MIQDAR</small>
      </span>
    </div>
  );
}
