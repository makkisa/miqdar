import { useEffect, useRef, useState } from "react";
import {
  caloriesFromMacros,
  quantityInBasis,
  scale,
  productSchema,
  type Product,
  type Unit,
} from "./domain";
import PercentWheel from "./PercentWheel";
export default function Editor({
  product,
  quantity,
  onSave,
  onClose,
  ar,
  meal,
}: {
  product?: Product;
  quantity?: number;
  meal?: "breakfast" | "lunch" | "dinner";
  onSave: (
    p: Product,
    q: number,
    operationId: string,
    meal: "breakfast" | "lunch" | "dinner",
  ) => Promise<void>;
  onClose: () => void;
  ar: boolean;
}) {
  const [selectedMeal, setSelectedMeal] = useState(meal ?? "lunch");
  const [p, setP] = useState<Product>(
    product ?? {
      id: crypto.randomUUID(),
      name: "",
      basis: "g",
      nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      source: "manual",
      favorite: false,
      lastQuantity: 100,
      portion: null,
    },
  );
  const [amount, setAmount] = useState(quantity ?? p.lastQuantity);
  const [unit, setUnit] = useState<Unit>(p.basis);
  const [portion, setPortion] = useState<number | null>(p.portion);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [macrosEdited, setMacrosEdited] = useState(false);
  const [showMacroEditor, setShowMacroEditor] = useState(
    () => !product || [product.nutrients.protein, product.nutrients.carbs, product.nutrients.fat].some((value) => value === null),
  );
  const [operationId] = useState(() => crypto.randomUUID());
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const nodes = modal.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,select,textarea,[role=spinbutton]",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  let q = 0;
  try {
    q = quantityInBasis(amount, unit, p.basis, portion);
  } catch {}
  const automaticCalories =
    p.source === "manual" || macrosEdited || p.nutrients.kcal === null;
  const nutrients = {
    ...p.nutrients,
    kcal: automaticCalories
      ? caloriesFromMacros(p.nutrients)
      : p.nutrients.kcal,
  };
  const calculated = scale(nutrients, q);
  const labels = ar
    ? {
        kcal: "السعرات",
        protein: "البروتين",
        carbs: "الكربوهيدرات",
        fat: "الدهون",
      }
    : { kcal: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };
  return (
    <div className="modal-backdrop">
      <section
        ref={modal}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={ar ? "تسجيل طعام" : "Log food"}
      >
        <button
          className="close"
          onClick={onClose}
          aria-label={ar ? "إغلاق" : "Close"}
        >
          ×
        </button>
        <h2>{ar ? "تفاصيل الطعام" : "Food details"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              if (!q) throw Error("quantity");
              if (Object.values(nutrients).some((n) => n === null))
                throw Error("missing");
              await onSave(
                productSchema.parse({
                  ...p,
                  nutrients,
                  lastQuantity: q,
                  portion,
                  ...(macrosEdited && p.source !== "manual"
                    ? {
                        original: p.original ?? {
                          source: p.source,
                          nutrients: product?.nutrients,
                        },
                        source: "manual",
                      }
                    : {}),
                }),
                q,
                operationId,
                selectedMeal,
              );
              onClose();
            } catch {
              setError(
                ar
                  ? "أكمل القيم والكمية. الوحدات المنزلية تحتاج وزنًا أو حجمًا محددًا."
                  : "Complete all values and quantity. Household units need a specific weight or volume.",
              );
              setBusy(false);
            }
          }}
        >
          <label>
            {ar ? "الوجبة" : "Meal"}
            <select
              value={selectedMeal}
              onChange={(e) =>
                setSelectedMeal(e.target.value as typeof selectedMeal)
              }
            >
              <option value="breakfast">{ar ? "الفطور" : "Breakfast"}</option>
              <option value="lunch">{ar ? "الغداء" : "Lunch"}</option>
              <option value="dinner">{ar ? "العشاء" : "Dinner"}</option>
            </select>
          </label>
          <label>
            {ar ? "اسم الطعام" : "Food name"}
            <input
              autoFocus
              value={p.name}
              onChange={(e) => setP({ ...p, name: e.target.value })}
              required
              maxLength={200}
            />
          </label>
          <div className="macro-energy" aria-live="polite" aria-atomic="true">
            <div className="macro-energy-heading">
              <span>
                {ar
                  ? "السعرات لكل 100 " + p.basis
                  : "Calories per 100 " + p.basis}
              </span>
              {p.source !== "manual" && <small>{p.source}</small>}
            </div>
            <output
              aria-label={ar ? "السعرات المحسوبة" : "Calculated calories"}
            >
              {nutrients.kcal === null
                ? "—"
                : Math.round(nutrients.kcal * 10) / 10}{" "}
              <small>kcal</small>
            </output>
            <p className="muted">
              {automaticCalories
                ? ar
                  ? "البروتين × 4 + الكربوهيدرات × 4 + الدهون × 9. تُحدّث السعرات تلقائيًا."
                  : "Protein × 4 + carbs × 4 + fat × 9. Calories update automatically."
                : ar
                  ? "السعرات من مصدر المنتج. عند تعديل الماكروز تُحسب تلقائيًا بمعادلة 4/4/9؛ قد تختلف عن الملصق بسبب الألياف والتقريب."
                  : "Calories from the product source. Editing macros recalculates with 4/4/9; fiber and rounding can differ from the label."}
            </p>
          </div>
          <button
            type="button"
            className="macro-edit-toggle"
            aria-expanded={showMacroEditor}
            onClick={() => setShowMacroEditor((visible) => !visible)}
          >
            {showMacroEditor
              ? ar ? "إخفاء تعديل الماكروز" : "Hide macro editor"
              : ar ? "تعديل الماكروز" : "Edit macros"}
          </button>
          {showMacroEditor && (
            <div className="grid2 macro-editor-fields">
              {(["protein", "carbs", "fat"] as const).map((k) => (
                <label key={k}>
                  {labels[k]}
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="any"
                    required
                    value={p.nutrients[k] ?? ""}
                    placeholder={ar ? "غير متوفر" : "Missing"}
                    onChange={(e) => {
                      setMacrosEdited(true);
                      setP({
                        ...p,
                        nutrients: {
                          ...p.nutrients,
                          [k]: e.target.value === "" ? null : Number(e.target.value),
                        },
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="quantity-controls">
            <div className="quantity-wheel-wrap">
              <span className="quantity-label">{ar ? "الكمية" : "Quantity"}</span>
              <PercentWheel
                label={ar ? "الكمية" : "Quantity"}
                value={amount}
                min={1}
                max={100000}
                step={1}
                suffix={` ${unit}`}
                orientation="horizontal"
                onChange={setAmount}
              />
            </div>
            <label>
              {ar ? "الوحدة" : "Unit"}
              <select
                value={unit}
                onChange={(e) => {
                  const nextUnit = e.target.value as Unit;
                  setUnit(nextUnit);
                  setPortion(null);
                  if (p.source === "manual" && ["g", "kg", "oz"].includes(nextUnit))
                    setP({ ...p, basis: "g" });
                  else if (p.source === "manual" && ["ml", "L"].includes(nextUnit))
                    setP({ ...p, basis: "ml" });
                }}
              >
                {[
                  "g",
                  "kg",
                  "ml",
                  "L",
                  "oz",
                  "serving",
                  "piece",
                  "cup",
                  "tbsp",
                  "tsp",
                ].map((u) => (
                  <option key={u} value={u}>
                    {ar
                      ? ((
                          {
                            serving: "الحصة",
                            piece: "القطعة",
                            cup: "الكوب",
                            tbsp: "ملعقة كبيرة",
                            tsp: "ملعقة صغيرة",
                          } as Record<string, string>
                        )[u] ?? u)
                      : u}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!["g", "kg", "ml", "L", "oz"].includes(unit) && (
            <label>
              {ar
                ? `وزن/حجم ${unit} بـ ${p.basis}`
                : `One ${unit} in ${p.basis}`}
              <input
                type="number"
                min="0.01"
                step="any"
                value={portion ?? ""}
                onChange={(e) => setPortion(Number(e.target.value))}
              />
            </label>
          )}
          <div className="preview">
            {Object.entries(calculated).map(([k, v]) => (
              <span key={k}>
                {labels[k as keyof typeof labels]}{" "}
                <strong>{v === null ? "—" : Math.round(v * 10) / 10}</strong>
              </span>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy || !q} className="primary full">
            {ar ? "تأكيد وتسجيل" : "Confirm & log"}
          </button>
        </form>
      </section>
    </div>
  );
}
