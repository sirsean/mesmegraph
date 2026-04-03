const STORAGE_KEY = "mesmegraph-edge-trace-strength";

const DEFAULT_STRENGTH = 1;

export function readEdgeTraceStrength(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return DEFAULT_STRENGTH;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return DEFAULT_STRENGTH;
    return Math.min(1, Math.max(0, n));
  } catch {
    return DEFAULT_STRENGTH;
  }
}

export function writeEdgeTraceStrength(value: number): void {
  const v = Math.min(1, Math.max(0, value));
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* private mode / quota */
  }
}
