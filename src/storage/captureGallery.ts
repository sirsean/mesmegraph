/**
 * Local still captures (IndexedDB — PNG blobs are too large for localStorage).
 * Meta and blobs are split so listing does not load every image into RAM.
 * Oldest captures are removed when saving would exceed MAX_GALLERY_CAPTURES.
 */

const MAX_GALLERY_CAPTURES = 12;

const DB_NAME = "mesmegraph-gallery";
const DB_VERSION = 1;
const META_STORE = "gallery-meta";
const BLOB_STORE = "gallery-blobs";

export type GalleryCaptureMeta = {
  id: string;
  createdAt: number;
  specId: string;
  filename: string;
};

type MetaRow = GalleryCaptureMeta;
type BlobRow = { id: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Persists a copy of the capture after download/clipboard (best-effort; failures are silent for callers).
 */
export async function addCaptureToGallery(
  blob: Blob,
  meta: Pick<GalleryCaptureMeta, "specId" | "filename">,
): Promise<GalleryCaptureMeta | null> {
  try {
    const id = randomId();
    const row: MetaRow = {
      id,
      createdAt: Date.now(),
      specId: meta.specId,
      filename: meta.filename,
    };
    const database = await db();
    // Read existing rows in a readonly tx (same path as the gallery UI) so we see
    // last commit; listing inside the write tx saw an empty snapshot on some engines.
    const existing = await listGalleryMeta();
    const nDrop = Math.max(0, existing.length - (MAX_GALLERY_CAPTURES - 1));
    // When nDrop is 0, slice(-nDrop) is slice(-0) === slice(0): the whole array — do not delete.
    const idsToDrop =
      nDrop > 0 ? existing.slice(-nDrop).map((m) => m.id) : [];

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([META_STORE, BLOB_STORE], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("gallery write failed"));
      const metaStore = tx.objectStore(META_STORE);
      const blobStore = tx.objectStore(BLOB_STORE);
      for (const dropId of idsToDrop) {
        metaStore.delete(dropId);
        blobStore.delete(dropId);
      }
      metaStore.put(row);
      blobStore.put({ id, blob } satisfies BlobRow);
    });
    return row;
  } catch {
    return null;
  }
}

export async function listGalleryMeta(): Promise<GalleryCaptureMeta[]> {
  try {
    const database = await db();
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as MetaRow[]).filter(Boolean);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error ?? new Error("gallery list failed"));
    });
  } catch {
    return [];
  }
}

export async function getGalleryBlob(id: string): Promise<Blob | null> {
  try {
    const database = await db();
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(id);
      req.onsuccess = () => {
        const row = req.result as BlobRow | undefined;
        resolve(row?.blob ?? null);
      };
      req.onerror = () => reject(req.error ?? new Error("gallery get failed"));
    });
  } catch {
    return null;
  }
}

export async function deleteGalleryCapture(id: string): Promise<boolean> {
  try {
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([META_STORE, BLOB_STORE], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("gallery delete failed"));
      tx.objectStore(META_STORE).delete(id);
      tx.objectStore(BLOB_STORE).delete(id);
    });
    return true;
  } catch {
    return false;
  }
}
