import { DEFAULT_SPEC_ID, isValidSpecId } from "../data/specs";

const STORAGE_KEY = "mesmegraph-selected-spec";

export function readSelectedSpecId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isValidSpecId(raw)) return raw;
  } catch {
    /* private mode / disabled */
  }
  return DEFAULT_SPEC_ID;
}

export function writeSelectedSpecId(id: string): void {
  if (!isValidSpecId(id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
