import { describe, it, expect } from "vitest";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  signOut,
} from "firebase/auth";
describe.skipIf(!process.env.FIREBASE_AUTH_EMULATOR_HOST)(
  "Firebase session isolation",
  () => {
    it("signs in and clears the current identity on sign-out", async () => {
      const app = initializeApp(
        { apiKey: "demo-key", projectId: "demo-makkihero" },
        "auth-test",
      );
      const auth = getAuth(app);
      connectAuthEmulator(
        auth,
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
        { disableWarnings: true },
      );
      const result = await signInAnonymously(auth);
      expect(auth.currentUser?.uid).toBe(result.user.uid);
      await signOut(auth);
      expect(auth.currentUser).toBeNull();
      await deleteApp(app);
    });
  },
);
