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
function productFromLabel(
  label: NonNullable<ReturnType<typeof aiSchema.parse>["label"]>,
  ar: boolean,
): Product {
  const nutrients = {
    ...label.nutrients,
    kcal:
      label.nutrients.kcal === null
        ? null
        : label.energyUnit === "kJ"
          ? label.nutrients.kcal / 4.184
          : label.nutrients.kcal,
  };
  const normalized = normalize(
    nutrients,
    label.basis,
    label.servingSize,
    label.servingUnit,
  );
  return {
    id: crypto.randomUUID(),
    name: label.name || (ar ? "منتج جديد" : "New product"),
    ...normalized,
    source: "Gemini label · review required",
    original: label,
    favorite: false,
    lastQuantity: 100,
    portion: label.servingSize,
  };
}
export default function AI({
  ar,
  initialMode,
  entries,
  remaining,
  onProduct,
  onAction,
}: {
  ar: boolean;
  initialMode: "label" | "meal";
  entries: Entry[];
  remaining: Nutrients;
  onProduct: (p: Product, q?: number) => void;
  onAction: (
    type: "delete" | "update",
    id: string,
    q?: number,
  ) => Promise<void>;
}) {
  const [mode] = useState(initialMode);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<
    typeof aiSchema.parse
  > | null>(null);
  const apiConfigured =
    Boolean(import.meta.env.VITE_API_BASE) || import.meta.env.DEV;
  return (
    <section className="panel">
      <span className="eyebrow">
        {mode === "label" ? "LABEL READER" : "MEAL PHOTO"}
      </span>
      <h2>
        {mode === "label"
          ? ar
            ? "تصوير جدول القيم الغذائية"
            : "Nutrition label scan"
          : ar
            ? "تحليل صورة الوجبة"
            : "Meal photo estimate"}
      </h2>
      <p className="muted">
        {mode === "label"
          ? ar
            ? "نستخرج القيم الظاهرة فقط. راجعها قبل حفظ المنتج."
            : "Only visible values are extracted. Review them before saving."
          : ar
            ? "اكتب وصفًا بسيطًا للمكونات والكمية. النتيجة تقديرية وتحتاج مراجعتك."
            : "Describe the ingredients and portion. The estimate needs your review."}
      </p>
      {!apiConfigured && (
        <p className="notice" role="status">
          {ar
            ? "تحليل الصور يحتاج ربط خادم Gemini الآمن. لا تُرسل الصورة قبل إعداد الخدمة."
            : "Photo analysis needs a secure Gemini server. Images will not be sent until the service is configured."}
        </p>
      )}
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
            const parsed = aiSchema.parse(await r.json());
            setResult(parsed);
            if (
              mode === "label" &&
              parsed.label &&
              (parsed.label.basis !== "serving" ||
                (parsed.label.servingSize !== null &&
                  parsed.label.servingUnit !== null))
            ) {
              try {
                onProduct(productFromLabel(parsed.label, ar));
                setResult(null);
              } catch {
                // Keep the extraction visible so a missing serving size can be reviewed.
              }
            }
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
        {mode === "meal" && (
          <label>
            {ar ? "وصف الوجبة" : "Meal description"}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={1000}
              placeholder={
                ar
                  ? "مثال: رز أبيض، صدر دجاج مشوي، وسلطة بدون صوص"
                  : "Example: white rice, grilled chicken breast and salad, no dressing"
              }
              required
            />
          </label>
        )}
        <label className="file-button">
          {mode === "label"
            ? ar
              ? "التقط صورة الملصق الغذائي"
              : "Photograph the nutrition label"
            : ar
              ? "التقط صورة الوجبة"
              : "Photograph the meal"}
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
            ? "أوافق على إرسال الصورة والوصف إلى Gemini لتحليلها. قد تستخدم الخطة المجانية المحتوى لتحسين خدمات Google."
            : "I agree to send the image and description to Gemini. The free tier may use content to improve Google services."}
        </label>
        <button
          className="primary"
          disabled={
            busy ||
            !apiConfigured ||
            !consent ||
            !file ||
            (mode === "meal" && !prompt.trim())
          }
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
              <div className="label-values">
                <strong>{result.label.name}</strong>
                <span className="muted">
                  {ar ? "أساس القيم: " : "Values based on: "}
                  {result.label.basis === "serving"
                    ? `${result.label.servingSize ?? "—"} ${result.label.servingUnit ?? ""}`
                    : result.label.basis}
                </span>
                <div>
                  {(
                    [
                      [
                        "السعرات",
                        "Calories",
                        result.label.nutrients.kcal,
                        result.label.energyUnit,
                      ],
                      [
                        "البروتين",
                        "Protein",
                        result.label.nutrients.protein,
                        "g",
                      ],
                      [
                        "الكربوهيدرات",
                        "Carbohydrate",
                        result.label.nutrients.carbs,
                        "g",
                      ],
                      ["الدهون", "Fat", result.label.nutrients.fat, "g"],
                    ] as const
                  ).map(([arName, enName, value, unit]) => (
                    <span key={enName}>
                      {ar ? arName : enName}
                      <b>
                        {value === null
                          ? ar
                            ? "راجع"
                            : "Review"
                          : `${value} ${unit}`}
                      </b>
                    </span>
                  ))}
                </div>
                {result.label.nutrients.protein === null ||
                result.label.nutrients.carbs === null ||
                result.label.nutrients.fat === null ? (
                  <p className="notice">
                    {ar
                      ? "بعض القيم غير واضحة. ستحتاج إلى إدخالها أو مراجعتها قبل الحفظ."
                      : "Some values are unclear. Review or enter them before saving."}
                  </p>
                ) : null}
              </div>
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
                    onProduct(productFromLabel(result.label!, ar));
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
