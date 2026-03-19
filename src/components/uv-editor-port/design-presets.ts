import {
  DEFAULT_PRINT_TEXTURE_STYLE,
  isPrintTextureDisabled,
  resolvePrintTextureStrengths,
  sanitizePrintTextureStyle,
  serializePrintTextureStyle,
} from "./print-texture";
import { sanitizePrintModeId } from "./print-mode-presets";
import type { PrintModeId } from "./print-mode-presets";
import type { PrintTextureStyle } from "./print-texture";

export type DesignFillMode = "solid" | "pattern" | "gradient" | "texture";

export type DesignShapePreset = {
  id: string;
  name: string;
  fileStem: string;
  defaultScale: number;
  previewSrc: string;
  renderBody: (fill: string, stroke: string) => string;
};

export type DesignPatternPreset = {
  id: string;
  name: string;
  fileStem: string;
  previewSrc: string;
  renderDefinition: (fillId: string) => string;
};

export type DesignGradientPreset = {
  id: string;
  name: string;
  fileStem: string;
  previewSrc: string;
  renderDefinition: (fillId: string) => string;
};

export type DesignStylePreset = {
  id: string;
  name: string;
  previewSrc: string;
  fillMode: DesignFillMode;
  solidColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  patternPresetId: string;
  gradientPresetId: string;
  patternControls: DesignPatternControls;
};

export type DesignPatternControls = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
  repeatX: number;
  repeatY: number;
  mirrorRepeat: boolean;
};

export type DesignTextureContentBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DesignLayerStyle = {
  fillMode: DesignFillMode;
  solidColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  textureDataUrl: string;
  textureFileName: string;
  textureWidth: number;
  textureHeight: number;
  textureAutoCenter: boolean;
  textureContentBounds: DesignTextureContentBounds;
  printTexture: PrintTextureStyle;
  printModeId: PrintModeId | null;
  shapePresetId: string;
  patternPresetId: string;
  gradientPresetId: string;
  patternControls: DesignPatternControls;
};

export type DesignLayerRequest = {
  fillMode: DesignFillMode;
  solidColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  textureDataUrl: string;
  textureFileName: string;
  textureWidth: number;
  textureHeight: number;
  textureAutoCenter: boolean;
  textureContentBounds: DesignTextureContentBounds;
  printTexture: PrintTextureStyle;
  printModeId: PrintModeId | null;
  shapePreset: DesignShapePreset;
  patternPreset: DesignPatternPreset;
  gradientPreset: DesignGradientPreset;
  patternControls: DesignPatternControls;
};

type ShapeDefinition = Omit<DesignShapePreset, "previewSrc">;
type PatternDefinition = Omit<DesignPatternPreset, "previewSrc">;
type GradientDefinition = Omit<DesignGradientPreset, "previewSrc">;
type StyleDefinition = Omit<DesignStylePreset, "previewSrc"> & {
  previewShapeId: string;
};
type GradientStop = {
  offset: string;
  color: string;
  opacity?: number;
};
type LinearGradientDefinitionInput = {
  id: string;
  name: string;
  fileStem: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  stops: readonly GradientStop[];
};
type RadialGradientDefinitionInput = {
  id: string;
  name: string;
  fileStem: string;
  cx: string;
  cy: string;
  r: string;
  fx?: string;
  fy?: string;
  stops: readonly GradientStop[];
};

export const DEFAULT_DESIGN_PATTERN_CONTROLS: DesignPatternControls = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0,
  repeatX: 1,
  repeatY: 1,
  mirrorRepeat: false,
};

export const DEFAULT_DESIGN_SHADOW_STYLE = {
  color: "#0f1720",
  opacity: 0.22,
  blur: 3.4,
  offsetX: 0,
  offsetY: 2.4,
} as const;

export const DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS: DesignTextureContentBounds = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
};

export const getDefaultDesignLayerStyle = (solidColor = "#ffb347"): DesignLayerStyle => ({
  fillMode: "solid",
  solidColor: normalizeHex(solidColor),
  strokeColor: "#ffffff",
  strokeWidth: 0,
  shadowColor: DEFAULT_DESIGN_SHADOW_STYLE.color,
  shadowOpacity: DEFAULT_DESIGN_SHADOW_STYLE.opacity,
  shadowBlur: DEFAULT_DESIGN_SHADOW_STYLE.blur,
  shadowOffsetX: DEFAULT_DESIGN_SHADOW_STYLE.offsetX,
  shadowOffsetY: DEFAULT_DESIGN_SHADOW_STYLE.offsetY,
  textureDataUrl: "",
  textureFileName: "",
  textureWidth: 1024,
  textureHeight: 1024,
  textureAutoCenter: false,
  textureContentBounds: { ...DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS },
  printTexture: { ...DEFAULT_PRINT_TEXTURE_STYLE },
  printModeId: null,
  shapePresetId: DESIGN_SHAPE_PRESETS[0]?.id || "badge",
  patternPresetId: DESIGN_PATTERN_PRESETS[0]?.id || "checker",
  gradientPresetId: DESIGN_GRADIENT_PRESETS[0]?.id || "sunset",
  patternControls: { ...DEFAULT_DESIGN_PATTERN_CONTROLS },
});

const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s{2,}/g, " ").trim())}`;

const renderGradientStops = (stops: readonly GradientStop[]) =>
  stops
    .map(
      (stop) =>
        `<stop offset="${stop.offset}" stop-color="${stop.color}"${
          typeof stop.opacity === "number" ? ` stop-opacity="${stop.opacity}"` : ""
        } />`
    )
    .join("");

const createLinearGradientDefinition = ({
  id,
  name,
  fileStem,
  x1,
  y1,
  x2,
  y2,
  stops,
}: LinearGradientDefinitionInput): GradientDefinition => ({
  id,
  name,
  fileStem,
  renderDefinition: (fillId) => `
      <linearGradient id="${fillId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
        ${renderGradientStops(stops)}
      </linearGradient>
    `,
});

const createRadialGradientDefinition = ({
  id,
  name,
  fileStem,
  cx,
  cy,
  r,
  fx,
  fy,
  stops,
}: RadialGradientDefinitionInput): GradientDefinition => ({
  id,
  name,
  fileStem,
  renderDefinition: (fillId) => `
      <radialGradient id="${fillId}" cx="${cx}" cy="${cy}" r="${r}"${
        fx ? ` fx="${fx}"` : ""
      }${fy ? ` fy="${fy}"` : ""}>
        ${renderGradientStops(stops)}
      </radialGradient>
    `,
});

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const normalizeHex = (value: string) => {
  const hex = (value || "#ffb347").replace("#", "").trim();
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : hex.padEnd(6, "0").slice(0, 6);
  return `#${normalized.toLowerCase()}`;
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
  const nextWeight = Math.max(0, Math.min(1, weight));
  return `#${[
    clampByte(left.r + (right.r - left.r) * nextWeight),
    clampByte(left.g + (right.g - left.g) * nextWeight),
    clampByte(left.b + (right.b - left.b) * nextWeight),
  ]
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("")}`;
};

const rgba = (value: string, alpha: number) => {
  const rgb = hexToRgb(value);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const safeNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const formatSvgNumber = (value: number) => {
  const normalized = Math.abs(value) < 0.0001 ? 0 : value;
  return Number.parseFloat(normalized.toFixed(4)).toString();
};

const readSvgAttribute = (value: string, name: string) => {
  const match = value.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return match ? match[1] : null;
};

const PATTERN_DEFINITION_REGEX = /^\s*<pattern\b([^>]*)>([\s\S]*?)<\/pattern>\s*$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isDesignFillMode = (value: unknown): value is DesignFillMode =>
  value === "solid" || value === "pattern" || value === "gradient" || value === "texture";

const sanitizeTextureDataUrl = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const sanitizeTextureDimension = (value: unknown, fallback: number) =>
  clampNumber(safeNumber(typeof value === "number" ? value : NaN, fallback), 1, 8192);

const sanitizeShadowColor = (value: unknown, fallback: string) =>
  normalizeHex(typeof value === "string" ? value : fallback);

const sanitizeShadowOpacity = (value: unknown, fallback: number) =>
  clampNumber(safeNumber(typeof value === "number" ? value : NaN, fallback), 0, 1);

const sanitizeShadowBlur = (value: unknown, fallback: number) =>
  clampNumber(safeNumber(typeof value === "number" ? value : NaN, fallback), 0, 20);

const sanitizeShadowOffset = (value: unknown, fallback: number) =>
  clampNumber(safeNumber(typeof value === "number" ? value : NaN, fallback), -20, 20);

const serializeTextureDataUrl = (value: string) => (value ? `${value.length}:${value.slice(0, 96)}` : "");

const sanitizeTextureContentBounds = (value: unknown): DesignTextureContentBounds => {
  const source = isRecord(value) ? value : {};
  const left = clampNumber(safeNumber(typeof source.left === "number" ? source.left : NaN, 0), 0, 1);
  const top = clampNumber(safeNumber(typeof source.top === "number" ? source.top : NaN, 0), 0, 1);
  const width = clampNumber(safeNumber(typeof source.width === "number" ? source.width : NaN, 1), 0.0001, 1);
  const height = clampNumber(safeNumber(typeof source.height === "number" ? source.height : NaN, 1), 0.0001, 1);

  return {
    left: Math.min(left, 1 - width),
    top: Math.min(top, 1 - height),
    width,
    height,
  };
};

const sanitizeDesignPatternControls = (value: unknown): DesignPatternControls => {
  const source = isRecord(value) ? value : {};
  return {
    scale: clampNumber(safeNumber(typeof source.scale === "number" ? source.scale : NaN, 1), 0.05, 20),
    offsetX: clampNumber(safeNumber(typeof source.offsetX === "number" ? source.offsetX : NaN, 0), -500, 500),
    offsetY: clampNumber(safeNumber(typeof source.offsetY === "number" ? source.offsetY : NaN, 0), -500, 500),
    rotationDeg: clampNumber(
      safeNumber(typeof source.rotationDeg === "number" ? source.rotationDeg : NaN, 0),
      -360,
      360
    ),
    repeatX: clampNumber(safeNumber(typeof source.repeatX === "number" ? source.repeatX : NaN, 1), 0.05, 20),
    repeatY: clampNumber(safeNumber(typeof source.repeatY === "number" ? source.repeatY : NaN, 1), 0.05, 20),
    mirrorRepeat: Boolean(source.mirrorRepeat),
  };
};

export const createDesignLayerStyleFromRequest = (request: DesignLayerRequest): DesignLayerStyle => ({
  fillMode: request.fillMode,
  solidColor: normalizeHex(request.solidColor),
  strokeColor: normalizeHex(request.strokeColor),
  strokeWidth: clampNumber(safeNumber(request.strokeWidth, 0), 0, 20),
  shadowColor: sanitizeShadowColor(request.shadowColor, DEFAULT_DESIGN_SHADOW_STYLE.color),
  shadowOpacity: sanitizeShadowOpacity(request.shadowOpacity, DEFAULT_DESIGN_SHADOW_STYLE.opacity),
  shadowBlur: sanitizeShadowBlur(request.shadowBlur, DEFAULT_DESIGN_SHADOW_STYLE.blur),
  shadowOffsetX: sanitizeShadowOffset(request.shadowOffsetX, DEFAULT_DESIGN_SHADOW_STYLE.offsetX),
  shadowOffsetY: sanitizeShadowOffset(request.shadowOffsetY, DEFAULT_DESIGN_SHADOW_STYLE.offsetY),
  textureDataUrl: sanitizeTextureDataUrl(request.textureDataUrl),
  textureFileName: typeof request.textureFileName === "string" ? request.textureFileName.trim() : "",
  textureWidth: sanitizeTextureDimension(request.textureWidth, 1024),
  textureHeight: sanitizeTextureDimension(request.textureHeight, 1024),
  textureAutoCenter: Boolean(request.textureAutoCenter),
  textureContentBounds: sanitizeTextureContentBounds(request.textureContentBounds),
  printTexture: sanitizePrintTextureStyle(request.printTexture),
  printModeId: sanitizePrintModeId(request.printModeId),
  shapePresetId: request.shapePreset.id,
  patternPresetId: request.patternPreset.id,
  gradientPresetId: request.gradientPreset.id,
  patternControls: sanitizeDesignPatternControls(request.patternControls),
});

export const sanitizeDesignLayerStyle = (value: unknown): DesignLayerStyle | null => {
  if (!isRecord(value) || !isDesignFillMode(value.fillMode) || typeof value.solidColor !== "string") {
    return null;
  }

  const defaultStyle = getDefaultDesignLayerStyle(value.solidColor);
  const shapePresetId =
    typeof value.shapePresetId === "string" &&
    DESIGN_SHAPE_PRESETS.some((preset) => preset.id === value.shapePresetId)
      ? value.shapePresetId
      : defaultStyle.shapePresetId;
  const patternPresetId =
    typeof value.patternPresetId === "string" &&
    DESIGN_PATTERN_PRESETS.some((preset) => preset.id === value.patternPresetId)
      ? value.patternPresetId
      : defaultStyle.patternPresetId;
  const gradientPresetId =
    typeof value.gradientPresetId === "string" &&
    DESIGN_GRADIENT_PRESETS.some((preset) => preset.id === value.gradientPresetId)
      ? value.gradientPresetId
      : defaultStyle.gradientPresetId;

  return {
    fillMode: value.fillMode,
    solidColor: normalizeHex(value.solidColor),
    strokeColor: normalizeHex(typeof value.strokeColor === "string" ? value.strokeColor : "#ffffff"),
    strokeWidth: clampNumber(
      safeNumber(typeof value.strokeWidth === "number" ? value.strokeWidth : NaN, 0),
      0,
      20
    ),
    shadowColor: sanitizeShadowColor(value.shadowColor, DEFAULT_DESIGN_SHADOW_STYLE.color),
    shadowOpacity: sanitizeShadowOpacity(value.shadowOpacity, DEFAULT_DESIGN_SHADOW_STYLE.opacity),
    shadowBlur: sanitizeShadowBlur(value.shadowBlur, DEFAULT_DESIGN_SHADOW_STYLE.blur),
    shadowOffsetX: sanitizeShadowOffset(value.shadowOffsetX, DEFAULT_DESIGN_SHADOW_STYLE.offsetX),
    shadowOffsetY: sanitizeShadowOffset(value.shadowOffsetY, DEFAULT_DESIGN_SHADOW_STYLE.offsetY),
    textureDataUrl: sanitizeTextureDataUrl(value.textureDataUrl),
    textureFileName: typeof value.textureFileName === "string" ? value.textureFileName.trim() : "",
    textureWidth: sanitizeTextureDimension(value.textureWidth, 1024),
    textureHeight: sanitizeTextureDimension(value.textureHeight, 1024),
    textureAutoCenter: Boolean(value.textureAutoCenter),
    textureContentBounds: sanitizeTextureContentBounds(value.textureContentBounds),
    printTexture: sanitizePrintTextureStyle(value.printTexture),
    printModeId: sanitizePrintModeId(value.printModeId),
    shapePresetId,
    patternPresetId,
    gradientPresetId,
    patternControls: sanitizeDesignPatternControls(value.patternControls),
  };
};

export const serializeDesignLayerStyle = (style: DesignLayerStyle | null | undefined) =>
  style
    ? JSON.stringify({
        fillMode: style.fillMode,
        solidColor: normalizeHex(style.solidColor),
        strokeColor: normalizeHex(style.strokeColor || "#ffffff"),
        strokeWidth: clampNumber(safeNumber(style.strokeWidth, 0), 0, 20),
        shadowColor: sanitizeShadowColor(style.shadowColor, DEFAULT_DESIGN_SHADOW_STYLE.color),
        shadowOpacity: sanitizeShadowOpacity(style.shadowOpacity, DEFAULT_DESIGN_SHADOW_STYLE.opacity),
        shadowBlur: sanitizeShadowBlur(style.shadowBlur, DEFAULT_DESIGN_SHADOW_STYLE.blur),
        shadowOffsetX: sanitizeShadowOffset(style.shadowOffsetX, DEFAULT_DESIGN_SHADOW_STYLE.offsetX),
        shadowOffsetY: sanitizeShadowOffset(style.shadowOffsetY, DEFAULT_DESIGN_SHADOW_STYLE.offsetY),
        textureDataUrl: serializeTextureDataUrl(style.textureDataUrl || ""),
        textureFileName: style.textureFileName || "",
        textureWidth: sanitizeTextureDimension(style.textureWidth, 1024),
        textureHeight: sanitizeTextureDimension(style.textureHeight, 1024),
        textureAutoCenter: Boolean(style.textureAutoCenter),
        textureContentBounds: sanitizeTextureContentBounds(style.textureContentBounds),
        printTexture: serializePrintTextureStyle(style.printTexture),
        printModeId: sanitizePrintModeId(style.printModeId),
        shapePresetId: style.shapePresetId,
        patternPresetId: style.patternPresetId,
        gradientPresetId: style.gradientPresetId,
        patternControls: sanitizeDesignPatternControls(style.patternControls),
      })
    : "";

export const resolveDesignLayerRequest = (style: DesignLayerStyle): DesignLayerRequest => {
  const normalizedStyle = sanitizeDesignLayerStyle(style) || getDefaultDesignLayerStyle(style.solidColor);
  return {
    fillMode: normalizedStyle.fillMode,
    solidColor: normalizedStyle.solidColor,
    strokeColor: normalizedStyle.strokeColor,
    strokeWidth: normalizedStyle.strokeWidth,
    shadowColor: normalizedStyle.shadowColor,
    shadowOpacity: normalizedStyle.shadowOpacity,
    shadowBlur: normalizedStyle.shadowBlur,
    shadowOffsetX: normalizedStyle.shadowOffsetX,
    shadowOffsetY: normalizedStyle.shadowOffsetY,
    textureDataUrl: normalizedStyle.textureDataUrl,
    textureFileName: normalizedStyle.textureFileName,
    textureWidth: normalizedStyle.textureWidth,
    textureHeight: normalizedStyle.textureHeight,
    textureAutoCenter: normalizedStyle.textureAutoCenter,
    textureContentBounds: normalizedStyle.textureContentBounds,
    printTexture: normalizedStyle.printTexture,
    printModeId: normalizedStyle.printModeId,
    shapePreset:
      DESIGN_SHAPE_PRESETS.find((preset) => preset.id === normalizedStyle.shapePresetId) || DESIGN_SHAPE_PRESETS[0]!,
    patternPreset:
      DESIGN_PATTERN_PRESETS.find((preset) => preset.id === normalizedStyle.patternPresetId) ||
      DESIGN_PATTERN_PRESETS[0]!,
    gradientPreset:
      DESIGN_GRADIENT_PRESETS.find((preset) => preset.id === normalizedStyle.gradientPresetId) ||
      DESIGN_GRADIENT_PRESETS[0]!,
    patternControls: normalizedStyle.patternControls,
  };
};

const renderPatternDefinitionWithControls = (
  presetOrDefinition: Pick<DesignPatternPreset, "renderDefinition"> | string,
  fillId: string,
  controls: DesignPatternControls,
  options?: {
    centerWithinViewBox?: boolean;
    viewBoxWidth?: number;
    viewBoxHeight?: number;
    ignoreManualOffset?: boolean;
    rotateAroundCenter?: boolean;
  }
) => {
  const rawDefinition =
    typeof presetOrDefinition === "string" ? presetOrDefinition : presetOrDefinition.renderDefinition(fillId);
  const match = rawDefinition.match(PATTERN_DEFINITION_REGEX);
  if (!match) {
    return rawDefinition;
  }

  const [, attributes, content] = match;
  const baseWidth = Math.max(
    0.1,
    safeNumber(Number.parseFloat(readSvgAttribute(attributes, "width") || ""), 24)
  );
  const baseHeight = Math.max(
    0.1,
    safeNumber(Number.parseFloat(readSvgAttribute(attributes, "height") || ""), 24)
  );
  const baseTransform = readSvgAttribute(attributes, "patternTransform");
  const scale = clampNumber(safeNumber(controls.scale, 1), 0.05, 20);
  const repeatX = clampNumber(safeNumber(controls.repeatX, 1), 0.05, 20);
  const repeatY = clampNumber(safeNumber(controls.repeatY, 1), 0.05, 20);
  const rotationDeg = clampNumber(safeNumber(controls.rotationDeg, 0), -360, 360);
  const tileWidth = Math.max(0.1, (baseWidth * scale) / repeatX);
  const tileHeight = Math.max(0.1, (baseHeight * scale) / repeatY);
  const manualOffsetX = options?.ignoreManualOffset ? 0 : clampNumber(safeNumber(controls.offsetX, 0), -500, 500);
  const manualOffsetY = options?.ignoreManualOffset ? 0 : clampNumber(safeNumber(controls.offsetY, 0), -500, 500);
  const offsetX = (manualOffsetX / 100) * tileWidth;
  const offsetY = (manualOffsetY / 100) * tileHeight;
  const patternWidth = tileWidth * (controls.mirrorRepeat ? 2 : 1);
  const patternHeight = tileHeight * (controls.mirrorRepeat ? 2 : 1);
  const viewBoxWidth = options?.viewBoxWidth ?? 100;
  const viewBoxHeight = options?.viewBoxHeight ?? 100;
  const baseOriginX =
    options?.centerWithinViewBox
      ? (viewBoxWidth - patternWidth) / 2
      : 0;
  const baseOriginY =
    options?.centerWithinViewBox
      ? (viewBoxHeight - patternHeight) / 2
      : 0;
  const contentScaleX = tileWidth / baseWidth;
  const contentScaleY = tileHeight / baseHeight;
  const rotationCenterX = options?.rotateAroundCenter ? viewBoxWidth / 2 : 0;
  const rotationCenterY = options?.rotateAroundCenter ? viewBoxHeight / 2 : 0;
  const transformParts = [
    baseTransform,
    Math.abs(rotationDeg) > 0.0001
      ? options?.rotateAroundCenter
        ? `rotate(${formatSvgNumber(rotationDeg)} ${formatSvgNumber(rotationCenterX)} ${formatSvgNumber(rotationCenterY)})`
        : `rotate(${formatSvgNumber(rotationDeg)})`
      : null,
  ].filter(Boolean);
  const baseTile = `<g transform="scale(${formatSvgNumber(contentScaleX)} ${formatSvgNumber(contentScaleY)})">${content}</g>`;
  const mirroredTiles = controls.mirrorRepeat
    ? `
        <g transform="translate(${formatSvgNumber(tileWidth * 2)} 0) scale(-${formatSvgNumber(contentScaleX)} ${formatSvgNumber(contentScaleY)})">
          ${content}
        </g>
        <g transform="translate(0 ${formatSvgNumber(tileHeight * 2)}) scale(${formatSvgNumber(contentScaleX)} -${formatSvgNumber(contentScaleY)})">
          ${content}
        </g>
        <g transform="translate(${formatSvgNumber(tileWidth * 2)} ${formatSvgNumber(tileHeight * 2)}) scale(-${formatSvgNumber(contentScaleX)} -${formatSvgNumber(contentScaleY)})">
          ${content}
        </g>
      `
    : "";

  return `
      <pattern id="${fillId}" x="${formatSvgNumber(baseOriginX + offsetX)}" y="${formatSvgNumber(baseOriginY + offsetY)}" width="${formatSvgNumber(patternWidth)}" height="${formatSvgNumber(patternHeight)}" patternUnits="userSpaceOnUse"${
        transformParts.length ? ` patternTransform="${transformParts.join(" ")}"` : ""
      }>
        ${baseTile}
        ${mirroredTiles}
      </pattern>
    `;
};

const getTexturePatternBaseSize = (textureWidth: number, textureHeight: number) => {
  const safeWidth = sanitizeTextureDimension(textureWidth, 1024);
  const safeHeight = sanitizeTextureDimension(textureHeight, 1024);
  if (safeWidth >= safeHeight) {
    return {
      width: 100,
      height: (safeHeight / safeWidth) * 100,
    };
  }
  return {
    width: (safeWidth / safeHeight) * 100,
    height: 100,
  };
};

const renderAutoCenteredTextureDefinition = ({
  fillId,
  textureDataUrl,
  textureWidth,
  textureHeight,
  textureContentBounds,
  scale,
}: {
  fillId: string;
  textureDataUrl: string;
  textureWidth: number;
  textureHeight: number;
  textureContentBounds: DesignTextureContentBounds;
  scale: number;
}) => {
  const safeTextureWidth = sanitizeTextureDimension(textureWidth, 1024);
  const safeTextureHeight = sanitizeTextureDimension(textureHeight, 1024);
  const contentBounds = sanitizeTextureContentBounds(textureContentBounds);
  const croppedWidth = safeTextureWidth * contentBounds.width;
  const croppedHeight = safeTextureHeight * contentBounds.height;
  const baseSize = getTexturePatternBaseSize(croppedWidth, croppedHeight);
  const zoom = clampNumber(safeNumber(scale, 1), 0.05, 20);
  const visibleWidth = baseSize.width * zoom;
  const visibleHeight = baseSize.height * zoom;
  const scaleX = visibleWidth / Math.max(croppedWidth, 0.0001);
  const scaleY = visibleHeight / Math.max(croppedHeight, 0.0001);
  const imageWidth = safeTextureWidth * scaleX;
  const imageHeight = safeTextureHeight * scaleY;
  const imageX = (100 - visibleWidth) / 2 - contentBounds.left * imageWidth;
  const imageY = (100 - visibleHeight) / 2 - contentBounds.top * imageHeight;

  return `
      <pattern id="${fillId}" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <image
          href="${textureDataUrl}"
          x="${formatSvgNumber(imageX)}"
          y="${formatSvgNumber(imageY)}"
          width="${formatSvgNumber(imageWidth)}"
          height="${formatSvgNumber(imageHeight)}"
          preserveAspectRatio="none"
        />
      </pattern>
    `;
};

const renderTextureDefinitionWithControls = ({
  fillId,
  textureDataUrl,
  textureWidth,
  textureHeight,
  textureAutoCenter,
  textureContentBounds,
  controls,
}: {
  fillId: string;
  textureDataUrl: string;
  textureWidth: number;
  textureHeight: number;
  textureAutoCenter: boolean;
  textureContentBounds: DesignTextureContentBounds;
  controls: DesignPatternControls;
}) => {
  if (textureAutoCenter) {
    return renderAutoCenteredTextureDefinition({
      fillId,
      textureDataUrl,
      textureWidth,
      textureHeight,
      textureContentBounds,
      scale: controls.scale,
    });
  }

  const contentBounds = sanitizeTextureContentBounds(textureContentBounds);
  const effectiveWidth = textureWidth * contentBounds.width;
  const effectiveHeight = textureHeight * contentBounds.height;
  const baseSize = getTexturePatternBaseSize(effectiveWidth, effectiveHeight);
  const scaleX = baseSize.width / Math.max(1, effectiveWidth);
  const scaleY = baseSize.height / Math.max(1, effectiveHeight);
  const translateX = -(contentBounds.left * textureWidth * scaleX);
  const translateY = -(contentBounds.top * textureHeight * scaleY);
  const imageMarkup = `
      <g transform="translate(${formatSvgNumber(translateX)} ${formatSvgNumber(translateY)}) scale(${formatSvgNumber(scaleX)} ${formatSvgNumber(scaleY)})">
        <image href="${textureDataUrl}" width="${formatSvgNumber(textureWidth)}" height="${formatSvgNumber(textureHeight)}" preserveAspectRatio="none" />
      </g>
    `;
  return renderPatternDefinitionWithControls(
    `
      <pattern id="${fillId}" width="${formatSvgNumber(baseSize.width)}" height="${formatSvgNumber(baseSize.height)}" patternUnits="userSpaceOnUse">
        ${imageMarkup}
      </pattern>
    `,
    fillId,
    controls
  );
};

const getTextureFileStem = (fileName: string) => {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "texture";
  }
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "texture";
};

const createSolidFill = (solidColor: string) => {
  const baseColor = normalizeHex(solidColor);
  const highlight = mixHex(baseColor, "#ffffff", 0.24);
  const shade = mixHex(baseColor, "#0f1720", 0.28);

  return {
    defs: `
      <linearGradient id="shape-fill" x1="12%" y1="8%" x2="88%" y2="92%">
        <stop offset="0%" stop-color="${highlight}" />
        <stop offset="42%" stop-color="${baseColor}" />
        <stop offset="100%" stop-color="${shade}" />
      </linearGradient>
    `,
    fill: "url(#shape-fill)",
    stroke: rgba(mixHex(baseColor, "#0f1720", 0.62), 0.34),
  };
};

const createFillPreviewSvg = (defs: string, fill: string) =>
  svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="132" viewBox="0 0 220 132">
      <defs>${defs}</defs>
      <rect width="220" height="132" rx="22" fill="#f7f7f7" />
      <rect x="12" y="12" width="196" height="108" rx="20" fill="${fill}" />
      <rect x="12" y="12" width="196" height="108" rx="20" fill="none" stroke="rgba(15, 23, 32, 0.12)" stroke-width="3" />
    </svg>
  `);

const createShapeTextureSvg = (
  shapePreset: Pick<DesignShapePreset, "renderBody">,
  defs: string,
  fill: string,
  stroke: string,
  options?: {
    strokeColor?: string;
    strokeWidth?: number;
    shadowColor?: string;
    shadowOpacity?: number;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    printTexture?: PrintTextureStyle;
  }
) => {
  const outlineWidth = clampNumber(safeNumber(options?.strokeWidth ?? 0, 0), 0, 20);
  const outlineColor = normalizeHex(options?.strokeColor || "#ffffff");
  const shadowColor = sanitizeShadowColor(options?.shadowColor, DEFAULT_DESIGN_SHADOW_STYLE.color);
  const shadowOpacity = sanitizeShadowOpacity(options?.shadowOpacity, DEFAULT_DESIGN_SHADOW_STYLE.opacity);
  const shadowBlur = sanitizeShadowBlur(options?.shadowBlur, DEFAULT_DESIGN_SHADOW_STYLE.blur);
  const shadowOffsetX = sanitizeShadowOffset(options?.shadowOffsetX, DEFAULT_DESIGN_SHADOW_STYLE.offsetX);
  const shadowOffsetY = sanitizeShadowOffset(options?.shadowOffsetY, DEFAULT_DESIGN_SHADOW_STYLE.offsetY);
  const printTexture = sanitizePrintTextureStyle(options?.printTexture);
  const printTextureStrengths = resolvePrintTextureStrengths(printTexture);
  const hasShadow =
    shadowOpacity > 0.001 &&
    (shadowBlur > 0.001 || Math.abs(shadowOffsetX) > 0.001 || Math.abs(shadowOffsetY) > 0.001);
  const hasPrintTexture = !isPrintTextureDisabled(printTexture);
  const outlineDefs =
    outlineWidth > 0.001
      ? `
        <filter id="shape-outline" x="-60%" y="-60%" width="220%" height="220%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="${formatSvgNumber(outlineWidth)}" result="outline-alpha" />
          <feFlood flood-color="${outlineColor}" result="outline-color" />
          <feComposite in="outline-color" in2="outline-alpha" operator="in" result="outline-fill" />
          <feComposite in="outline-fill" in2="SourceAlpha" operator="out" result="outline-only" />
          <feMerge>
            <feMergeNode in="outline-only" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      `
    : "";
  const printTextureDefs = hasPrintTexture
    ? `
        <filter id="shape-print-texture" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="${formatSvgNumber(0.05 + printTextureStrengths.fabricNoise * 0.08)}"
            numOctaves="3"
            seed="23"
            result="fabric-noise"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="${formatSvgNumber(0.75 + printTextureStrengths.grain * 0.55)}"
            numOctaves="2"
            seed="13"
            result="grain-noise"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="${formatSvgNumber(0.14 + printTextureStrengths.distress * 0.14)}"
            numOctaves="2"
            seed="37"
            result="distress-noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="fabric-noise"
            scale="${formatSvgNumber(printTextureStrengths.fabricNoise * 3.2 + printTextureStrengths.distress * 1.4)}"
            xChannelSelector="R"
            yChannelSelector="B"
            result="print-base"
          />
          <feColorMatrix
            in="distress-noise"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2126 0.7152 0.0722 0 0"
            result="distress-mono"
          />
          <feComponentTransfer in="distress-mono" result="distress-alpha">
            <feFuncA
              type="linear"
              slope="${formatSvgNumber(printTextureStrengths.distress * 0.92)}"
              intercept="${formatSvgNumber(1 - printTextureStrengths.distress * 0.92)}"
            />
          </feComponentTransfer>
          <feComposite in="print-base" in2="distress-alpha" operator="in" result="distressed" />
          <feColorMatrix
            in="grain-noise"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2126 0.7152 0.0722 0 0"
            result="grain-mono"
          />
          <feComponentTransfer in="grain-mono" result="grain-alpha">
            <feFuncA type="linear" slope="${formatSvgNumber(0.55 + printTextureStrengths.grain * 0.45)}" />
          </feComponentTransfer>
          <feFlood
            flood-color="#000000"
            flood-opacity="${formatSvgNumber(0.035 + printTextureStrengths.grain * 0.12)}"
            result="grain-dark-color"
          />
          <feComposite in="grain-dark-color" in2="grain-alpha" operator="in" result="grain-dark" />
          <feComposite in="grain-dark" in2="distressed" operator="in" result="grain-dark-clipped" />
          <feBlend in="distressed" in2="grain-dark-clipped" mode="multiply" result="with-grain-dark" />
          <feFlood
            flood-color="#ffffff"
            flood-opacity="${formatSvgNumber(printTextureStrengths.grain * 0.05 + printTextureStrengths.fabricNoise * 0.03)}"
            result="grain-light-color"
          />
          <feComposite in="grain-light-color" in2="grain-alpha" operator="in" result="grain-light" />
          <feComposite in="grain-light" in2="distressed" operator="in" result="grain-light-clipped" />
          <feBlend in="with-grain-dark" in2="grain-light-clipped" mode="screen" result="with-grain" />
          <feColorMatrix
            in="fabric-noise"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2126 0.7152 0.0722 0 0"
            result="fabric-mono"
          />
          <feComponentTransfer in="fabric-mono" result="fabric-alpha">
            <feFuncA type="linear" slope="${formatSvgNumber(0.3 + printTextureStrengths.fabricNoise * 0.5)}" />
          </feComponentTransfer>
          <feFlood
            flood-color="#000000"
            flood-opacity="${formatSvgNumber(printTextureStrengths.fabricNoise * 0.08)}"
            result="fabric-dark-color"
          />
          <feComposite in="fabric-dark-color" in2="fabric-alpha" operator="in" result="fabric-dark" />
          <feComposite in="fabric-dark" in2="distressed" operator="in" result="fabric-dark-clipped" />
          <feBlend in="with-grain" in2="fabric-dark-clipped" mode="multiply" result="textured" />
          <feFlood
            flood-color="#ffffff"
            flood-opacity="${formatSvgNumber(printTextureStrengths.fade * 0.16)}"
            result="fade-white"
          />
          <feBlend in="textured" in2="fade-white" mode="screen" result="lightened" />
          <feComponentTransfer in="lightened" result="print-finished">
            <feFuncA type="linear" slope="${formatSvgNumber(1 - printTextureStrengths.fade * 0.42)}" />
          </feComponentTransfer>
        </filter>
      `
    : "";
  const renderedBody = shapePreset.renderBody(fill, stroke);
  const outlinedBody =
    outlineWidth > 0.001 ? `<g filter="url(#shape-outline)">${renderedBody}</g>` : renderedBody;
  const body = hasPrintTexture
    ? `<g filter="url(#shape-print-texture)">${outlinedBody}</g>`
    : outlinedBody;
  const shadowDefs = hasShadow
    ? `
        <filter id="shape-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow
            dx="${formatSvgNumber(shadowOffsetX)}"
            dy="${formatSvgNumber(shadowOffsetY)}"
            stdDeviation="${formatSvgNumber(shadowBlur)}"
            flood-color="${shadowColor}"
            flood-opacity="${formatSvgNumber(shadowOpacity)}"
          />
        </filter>
      `
    : "";
  const renderedWithShadow = hasShadow ? `<g filter="url(#shape-shadow)">${body}</g>` : body;

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <defs>
        ${defs}
        ${shadowDefs}
        ${outlineDefs}
        ${printTextureDefs}
      </defs>
      <rect width="100" height="100" fill="transparent" />
      ${renderedWithShadow}
    </svg>
  `);
};

const patternDefinitions: PatternDefinition[] = [
  {
    id: "checker",
    name: "Checker",
    fileStem: "checker",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="#f7f0e4" />
        <rect width="12" height="12" fill="#212121" />
        <rect x="12" y="12" width="12" height="12" fill="#212121" />
      </pattern>
    `,
  },
  {
    id: "camo",
    name: "Camo",
    fileStem: "camo",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="96" height="96" patternUnits="userSpaceOnUse">
        <rect width="96" height="96" fill="#73836a" />
        <path d="M8 20 C24 2 44 4 50 24 C56 44 36 52 18 44 C0 36 -2 30 8 20 Z" fill="#2f4637" />
        <path d="M60 8 C74 10 90 22 84 40 C78 58 58 62 44 48 C30 34 42 4 60 8 Z" fill="#d2c59f" />
        <path d="M56 56 C72 44 94 58 90 76 C86 94 58 98 42 86 C26 74 38 56 56 56 Z" fill="#1b2420" />
        <path d="M8 60 C18 54 32 60 32 74 C32 88 18 90 8 84 C-2 78 -2 66 8 60 Z" fill="#9aa37b" />
      </pattern>
    `,
  },
  {
    id: "denim",
    name: "Denim",
    fileStem: "denim",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="18" height="18" patternUnits="userSpaceOnUse">
        <rect width="18" height="18" fill="#526f9c" />
        <path d="M0 0 L18 18 M-4 4 L4 -4 M14 22 L22 14" stroke="rgba(255,255,255,0.22)" stroke-width="1.3" />
        <path d="M18 0 L0 18 M14 -4 L22 4 M-4 14 L4 22" stroke="rgba(32,43,65,0.22)" stroke-width="0.9" />
      </pattern>
    `,
  },
  {
    id: "carbon",
    name: "Carbon",
    fileStem: "carbon",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#16191d" />
        <path d="M0 0 H20 V10 H0 Z" fill="#1f2429" />
        <path d="M0 10 H20 V20 H0 Z" fill="#0f1316" />
        <path d="M0 0 L20 20 M-4 4 L4 -4 M16 24 L24 16" stroke="rgba(255,255,255,0.08)" stroke-width="1.4" />
        <path d="M20 0 L0 20 M16 -4 L24 4 M-4 16 L4 24" stroke="rgba(255,255,255,0.05)" stroke-width="1.1" />
      </pattern>
    `,
  },
  {
    id: "sport-stripe",
    name: "Sport Stripe",
    fileStem: "sport-stripe",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
        <rect width="28" height="28" fill="#f5f5f5" />
        <rect width="8" height="28" fill="#118ab2" />
        <rect x="12" width="6" height="28" fill="#14181f" />
        <rect x="22" width="4" height="28" fill="#ffd166" />
      </pattern>
    `,
  },
  {
    id: "halftone",
    name: "Comic Halftone",
    fileStem: "comic-halftone",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="28" patternUnits="userSpaceOnUse">
        <rect width="28" height="28" fill="#fff7db" />
        <circle cx="7" cy="7" r="2.2" fill="#131313" />
        <circle cx="21" cy="7" r="4" fill="#131313" />
        <circle cx="7" cy="21" r="4.2" fill="#131313" />
        <circle cx="21" cy="21" r="2.4" fill="#131313" />
        <circle cx="14" cy="14" r="1.5" fill="#131313" />
      </pattern>
    `,
  },
  {
    id: "pinstripe",
    name: "Pinstripe",
    fileStem: "pinstripe",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
        <rect width="24" height="24" fill="#f3f4f6" />
        <rect width="3" height="24" fill="#111827" />
        <rect x="10" width="2" height="24" fill="#9ca3af" />
        <rect x="18" width="1.5" height="24" fill="#d97706" />
      </pattern>
    `,
  },
  {
    id: "honeycomb",
    name: "Honeycomb",
    fileStem: "honeycomb",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="36" height="31.2" patternUnits="userSpaceOnUse">
        <rect width="36" height="31.2" fill="#f7f0d9" />
        <path d="M9 0 L27 0 L36 15.6 L27 31.2 L9 31.2 L0 15.6 Z" fill="none" stroke="#2b3036" stroke-width="2.1" />
        <path d="M27 0 L45 0 L54 15.6 L45 31.2 L27 31.2 L18 15.6 Z" fill="none" stroke="rgba(43,48,54,0.45)" stroke-width="2.1" />
      </pattern>
    `,
  },
  {
    id: "plaid",
    name: "Plaid",
    fileStem: "plaid",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#7a1f2b" />
        <rect x="8" width="8" height="40" fill="#1f2a44" opacity="0.9" />
        <rect x="22" width="4" height="40" fill="#f4e6bf" opacity="0.95" />
        <rect y="8" width="40" height="8" fill="#1f2a44" opacity="0.9" />
        <rect y="22" width="40" height="4" fill="#f4e6bf" opacity="0.95" />
        <path d="M0 0 H40 V40 H0 Z" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
      </pattern>
    `,
  },
  {
    id: "houndstooth",
    name: "Houndstooth",
    fileStem: "houndstooth",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="#f6efe8" />
        <path d="M0 0 H8 V4 H12 V12 H8 V16 H0 V12 H4 V4 H0 Z" fill="#171717" />
        <path d="M12 0 H16 V8 H24 V12 H20 V16 H12 V8 Z" fill="#171717" />
        <path d="M0 12 H4 V20 H12 V24 H8 V20 H0 Z" fill="#171717" />
        <path d="M12 12 H20 V16 H24 V24 H16 V20 H12 Z" fill="#171717" />
      </pattern>
    `,
  },
  {
    id: "digital-camo",
    name: "Digital Camo",
    fileStem: "digital-camo",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="36" height="36" patternUnits="userSpaceOnUse">
        <rect width="36" height="36" fill="#8b9470" />
        <rect width="12" height="12" fill="#283125" />
        <rect x="12" y="12" width="12" height="12" fill="#d7caa2" />
        <rect x="24" width="12" height="12" fill="#536142" />
        <rect x="24" y="12" width="12" height="12" fill="#1d231a" />
        <rect y="24" width="12" height="12" fill="#d7caa2" />
        <rect x="12" y="24" width="12" height="12" fill="#4a583c" />
        <rect x="24" y="24" width="12" height="12" fill="#20261d" />
      </pattern>
    `,
  },
  {
    id: "zebra",
    name: "Zebra",
    fileStem: "zebra",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="52" height="52" patternUnits="userSpaceOnUse">
        <rect width="52" height="52" fill="#fbfaf7" />
        <path d="M4 0 C18 8 10 18 20 26 C28 34 18 44 30 52" stroke="#111111" stroke-width="7" fill="none" stroke-linecap="round" />
        <path d="M24 0 C36 10 30 18 40 28 C48 36 42 44 52 52" stroke="#111111" stroke-width="6" fill="none" stroke-linecap="round" />
        <path d="M-4 16 C8 22 6 30 14 36 C22 42 18 48 24 56" stroke="#111111" stroke-width="5" fill="none" stroke-linecap="round" />
      </pattern>
    `,
  },
  {
    id: "tiger",
    name: "Tiger",
    fileStem: "tiger",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="54" height="54" patternUnits="userSpaceOnUse">
        <rect width="54" height="54" fill="#f59e0b" />
        <path d="M8 0 C18 10 18 20 10 30 C6 36 6 44 14 54" stroke="#25140a" stroke-width="7" fill="none" stroke-linecap="round" />
        <path d="M28 0 C38 8 40 18 30 30 C24 38 24 46 32 54" stroke="#25140a" stroke-width="8" fill="none" stroke-linecap="round" />
        <path d="M46 0 C54 8 56 18 48 28 C42 36 42 44 50 54" stroke="#25140a" stroke-width="6" fill="none" stroke-linecap="round" />
      </pattern>
    `,
  },
  {
    id: "chain-link",
    name: "Chain Link",
    fileStem: "chain-link",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="20" patternUnits="userSpaceOnUse">
        <rect width="28" height="20" fill="#eef2f7" />
        <g fill="none" stroke="#26313d" stroke-width="2.8">
          <ellipse cx="8" cy="10" rx="6" ry="8" />
          <ellipse cx="20" cy="10" rx="6" ry="8" />
        </g>
        <g fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.1">
          <ellipse cx="8" cy="10" rx="4.2" ry="6.2" />
          <ellipse cx="20" cy="10" rx="4.2" ry="6.2" />
        </g>
      </pattern>
    `,
  },
  {
    id: "knit",
    name: "Knit",
    fileStem: "knit",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="#c6a97e" />
        <path d="M0 6 Q6 0 12 6 T24 6 M0 18 Q6 12 12 18 T24 18" stroke="#8b6a47" stroke-width="3.2" fill="none" stroke-linecap="round" />
        <path d="M0 10 Q6 4 12 10 T24 10 M0 22 Q6 16 12 22 T24 22" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" fill="none" stroke-linecap="round" />
      </pattern>
    `,
  },
  {
    id: "mesh-grid",
    name: "Mesh Grid",
    fileStem: "mesh-grid",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#e9edf2" />
        <path d="M0 0 H20 M0 10 H20 M0 20 H20 M0 0 V20 M10 0 V20 M20 0 V20" stroke="#667085" stroke-width="0.9" />
        <path d="M0 0 L20 20 M20 0 L0 20" stroke="rgba(17,24,39,0.18)" stroke-width="0.9" />
      </pattern>
    `,
  },
  {
    id: "wave-lines",
    name: "Wave Lines",
    fileStem: "wave-lines",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="20" patternUnits="userSpaceOnUse">
        <rect width="28" height="20" fill="#dbeafe" />
        <path d="M0 5 Q7 0 14 5 T28 5 M0 15 Q7 10 14 15 T28 15" stroke="#2563eb" stroke-width="2.2" fill="none" stroke-linecap="round" />
        <path d="M0 10 Q7 5 14 10 T28 10" stroke="rgba(37,99,235,0.38)" stroke-width="1.1" fill="none" stroke-linecap="round" />
      </pattern>
    `,
  },
  {
    id: "leopard",
    name: "Leopard",
    fileStem: "leopard",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#d6a264" />
        <path d="M8 8 C14 4 18 10 16 16 C10 18 4 14 8 8 Z" fill="#2b190d" />
        <path d="M26 6 C32 6 36 12 32 18 C26 18 22 12 26 6 Z" fill="#2b190d" />
        <path d="M10 24 C16 20 22 26 18 32 C12 34 6 30 10 24 Z" fill="#2b190d" />
        <path d="M28 24 C34 22 38 28 34 34 C28 34 24 30 28 24 Z" fill="#2b190d" />
        <circle cx="21" cy="19" r="2.4" fill="#2b190d" />
      </pattern>
    `,
  },
  {
    id: "bandana",
    name: "Bandana",
    fileStem: "bandana",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="38" height="38" patternUnits="userSpaceOnUse">
        <rect width="38" height="38" fill="#a61d2f" />
        <circle cx="9" cy="9" r="2.2" fill="#fff7ed" />
        <circle cx="29" cy="9" r="2.2" fill="#fff7ed" />
        <circle cx="9" cy="29" r="2.2" fill="#fff7ed" />
        <circle cx="29" cy="29" r="2.2" fill="#fff7ed" />
        <path d="M19 10 C23 14 23 20 19 24 C15 20 15 14 19 10 Z" fill="#fff7ed" />
        <path d="M0 19 H38 M19 0 V38" stroke="rgba(255,247,237,0.42)" stroke-width="1" stroke-dasharray="2 4" />
      </pattern>
    `,
  },
  {
    id: "chevron",
    name: "Chevron",
    fileStem: "chevron",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="24" patternUnits="userSpaceOnUse">
        <rect width="28" height="24" fill="#f5f3ff" />
        <path d="M0 6 L7 0 L14 6 L21 0 L28 6 L28 12 L21 6 L14 12 L7 6 L0 12 Z" fill="#5b21b6" />
        <path d="M0 18 L7 12 L14 18 L21 12 L28 18 L28 24 L21 18 L14 24 L7 18 L0 24 Z" fill="#c4b5fd" />
      </pattern>
    `,
  },
  {
    id: "cyber-grid",
    name: "Cyber Grid",
    fileStem: "cyber-grid",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="28" patternUnits="userSpaceOnUse">
        <rect width="28" height="28" fill="#0f172a" />
        <path d="M0 0 H28 V28 H0 Z M0 14 H28 M14 0 V28" fill="none" stroke="rgba(34,211,238,0.34)" stroke-width="1.1" />
        <path d="M4 4 H12 V6 H6 V12 H4 Z M16 22 H24 V24 H18 V18 H16 Z" fill="#22d3ee" opacity="0.78" />
        <circle cx="14" cy="14" r="2.4" fill="#67e8f9" />
      </pattern>
    `,
  },

  {
    id: "polka-dots",
    name: "Polka Dots",
    fileStem: "polka-dots",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill="#fff8ee" />
        <circle cx="8" cy="8" r="4" fill="#111827" />
        <circle cx="22" cy="22" r="4" fill="#111827" />
        <circle cx="22" cy="8" r="2.4" fill="#f59e0b" />
        <circle cx="8" cy="22" r="2.4" fill="#f59e0b" />
      </pattern>
    `,
  },
  {
    id: "big-dots",
    name: "Big Dots",
    fileStem: "big-dots",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#e0f2fe" />
        <circle cx="10" cy="10" r="8" fill="#0f172a" />
        <circle cx="30" cy="30" r="8" fill="#0f172a" />
      </pattern>
    `,
  },
  {
    id: "argyle",
    name: "Argyle",
    fileStem: "argyle",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#1f3a5f" />
        <polygon points="20,2 38,20 20,38 2,20" fill="#dbeafe" />
        <path d="M20 0 V40 M0 20 H40" stroke="#f59e0b" stroke-width="1.6" opacity="0.75" />
      </pattern>
    `,
  },
  {
    id: "brick",
    name: "Brick",
    fileStem: "brick",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="24" patternUnits="userSpaceOnUse">
        <rect width="40" height="24" fill="#bf5a3d" />
        <path d="M0 0 H40 V24 H0 Z M0 12 H40 M20 0 V12 M10 12 V24 M30 12 V24" stroke="#f3e4d4" stroke-width="1.6" opacity="0.75" />
      </pattern>
    `,
  },
  {
    id: "terrazzo",
    name: "Terrazzo",
    fileStem: "terrazzo",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="44" height="44" patternUnits="userSpaceOnUse">
        <rect width="44" height="44" fill="#ede7df" />
        <path d="M6 8 L14 4 L18 12 L10 16 Z" fill="#1f2937" />
        <path d="M24 6 L34 8 L30 18 L20 16 Z" fill="#f59e0b" />
        <path d="M8 26 L18 22 L22 34 L10 36 Z" fill="#0f766e" />
        <path d="M28 24 L38 26 L36 38 L24 34 Z" fill="#7c3aed" />
        <path d="M18 18 L24 16 L28 22 L22 26 Z" fill="#dc2626" />
      </pattern>
    `,
  },
  {
    id: "hazard",
    name: "Hazard",
    fileStem: "hazard",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <rect width="28" height="28" fill="#facc15" />
        <rect width="12" height="28" fill="#111827" />
      </pattern>
    `,
  },
  {
    id: "circuit",
    name: "Circuit",
    fileStem: "circuit",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#10253a" />
        <path d="M8 8 H22 V16 H32 V32 M8 24 H16 V32 H26" fill="none" stroke="#67e8f9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="8" cy="8" r="2.2" fill="#67e8f9" />
        <circle cx="22" cy="16" r="2.2" fill="#67e8f9" />
        <circle cx="32" cy="32" r="2.2" fill="#67e8f9" />
        <circle cx="26" cy="32" r="2.2" fill="#67e8f9" />
      </pattern>
    `,
  },
  {
    id: "topography",
    name: "Topography",
    fileStem: "topography",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="48" height="48" patternUnits="userSpaceOnUse">
        <rect width="48" height="48" fill="#f4f1eb" />
        <path d="M4 14 C14 6 26 8 38 14 C44 18 46 24 44 30 C40 40 24 42 12 36 C2 30 0 20 4 14 Z" fill="none" stroke="#475569" stroke-width="1.4" />
        <path d="M10 18 C18 12 28 14 36 18 C40 20 40 26 36 30 C30 36 18 36 12 32 C6 28 4 22 10 18 Z" fill="none" stroke="#475569" stroke-width="1.1" />
        <path d="M16 22 C22 18 28 20 32 24 C34 26 34 30 30 32 C26 34 20 34 16 30 C12 28 12 24 16 22 Z" fill="none" stroke="#475569" stroke-width="0.9" />
      </pattern>
    `,
  },
  {
    id: "confetti",
    name: "Confetti",
    fileStem: "confetti",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="42" height="42" patternUnits="userSpaceOnUse">
        <rect width="42" height="42" fill="#fffaf5" />
        <rect x="6" y="8" width="4" height="12" rx="2" fill="#ef4444" transform="rotate(-20 8 14)" />
        <rect x="20" y="6" width="4" height="12" rx="2" fill="#f59e0b" transform="rotate(18 22 12)" />
        <rect x="30" y="18" width="4" height="12" rx="2" fill="#22c55e" transform="rotate(-24 32 24)" />
        <rect x="10" y="24" width="4" height="12" rx="2" fill="#3b82f6" transform="rotate(14 12 30)" />
        <circle cx="30" cy="8" r="2.6" fill="#7c3aed" />
        <circle cx="14" cy="18" r="2.2" fill="#ec4899" />
        <circle cx="24" cy="32" r="2.2" fill="#14b8a6" />
      </pattern>
    `,
  },
  {
    id: "hearts",
    name: "Hearts",
    fileStem: "hearts",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="34" height="34" patternUnits="userSpaceOnUse">
        <rect width="34" height="34" fill="#fff1f2" />
        <path d="M10 12 C10 8 14 6 17 9 C20 6 24 8 24 12 C24 16 20 19 17 22 C14 19 10 16 10 12 Z" fill="#e11d48" />
        <path d="M0 26 C0 22 4 20 7 23 C10 20 14 22 14 26 C14 30 10 33 7 36 C4 33 0 30 0 26 Z" fill="#fb7185" />
        <path d="M20 26 C20 22 24 20 27 23 C30 20 34 22 34 26 C34 30 30 33 27 36 C24 33 20 30 20 26 Z" fill="#fb7185" />
      </pattern>
    `,
  },
  {
    id: "stars-pattern",
    name: "Stars",
    fileStem: "stars-pattern",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="36" height="36" patternUnits="userSpaceOnUse">
        <rect width="36" height="36" fill="#101827" />
        <polygon points="18,6 20.8,13 28,13 22.2,17.6 24.5,25 18,20.4 11.5,25 13.8,17.6 8,13 15.2,13" fill="#fbbf24" />
        <circle cx="6" cy="8" r="1.4" fill="#ffffff" />
        <circle cx="30" cy="10" r="1.6" fill="#ffffff" />
        <circle cx="10" cy="28" r="1.2" fill="#ffffff" />
        <circle cx="28" cy="26" r="1.2" fill="#ffffff" />
      </pattern>
    `,
  },
  {
    id: "arrows-pattern",
    name: "Arrows",
    fileStem: "arrows-pattern",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="34" height="34" patternUnits="userSpaceOnUse">
        <rect width="34" height="34" fill="#eef2ff" />
        <path d="M4 10 H18 V4 L30 17 L18 30 V24 H4 Z" fill="#3730a3" />
        <path d="M-10 10 H4 V4 L16 17 L4 30 V24 H-10 Z" fill="#818cf8" opacity="0.75" />
      </pattern>
    `,
  },
  {
    id: "lightning-pattern",
    name: "Lightning",
    fileStem: "lightning-pattern",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="36" height="36" patternUnits="userSpaceOnUse">
        <rect width="36" height="36" fill="#0f172a" />
        <path d="M12 4 L6 18 H14 L10 32 L24 14 H16 L20 4 Z" fill="#fbbf24" />
        <path d="M30 8 L24 20 H30 L26 30 L36 18 H32 L34 8 Z" fill="#fde68a" />
      </pattern>
    `,
  },
  {
    id: "barcode",
    name: "Barcode",
    fileStem: "barcode",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill="#fafaf9" />
        <rect x="2" width="2" height="30" fill="#0f172a" />
        <rect x="6" width="4" height="30" fill="#0f172a" />
        <rect x="12" width="1.5" height="30" fill="#0f172a" />
        <rect x="16" width="3" height="30" fill="#0f172a" />
        <rect x="22" width="2" height="30" fill="#0f172a" />
        <rect x="27" width="1.5" height="30" fill="#0f172a" />
      </pattern>
    `,
  },
  {
    id: "glitch",
    name: "Glitch",
    fileStem: "glitch",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="42" height="28" patternUnits="userSpaceOnUse">
        <rect width="42" height="28" fill="#111827" />
        <rect y="4" width="26" height="4" fill="#22d3ee" />
        <rect x="10" y="12" width="22" height="4" fill="#f472b6" />
        <rect x="18" y="20" width="20" height="4" fill="#facc15" />
        <rect x="28" y="4" width="8" height="4" fill="#a78bfa" />
        <rect x="2" y="20" width="10" height="4" fill="#fb7185" />
      </pattern>
    `,
  },
  {
    id: "scales",
    name: "Fish Scales",
    fileStem: "fish-scales",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="24" height="22" patternUnits="userSpaceOnUse">
        <rect width="24" height="22" fill="#d9f99d" />
        <path d="M0 11 A6 6 0 0 1 12 11 A6 6 0 0 1 24 11" fill="none" stroke="#365314" stroke-width="2" />
        <path d="M-6 22 A6 6 0 0 1 6 22 A6 6 0 0 1 18 22 A6 6 0 0 1 30 22" fill="none" stroke="#4d7c0f" stroke-width="2" />
      </pattern>
    `,
  },
  {
    id: "cowhide",
    name: "Cowhide",
    fileStem: "cowhide",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="44" height="44" patternUnits="userSpaceOnUse">
        <rect width="44" height="44" fill="#fffdf7" />
        <path d="M4 8 C14 0 24 8 18 18 C10 22 0 18 4 8 Z" fill="#1f2937" />
        <path d="M26 6 C36 8 42 18 34 28 C26 28 20 18 26 6 Z" fill="#111827" />
        <path d="M10 26 C20 22 28 30 22 40 C10 42 4 34 10 26 Z" fill="#1f2937" />
      </pattern>
    `,
  },
  {
    id: "patchwork",
    name: "Patchwork",
    fileStem: "patchwork",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#3b82f6" />
        <rect x="20" width="20" height="20" fill="#f59e0b" />
        <rect y="20" width="20" height="20" fill="#ef4444" />
        <rect x="20" y="20" width="20" height="20" fill="#10b981" />
        <path d="M0 0 H40 V40 H0 Z M20 0 V40 M0 20 H40" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-dasharray="2 3" />
      </pattern>
    `,
  },
  {
    id: "graph-paper",
    name: "Graph Paper",
    fileStem: "graph-paper",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="28" patternUnits="userSpaceOnUse">
        <rect width="28" height="28" fill="#ffffff" />
        <path d="M0 0 H28 V28 H0 Z M0 7 H28 M0 14 H28 M0 21 H28 M7 0 V28 M14 0 V28 M21 0 V28" stroke="#93c5fd" stroke-width="0.8" />
        <path d="M0 0 H28 M0 0 V28" stroke="#3b82f6" stroke-width="1.2" />
      </pattern>
    `,
  },
  {
    id: "spray-paint",
    name: "Spray Paint",
    fileStem: "spray-paint",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="44" height="44" patternUnits="userSpaceOnUse">
        <rect width="44" height="44" fill="#f8fafc" />
        <circle cx="12" cy="10" r="4.5" fill="#111827" opacity="0.95" />
        <circle cx="8" cy="18" r="2.2" fill="#111827" opacity="0.7" />
        <circle cx="18" cy="18" r="2.8" fill="#111827" opacity="0.8" />
        <circle cx="30" cy="12" r="5" fill="#ef4444" opacity="0.88" />
        <circle cx="34" cy="20" r="2.2" fill="#ef4444" opacity="0.72" />
        <circle cx="24" cy="22" r="2.4" fill="#ef4444" opacity="0.72" />
        <circle cx="18" cy="32" r="4.2" fill="#2563eb" opacity="0.88" />
        <circle cx="10" cy="36" r="2.1" fill="#2563eb" opacity="0.68" />
        <circle cx="26" cy="34" r="2.1" fill="#2563eb" opacity="0.68" />
      </pattern>
    `,
  },
  {
    id: "flames-pattern",
    name: "Flames",
    fileStem: "flames-pattern",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="40" height="28" patternUnits="userSpaceOnUse">
        <rect width="40" height="28" fill="#2b0a08" />
        <path d="M0 28 C4 20 10 20 12 10 C14 18 20 18 22 28 Z" fill="#f97316" />
        <path d="M10 28 C14 18 20 18 22 6 C26 14 32 14 34 28 Z" fill="#fb7185" />
        <path d="M20 28 C24 20 30 20 32 10 C34 18 38 18 40 28 Z" fill="#f59e0b" />
      </pattern>
    `,
  },
  {
    id: "diamonds-pattern",
    name: "Diamonds",
    fileStem: "diamonds-pattern",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="32" height="32" patternUnits="userSpaceOnUse">
        <rect width="32" height="32" fill="#fdf6ec" />
        <polygon points="16,2 30,16 16,30 2,16" fill="#92400e" />
        <polygon points="16,8 24,16 16,24 8,16" fill="#fbbf24" />
      </pattern>
    `,
  },
  {
    id: "memphis",
    name: "Memphis",
    fileStem: "memphis",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="44" height="44" patternUnits="userSpaceOnUse">
        <rect width="44" height="44" fill="#fdf4ff" />
        <circle cx="10" cy="10" r="5" fill="#f43f5e" />
        <path d="M24 8 H38" stroke="#2563eb" stroke-width="3.6" stroke-linecap="round" />
        <path d="M30 18 L38 26 L30 34 L22 26 Z" fill="#facc15" />
        <path d="M4 28 C8 20 16 20 20 28 C24 36 32 36 36 28" stroke="#111827" stroke-width="2.2" fill="none" stroke-linecap="round" />
        <circle cx="12" cy="34" r="2.4" fill="#22c55e" />
      </pattern>
    `,
  },
  {
    id: "marble",
    name: "Marble",
    fileStem: "marble",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="56" height="56" patternUnits="userSpaceOnUse">
        <rect width="56" height="56" fill="#f9fafb" />
        <path d="M4 10 C16 4 28 8 38 4 C48 0 54 4 52 12 C48 22 32 18 24 24 C14 32 10 38 2 40" stroke="rgba(15,23,32,0.18)" stroke-width="1.8" fill="none" stroke-linecap="round" />
        <path d="M10 50 C20 40 30 42 40 34 C48 28 52 18 56 10" stroke="rgba(15,23,32,0.16)" stroke-width="1.5" fill="none" stroke-linecap="round" />
        <path d="M0 24 C10 18 18 20 28 14 C40 8 48 10 56 2" stroke="rgba(148,163,184,0.34)" stroke-width="1.2" fill="none" stroke-linecap="round" />
      </pattern>
    `,
  },
  {
    id: "racing-check",
    name: "Racing Check",
    fileStem: "racing-check",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="28" height="28" patternUnits="userSpaceOnUse">
        <rect width="28" height="28" fill="#f8fafc" />
        <rect width="14" height="14" fill="#111827" />
        <rect x="14" y="14" width="14" height="14" fill="#111827" />
        <rect x="20" width="4" height="28" fill="#ef4444" opacity="0.82" />
        <rect y="20" width="28" height="4" fill="#ef4444" opacity="0.82" />
      </pattern>
    `,
  },
  {
    id: "wave-lines",
    name: "Wave Lines",
    fileStem: "wave-lines",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="34" height="26" patternUnits="userSpaceOnUse">
        <rect width="34" height="26" fill="#eef6ff" />
        <path d="M0 6 Q8 0 17 6 T34 6" stroke="#0ea5e9" stroke-width="2.2" fill="none" stroke-linecap="round" />
        <path d="M0 13 Q8 7 17 13 T34 13" stroke="#0284c7" stroke-width="2.2" fill="none" stroke-linecap="round" />
        <path d="M0 20 Q8 14 17 20 T34 20" stroke="#38bdf8" stroke-width="2.2" fill="none" stroke-linecap="round" />
      </pattern>
    `,
  },
  {
    id: "snake-skin",
    name: "Snake Skin",
    fileStem: "snake-skin",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="42" height="42" patternUnits="userSpaceOnUse">
        <rect width="42" height="42" fill="#d8ccb4" />
        <path d="M10 2 L22 8 L22 20 L10 26 L-2 20 L-2 8 Z" fill="#8b7355" opacity="0.86" />
        <path d="M32 2 L44 8 L44 20 L32 26 L20 20 L20 8 Z" fill="#6f5a44" opacity="0.88" />
        <path d="M10 20 L22 26 L22 38 L10 44 L-2 38 L-2 26 Z" fill="#6f5a44" opacity="0.88" />
        <path d="M32 20 L44 26 L44 38 L32 44 L20 38 L20 26 Z" fill="#8b7355" opacity="0.86" />
        <path d="M10 2 L22 8 L22 20 L10 26 L-2 20 L-2 8 Z M32 2 L44 8 L44 20 L32 26 L20 20 L20 8 Z M10 20 L22 26 L22 38 L10 44 L-2 38 L-2 26 Z M32 20 L44 26 L44 38 L32 44 L20 38 L20 26 Z" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.1" />
      </pattern>
    `,
  },
  {
    id: "paper-cut",
    name: "Paper Cut",
    fileStem: "paper-cut",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="52" height="52" patternUnits="userSpaceOnUse">
        <rect width="52" height="52" fill="#f8fafc" />
        <path d="M6 10 C14 0 30 0 40 10 C46 16 46 28 38 36 C30 44 16 46 8 38 C0 30 0 18 6 10 Z" fill="#cbd5e1" />
        <path d="M14 14 C20 8 30 8 36 14 C40 18 40 26 34 32 C28 38 18 38 12 32 C8 28 8 18 14 14 Z" fill="#e2e8f0" />
        <path d="M18 18 C24 14 30 14 34 18 C36 20 36 26 32 30 C28 34 22 34 18 30 C14 26 14 22 18 18 Z" fill="#ffffff" />
      </pattern>
    `,
  },
  {
    id: "pixel-rain",
    name: "Pixel Rain",
    fileStem: "pixel-rain",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="34" height="42" patternUnits="userSpaceOnUse">
        <rect width="34" height="42" fill="#020617" />
        <rect x="4" width="3" height="18" fill="#4ade80" />
        <rect x="10" y="8" width="2" height="22" fill="#22c55e" />
        <rect x="16" y="2" width="3" height="26" fill="#86efac" />
        <rect x="22" y="12" width="2" height="18" fill="#16a34a" />
        <rect x="28" y="4" width="3" height="24" fill="#bbf7d0" />
        <rect x="6" y="22" width="2" height="12" fill="#15803d" />
        <rect x="18" y="30" width="2" height="10" fill="#4ade80" />
      </pattern>
    `,
  },
  {
    id: "sticker-doodles",
    name: "Sticker Doodles",
    fileStem: "sticker-doodles",
    renderDefinition: (fillId) => `
      <pattern id="${fillId}" width="42" height="42" patternUnits="userSpaceOnUse">
        <rect width="42" height="42" fill="#fffef7" />
        <path d="M6 12 C8 6 16 6 18 12 C16 16 8 16 6 12 Z" fill="#fb7185" />
        <path d="M24 8 H34 V18 H24 Z" fill="#60a5fa" transform="rotate(12 29 13)" />
        <path d="M12 28 L18 22 L24 28 L18 34 Z" fill="#facc15" />
        <path d="M28 24 C28 20 32 18 35 21 C38 18 42 20 42 24 C42 28 38 31 35 34 C32 31 28 28 28 24 Z" fill="#4ade80" />
        <path d="M2 36 H16 M20 36 H30" stroke="#111827" stroke-width="2" stroke-linecap="round" />
      </pattern>
    `,
  },

];

const gradientDefinitions: GradientDefinition[] = [
  createLinearGradientDefinition({
    id: "sunset",
    name: "Sunset",
    fileStem: "sunset",
    x1: "10%",
    y1: "0%",
    x2: "90%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#ffd166" },
      { offset: "45%", color: "#ff7a18" },
      { offset: "100%", color: "#ef476f" },
    ],
  }),
  createLinearGradientDefinition({
    id: "ice",
    name: "Ice",
    fileStem: "ice",
    x1: "12%",
    y1: "0%",
    x2: "88%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#f5fdff" },
      { offset: "42%", color: "#78d6ff" },
      { offset: "100%", color: "#1466d4" },
    ],
  }),
  createLinearGradientDefinition({
    id: "fire",
    name: "Fire",
    fileStem: "fire",
    x1: "0%",
    y1: "12%",
    x2: "100%",
    y2: "88%",
    stops: [
      { offset: "0%", color: "#fff1a8" },
      { offset: "35%", color: "#ffb703" },
      { offset: "72%", color: "#ff5f1f" },
      { offset: "100%", color: "#b80f0a" },
    ],
  }),
  createLinearGradientDefinition({
    id: "steel",
    name: "Steel",
    fileStem: "steel",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#f4f7fb" },
      { offset: "36%", color: "#bcc4d2" },
      { offset: "72%", color: "#7a8595" },
      { offset: "100%", color: "#3b4654" },
    ],
  }),
  createLinearGradientDefinition({
    id: "aurora",
    name: "Aurora",
    fileStem: "aurora",
    x1: "0%",
    y1: "10%",
    x2: "100%",
    y2: "90%",
    stops: [
      { offset: "0%", color: "#c7f464" },
      { offset: "45%", color: "#2dd4bf" },
      { offset: "100%", color: "#0f766e" },
    ],
  }),
  createLinearGradientDefinition({
    id: "gold",
    name: "Gold",
    fileStem: "gold",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff8c9" },
      { offset: "28%", color: "#f9d976" },
      { offset: "58%", color: "#d6a23d" },
      { offset: "100%", color: "#7c5317" },
    ],
  }),
  createLinearGradientDefinition({
    id: "rose-gold",
    name: "Rose Gold",
    fileStem: "rose-gold",
    x1: "8%",
    y1: "0%",
    x2: "92%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff5ef" },
      { offset: "34%", color: "#f7c6b4" },
      { offset: "68%", color: "#d78f7f" },
      { offset: "100%", color: "#7c4b45" },
    ],
  }),
  createLinearGradientDefinition({
    id: "chrome",
    name: "Chrome",
    fileStem: "chrome",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#ffffff" },
      { offset: "20%", color: "#cfd6dd" },
      { offset: "42%", color: "#7f8a98" },
      { offset: "66%", color: "#edf2f7" },
      { offset: "100%", color: "#3d4653" },
    ],
  }),
  createLinearGradientDefinition({
    id: "copper",
    name: "Copper",
    fileStem: "copper",
    x1: "0%",
    y1: "10%",
    x2: "100%",
    y2: "90%",
    stops: [
      { offset: "0%", color: "#fff1de" },
      { offset: "30%", color: "#e8a15f" },
      { offset: "62%", color: "#b66a3a" },
      { offset: "100%", color: "#5f2818" },
    ],
  }),
  createLinearGradientDefinition({
    id: "deep-ocean",
    name: "Deep Ocean",
    fileStem: "deep-ocean",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#d4fcff" },
      { offset: "26%", color: "#4cc9f0" },
      { offset: "62%", color: "#1463ff" },
      { offset: "100%", color: "#051937" },
    ],
  }),
  createLinearGradientDefinition({
    id: "jade",
    name: "Jade",
    fileStem: "jade",
    x1: "0%",
    y1: "8%",
    x2: "100%",
    y2: "92%",
    stops: [
      { offset: "0%", color: "#f0fff9" },
      { offset: "35%", color: "#6ee7b7" },
      { offset: "68%", color: "#11998e" },
      { offset: "100%", color: "#064e3b" },
    ],
  }),
  createLinearGradientDefinition({
    id: "cotton-candy",
    name: "Cotton Candy",
    fileStem: "cotton-candy",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#ffe3f1" },
      { offset: "34%", color: "#ff8fd1" },
      { offset: "70%", color: "#b388ff" },
      { offset: "100%", color: "#6ee7ff" },
    ],
  }),
  createLinearGradientDefinition({
    id: "peach-glow",
    name: "Peach Glow",
    fileStem: "peach-glow",
    x1: "8%",
    y1: "0%",
    x2: "92%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff2c5" },
      { offset: "30%", color: "#ffbd73" },
      { offset: "64%", color: "#ff8b6a" },
      { offset: "100%", color: "#ff5f8f" },
    ],
  }),
  createLinearGradientDefinition({
    id: "purple-haze",
    name: "Purple Haze",
    fileStem: "purple-haze",
    x1: "12%",
    y1: "0%",
    x2: "88%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#f3e8ff" },
      { offset: "30%", color: "#c084fc" },
      { offset: "65%", color: "#7c3aed" },
      { offset: "100%", color: "#2b1055" },
    ],
  }),
  createLinearGradientDefinition({
    id: "royal-sapphire",
    name: "Royal Sapphire",
    fileStem: "royal-sapphire",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#ebf8ff" },
      { offset: "26%", color: "#60a5fa" },
      { offset: "62%", color: "#1d4ed8" },
      { offset: "100%", color: "#0f172a" },
    ],
  }),
  createLinearGradientDefinition({
    id: "synthwave",
    name: "Synthwave",
    fileStem: "synthwave",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff27a" },
      { offset: "28%", color: "#ff66c4" },
      { offset: "60%", color: "#8b5cf6" },
      { offset: "100%", color: "#2dd4bf" },
    ],
  }),
  createLinearGradientDefinition({
    id: "magma",
    name: "Magma",
    fileStem: "magma",
    x1: "0%",
    y1: "10%",
    x2: "100%",
    y2: "90%",
    stops: [
      { offset: "0%", color: "#fff7bf" },
      { offset: "24%", color: "#ffb347" },
      { offset: "55%", color: "#ff5e33" },
      { offset: "100%", color: "#5f0f12" },
    ],
  }),
  createRadialGradientDefinition({
    id: "arctic-night",
    name: "Arctic Night",
    fileStem: "arctic-night",
    cx: "34%",
    cy: "28%",
    r: "85%",
    fx: "28%",
    fy: "24%",
    stops: [
      { offset: "0%", color: "#f2fdff" },
      { offset: "24%", color: "#8edcff" },
      { offset: "56%", color: "#315b9a" },
      { offset: "100%", color: "#020617" },
    ],
  }),
  createRadialGradientDefinition({
    id: "pearl",
    name: "Pearl",
    fileStem: "pearl",
    cx: "34%",
    cy: "28%",
    r: "90%",
    fx: "26%",
    fy: "22%",
    stops: [
      { offset: "0%", color: "#ffffff" },
      { offset: "28%", color: "#fde2ff" },
      { offset: "62%", color: "#dbeafe" },
      { offset: "100%", color: "#94a3b8" },
    ],
  }),
  createLinearGradientDefinition({
    id: "prism",
    name: "Prism",
    fileStem: "prism",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#ff5f6d" },
      { offset: "18%", color: "#ffc371" },
      { offset: "36%", color: "#fff27a" },
      { offset: "54%", color: "#4ade80" },
      { offset: "72%", color: "#38bdf8" },
      { offset: "88%", color: "#818cf8" },
      { offset: "100%", color: "#f472b6" },
    ],
  }),
  createLinearGradientDefinition({
    id: "toxic-lime",
    name: "Toxic Lime",
    fileStem: "toxic-lime",
    x1: "0%",
    y1: "12%",
    x2: "100%",
    y2: "88%",
    stops: [
      { offset: "0%", color: "#faff9d" },
      { offset: "30%", color: "#d9ff00" },
      { offset: "66%", color: "#57cc99" },
      { offset: "100%", color: "#14532d" },
    ],
  }),
  createLinearGradientDefinition({
    id: "neon-pop",
    name: "Neon Pop",
    fileStem: "neon-pop",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#d9ff00" },
      { offset: "34%", color: "#00f5ff" },
      { offset: "68%", color: "#7c3aed" },
      { offset: "100%", color: "#ff4ecd" },
    ],
  }),
  createLinearGradientDefinition({
    id: "rose-dawn",
    name: "Rose Dawn",
    fileStem: "rose-dawn",
    x1: "8%",
    y1: "0%",
    x2: "92%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff1f2" },
      { offset: "34%", color: "#fda4af" },
      { offset: "68%", color: "#fb7185" },
      { offset: "100%", color: "#9f1239" },
    ],
  }),
  createLinearGradientDefinition({
    id: "royal-velvet",
    name: "Royal Velvet",
    fileStem: "royal-velvet",
    x1: "6%",
    y1: "0%",
    x2: "94%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#f5ecff" },
      { offset: "30%", color: "#8b5cf6" },
      { offset: "68%", color: "#4c1d95" },
      { offset: "100%", color: "#12071f" },
    ],
  }),
  createLinearGradientDefinition({
    id: "midnight-neon",
    name: "Midnight Neon",
    fileStem: "midnight-neon",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#020617" },
      { offset: "26%", color: "#0f172a" },
      { offset: "62%", color: "#06b6d4" },
      { offset: "100%", color: "#67e8f9" },
    ],
  }),
  createLinearGradientDefinition({
    id: "ruby-glow",
    name: "Ruby Glow",
    fileStem: "ruby-glow",
    x1: "10%",
    y1: "0%",
    x2: "90%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff1f2" },
      { offset: "28%", color: "#fb7185" },
      { offset: "62%", color: "#e11d48" },
      { offset: "100%", color: "#4c0519" },
    ],
  }),
  createLinearGradientDefinition({
    id: "champagne",
    name: "Champagne",
    fileStem: "champagne",
    x1: "8%",
    y1: "0%",
    x2: "92%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fffdf2" },
      { offset: "32%", color: "#f8e7b5" },
      { offset: "66%", color: "#e2c97a" },
      { offset: "100%", color: "#7c6240" },
    ],
  }),
  createLinearGradientDefinition({
    id: "obsidian",
    name: "Obsidian",
    fileStem: "obsidian",
    x1: "0%",
    y1: "8%",
    x2: "100%",
    y2: "92%",
    stops: [
      { offset: "0%", color: "#f8fafc" },
      { offset: "18%", color: "#9ca3af" },
      { offset: "48%", color: "#111827" },
      { offset: "100%", color: "#020617" },
    ],
  }),
  createLinearGradientDefinition({
    id: "desert-sun",
    name: "Desert Sun",
    fileStem: "desert-sun",
    x1: "6%",
    y1: "0%",
    x2: "94%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#fff7cc" },
      { offset: "30%", color: "#fbbf24" },
      { offset: "66%", color: "#f97316" },
      { offset: "100%", color: "#7c2d12" },
    ],
  }),
];

const shapeDefinitions: ShapeDefinition[] = [
  {
    id: "badge",
    name: "Rounded Badge",
    fileStem: "rounded-badge",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <rect x="18" y="18" width="64" height="64" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "circle",
    name: "Circle",
    fileStem: "circle",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <circle cx="50" cy="50" r="32" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "hex",
    name: "Hex",
    fileStem: "hex",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <polygon points="50,12 78,28 78,72 50,88 22,72 22,28" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "shield",
    name: "Shield",
    fileStem: "shield",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path d="M50 12 L77 24 V47 C77 66 65 79 50 88 C35 79 23 66 23 47 V24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "star",
    name: "Star",
    fileStem: "star",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 60,36 88,36 66,52 74,80 50,64 26,80 34,52 12,36 40,36" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "bolt",
    name: "Bolt",
    fileStem: "bolt",
    defaultScale: 0.33,
    renderBody: (fill, stroke) => `
      <path d="M57 12 L26 56 H44 L36 88 L74 42 H56 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "pill",
    name: "Pill",
    fileStem: "pill",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <rect x="14" y="30" width="72" height="40" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "diamond",
    name: "Diamond",
    fileStem: "diamond",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <polygon points="50,12 82,50 50,88 18,50" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "triangle",
    name: "Triangle",
    fileStem: "triangle",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <polygon points="50,14 84,84 16,84" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "chevron-shape",
    name: "Chevron",
    fileStem: "chevron",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path d="M20 24 L50 54 L80 24 L88 32 L50 72 L12 32 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "pentagon",
    name: "Pentagon",
    fileStem: "pentagon",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <polygon points="50,12 84,38 70,84 30,84 16,38" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "octagon",
    name: "Octagon",
    fileStem: "octagon",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <polygon points="34,12 66,12 88,34 88,66 66,88 34,88 12,66 12,34" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "cross",
    name: "Cross",
    fileStem: "cross",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <path d="M38 14 H62 V38 H86 V62 H62 V86 H38 V62 H14 V38 H38 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "heart",
    name: "Heart",
    fileStem: "heart",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path d="M50 82 C28 68 16 54 16 38 C16 27 24 18 35 18 C42 18 48 21 50 28 C52 21 58 18 65 18 C76 18 84 27 84 38 C84 54 72 68 50 82 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "crescent",
    name: "Crescent",
    fileStem: "crescent",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path fill-rule="evenodd" d="M50 18 A32 32 0 1 1 49.9 18 Z M62 18 A24 24 0 1 0 61.9 18 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "drop",
    name: "Drop",
    fileStem: "drop",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <path d="M50 14 C60 32 72 44 72 60 C72 75 62 86 50 86 C38 86 28 75 28 60 C28 44 40 32 50 14 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "cloud",
    name: "Cloud",
    fileStem: "cloud",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <circle cx="38" cy="50" r="16" />
        <circle cx="54" cy="40" r="18" />
        <circle cx="68" cy="52" r="14" />
        <rect x="24" y="48" width="52" height="18" rx="9" />
      </g>
    `,
  },
  {
    id: "speech",
    name: "Speech Bubble",
    fileStem: "speech-bubble",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path d="M22 24 H78 A10 10 0 0 1 88 34 V56 A10 10 0 0 1 78 66 H58 L46 80 L44 66 H22 A10 10 0 0 1 12 56 V34 A10 10 0 0 1 22 24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "arrow-right",
    name: "Arrow Right",
    fileStem: "arrow-right",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M16 38 H56 V22 L86 50 L56 78 V62 H16 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "arrow-up",
    name: "Arrow Up",
    fileStem: "arrow-up",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M50 14 L84 48 H66 V86 H34 V48 H16 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "crown",
    name: "Crown",
    fileStem: "crown",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M16 72 L22 28 L40 50 L50 22 L60 50 L78 28 L84 72 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "burst",
    name: "Burst",
    fileStem: "burst",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 59,24 76,16 74,34 90,40 78,54 90,68 72,70 68,88 50,80 32,88 28,70 10,68 22,54 10,40 26,34 24,16 41,24" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "ribbon",
    name: "Ribbon",
    fileStem: "ribbon",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M20 18 H80 V52 H62 L54 82 L46 52 H20 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "flower",
    name: "Flower",
    fileStem: "flower",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <circle cx="50" cy="30" r="13" />
        <circle cx="70" cy="50" r="13" />
        <circle cx="50" cy="70" r="13" />
        <circle cx="30" cy="50" r="13" />
        <circle cx="50" cy="50" r="11" />
      </g>
    `,
  },
  {
    id: "banner",
    name: "Banner",
    fileStem: "banner",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M18 30 H82 L72 50 L82 70 H18 L28 50 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "medal",
    name: "Medal",
    fileStem: "medal",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <path d="M34 14 H46 L42 34 H30 Z" />
        <path d="M54 14 H66 L70 34 H58 Z" />
        <circle cx="50" cy="58" r="22" />
      </g>
    `,
  },

  {
    id: "square",
    name: "Square",
    fileStem: "square",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <rect x="18" y="18" width="64" height="64" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "squircle",
    name: "Squircle",
    fileStem: "squircle",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <rect x="16" y="16" width="68" height="68" rx="24" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "ring",
    name: "Ring",
    fileStem: "ring",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path fill-rule="evenodd" d="M50 12 A38 38 0 1 1 49.9 12 Z M50 30 A20 20 0 1 0 49.9 30 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "triangle-right",
    name: "Triangle Right",
    fileStem: "triangle-right",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <polygon points="18,18 82,50 18,82" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "triangle-left",
    name: "Triangle Left",
    fileStem: "triangle-left",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <polygon points="82,18 18,50 82,82" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "triangle-down",
    name: "Triangle Down",
    fileStem: "triangle-down",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <polygon points="16,18 84,18 50,86" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "arrow-left",
    name: "Arrow Left",
    fileStem: "arrow-left",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M84 38 H44 V22 L14 50 L44 78 V62 H84 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "arrow-down",
    name: "Arrow Down",
    fileStem: "arrow-down",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M16 52 L50 86 L84 52 H66 V14 H34 V52 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "double-arrow-right",
    name: "Double Arrow",
    fileStem: "double-arrow-right",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M14 24 L38 50 L14 76 H30 L54 50 L30 24 Z M46 24 L70 50 L46 76 H62 L86 50 L62 24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "map-pin",
    name: "Map Pin",
    fileStem: "map-pin",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path d="M50 12 C35 12 24 24 24 38 C24 56 40 67 50 86 C60 67 76 56 76 38 C76 24 65 12 50 12 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "tag",
    name: "Tag",
    fileStem: "tag",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path d="M18 34 L44 18 H78 L82 50 L78 82 H44 L18 66 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
      <circle cx="58" cy="34" r="4" fill="rgba(255,255,255,0.6)" />
    `,
  },
  {
    id: "ticket",
    name: "Ticket",
    fileStem: "ticket",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path fill-rule="evenodd" d="M16 28 H84 V40 A8 8 0 0 0 84 60 V72 H16 V60 A8 8 0 0 0 16 40 Z M50 28 V72" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-dasharray="6 5" />
    `,
  },
  {
    id: "bookmark",
    name: "Bookmark",
    fileStem: "bookmark",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path d="M28 14 H72 V86 L50 68 L28 86 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "flame",
    name: "Flame",
    fileStem: "flame",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path d="M54 14 C58 28 72 34 72 52 C72 70 62 84 50 84 C36 84 26 72 26 56 C26 42 36 30 46 22 C46 30 50 34 54 14 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "sun",
    name: "Sun",
    fileStem: "sun",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <circle cx="50" cy="50" r="18" />
        <path d="M50 12 V26 M50 74 V88 M12 50 H26 M74 50 H88 M23 23 L32 32 M68 68 L77 77 M23 77 L32 68 M68 32 L77 23" fill="none" stroke="${stroke}" stroke-linecap="round" />
      </g>
    `,
  },
  {
    id: "sparkle-4",
    name: "Sparkle",
    fileStem: "sparkle-4",
    defaultScale: 0.34,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 58,42 90,50 58,58 50,90 42,58 10,50 42,42" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "sparkle-8",
    name: "Sparkle 8",
    fileStem: "sparkle-8",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 56,30 72,18 66,38 86,44 66,50 72,70 56,58 50,90 44,58 28,70 34,50 14,44 34,38 28,18 44,30" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "clover",
    name: "Clover",
    fileStem: "clover",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <circle cx="38" cy="38" r="14" />
        <circle cx="62" cy="38" r="14" />
        <circle cx="38" cy="62" r="14" />
        <circle cx="62" cy="62" r="14" />
        <path d="M50 64 C56 70 60 76 60 84" fill="none" stroke="${stroke}" stroke-linecap="round" />
      </g>
    `,
  },
  {
    id: "x-mark",
    name: "X Mark",
    fileStem: "x-mark",
    defaultScale: 0.35,
    renderBody: (fill, stroke) => `
      <path d="M26 18 L50 42 L74 18 L82 26 L58 50 L82 74 L74 82 L50 58 L26 82 L18 74 L42 50 L18 26 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "paw",
    name: "Paw",
    fileStem: "paw",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <ellipse cx="32" cy="28" rx="7" ry="9" />
        <ellipse cx="46" cy="22" rx="7" ry="9" />
        <ellipse cx="60" cy="22" rx="7" ry="9" />
        <ellipse cx="74" cy="30" rx="7" ry="9" />
        <path d="M50 42 C64 42 76 52 74 66 C72 78 60 86 46 82 C34 78 24 70 26 58 C28 48 38 42 50 42 Z" />
      </g>
    `,
  },
  {
    id: "thought-bubble",
    name: "Thought Bubble",
    fileStem: "thought-bubble",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <ellipse cx="50" cy="44" rx="30" ry="22" />
        <circle cx="28" cy="70" r="6" />
        <circle cx="18" cy="82" r="4" />
      </g>
    `,
  },
  {
    id: "shield-alt",
    name: "Shield Alt",
    fileStem: "shield-alt",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path d="M50 14 L80 24 V44 C80 66 66 80 50 88 C34 80 20 66 20 44 V24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "frame",
    name: "Frame",
    fileStem: "frame",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path fill-rule="evenodd" d="M16 16 H84 V84 H16 Z M28 28 H72 V72 H28 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "double-chevron",
    name: "Double Chevron",
    fileStem: "double-chevron",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M18 30 L44 50 L18 70 L30 82 L70 50 L30 18 Z M44 18 L84 50 L44 82 L56 70 L72 58 L84 50 L72 42 L56 30 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "rosette",
    name: "Rosette",
    fileStem: "rosette",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M50 14 C56 20 64 18 68 22 C72 26 80 26 82 32 C84 38 90 44 88 50 C90 56 84 62 82 68 C80 74 72 74 68 78 C64 82 56 80 50 86 C44 80 36 82 32 78 C28 74 20 74 18 68 C16 62 10 56 12 50 C10 44 16 38 18 32 C20 26 28 26 32 22 C36 18 44 20 50 14 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "seal-12",
    name: "Seal",
    fileStem: "seal-12",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 58,18 70,14 74,26 86,26 82,38 90,50 82,62 86,74 74,74 70,86 58,82 50,90 42,82 30,86 26,74 14,74 18,62 10,50 18,38 14,26 26,26 30,14 42,18" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "pennant",
    name: "Pennant",
    fileStem: "pennant",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M20 18 H78 V46 L54 34 L78 22 V82 H20 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "ribbon-tail",
    name: "Ribbon Tail",
    fileStem: "ribbon-tail",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M20 18 H80 V56 H62 L56 82 L44 68 L32 82 L38 56 H20 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "arch",
    name: "Arch",
    fileStem: "arch",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <path d="M20 82 V40 C20 24 33 14 50 14 C67 14 80 24 80 40 V82 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "trapezoid",
    name: "Trapezoid",
    fileStem: "trapezoid",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="26,18 74,18 86,82 14,82" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "parallelogram",
    name: "Parallelogram",
    fileStem: "parallelogram",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="28,18 84,18 72,82 16,82" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "folder-tab",
    name: "Folder Tab",
    fileStem: "folder-tab",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M16 30 H40 L48 20 H84 V78 H16 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "ticket-notch",
    name: "Ticket Notch",
    fileStem: "ticket-notch",
    defaultScale: 0.39,
    renderBody: (fill, stroke) => `
      <path fill-rule="evenodd" d="M18 24 H82 V38 A7 7 0 0 0 82 62 V76 H18 V62 A7 7 0 0 0 18 38 Z M18 50 A5 5 0 0 1 18 50 Z M82 50 A5 5 0 0 1 82 50 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-dasharray="5 4" />
    `,
  },
  {
    id: "scroll-banner",
    name: "Scroll Banner",
    fileStem: "scroll-banner",
    defaultScale: 0.39,
    renderBody: (fill, stroke) => `
      <path d="M18 30 H82 V66 H60 L50 78 L40 66 H18 Z M18 30 L10 38 L18 46 M82 30 L90 38 L82 46" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "star-8",
    name: "Star 8",
    fileStem: "star-8",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 58,30 78,22 70,42 90,50 70,58 78,78 58,70 50,90 42,70 22,78 30,58 10,50 30,42 22,22 42,30" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "star-12",
    name: "Star 12",
    fileStem: "star-12",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,8 56,24 70,14 68,30 84,26 76,40 92,44 78,54 92,66 76,70 84,84 68,80 70,96 56,86 50,92 44,86 30,96 32,80 16,84 24,70 8,66 22,54 8,44 24,40 16,26 32,30 30,14 44,24" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "shield-point",
    name: "Shield Point",
    fileStem: "shield-point",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M50 12 L82 24 V42 C82 62 68 76 50 90 C32 76 18 62 18 42 V24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "capsule-vertical",
    name: "Capsule Vertical",
    fileStem: "capsule-vertical",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <rect x="30" y="14" width="40" height="72" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="2.6" />
    `,
  },
  {
    id: "notched-rect",
    name: "Notched Rect",
    fileStem: "notched-rect",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M18 22 H82 V38 L72 50 L82 62 V78 H18 V62 L28 50 L18 38 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "home-plate",
    name: "Home Plate",
    fileStem: "home-plate",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M24 22 H76 L86 54 L50 86 L14 54 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "kite",
    name: "Kite",
    fileStem: "kite",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 82,44 58,90 18,52" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "gem-cut",
    name: "Gem Cut",
    fileStem: "gem-cut",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M28 18 H72 L86 34 L74 78 H26 L14 34 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "arc-ribbon",
    name: "Arc Ribbon",
    fileStem: "arc-ribbon",
    defaultScale: 0.39,
    renderBody: (fill, stroke) => `
      <path d="M16 34 C24 18 38 10 50 10 C62 10 76 18 84 34 V58 H66 L58 80 L50 64 L42 80 L34 58 H16 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "label-notch",
    name: "Label Notch",
    fileStem: "label-notch",
    defaultScale: 0.39,
    renderBody: (fill, stroke) => `
      <path d="M18 26 H82 V74 H18 L32 50 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "diamond-cut",
    name: "Diamond Cut",
    fileStem: "diamond-cut",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 74,28 86,50 74,72 50,90 26,72 14,50 26,28" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "burst-24",
    name: "Burst 24",
    fileStem: "burst-24",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,8 56,20 68,12 68,26 82,18 76,32 92,30 82,42 96,50 82,58 92,70 76,68 82,82 68,74 68,88 56,80 50,92 44,80 32,88 32,74 18,82 24,68 8,70 18,58 4,50 18,42 8,30 24,32 18,18 32,26 32,12 44,20" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "shield-round",
    name: "Shield Round",
    fileStem: "shield-round",
    defaultScale: 0.37,
    renderBody: (fill, stroke) => `
      <path d="M50 14 L78 24 V42 C78 62 66 76 50 88 C34 76 22 62 22 42 V24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "hex-point",
    name: "Hex Point",
    fileStem: "hex-point",
    defaultScale: 0.36,
    renderBody: (fill, stroke) => `
      <polygon points="50,10 76,24 86,50 76,76 50,90 24,76 14,50 24,24" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "medallion-ribbon",
    name: "Medallion Ribbon",
    fileStem: "medallion-ribbon",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M36 20 H64 L70 34 L82 40 L76 54 L80 68 L66 70 L58 84 L50 74 L42 84 L34 70 L20 68 L24 54 L18 40 L30 34 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "corner-ribbon",
    name: "Corner Ribbon",
    fileStem: "corner-ribbon",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <path d="M18 18 H82 V56 L62 50 L50 82 L36 52 L18 56 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },
  {
    id: "double-tag",
    name: "Double Tag",
    fileStem: "double-tag",
    defaultScale: 0.38,
    renderBody: (fill, stroke) => `
      <g fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
        <path d="M22 28 H58 L76 46 L58 64 H22 Z" />
        <path d="M42 18 H78 L90 30 V58 L72 76 H42 Z" opacity="0.92" />
      </g>
    `,
  },
  {
    id: "wave-badge",
    name: "Wave Badge",
    fileStem: "wave-badge",
    defaultScale: 0.39,
    renderBody: (fill, stroke) => `
      <path d="M18 32 C28 20 40 20 50 28 C60 36 72 36 82 24 V70 C72 82 60 82 50 74 C40 66 28 66 18 78 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" />
    `,
  },

];

const getPatternDefinitionById = (id: string) =>
  patternDefinitions.find((preset) => preset.id === id) || patternDefinitions[0]!;

const getGradientDefinitionById = (id: string) =>
  gradientDefinitions.find((preset) => preset.id === id) || gradientDefinitions[0]!;

const getShapeDefinitionById = (id: string) => shapeDefinitions.find((preset) => preset.id === id) || shapeDefinitions[0]!;

const createStylePreviewSrc = (definition: StyleDefinition) => {
  const shapePreset = getShapeDefinitionById(definition.previewShapeId);
  const solidFill = createSolidFill(definition.solidColor);
  let defs = solidFill.defs;
  let fill = solidFill.fill;

  if (definition.fillMode === "pattern") {
    defs = renderPatternDefinitionWithControls(
      getPatternDefinitionById(definition.patternPresetId),
      "shape-fill",
      definition.patternControls
    );
    fill = "url(#shape-fill)";
  } else if (definition.fillMode === "gradient") {
    defs = getGradientDefinitionById(definition.gradientPresetId).renderDefinition("shape-fill");
    fill = "url(#shape-fill)";
  }

  return createShapeTextureSvg(shapePreset, defs, fill, solidFill.stroke, {
    strokeColor: definition.strokeColor,
    strokeWidth: definition.strokeWidth,
    shadowColor: definition.shadowColor,
    shadowOpacity: definition.shadowOpacity,
    shadowBlur: definition.shadowBlur,
    shadowOffsetX: definition.shadowOffsetX,
    shadowOffsetY: definition.shadowOffsetY,
  });
};

const styleDefinitions: StyleDefinition[] = [
  {
    id: "sport",
    name: "Sport",
    previewShapeId: "badge",
    fillMode: "pattern",
    solidColor: "#0f172a",
    strokeColor: "#ffffff",
    strokeWidth: 1.8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.28,
    shadowBlur: 2.6,
    shadowOffsetX: 0,
    shadowOffsetY: 2.2,
    patternPresetId: "sport-stripe",
    gradientPresetId: "sunset",
    patternControls: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: -8,
      repeatX: 1.3,
      repeatY: 1.3,
      mirrorRepeat: false,
    },
  },
  {
    id: "cyber",
    name: "Cyber",
    previewShapeId: "bolt",
    fillMode: "pattern",
    solidColor: "#06b6d4",
    strokeColor: "#cffafe",
    strokeWidth: 1.3,
    shadowColor: "#22d3ee",
    shadowOpacity: 0.36,
    shadowBlur: 4.4,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    patternPresetId: "cyber-grid",
    gradientPresetId: "midnight-neon",
    patternControls: {
      scale: 0.9,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0,
      repeatX: 1.8,
      repeatY: 1.8,
      mirrorRepeat: false,
    },
  },
  {
    id: "vintage",
    name: "Vintage",
    previewShapeId: "shield-alt",
    fillMode: "gradient",
    solidColor: "#8b5e3c",
    strokeColor: "#f8e7c8",
    strokeWidth: 1.6,
    shadowColor: "#4a2d1f",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 1.4,
    patternPresetId: "topography",
    gradientPresetId: "copper",
    patternControls: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0,
      repeatX: 1,
      repeatY: 1,
      mirrorRepeat: false,
    },
  },
  {
    id: "grunge",
    name: "Grunge",
    previewShapeId: "burst",
    fillMode: "pattern",
    solidColor: "#202020",
    strokeColor: "#f5f5f4",
    strokeWidth: 1.2,
    shadowColor: "#111111",
    shadowOpacity: 0.24,
    shadowBlur: 2.8,
    shadowOffsetX: 0.2,
    shadowOffsetY: 2.4,
    patternPresetId: "spray-paint",
    gradientPresetId: "obsidian",
    patternControls: {
      scale: 0.95,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 12,
      repeatX: 1.4,
      repeatY: 1.4,
      mirrorRepeat: false,
    },
  },
  {
    id: "luxury",
    name: "Luxury",
    previewShapeId: "crown",
    fillMode: "gradient",
    solidColor: "#c2871d",
    strokeColor: "#fff6cf",
    strokeWidth: 1.5,
    shadowColor: "#5b3b0c",
    shadowOpacity: 0.22,
    shadowBlur: 3,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "honeycomb",
    gradientPresetId: "gold",
    patternControls: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0,
      repeatX: 1,
      repeatY: 1,
      mirrorRepeat: false,
    },
  },
  {
    id: "neon",
    name: "Neon",
    previewShapeId: "star-8",
    fillMode: "gradient",
    solidColor: "#00d4ff",
    strokeColor: "#e6ffff",
    strokeWidth: 1.4,
    shadowColor: "#00f5ff",
    shadowOpacity: 0.42,
    shadowBlur: 5.4,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    patternPresetId: "cyber-grid",
    gradientPresetId: "neon-pop",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "racing",
    name: "Racing",
    previewShapeId: "ticket-notch",
    fillMode: "pattern",
    solidColor: "#111827",
    strokeColor: "#ffffff",
    strokeWidth: 1.7,
    shadowColor: "#7f1d1d",
    shadowOpacity: 0.16,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "racing-check",
    gradientPresetId: "fire",
    patternControls: { scale: 0.95, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.25, repeatY: 1.25, mirrorRepeat: false },
  },
  {
    id: "sticker",
    name: "Sticker",
    previewShapeId: "badge",
    fillMode: "solid",
    solidColor: "#ef4444",
    strokeColor: "#ffffff",
    strokeWidth: 2.5,
    shadowColor: "#111827",
    shadowOpacity: 0.22,
    shadowBlur: 2.6,
    shadowOffsetX: 0,
    shadowOffsetY: 2.2,
    patternPresetId: "checker",
    gradientPresetId: "sunset",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "comic",
    name: "Comic",
    previewShapeId: "burst",
    fillMode: "pattern",
    solidColor: "#111827",
    strokeColor: "#ffffff",
    strokeWidth: 1.8,
    shadowColor: "#111827",
    shadowOpacity: 0.18,
    shadowBlur: 1.8,
    shadowOffsetX: 0.8,
    shadowOffsetY: 1.8,
    patternPresetId: "halftone",
    gradientPresetId: "prism",
    patternControls: { scale: 0.9, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.3, repeatY: 1.3, mirrorRepeat: false },
  },
  {
    id: "chrome-x",
    name: "Chrome",
    previewShapeId: "shield-alt",
    fillMode: "gradient",
    solidColor: "#9ca3af",
    strokeColor: "#f8fafc",
    strokeWidth: 1.3,
    shadowColor: "#334155",
    shadowOpacity: 0.2,
    shadowBlur: 2.6,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "carbon",
    gradientPresetId: "chrome",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "tactical",
    name: "Tactical",
    previewShapeId: "shield-point",
    fillMode: "pattern",
    solidColor: "#2f4637",
    strokeColor: "#ecfdf5",
    strokeWidth: 1.2,
    shadowColor: "#0f1720",
    shadowOpacity: 0.24,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2.2,
    patternPresetId: "digital-camo",
    gradientPresetId: "jade",
    patternControls: { scale: 0.95, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.45, repeatY: 1.45, mirrorRepeat: false },
  },
  {
    id: "ocean",
    name: "Ocean",
    previewShapeId: "drop",
    fillMode: "gradient",
    solidColor: "#1463ff",
    strokeColor: "#eff6ff",
    strokeWidth: 1.5,
    shadowColor: "#082f49",
    shadowOpacity: 0.24,
    shadowBlur: 2.8,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "wave-lines",
    gradientPresetId: "deep-ocean",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "inferno",
    name: "Inferno",
    previewShapeId: "flame",
    fillMode: "gradient",
    solidColor: "#b91c1c",
    strokeColor: "#fff7ed",
    strokeWidth: 1.5,
    shadowColor: "#7c2d12",
    shadowOpacity: 0.26,
    shadowBlur: 3,
    shadowOffsetX: 0,
    shadowOffsetY: 2.2,
    patternPresetId: "flames-pattern",
    gradientPresetId: "fire",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "toxic",
    name: "Toxic",
    previewShapeId: "hex",
    fillMode: "gradient",
    solidColor: "#65a30d",
    strokeColor: "#f7fee7",
    strokeWidth: 1.4,
    shadowColor: "#14532d",
    shadowOpacity: 0.28,
    shadowBlur: 3.4,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    patternPresetId: "hazard",
    gradientPresetId: "toxic-lime",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "candy",
    name: "Candy",
    previewShapeId: "heart",
    fillMode: "gradient",
    solidColor: "#ec4899",
    strokeColor: "#fff7fb",
    strokeWidth: 1.6,
    shadowColor: "#9d174d",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 1.8,
    patternPresetId: "hearts",
    gradientPresetId: "cotton-candy",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "paper-cut-style",
    name: "Paper Cut",
    previewShapeId: "speech",
    fillMode: "pattern",
    solidColor: "#cbd5e1",
    strokeColor: "#ffffff",
    strokeWidth: 1.8,
    shadowColor: "#64748b",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "paper-cut",
    gradientPresetId: "pearl",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "wild",
    name: "Wild",
    previewShapeId: "paw",
    fillMode: "pattern",
    solidColor: "#7c2d12",
    strokeColor: "#fff7ed",
    strokeWidth: 1.3,
    shadowColor: "#2b190d",
    shadowOpacity: 0.22,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2.2,
    patternPresetId: "leopard",
    gradientPresetId: "desert-sun",
    patternControls: { scale: 0.95, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.2, repeatY: 1.2, mirrorRepeat: false },
  },
  {
    id: "royal",
    name: "Royal",
    previewShapeId: "crown",
    fillMode: "gradient",
    solidColor: "#4c1d95",
    strokeColor: "#f5ecff",
    strokeWidth: 1.5,
    shadowColor: "#2e1065",
    shadowOpacity: 0.22,
    shadowBlur: 2.8,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "diamonds-pattern",
    gradientPresetId: "royal-velvet",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "midnight",
    name: "Midnight",
    previewShapeId: "diamond",
    fillMode: "gradient",
    solidColor: "#111827",
    strokeColor: "#e2e8f0",
    strokeWidth: 1.3,
    shadowColor: "#020617",
    shadowOpacity: 0.28,
    shadowBlur: 3.2,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "pixel-rain",
    gradientPresetId: "obsidian",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "street-art",
    name: "Street Art",
    previewShapeId: "scroll-banner",
    fillMode: "pattern",
    solidColor: "#1f2937",
    strokeColor: "#ffffff",
    strokeWidth: 1.9,
    shadowColor: "#111827",
    shadowOpacity: 0.24,
    shadowBlur: 2.6,
    shadowOffsetX: 0.6,
    shadowOffsetY: 2,
    patternPresetId: "spray-paint",
    gradientPresetId: "sunset",
    patternControls: { scale: 0.92, offsetX: 0, offsetY: 0, rotationDeg: -10, repeatX: 1.35, repeatY: 1.35, mirrorRepeat: false },
  },
  {
    id: "retro-pop",
    name: "Retro Pop",
    previewShapeId: "flower",
    fillMode: "pattern",
    solidColor: "#f97316",
    strokeColor: "#fff7ed",
    strokeWidth: 1.5,
    shadowColor: "#7c2d12",
    shadowOpacity: 0.18,
    shadowBlur: 2,
    shadowOffsetX: 0,
    shadowOffsetY: 1.8,
    patternPresetId: "memphis",
    gradientPresetId: "peach-glow",
    patternControls: { scale: 0.9, offsetX: 0, offsetY: 0, rotationDeg: -6, repeatX: 1.35, repeatY: 1.35, mirrorRepeat: false },
  },
  {
    id: "galaxy",
    name: "Galaxy",
    previewShapeId: "sparkle-8",
    fillMode: "gradient",
    solidColor: "#312e81",
    strokeColor: "#e9d5ff",
    strokeWidth: 1.4,
    shadowColor: "#312e81",
    shadowOpacity: 0.3,
    shadowBlur: 4.2,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    patternPresetId: "stars-pattern",
    gradientPresetId: "synthwave",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    previewShapeId: "frame",
    fillMode: "pattern",
    solidColor: "#1d4ed8",
    strokeColor: "#eff6ff",
    strokeWidth: 1.4,
    shadowColor: "#1e3a8a",
    shadowOpacity: 0.2,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "graph-paper",
    gradientPresetId: "steel",
    patternControls: { scale: 0.92, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.25, repeatY: 1.25, mirrorRepeat: false },
  },
  {
    id: "emerald",
    name: "Emerald",
    previewShapeId: "gem-cut",
    fillMode: "gradient",
    solidColor: "#047857",
    strokeColor: "#ecfdf5",
    strokeWidth: 1.4,
    shadowColor: "#064e3b",
    shadowOpacity: 0.2,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "scales",
    gradientPresetId: "jade",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "rose-glam",
    name: "Rose Glam",
    previewShapeId: "medallion-ribbon",
    fillMode: "gradient",
    solidColor: "#b76e79",
    strokeColor: "#fff1f2",
    strokeWidth: 1.5,
    shadowColor: "#881337",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 1.8,
    patternPresetId: "diamonds-pattern",
    gradientPresetId: "rose-gold",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "bandana-west",
    name: "Bandana West",
    previewShapeId: "diamond-cut",
    fillMode: "pattern",
    solidColor: "#7c2d12",
    strokeColor: "#fff7ed",
    strokeWidth: 1.3,
    shadowColor: "#431407",
    shadowOpacity: 0.22,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "bandana",
    gradientPresetId: "desert-sun",
    patternControls: { scale: 0.9, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.25, repeatY: 1.25, mirrorRepeat: false },
  },
  {
    id: "mesh-club",
    name: "Mesh Club",
    previewShapeId: "hex-point",
    fillMode: "pattern",
    solidColor: "#0f172a",
    strokeColor: "#e2e8f0",
    strokeWidth: 1.2,
    shadowColor: "#020617",
    shadowOpacity: 0.3,
    shadowBlur: 3.4,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    patternPresetId: "mesh-grid",
    gradientPresetId: "midnight-neon",
    patternControls: { scale: 0.84, offsetX: 0, offsetY: 0, rotationDeg: 12, repeatX: 1.7, repeatY: 1.7, mirrorRepeat: false },
  },
  {
    id: "ice-frost",
    name: "Ice Frost",
    previewShapeId: "capsule-vertical",
    fillMode: "gradient",
    solidColor: "#38bdf8",
    strokeColor: "#f0f9ff",
    strokeWidth: 1.5,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "graph-paper",
    gradientPresetId: "ice",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "desert",
    name: "Desert",
    previewShapeId: "arch",
    fillMode: "gradient",
    solidColor: "#b45309",
    strokeColor: "#fef3c7",
    strokeWidth: 1.4,
    shadowColor: "#78350f",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "topography",
    gradientPresetId: "desert-sun",
    patternControls: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1, repeatY: 1, mirrorRepeat: false },
  },
  {
    id: "snake-luxe",
    name: "Snake Luxe",
    previewShapeId: "shield-round",
    fillMode: "pattern",
    solidColor: "#334155",
    strokeColor: "#f8fafc",
    strokeWidth: 1.3,
    shadowColor: "#0f172a",
    shadowOpacity: 0.26,
    shadowBlur: 2.6,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "snake-skin",
    gradientPresetId: "obsidian",
    patternControls: { scale: 0.92, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.3, repeatY: 1.3, mirrorRepeat: false },
  },
  {
    id: "confetti-party",
    name: "Confetti Party",
    previewShapeId: "burst-24",
    fillMode: "pattern",
    solidColor: "#7c3aed",
    strokeColor: "#ffffff",
    strokeWidth: 1.6,
    shadowColor: "#4c1d95",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 1.8,
    patternPresetId: "confetti",
    gradientPresetId: "prism",
    patternControls: { scale: 0.88, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.2, repeatY: 1.2, mirrorRepeat: false },
  },
  {
    id: "patchwork",
    name: "Patchwork",
    previewShapeId: "notched-rect",
    fillMode: "pattern",
    solidColor: "#a16207",
    strokeColor: "#fff7ed",
    strokeWidth: 1.5,
    shadowColor: "#78350f",
    shadowOpacity: 0.18,
    shadowBlur: 2.2,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "patchwork",
    gradientPresetId: "champagne",
    patternControls: { scale: 0.92, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.15, repeatY: 1.15, mirrorRepeat: false },
  },
  {
    id: "graphite",
    name: "Graphite",
    previewShapeId: "parallelogram",
    fillMode: "pattern",
    solidColor: "#1f2937",
    strokeColor: "#f8fafc",
    strokeWidth: 1.2,
    shadowColor: "#111827",
    shadowOpacity: 0.24,
    shadowBlur: 2.8,
    shadowOffsetX: 0.4,
    shadowOffsetY: 2.2,
    patternPresetId: "carbon",
    gradientPresetId: "chrome",
    patternControls: { scale: 0.94, offsetX: 0, offsetY: 0, rotationDeg: -8, repeatX: 1.25, repeatY: 1.25, mirrorRepeat: false },
  },
  {
    id: "pixel-core",
    name: "Pixel Core",
    previewShapeId: "folder-tab",
    fillMode: "pattern",
    solidColor: "#111827",
    strokeColor: "#e0f2fe",
    strokeWidth: 1.3,
    shadowColor: "#0c4a6e",
    shadowOpacity: 0.24,
    shadowBlur: 3.2,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    patternPresetId: "pixel-rain",
    gradientPresetId: "arctic-night",
    patternControls: { scale: 0.86, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.55, repeatY: 1.55, mirrorRepeat: false },
  },
  {
    id: "barcode-tech",
    name: "Barcode Tech",
    previewShapeId: "label-notch",
    fillMode: "pattern",
    solidColor: "#111111",
    strokeColor: "#ffffff",
    strokeWidth: 1.4,
    shadowColor: "#111827",
    shadowOpacity: 0.2,
    shadowBlur: 2.4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "barcode",
    gradientPresetId: "steel",
    patternControls: { scale: 0.92, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.3, repeatY: 1.3, mirrorRepeat: false },
  },
  {
    id: "marble-club",
    name: "Marble Club",
    previewShapeId: "wave-badge",
    fillMode: "pattern",
    solidColor: "#475569",
    strokeColor: "#ffffff",
    strokeWidth: 1.4,
    shadowColor: "#1e293b",
    shadowOpacity: 0.18,
    shadowBlur: 2.6,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    patternPresetId: "marble",
    gradientPresetId: "pearl",
    patternControls: { scale: 0.88, offsetX: 0, offsetY: 0, rotationDeg: 0, repeatX: 1.1, repeatY: 1.1, mirrorRepeat: false },
  },
];

export const DESIGN_PATTERN_PRESETS: DesignPatternPreset[] = patternDefinitions.map((preset) => ({
  ...preset,
  previewSrc: createFillPreviewSvg(preset.renderDefinition(`preview-${preset.id}`), `url(#preview-${preset.id})`),
}));

export const DESIGN_GRADIENT_PRESETS: DesignGradientPreset[] = gradientDefinitions.map((preset) => ({
  ...preset,
  previewSrc: createFillPreviewSvg(preset.renderDefinition(`preview-${preset.id}`), `url(#preview-${preset.id})`),
}));

export const DESIGN_SHAPE_PRESETS: DesignShapePreset[] = shapeDefinitions.map((preset) => {
  const solidFill = createSolidFill("#111111");
  return {
    ...preset,
    previewSrc: createShapeTextureSvg(preset, solidFill.defs, solidFill.fill, "rgba(0, 0, 0, 0.28)"),
  };
});

export const DESIGN_STYLE_PRESETS: DesignStylePreset[] = styleDefinitions.map((preset) => ({
  ...preset,
  previewSrc: createStylePreviewSrc(preset),
}));

const numbersMatch = (left: number, right: number, tolerance = 0.001) => Math.abs(left - right) <= tolerance;

const patternControlsMatch = (left: DesignPatternControls, right: DesignPatternControls) =>
  numbersMatch(left.scale, right.scale) &&
  numbersMatch(left.offsetX, right.offsetX) &&
  numbersMatch(left.offsetY, right.offsetY) &&
  numbersMatch(left.rotationDeg, right.rotationDeg) &&
  numbersMatch(left.repeatX, right.repeatX) &&
  numbersMatch(left.repeatY, right.repeatY) &&
  left.mirrorRepeat === right.mirrorRepeat;

export const applyDesignStylePreset = (
  style: DesignLayerStyle,
  preset: DesignStylePreset
): DesignLayerStyle =>
  sanitizeDesignLayerStyle({
    ...style,
    fillMode: preset.fillMode,
    solidColor: preset.solidColor,
    strokeColor: preset.strokeColor,
    strokeWidth: preset.strokeWidth,
    shadowColor: preset.shadowColor,
    shadowOpacity: preset.shadowOpacity,
    shadowBlur: preset.shadowBlur,
    shadowOffsetX: preset.shadowOffsetX,
    shadowOffsetY: preset.shadowOffsetY,
    printTexture: { ...DEFAULT_PRINT_TEXTURE_STYLE },
    printModeId: null,
    patternPresetId: preset.patternPresetId,
    gradientPresetId: preset.gradientPresetId,
    patternControls: { ...preset.patternControls },
  }) || style;

export const getMatchingDesignStylePresetId = (style: DesignLayerStyle | null | undefined) => {
  const normalizedStyle = style ? sanitizeDesignLayerStyle(style) : null;
  if (!normalizedStyle) {
    return null;
  }

  const match = DESIGN_STYLE_PRESETS.find((preset) => {
    if (!isPrintTextureDisabled(normalizedStyle.printTexture)) {
      return false;
    }
    if (normalizedStyle.fillMode !== preset.fillMode) {
      return false;
    }
    if (normalizeHex(normalizedStyle.solidColor) !== normalizeHex(preset.solidColor)) {
      return false;
    }
    if (normalizeHex(normalizedStyle.strokeColor) !== normalizeHex(preset.strokeColor)) {
      return false;
    }
    if (!numbersMatch(normalizedStyle.strokeWidth, preset.strokeWidth)) {
      return false;
    }
    if (normalizeHex(normalizedStyle.shadowColor) !== normalizeHex(preset.shadowColor)) {
      return false;
    }
    if (!numbersMatch(normalizedStyle.shadowOpacity, preset.shadowOpacity)) {
      return false;
    }
    if (!numbersMatch(normalizedStyle.shadowBlur, preset.shadowBlur)) {
      return false;
    }
    if (!numbersMatch(normalizedStyle.shadowOffsetX, preset.shadowOffsetX)) {
      return false;
    }
    if (!numbersMatch(normalizedStyle.shadowOffsetY, preset.shadowOffsetY)) {
      return false;
    }
    if (normalizedStyle.patternPresetId !== preset.patternPresetId) {
      return false;
    }
    if (normalizedStyle.gradientPresetId !== preset.gradientPresetId) {
      return false;
    }
    return patternControlsMatch(normalizedStyle.patternControls, preset.patternControls);
  });

  return match?.id || null;
};

export const createGeneratedDesignAsset = ({
  style,
  isRussian,
}: {
  style: DesignLayerStyle;
  isRussian: boolean;
}) => {
  const {
    fillMode,
    solidColor,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowOpacity,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    printTexture,
    textureDataUrl,
    textureFileName,
    textureWidth,
    textureHeight,
    textureAutoCenter,
    textureContentBounds,
    shapePreset,
    patternPreset,
    gradientPreset,
    patternControls,
  } = resolveDesignLayerRequest(style);
  const solidFill = createSolidFill(solidColor);
  let defs = solidFill.defs;
  let fill = solidFill.fill;
  let fileSuffix = "solid";

  if (fillMode === "pattern") {
    defs = renderPatternDefinitionWithControls(
      patternPreset,
      "shape-fill",
      patternControls || DEFAULT_DESIGN_PATTERN_CONTROLS
    );
    fill = "url(#shape-fill)";
    fileSuffix = patternPreset.fileStem;
  } else if (fillMode === "texture" && textureDataUrl) {
    defs = renderTextureDefinitionWithControls({
      fillId: "shape-fill",
      textureDataUrl,
      textureWidth,
      textureHeight,
      textureAutoCenter,
      textureContentBounds,
      controls: patternControls || DEFAULT_DESIGN_PATTERN_CONTROLS,
    });
    fill = "url(#shape-fill)";
    fileSuffix = getTextureFileStem(textureFileName);
  } else if (fillMode === "gradient") {
    defs = gradientPreset.renderDefinition("shape-fill");
    fill = "url(#shape-fill)";
    fileSuffix = gradientPreset.fileStem;
  }

  return {
    fileName: `${isRussian ? "Фигура" : "Shape"} ${shapePreset.name} ${fileSuffix}.svg`,
    textureUrl: createShapeTextureSvg(shapePreset, defs, fill, solidFill.stroke, {
      strokeColor,
      strokeWidth,
      shadowColor,
      shadowOpacity,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      printTexture,
    }),
    scale: shapePreset.defaultScale,
  };
};
