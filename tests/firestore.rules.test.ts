import { beforeAll, afterAll, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
let env: RulesTestEnvironment;
describe.skipIf(!enabled)("Firestore authorization", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-makkihero",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });
  afterAll(async () => await env.cleanup());
  it("allows owner, blocks other user and anonymous", async () => {
    const product = {
      id: "p",
      name: "Food",
      brand: "Test brand",
      basis: "g",
      nutrients: { kcal: 100, protein: 1, carbs: 2, fat: 3 },
      source: "manual",
      favorite: false,
      lastQuantity: 100,
      portion: null,
    };
    await assertSucceeds(
      setDoc(
        doc(
          env.authenticatedContext("alice").firestore(),
          "users/alice/products/p",
        ),
        product,
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(env.authenticatedContext("alice").firestore(), "users/alice/entries/e1"),
        {
          id: "e1",
          product,
          quantity: 100,
          date: "2026-01-01",
          createdAt: 1,
          deleted: false,
          meal: "lunch",
        },
      ),
    );
    await assertFails(
      getDoc(
        doc(
          env.authenticatedContext("bob").firestore(),
          "users/alice/products/p",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore(), "users/alice/products/p"),
      ),
    );
    await assertFails(
      setDoc(
        doc(
          env.authenticatedContext("alice").firestore(),
          "users/bob/products/p",
        ),
        product,
      ),
    );
  });
});
