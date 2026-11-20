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
  const codes = [code];
  const upce = code.length === 8 ? expandUPCE(code) : null;
  if (upce) codes.push(upce);
  for (const candidate of codes) {
    const r = await fetch(
      `https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(candidate)}.json?fields=code,product_name,product_name_ar,brands,nutrition_data_per,serving_size,nutriments`,
      { signal },
    );
    if (!r.ok) throw Error("network");
    const j = await r.json();
    if (j.status === 1 && j.product) {
      performance.measure("product-lookup", "product-start");
      const product = parseOFF(j.product);
      // Keep the scanned code as the local cache key even if a UPC-E was expanded.
      product.barcode = code;
      return product;
    }
  }
  performance.measure("product-lookup", "product-start");
  return null;
}
function expandUPCE(value: string): string | null {
  if (!/^[01]\d{7}$/.test(value)) return null;
  const [numberSystem, ...digits] = value;
  const [a, b, c, d, e, f, check] = digits;
  let manufacturer = "";
  let item = "";
  if (f <= "2") {
    manufacturer = `${a}${b}${f}00`;
    item = `00${c}${d}${e}`;
  } else if (f === "3") {
    manufacturer = `${a}${b}${c}00`;
    item = `000${d}${e}`;
  } else if (f === "4") {
    manufacturer = `${a}${b}${c}${d}0`;
    item = `0000${e}`;
  } else {
    manufacturer = `${a}${b}${c}${d}${e}`;
    item = `0000${f}`;
  }
  const body = `${numberSystem}${manufacturer}${item}`;
  const sum = [...body].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1),
    0,
  );
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(check) ? `${body}${check}` : null;
}
export async function searchOFF(text: string, signal: AbortSignal) {
  const r = await fetch(
    `https://world.openfoodfacts.net/cgi/search.pl?search_terms=${encodeURIComponent(text)}&search_simple=1&action=process&json=1&page_size=10`,
    { signal },
  );
  if (!r.ok) throw Error("network");
  const j = await r.json();
  return (j.products ?? []).map(parseOFF) as Product[];
}
