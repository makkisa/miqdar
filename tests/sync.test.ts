import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDocFromServer,
  disableNetwork,
  enableNetwork,
  waitForPendingWrites,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
let env: RulesTestEnvironment;
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "offline and conflicts with real emulator",
  () => {
    beforeAll(async () => {
      env = await initializeTestEnvironment({
        projectId: "demo-makkihero-sync",
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
      });
    });
    afterAll(async () => env.cleanup());
    it("replays same document once and uses last write on reconnect", async () => {
      const a = env.authenticatedContext("u").firestore();
      const b = env.authenticatedContext("u").firestore();
      const path = "users/u/products/p";
      const p = {
        id: "p",
        name: "Initial",
        basis: "g",
        nutrients: { kcal: 100, protein: 2, carbs: 3, fat: 4 },
        source: "manual",
        favorite: false,
        lastQuantity: 100,
        portion: null,
      };
      await setDoc(doc(a, path), p);
      await disableNetwork(a);
      const pending = setDoc(doc(a, path), { ...p, name: "Offline edit" });
      await setDoc(doc(b, path), { ...p, name: "Online edit" });
      await enableNetwork(a);
      await pending;
      await waitForPendingWrites(a);
      expect((await getDocFromServer(doc(b, path))).data()?.name).toBe(
        "Offline edit",
      );
      await setDoc(doc(a, path), { ...p, name: "Offline edit" });
      expect((await getDocFromServer(doc(b, path))).data()?.id).toBe("p");
    }, 20000);
  },
);
