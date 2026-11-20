import { emptyNutrients, type Product } from "./domain";
export function parseOFF(p: Record<string, any>): Product {
  const n = p.nutriments ?? {};
  const value = (key: string) =>
    typeof n[key] === "number" && Number.isFinite(n[key]) && n[key] >= 0
      ? n[key]
      : null;
  return {
    id: `off-${p.code}`,
    barcode: String(p.code),
    name: p.product_name_ar || p.product_name || p.brands || String(p.code),
    basis: /\bml\b/i.test(p.nutrition_data_per || p.serving_size || "")
      ? "ml"
      : "g",
    nutrients: {
      ...emptyNutrients(),
      kcal:
        value("energy-kcal_100g") ??
        (value("energy_100g") === null ? null : value("energy_100g")! / 4.184),
      protein: value("proteins_100g"),
      carbs: value("carbohydrates_100g"),
      fat: value("fat_100g"),
    },
    source: "Open Food Facts",
    favorite: false,
    lastQuantity: 100,
    portion: null,
  };
}
export async function lookup(code: string, signal?: AbortSignal) {
  if (!/^\d{8,14}$/.test(code)) throw Error("barcode");
  performance.mark("product-start");
  const r = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
    { signal },
  );
  if (!r.ok) throw Error("network");
  const j = await r.json();
  performance.measure("product-lookup", "product-start");
  return j.status === 1 ? parseOFF(j.product) : null;
}
export async function searchOFF(text: string, signal: AbortSignal) {
  const r = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(text)}&search_simple=1&action=process&json=1&page_size=10`,
    { signal },
  );
  if (!r.ok) throw Error("network");
  const j = await r.json();
  return (j.products ?? []).map(parseOFF) as Product[];
}
