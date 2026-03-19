export type PrintTextureStyle = {
  amount: number;
  grain: number;
  distress: number;
  fade: number;
  fabricNoise: number;
};

export const DEFAULT_PRINT_TEXTURE_STYLE: PrintTextureStyle = {
  amount: 0,
  grain: 0.55,
  distress: 0.38,
  fade: 0.24,
  fabricNoise: 0.42,
};

const clampUnit = (value: number, fallback: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : fallback));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const sanitizePrintTextureStyle = (value: unknown): PrintTextureStyle => {
  const source = isRecord(value) ? value : {};
  return {
    amount: clampUnit(typeof source.amount === "number" ? source.amount : NaN, DEFAULT_PRINT_TEXTURE_STYLE.amount),
    grain: clampUnit(typeof source.grain === "number" ? source.grain : NaN, DEFAULT_PRINT_TEXTURE_STYLE.grain),
    distress: clampUnit(
      typeof source.distress === "number" ? source.distress : NaN,
      DEFAULT_PRINT_TEXTURE_STYLE.distress
    ),
    fade: clampUnit(typeof source.fade === "number" ? source.fade : NaN, DEFAULT_PRINT_TEXTURE_STYLE.fade),
    fabricNoise: clampUnit(
      typeof source.fabricNoise === "number" ? source.fabricNoise : NaN,
      DEFAULT_PRINT_TEXTURE_STYLE.fabricNoise
    ),
  };
};

export const serializePrintTextureStyle = (value: PrintTextureStyle | null | undefined) =>
  JSON.stringify(sanitizePrintTextureStyle(value));

export const isPrintTextureDisabled = (value: PrintTextureStyle | null | undefined) => {
  const normalized = sanitizePrintTextureStyle(value);
  return (
    normalized.amount <= 0.001 ||
    (normalized.grain <= 0.001 &&
      normalized.distress <= 0.001 &&
      normalized.fade <= 0.001 &&
      normalized.fabricNoise <= 0.001)
  );
};

export const resolvePrintTextureStrengths = (value: PrintTextureStyle | null | undefined) => {
  const normalized = sanitizePrintTextureStyle(value);
  const amount = normalized.amount;
  return {
    amount,
    grain: normalized.grain * amount,
    distress: normalized.distress * amount,
    fade: normalized.fade * amount,
    fabricNoise: normalized.fabricNoise * amount,
  };
};
