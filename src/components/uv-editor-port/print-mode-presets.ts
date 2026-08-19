import { DEFAULT_PRINT_TEXTURE_STYLE, sanitizePrintTextureStyle } from "./print-texture";
import type { PrintTextureStyle } from "./print-texture";

export const PRINT_MODE_IDS = ["patch", "vintage", "neon", "silkscreen", "embroidery"] as const;

export type PrintModeId = (typeof PRINT_MODE_IDS)[number];

type DesignPrintModeState = {
  solidColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  printTexture: PrintTextureStyle;
  printModeId?: PrintModeId | null;
};

type TextPrintModeState = {
  color: string;
  fontSize: number;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  printTexture: PrintTextureStyle;
  printModeId?: PrintModeId | null;
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const clampUnit = (value: number, fallback: number) =>
  clampNumber(Number.isFinite(value) ? value : fallback, 0, 1);

const normalizeHex = (value: string, fallback = "#111111") => {
  const hex = typeof value === "string" ? value.replace("#", "").trim() : "";
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : hex.padEnd(6, "0").slice(0, 6);
  return `#${(normalized || fallback.replace("#", "")).toLowerCase()}`;
};

const hexToRgb = (value: string) => {
  const normalized = normalizeHex(value).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const mixHex = (base: string, target: string, weight: number) => {
  const left = hexToRgb(base);
  const right = hexToRgb(target);
  const safeWeight = clampUnit(weight, 0);
  const blend = (from: number, to: number) => Math.round(from + (to - from) * safeWeight);
  return normalizeHex(
    `#${blend(left.r, right.r).toString(16).padStart(2, "0")}${blend(left.g, right.g)
      .toString(16)
      .padStart(2, "0")}${blend(left.b, right.b).toString(16).padStart(2, "0")}`
  );
};

const createPrintTexture = (patch: Partial<PrintTextureStyle>) =>
  sanitizePrintTextureStyle({
    ...DEFAULT_PRINT_TEXTURE_STYLE,
    ...patch,
  });

export const isPrintModeId = (value: unknown): value is PrintModeId =>
  typeof value === "string" && PRINT_MODE_IDS.includes(value as PrintModeId);

export const sanitizePrintModeId = (value: unknown): PrintModeId | null =>
  isPrintModeId(value) ? value : null;

const resolveDesignAccentColor = (style: DesignPrintModeState) => {
  const strokeColor = normalizeHex(style.strokeColor, "#ffffff");
  if (style.strokeWidth > 0.05 && strokeColor !== "#ffffff") {
    return strokeColor;
  }
  const solidColor = normalizeHex(style.solidColor, "#22d3ee");
  if (solidColor === "#000000" || solidColor === "#111111" || solidColor === "#ffffff") {
    return "#22d3ee";
  }
  return solidColor;
};

const resolveTextAccentColor = (style: TextPrintModeState) => {
  const color = normalizeHex(style.color, "#22d3ee");
  if (color === "#000000" || color === "#111111" || color === "#ffffff") {
    return "#22d3ee";
  }
  return color;
};

export const applyDesignPrintModePreset = <T extends DesignPrintModeState>(style: T, modeId: PrintModeId): T => {
  const accent = resolveDesignAccentColor(style);
  switch (modeId) {
    case "patch":
      return {
        ...style,
        strokeColor: "#f8fafc",
        strokeWidth: 2.4,
        shadowColor: "#111827",
        shadowOpacity: 0.24,
        shadowBlur: 2.8,
        shadowOffsetX: 0,
        shadowOffsetY: 2.4,
        printTexture: createPrintTexture({
          amount: 0.52,
          grain: 0.16,
          distress: 0.1,
          fade: 0.04,
          fabricNoise: 0.84,
        }),
        printModeId: modeId,
      };
    case "vintage":
      return {
        ...style,
        strokeColor: "#f4e8d7",
        strokeWidth: 0.8,
        shadowColor: "#3f3023",
        shadowOpacity: 0.12,
        shadowBlur: 1.6,
        shadowOffsetX: 0,
        shadowOffsetY: 1.2,
        printTexture: createPrintTexture({
          amount: 0.9,
          grain: 0.58,
          distress: 0.76,
          fade: 0.56,
          fabricNoise: 0.42,
        }),
        printModeId: modeId,
      };
    case "neon":
      return {
        ...style,
        strokeColor: mixHex(accent, "#ffffff", 0.72),
        strokeWidth: 1.8,
        shadowColor: accent,
        shadowOpacity: 0.78,
        shadowBlur: 8.8,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        printTexture: createPrintTexture({
          amount: 0.08,
          grain: 0.14,
          distress: 0.02,
          fade: 0.02,
          fabricNoise: 0.04,
        }),
        printModeId: modeId,
      };
    case "silkscreen":
      return {
        ...style,
        strokeColor: mixHex(accent, "#ffffff", 0.24),
        strokeWidth: 0.6,
        shadowColor: "#111111",
        shadowOpacity: 0.08,
        shadowBlur: 0.8,
        shadowOffsetX: 0,
        shadowOffsetY: 0.6,
        printTexture: createPrintTexture({
          amount: 0.36,
          grain: 0.24,
          distress: 0.08,
          fade: 0.14,
          fabricNoise: 0.22,
        }),
        printModeId: modeId,
      };
    case "embroidery":
      return {
        ...style,
        strokeColor: mixHex(accent, "#ffffff", 0.54),
        strokeWidth: 1.8,
        shadowColor: mixHex(accent, "#0f1720", 0.62),
        shadowOpacity: 0.22,
        shadowBlur: 1.4,
        shadowOffsetX: 0,
        shadowOffsetY: 1,
        printTexture: createPrintTexture({
          amount: 0.82,
          grain: 0.12,
          distress: 0.04,
          fade: 0.02,
          fabricNoise: 1,
        }),
        printModeId: modeId,
      };
  }
};

export const applyTextPrintModePreset = <T extends TextPrintModeState>(style: T, modeId: PrintModeId): T => {
  const accent = resolveTextAccentColor(style);
  const safeFontSize = clampNumber(Math.round(style.fontSize), 18, 220);
  switch (modeId) {
    case "patch":
      return {
        ...style,
        strokeColor: "#f8fafc",
        strokeWidth: clampNumber(Number.parseFloat((safeFontSize * 0.075).toFixed(1)), 2, 12),
        shadowColor: "#111827",
        shadowOpacity: 0.24,
        shadowBlur: clampNumber(Number.parseFloat((safeFontSize * 0.08).toFixed(1)), 2, 14),
        shadowOffsetX: 0,
        shadowOffsetY: clampNumber(Number.parseFloat((safeFontSize * 0.04).toFixed(1)), 1, 6),
        printTexture: createPrintTexture({
          amount: 0.52,
          grain: 0.16,
          distress: 0.1,
          fade: 0.04,
          fabricNoise: 0.84,
        }),
        printModeId: modeId,
      };
    case "vintage":
      return {
        ...style,
        strokeColor: "#f1e3cf",
        strokeWidth: clampNumber(Number.parseFloat((safeFontSize * 0.02).toFixed(1)), 0.6, 4),
        shadowColor: "#3f3023",
        shadowOpacity: 0.1,
        shadowBlur: clampNumber(Number.parseFloat((safeFontSize * 0.02).toFixed(1)), 0.8, 6),
        shadowOffsetX: 0,
        shadowOffsetY: clampNumber(Number.parseFloat((safeFontSize * 0.015).toFixed(1)), 0.4, 3),
        printTexture: createPrintTexture({
          amount: 0.92,
          grain: 0.58,
          distress: 0.78,
          fade: 0.58,
          fabricNoise: 0.44,
        }),
        printModeId: modeId,
      };
    case "neon":
      return {
        ...style,
        strokeColor: mixHex(accent, "#ffffff", 0.72),
        strokeWidth: clampNumber(Number.parseFloat((safeFontSize * 0.045).toFixed(1)), 1.4, 10),
        shadowColor: accent,
        shadowOpacity: 0.84,
        shadowBlur: clampNumber(Number.parseFloat((safeFontSize * 0.18).toFixed(1)), 6, 28),
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        printTexture: createPrintTexture({
          amount: 0.08,
          grain: 0.12,
          distress: 0.02,
          fade: 0.02,
          fabricNoise: 0.04,
        }),
        printModeId: modeId,
      };
    case "silkscreen":
      return {
        ...style,
        strokeColor: mixHex(accent, "#ffffff", 0.18),
        strokeWidth: clampNumber(Number.parseFloat((safeFontSize * 0.016).toFixed(1)), 0.4, 3),
        shadowColor: "#111111",
        shadowOpacity: 0.08,
        shadowBlur: clampNumber(Number.parseFloat((safeFontSize * 0.01).toFixed(1)), 0.4, 2),
        shadowOffsetX: 0,
        shadowOffsetY: clampNumber(Number.parseFloat((safeFontSize * 0.01).toFixed(1)), 0.2, 1.4),
        printTexture: createPrintTexture({
          amount: 0.38,
          grain: 0.24,
          distress: 0.08,
          fade: 0.12,
          fabricNoise: 0.24,
        }),
        printModeId: modeId,
      };
    case "embroidery":
      return {
        ...style,
        strokeColor: mixHex(accent, "#ffffff", 0.48),
        strokeWidth: clampNumber(Number.parseFloat((safeFontSize * 0.055).toFixed(1)), 1.4, 10),
        shadowColor: mixHex(accent, "#111827", 0.56),
        shadowOpacity: 0.22,
        shadowBlur: clampNumber(Number.parseFloat((safeFontSize * 0.045).toFixed(1)), 1.4, 8),
        shadowOffsetX: 0,
        shadowOffsetY: clampNumber(Number.parseFloat((safeFontSize * 0.02).toFixed(1)), 0.6, 4),
        printTexture: createPrintTexture({
          amount: 0.84,
          grain: 0.1,
          distress: 0.02,
          fade: 0.02,
          fabricNoise: 1,
        }),
        printModeId: modeId,
      };
  }
};
