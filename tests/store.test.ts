import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.mock("../src/firebase", () => ({ cloud: null }));
import { save, subscribe, type Data } from "../src/store";
import type { Entry } from "../src/domain";
const entry: Entry = {
  id: "fixed-operation-id",
  date: "2026-11-20",
  createdAt: 1,
  deleted: false,
  meal: "lunch",
  quantity: 100,
  product: {
    id: "p",
    name: "Food",
    basis: "g",
    source: "manual",
    nutrients: { kcal: 100, protein: 2, carbs: 3, fat: 4 },
    favorite: false,
    portion: null,
    lastQuantity: 100,
  },
};
it("retries overwrite stable IDs, persists edits and tombstones", async () => {
  const error = vi.fn();
  let state: Data | undefined;
  const stop = subscribe(
    null,
    (s) => {
      state = s;
    },
    error,
  );
  await save(null, "entries", entry, error);
  await save(null, "entries", entry, error);
  await vi.waitFor(() => expect(state?.entries).toHaveLength(1));
  await save(null, "entries", { ...entry, quantity: 250 }, error);
  await vi.waitFor(() => expect(state?.entries[0].quantity).toBe(250));
  await save(null, "entries", { ...entry, deleted: true }, error);
  await vi.waitFor(() => expect(state?.entries[0].deleted).toBe(true));
  expect(error).not.toHaveBeenCalled();
  stop();
});
it("persists multiple distinct entries and omits undefined optional fields", async () => {
  const error = vi.fn();
  let state: Data | undefined;
  const stop = subscribe(null, (s) => (state = s), error);
  await save(null, "entries", {
    ...entry,
    id: "second-operation-id",
    product: { ...entry.product, id: "branded-food", brand: undefined },
  }, error);
  await vi.waitFor(() => expect(state?.entries.some((item) => item.id === "second-operation-id")).toBe(true));
  expect(state?.entries.some((item) => item.id === "fixed-operation-id")).toBe(true);
  const second = state?.entries.find((item) => item.id === "second-operation-id");
  expect(second).toBeDefined();
  expect(Object.hasOwn(second!.product, "brand")).toBe(false);
  expect(error).not.toHaveBeenCalled();
  stop();
});
