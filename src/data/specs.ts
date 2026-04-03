export type SpecDefinition = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  preview: string;
};

export const DEFAULT_SPEC_ID = "hyp";

/** Six signature specs — deck order is display order. */
export const SPEC_LIST: readonly SpecDefinition[] = [
  {
    id: "hyp",
    code: "01",
    title: "Hyperspec",
    subtitle: "Multi-planar optics · spectral ghosting",
    preview:
      "linear-gradient(125deg, #1a1428 0%, #4a2068 32%, #2d8f7a 58%, #e8c547 100%)",
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
      "linear-gradient(135deg, #0a2820 0%, #2d6b5a 38%, #e8c547 72%, #e85a8c 100%)",
  },
  {
    id: "lut",
    code: "05",
    title: "LUT grade",
    subtitle: "3D cube · trilinear remap",
    preview:
      "linear-gradient(118deg, #2a1810 0%, #6b3a22 32%, #b87333 58%, #d4a574 100%)",
  },
  {
    id: "kale",
    code: "06",
    title: "Prismatic lattice",
    subtitle: "Voronoi panes · luma-chased hues",
    preview:
      "conic-gradient(from 45deg at 50% 50%, #4a2068 0deg, #2d8f7a 72deg, #e8c547 144deg, #e85a8c 216deg, #3d8f7a 288deg, #4a2068 360deg)",
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
