import { describe, it, expect, vi } from "vitest";
import {
  quantityInBasis,
  scale,
  normalize,
  labelSchema,
  aiSchema,
  backupSchema,
  caloriesFromMacros,
} from "../src/domain";
import { parseOFF, lookup } from "../src/products";
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
