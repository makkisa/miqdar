import { describe, it, expect, vi } from "vitest";
import {
  quantityInBasis,
  scale,
  normalize,
  labelSchema,
  aiSchema,
  backupSchema,
  caloriesFromMacros,
  emptyNutrients,
} from "../src/domain";
import { parseFDC, parseOFF, lookup, searchFoods, searchOFF } from "../src/products";
const n = { kcal: 200, protein: 10, carbs: 20, fat: 5 };
describe("nutrition", () => {
  it("calculates energy from macros with 4/4/9 factors", () => {
    expect(caloriesFromMacros({ protein: 1, carbs: 0, fat: 0 })).toBe(4);
    expect(caloriesFromMacros({ protein: 0, carbs: 1, fat: 0 })).toBe(4);
    expect(caloriesFromMacros({ protein: 0, carbs: 0, fat: 1 })).toBe(9);
    expect(caloriesFromMacros({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
    expect(caloriesFromMacros({ protein: 1.5, carbs: 2.25, fat: 0.5 })).toBe(
      19.5,
    );
    expect(caloriesFromMacros({ protein: null, carbs: 0, fat: 0 })).toBeNull();
  });
  it("ignores a missing source-calorie field when all macros are available", () => {
    expect(caloriesFromMacros({ ...emptyNutrients(), protein: 1, carbs: 2, fat: 1 })).toBe(21);
  });
  it("scales quantities", () =>
    expect(scale(n, 150)).toEqual({
      kcal: 300,
      protein: 15,
      carbs: 30,
      fat: 7.5,
    }));
  it("converts kg, L, oz", () => {
    expect(quantityInBasis(0.2, "kg", "g")).toBe(200);
    expect(quantityInBasis(0.5, "L", "ml")).toBe(500);
    expect(quantityInBasis(1, "oz", "g")).toBeCloseTo(28.3495);
  });
  it("never assumes density", () => {
    expect(() => quantityInBasis(100, "ml", "g")).toThrow("density");
    expect(quantityInBasis(100, "ml", "g", null, 1.2)).toBe(120);
  });
  it("requires product household measure", () => {
    expect(() => quantityInBasis(2, "piece", "g")).toThrow("portion");
    expect(quantityInBasis(2, "piece", "g", 50)).toBe(100);
  });
  it("normalizes a 40g serving", () =>
    expect(normalize(n, "serving", 40, "g").nutrients.kcal).toBe(500));
  it("refuses unknown serving weight", () =>
    expect(() => normalize(n, "serving", null, null)).toThrow());
  it("preserves ml basis", () =>
    expect(normalize(n, "100ml", null, null).basis).toBe("ml"));
  it("preserves missing values", () =>
    expect(scale({ ...n, protein: null }, 100).protein).toBeNull());
  it("rejects invalid Gemini output", () => {
    expect(
      aiSchema.safeParse({
        message: "x",
        actions: [{ type: "drop_database" }],
        label: null,
      }).success,
    ).toBe(false);
    expect(labelSchema.safeParse({ name: "invented" }).success).toBe(false);
  });
  it("rejects malformed backup", () =>
    expect(
      backupSchema.safeParse({ version: 1, entries: [{}], products: [] })
        .success,
    ).toBe(false));
  it("does not replace missing OFF macros with zero", () => {
    const p = parseOFF({
      code: "12345678",
      product_name: "Food",
      nutriments: { "energy-kcal_100g": 200 },
    });
    expect(p.nutrients.protein).toBeNull();
    expect(p.nutrients.kcal).toBe(200);
  });
  it("parses OFF nutrient numbers returned as strings", () => {
    const p = parseOFF({
      code: "12345678",
      product_name: "Oat milk",
      brands: "North Farm",
      nutrition_data_per: "100ml",
      nutriments: {
        "energy-kcal_100ml": "46",
        proteins_100ml: "1.2",
        carbohydrates_100ml: "6.8",
        fat_100ml: "1.5",
      },
    });
    expect(p.name).toBe("Oat milk");
    expect(p.brand).toBe("North Farm");
    expect(p.basis).toBe("ml");
    expect(p.nutrients).toMatchObject({ kcal: 46, protein: 1.2, carbs: 6.8, fat: 1.5 });
  });
  it("derives calories from complete OFF macros when energy is absent", () => {
    const p = parseOFF({
      code: "22345678",
      product_name: "Yogurt",
      nutriments: {
        proteins_100g: "10",
        carbohydrates_100g: "5",
        fat_100g: "2",
      },
    });
    expect(p.nutrients.kcal).toBe(78);
  });
  it("infers milliliter basis from ml-only nutrient values", () => {
    const p = parseOFF({
      code: "32345678",
      product_name: "Drink",
      nutriments: {
        proteins_100ml: "1",
        carbohydrates_100ml: "3",
        fat_100ml: "0",
      },
    });
    expect(p.basis).toBe("ml");
  });
  it("maps complete USDA macro and energy values", () => {
    const p = parseFDC({
      fdcId: 101,
      description: "Raw oats",
      foodNutrients: [
        { nutrientId: 1062, nutrientName: "Energy", unitName: "kJ", value: 1628 },
        { nutrientId: 1008, nutrientName: "Energy", unitName: "KCAL", value: 389 },
        { nutrientId: 1003, value: 16.9 },
        { nutrientId: 1005, value: 66.3 },
        { nutrientId: 1004, value: 6.9 },
      ],
    });
    expect(p.source).toBe("USDA FoodData Central");
    expect(p.nutrients).toMatchObject({ kcal: 389, protein: 16.9, carbs: 66.3, fat: 6.9 });
  });
  it("does not mistake USDA kilojoules for kilocalories", () => {
    const p = parseFDC({
      fdcId: 104,
      description: "Bananas, raw",
      foodNutrients: [
        { nutrientId: 1062, nutrientName: "Energy", unitName: "kJ", value: 371 },
        { nutrientId: 1008, nutrientName: "Energy", unitName: "KCAL", value: 89 },
        { nutrientId: 1003, value: 1.09 },
        { nutrientId: 1005, value: 22.8 },
        { nutrientId: 1004, value: 0.33 },
      ],
    });
    expect(p.nutrients.kcal).toBe(89);
  });
  it("keeps USDA branded nutrients on the API's per-100 basis", () => {
    const p = parseFDC({
      fdcId: 103,
      dataType: "Branded",
      description: "Banana product",
      servingSize: 32,
      servingSizeUnit: "g",
      foodNutrients: [
        { nutrientId: 1008, value: 312 },
        { nutrientId: 1003, value: 12.5 },
        { nutrientId: 1005, value: 40.6 },
        { nutrientId: 1004, value: 6.25 },
      ],
    });
    expect(p.basis).toBe("g");
    expect(p.nutrients).toMatchObject({
      kcal: 312,
      protein: 12.5,
      carbs: 40.6,
      fat: 6.25,
    });
  });
  it("uses USDA as a cached fallback only after OFF has no complete match", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ products: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            foods: [
              {
                fdcId: 102,
                description: "Raw oats",
                foodNutrients: [
                  { nutrientId: 1008, value: 389 },
                  { nutrientId: 1003, value: 16.9 },
                  { nutrientId: 1005, value: 66.3 },
                  { nutrientId: 1004, value: 6.9 },
                ],
              },
            ],
          }),
        }),
    );
    const results = await searchFoods("raw oats fallback", new AbortController().signal);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Raw oats");
    expect(results[0].source).toBe("USDA FoodData Central");
    vi.unstubAllGlobals();
  });
  it("filters unrelated and incomplete OFF search results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [
            {
              code: "1",
              product_name: "Oat milk unsweetened",
              nutriments: {
                proteins_100g: "1",
                carbohydrates_100g: "6",
                fat_100g: "2",
              },
            },
            {
              code: "2",
              product_name: "Oat milk missing values",
              nutriments: { proteins_100g: "1" },
            },
            {
              code: "3",
              product_name: "Apple juice",
              nutriments: {
                proteins_100g: "1",
                carbohydrates_100g: "6",
                fat_100g: "2",
              },
            },
          ],
        }),
      }),
    );
    const results = await searchOFF("oat milk", new AbortController().signal);
    expect(results.map((p) => p.name)).toEqual(["Oat milk unsweetened"]);
    vi.unstubAllGlobals();
  });
  it("handles unknown barcodes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ status: 0 }) }),
    );
    expect(await lookup("12345678")).toBeNull();
    vi.unstubAllGlobals();
  });
});
