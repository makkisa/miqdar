import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserLocalPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
const e = import.meta.env;
export const configured = !!(
  e.VITE_FIREBASE_API_KEY &&
  e.VITE_FIREBASE_PROJECT_ID &&
  e.VITE_FIREBASE_APP_ID &&
  e.VITE_FIREBASE_AUTH_DOMAIN
);
export const app = configured
  ? initializeApp({
      apiKey: e.VITE_FIREBASE_API_KEY,
      projectId: e.VITE_FIREBASE_PROJECT_ID,
      appId: e.VITE_FIREBASE_APP_ID,
      authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    })
  : null;
export const auth = app
  ? initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null;
export const cloud = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: false }),
      }),
    })
  : null;
export const appCheck =
  app && e.VITE_APP_CHECK_SITE_KEY
    ? initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(e.VITE_APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      })
    : null;
export async function login() {
  if (!auth) throw Error("Firebase setup required");
  const provider = new GoogleAuthProvider();
  // Safari blocks cross-origin redirect storage. Use redirect only when the
  // auth helper is served on this origin; popup starts within the user gesture.
  if (
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    location.host === e.VITE_FIREBASE_AUTH_DOMAIN
  )
    await signInWithRedirect(auth, provider);
  else await signInWithPopup(auth, provider);
}
export async function redirectResult() {
  if (auth) await getRedirectResult(auth);
}
