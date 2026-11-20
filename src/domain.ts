import { z } from "zod";
export const nutrientsSchema = z.object({
  kcal: z.number().min(0).max(100000).nullable(),
  protein: z.number().min(0).max(10000).nullable(),
  carbs: z.number().min(0).max(10000).nullable(),
  fat: z.number().min(0).max(10000).nullable(),
});
export type Nutrients = z.infer<typeof nutrientsSchema>;
export function caloriesFromMacros(
  n: Pick<Nutrients, "protein" | "carbs" | "fat">,
): number | null {
  if (Object.values(n).some((v) => v === null || !Number.isFinite(v) || v < 0))
    return null;
  return n.protein! * 4 + n.carbs! * 4 + n.fat! * 9;
}
export const productSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  basis: z.enum(["g", "ml"]),
  nutrients: nutrientsSchema,
  source: z.string().max(100),
  barcode: z.string().max(30).optional(),
  favorite: z.boolean().default(false),
  lastQuantity: z.number().positive().max(100000).default(100),
  portion: z.number().positive().nullable().default(null),
  original: z.unknown().optional(),
});
export type Product = z.infer<typeof productSchema>;
export const entrySchema = z.object({
  id: z.string().min(1).max(128),
  product: productSchema,
  quantity: z.number().positive().max(100000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number(),
  deleted: z.boolean().default(false),
});
export type Entry = z.infer<typeof entrySchema>;
export type Unit =
  "g" | "kg" | "ml" | "L" | "oz" | "serving" | "piece" | "cup" | "tbsp" | "tsp";
export function quantityInBasis(
  amount: number,
  unit: Unit,
  basis: "g" | "ml",
  portion: number | null = null,
  density?: number,
) {
  if (!Number.isFinite(amount) || amount <= 0) throw Error("quantity");
  const units = {
    g: ["g", 1],
    kg: ["g", 1000],
    oz: ["g", 28.349523125],
    ml: ["ml", 1],
    L: ["ml", 1000],
  } as const;
  if (!(unit in units)) {
    if (!portion || portion <= 0) throw Error("portion");
    return amount * portion;
  }
  const [dimension, factor] = units[unit as keyof typeof units];
  let value = amount * factor;
  if (dimension !== basis) {
    if (!density || density <= 0) throw Error("density");
    value = dimension === "ml" ? value * density : value / density;
  }
  return value;
}
export function scale(n: Nutrients, quantity: number): Nutrients {
  return Object.fromEntries(
    Object.entries(n).map(([k, v]) => [
      k,
      v === null ? null : (v * quantity) / 100,
    ]),
  ) as Nutrients;
}
export function normalize(
  n: Nutrients,
  basis: "100g" | "100ml" | "serving",
  servingSize: number | null,
  unit: "g" | "ml" | null,
) {
  if (basis === "100g" || basis === "100ml")
    return {
      basis: basis === "100g" ? ("g" as const) : ("ml" as const),
      nutrients: n,
    };
  if (!servingSize || !unit) throw Error("serving");
  return { basis: unit, nutrients: scale(n, 10000 / servingSize) };
}
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const emptyNutrients = (): Nutrients => ({
  kcal: null,
  protein: null,
  carbs: null,
  fat: null,
});
export const labelSchema = z.object({
  name: z.string().max(200),
  basis: z.enum(["100g", "100ml", "serving"]),
  servingSize: z.number().positive().nullable(),
  servingUnit: z.enum(["g", "ml"]).nullable(),
  servings: z.number().positive().nullable(),
  energyUnit: z.enum(["kcal", "kJ"]),
  nutrients: nutrientsSchema,
  fiber: z.number().nonnegative().nullable(),
  sugars: z.number().nonnegative().nullable(),
  saturatedFat: z.number().nonnegative().nullable(),
  sodiumMg: z.number().nonnegative().nullable(),
});
export const aiSchema = z.object({
  message: z.string().max(4000),
  label: labelSchema.nullable(),
  actions: z
    .array(
      z.object({
        type: z.enum(["add", "update", "delete"]),
        entryId: z.string().nullable(),
        name: z.string(),
        quantity: z.number().positive().max(100000).nullable(),
        basis: z.enum(["g", "ml"]),
        nutrients: nutrientsSchema,
        estimated: z.boolean(),
      }),
    )
    .max(20),
});
export const backupSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema).max(10000),
  products: z.array(productSchema).max(5000),
});
