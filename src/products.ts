import { emptyNutrients, type Product } from "./domain";

type FoodCandidate = Product & { searchScore?: number };
type SearchCache = { expiresAt: number; products: Product[] };
const searchCache = new Map<string, SearchCache>();
const CACHE_TTL = 12 * 60 * 60 * 1000;
const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_ar",
  "brands",
  "nutrition_data_per",
  "serving_size",
  "nutriments",
].join(",");

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value: string) {
  return normalized(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function relevance(query: string, p: Product) {
  const wanted = tokens(query);
  if (!wanted.length) return 0;
  const haystack = normalized(`${p.name} ${p.brand ?? ""}`);
  const matched = wanted.filter((word) => haystack.includes(word)).length;
  return matched / wanted.length;
}

function hasMacros(p: Product) {
  return (
    p.nutrients.protein !== null &&
    p.nutrients.carbs !== null &&
    p.nutrients.fat !== null
  );
}

export function parseOFF(p: Record<string, unknown>): Product {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const value = (key: string) => numeric(n[key]);
  const code = String(p.code ?? "");
  const baseName = String(p.product_name_ar || p.product_name || "").trim();
  const protein = value("proteins_100g") ?? value("proteins_100ml");
  const carbs = value("carbohydrates_100g") ?? value("carbohydrates_100ml");
  const fat = value("fat_100g") ?? value("fat_100ml");
  const energy =
    value("energy-kcal_100g") ??
    value("energy-kcal_100ml") ??
    (value("energy_100g") === null
      ? value("energy_100ml") === null
        ? null
        : value("energy_100ml")! / 4.184
      : value("energy_100g")! / 4.184);
  const hasGramMacros = [
    value("proteins_100g"),
    value("carbohydrates_100g"),
    value("fat_100g"),
  ].some((item) => item !== null);
  const hasMlMacros = [
    value("proteins_100ml"),
    value("carbohydrates_100ml"),
    value("fat_100ml"),
  ].some((item) => item !== null);
  const basis = /100\s*ml/i.test(String(p.nutrition_data_per ?? ""))
    ? "ml"
    : !hasGramMacros && hasMlMacros
      ? "ml"
      : "g";
  return {
    id: `off-${code || crypto.randomUUID()}`,
    barcode: code || undefined,
    name: baseName || String(p.brands || code || "Open Food Facts product"),
    brand: String(p.brands || "").trim() || undefined,
    basis,
    nutrients: {
      ...emptyNutrients(),
      kcal: energy ?? (protein !== null && carbs !== null && fat !== null
        ? protein * 4 + carbs * 4 + fat * 9
        : null),
      protein,
      carbs,
      fat,
    },
    source: "Open Food Facts",
    favorite: false,
    lastQuantity: 100,
    portion: null,
  };
}

type FdcNutrient = {
  nutrientId?: number;
  nutrientNumber?: string;
  number?: string;
  nutrientName?: string;
  name?: string;
  value?: number;
  amount?: number;
  unitName?: string;
};

export function parseFDC(food: Record<string, unknown>): Product {
  const nutrients = Array.isArray(food.foodNutrients)
    ? (food.foodNutrients as FdcNutrient[])
    : [];
  const find = (id: number, name: RegExp) => {
    const item = nutrients.find(
      (n) =>
        n.nutrientId === id ||
        n.nutrientNumber === String(id) ||
        n.number === String(id) ||
        name.test(n.nutrientName ?? n.name ?? ""),
    );
    return numeric(item?.value ?? item?.amount);
  };
  const energyKcal = find(1008, /energy/i);
  const energyKj = find(1062, /energy.*kj/i);
  const protein = find(1003, /protein/i);
  const carbs = find(1005, /carbohydrate/i);
  const fat = find(1004, /total lipid|total fat/i);
  const kcal = energyKcal ?? (energyKj === null ? null : energyKj / 4.184);
  const id = String(food.fdcId ?? "");
  const name = String(food.description ?? "").trim();
  return {
    id: `fdc-${id || crypto.randomUUID()}`,
    name: name || "FoodData Central item",
    brand: String(food.brandOwner ?? food.brandName ?? "").trim() || undefined,
    basis: "g",
    nutrients: {
      ...emptyNutrients(),
      kcal: kcal ?? (protein !== null && carbs !== null && fat !== null
        ? protein * 4 + carbs * 4 + fat * 9
        : null),
      protein,
      carbs,
      fat,
    },
    source: "USDA FoodData Central",
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
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(candidate)}.json?fields=${OFF_FIELDS}`,
      { signal },
    );
    if (!r.ok) throw Error("network");
    const j = await r.json();
    if (j.status === 1 && j.product) {
      performance.measure("product-lookup", "product-start");
      const product = parseOFF(j.product);
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
  const query = text.trim();
  if (query.length < 2) return [];
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.search = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "30",
    fields: OFF_FIELDS,
  }).toString();
  const r = await fetch(url, { signal });
  if (!r.ok) throw Error("network");
  const j = (await r.json()) as { products?: Record<string, unknown>[] };
  const seen = new Set<string>();
  return (j.products ?? [])
    .map(parseOFF)
    .map((p) => ({ ...p, searchScore: relevance(query, p) }))
    .filter((p) => {
      if (p.searchScore < 0.5 || !hasMacros(p)) return false;
      const key = p.barcode || normalized(`${p.name} ${p.brand ?? ""}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.searchScore ?? 0) - (a.searchScore ?? 0))
    .slice(0, 8)
    .map(({ searchScore: _score, ...p }) => p);
}

async function searchUSDA(query: string, signal: AbortSignal): Promise<Product[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", "DEMO_KEY");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      dataType: ["Foundation", "SR Legacy", "Survey"],
      pageSize: 20,
    }),
    signal,
  });
  if (!response.ok) return [];
  const result = (await response.json()) as {
    foods?: Record<string, unknown>[];
  };
  return (result.foods ?? [])
    .map(parseFDC)
    .map((p) => ({ ...p, searchScore: relevance(query, p) }))
    .filter((p) => p.searchScore >= 0.5 && hasMacros(p))
    .sort((a, b) => (b.searchScore ?? 0) - (a.searchScore ?? 0))
    .slice(0, 8)
    .map(({ searchScore: _score, ...p }) => p);
}

export async function searchFoods(text: string, signal: AbortSignal) {
  const query = text.trim();
  if (query.length < 2) return [];
  const key = normalized(query);
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.products;

  let off: Product[] = [];
  try {
    off = await searchOFF(query, signal);
  } catch (error) {
    if (signal.aborted) throw error;
  }
  let products = off;
  if (off.length < 3 && !/^\d+$/.test(query)) {
    try {
      const usda = await searchUSDA(query, signal);
      const known = new Set(off.map((p) => normalized(`${p.name} ${p.brand ?? ""}`)));
      products = [...off, ...usda.filter((p) => !known.has(normalized(`${p.name} ${p.brand ?? ""}`)))];
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  const result = products.slice(0, 10);
  searchCache.set(key, { expiresAt: Date.now() + CACHE_TTL, products: result });
  if (searchCache.size > 40) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  return result;
}
