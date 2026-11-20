import { useState } from "react";
import { getToken } from "firebase/app-check";
import { auth, appCheck } from "./firebase";
import {
  aiSchema,
  normalize,
  type Entry,
  type Product,
  type Nutrients,
} from "./domain";
export async function compressImage(file: File) {
  if (file.size > 20 * 1024 * 1024) throw Error("image-size");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
export default function AI({
  ar,
  entries,
  remaining,
  onProduct,
  onAction,
}: {
  ar: boolean;
  entries: Entry[];
  remaining: Nutrients;
  onProduct: (p: Product, q?: number) => void;
  onAction: (
    type: "delete" | "update",
    id: string,
    q?: number,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState("chat");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<
    typeof aiSchema.parse
  > | null>(null);
  return (
    <section className="panel">
      <span className="eyebrow">MIQDAR AI</span>
      <h2>{ar ? "مساعدك الغذائي" : "Your food assistant"}</h2>
      <p className="muted">
        {ar
          ? "اقتراحات تُراجعها أنت قبل أي تغيير."
          : "Suggestions you review before any change."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setResult(null);
          try {
            if (!auth?.currentUser) throw Error("auth");
            const token = await auth.currentUser.getIdToken();
            const check = appCheck ? (await getToken(appCheck)).token : "";
            const image = file ? await compressImage(file) : undefined;
            const r = await fetch(
              `${import.meta.env.VITE_API_BASE || ""}/api/ai`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  ...(check ? { "X-Firebase-AppCheck": check } : {}),
                },
                body: JSON.stringify({
                  mode,
                  prompt,
                  image,
                  remaining,
                  entries: entries.slice(-30).map((e) => ({
                    id: e.id,
                    name: e.product.name,
                    quantity: e.quantity,
                  })),
                  consent,
                }),
              },
            );
            if (!r.ok) throw Error(String(r.status));
            setResult(aiSchema.parse(await r.json()));
            setFile(null);
          } catch {
            setError(
              ar
                ? "تعذرت الخدمة. تحقق من تسجيل الدخول وإعداد الخادم والحصة المتاحة. التسجيل اليدوي متاح."
                : "Service unavailable. Check sign-in, server setup and quota. Manual logging remains available.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {ar ? "المهمة" : "Task"}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="chat">{ar ? "شات" : "Chat"}</option>
            <option value="label">
              {ar ? "جدول القيم الغذائية" : "Nutrition label"}
            </option>
            <option value="meal">
              {ar ? "تقدير صورة وجبة" : "Estimate meal photo"}
            </option>
          </select>
        </label>
        <label>
          {ar ? "رسالتك" : "Your message"}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={2000}
            placeholder={
              ar
                ? "كم باقي لي بروتين اليوم؟"
                : "How much protein remains today?"
            }
          />
        </label>
        <label className="file-button">
          {ar ? "إرفاق صورة" : "Attach image"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <p>
            {file.name}{" "}
            <button type="button" onClick={() => setFile(null)}>
              ×
            </button>
          </p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {ar
            ? "أوافق على إرسال هذه الرسالة والصورة إلى Gemini. قد تستخدم الخطة المجانية المحتوى لتحسين خدمات Google."
            : "I agree to send this message and image to Gemini. The free tier may use content to improve Google services."}
        </label>
        <button
          className="primary"
          disabled={busy || !consent || (!prompt && !file)}
        >
          {busy
            ? ar
              ? "جارٍ التحليل…"
              : "Analyzing…"
            : ar
              ? "إرسال للتحليل"
              : "Analyze"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="ai-result">
          <p>{result.message}</p>
          {result.label && (
            <>
              <pre>{JSON.stringify(result.label, null, 2)}</pre>
              {result.label.basis === "serving" && (
                <div className="grid2">
                  <label>
                    {ar ? "حجم الحصة" : "Serving size"}
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={result.label.servingSize ?? ""}
                      onChange={(e) =>
                        setResult({
                          ...result,
                          label: {
                            ...result.label!,
                            servingSize: Number(e.target.value) || null,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    {ar ? "وحدة الحصة" : "Serving unit"}
                    <select
                      value={result.label.servingUnit ?? ""}
                      onChange={(e) =>
                        setResult({
                          ...result,
                          label: {
                            ...result.label!,
                            servingUnit: e.target.value as "g" | "ml",
                          },
                        })
                      }
                    >
                      <option value="">—</option>
                      <option>g</option>
                      <option>ml</option>
                    </select>
                  </label>
                </div>
              )}
              <button
                onClick={() => {
                  try {
                    const l = result.label!;
                    const n = {
                      ...l.nutrients,
                      kcal:
                        l.nutrients.kcal === null
                          ? null
                          : l.energyUnit === "kJ"
                            ? l.nutrients.kcal / 4.184
                            : l.nutrients.kcal,
                    };
                    const normalized = normalize(
                      n,
                      l.basis,
                      l.servingSize,
                      l.servingUnit,
                    );
                    onProduct({
                      id: crypto.randomUUID(),
                      name: l.name || (ar ? "منتج جديد" : "New product"),
                      ...normalized,
                      source: "Gemini label · review required",
                      original: l,
                      favorite: false,
                      lastQuantity: 100,
                      portion: l.servingSize,
                    });
                    setResult(null);
                  } catch {
                    setError(
                      ar
                        ? "حجم الحصة ووحدتها غير معروفين؛ أدخلهما يدويًا قبل التحويل."
                        : "Serving size/unit unknown; enter manually before conversion.",
                    );
                  }
                }}
              >
                {ar ? "مراجعة القيم والتسجيل" : "Review values & log"}
              </button>
            </>
          )}
          {result.actions.map((a, i) => (
            <div className="action" key={i}>
              <p>
                {a.type} · {a.name} · {a.quantity ?? ""}
              </p>
              <p className="muted">
                {a.estimated
                  ? ar
                    ? "تقدير: الصورة لا تكشف الوزن والزيوت بدقة."
                    : "Estimate: a photo cannot reveal exact weight or oils."
                  : ar
                    ? "راجع المعلومات قبل التأكيد"
                    : "Review before confirming"}
              </p>
              <button
                onClick={async () => {
                  try {
                    if (a.type === "add") {
                      onProduct(
                        {
                          id: crypto.randomUUID(),
                          name: a.name,
                          basis: a.basis,
                          nutrients: a.nutrients,
                          source: a.estimated
                            ? "Gemini estimate"
                            : "Gemini · review required",
                          favorite: false,
                          lastQuantity: a.quantity ?? 100,
                          portion: null,
                        },
                        a.quantity ?? 100,
                      );
                    } else {
                      if (
                        !a.entryId ||
                        !entries.some((e) => e.id === a.entryId)
                      )
                        throw Error("id");
                      await onAction(
                        a.type,
                        a.entryId,
                        a.quantity ?? undefined,
                      );
                    }
                    setResult({
                      ...result,
                      actions: result.actions.filter((_, j) => j !== i),
                    });
                  } catch {
                    setError(
                      ar ? "تعذر تنفيذ الاقتراح" : "Could not apply suggestion",
                    );
                  }
                }}
              >
                {ar ? "تأكيد / مراجعة" : "Confirm / review"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
