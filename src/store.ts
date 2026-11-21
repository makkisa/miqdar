import { openDB } from "idb";
import { collection, onSnapshot, setDoc, doc } from "firebase/firestore";
import { cloud } from "./firebase";
import { entrySchema, productSchema, type Entry, type Product } from "./domain";
const db = openDB("makkihero-guest", 1, {
  upgrade(db) {
    db.createObjectStore("entries", { keyPath: "id" });
    db.createObjectStore("products", { keyPath: "id" });
  },
});
export type Data = {
  entries: Entry[];
  products: Product[];
  pending: boolean;
  cached: boolean;
};
let refreshGuest: (() => void) | undefined;
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value))
    return value.map((item) => stripUndefined(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    ) as T;
  }
  return value;
}
export function subscribe(
  uid: string | null,
  notify: (data: Data) => void,
  onError: (error: Error) => void,
) {
  let active = true;
  let state: Data = { entries: [], products: [], pending: false, cached: true };
  if (uid && cloud) {
    let entryPending = false,
      productPending = false;
    const stops = (["entries", "products"] as const).map((key) =>
      onSnapshot(
        collection(cloud!, "users", uid, key),
        { includeMetadataChanges: true },
        (snap) => {
          try {
            const values = snap.docs.map((d) =>
              (key === "entries" ? entrySchema : productSchema).parse(d.data()),
            );
            if (key === "entries") {
              state.entries = values as Entry[];
              entryPending = snap.metadata.hasPendingWrites;
            } else {
              state.products = values as Product[];
              productPending = snap.metadata.hasPendingWrites;
            }
            state = {
              ...state,
              pending: entryPending || productPending,
              cached: snap.metadata.fromCache,
            };
            notify(state);
          } catch (e) {
            onError(e as Error);
          }
        },
        onError,
      ),
    );
    return () => stops.forEach((s) => s());
  }
  const refresh = () => {
    void db
      .then(async (d) => {
        const [entries, products] = await Promise.all([
          d.getAll("entries"),
          d.getAll("products"),
        ]);
        if (active) notify({ entries, products, pending: false, cached: true });
      })
      .catch(onError);
  };
  refreshGuest = refresh;
  refresh();
  return () => {
    active = false;
    if (refreshGuest === refresh) refreshGuest = undefined;
  };
}
export async function save(
  uid: string | null,
  key: "entries" | "products",
  value: Entry | Product,
  onError: (e: Error) => void,
) {
  const valid = stripUndefined(
    (key === "entries" ? entrySchema : productSchema).parse(value),
  );
  if (uid && cloud) {
    void setDoc(doc(cloud, "users", uid, key, valid.id), valid).catch(onError);
    return;
  }
  await (await db).put(key, valid);
  refreshGuest?.();
}
