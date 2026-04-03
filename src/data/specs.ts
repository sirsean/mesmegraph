export type SpecDefinition = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  preview: string;
};

export const DEFAULT_SPEC_ID = "hyp";

/** Four signature specs — deck order is display order. */
export const SPEC_LIST: readonly SpecDefinition[] = [
  {
    id: "hyp",
    code: "01",
    title: "Hyperspec",
    subtitle: "Multi-planar optics · spectral ghosting",
    preview:
      "linear-gradient(125deg, #1c2030 0%, #354560 35%, #6a8a78 70%, #c9a86c 100%)",
  },
  {
    id: "inv",
    code: "02",
    title: "Inversion",
    subtitle: "Spectral flip · channel parity",
    preview:
      "linear-gradient(145deg, #2a1818 0%, #4a3038 40%, #8b5a62 100%)",
  },
  {
    id: "gl",
    code: "03",
    title: "Glitch slit",
    subtitle: "Buffer tear · RGB shear",
    preview:
      "repeating-linear-gradient(90deg, #1a1a22 0px, #1a1a22 3px, #3a2a40 3px, #3a2a40 6px)",
  },
  {
    id: "heat",
    code: "04",
    title: "False heat",
    subtitle: "Planar temperature map",
    preview:
      "linear-gradient(135deg, #1a1030 0%, #602050 45%, #c08040 85%, #e8d060 100%)",
  },
] as const;

const SPEC_BY_ID = new Map(SPEC_LIST.map((s) => [s.id, s]));

export function getSpecById(id: string | undefined): SpecDefinition | undefined {
  if (!id) return undefined;
  return SPEC_BY_ID.get(id);
}

export function isValidSpecId(id: string): boolean {
  return SPEC_BY_ID.has(id);
}
