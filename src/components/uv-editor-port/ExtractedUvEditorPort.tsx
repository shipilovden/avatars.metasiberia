import { useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Mesh, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { UvDecalEditorProps } from "../UvDecalEditor";
import {
  DEFAULT_UV_LAYER_BLEND_MODE,
  getCanonicalMeshSlot,
  getCanvasCompositeOperationForUvBlendMode,
  UV_LAYER_BLEND_MODES,
} from "../avatar/shared";
import type {
  DecalProjectionBasis,
  UvLayerBlendMode,
} from "../avatar/shared";
import {
  BRUSH_PRESETS,
  DEFAULT_BRUSH_PRESET_ID,
  STAMP_PRESETS,
} from "./brush-presets";
import type { BrushPreset, BrushPresetKind } from "./brush-presets";
import { DesignLayerPanel } from "./DesignLayerPanel";
import {
  createGeneratedDesignAsset,
  sanitizeDesignLayerStyle,
} from "./design-presets";
import type { DesignLayerStyle } from "./design-presets";
import { createUvPortDocumentFromLegacyProps } from "./legacy-adapter";
import { GFTO_TEXT_FONT_OPTIONS } from "./gfto-font-options";
import type {
  UvPortCropShape,
  UvPortLayer,
  UvPortPaintTarget,
  UvPortTool,
  UvPortToolbarControls,
} from "./types";
import { useFloatingWindow } from "./useFloatingWindow";

type LoadedUvMesh = {
  meshName: string;
  geometry: BufferGeometry;
  baseTextureImage: CanvasImageSource | null;
};

type CanvasSize = {
  width: number;
  height: number;
};

const BASE_PAINT_TOOLS = new Set<UvPortTool>(["brush", "eraser", "eyedropper", "fill"]);

type ViewportState = {
  zoom: number;
  panX: number;
  panY: number;
};

type LayerOverride = Partial<
  Pick<
    UvPortLayer,
    | "name"
    | "opacity"
    | "visible"
    | "locked"
    | "textureUrl"
    | "uv"
    | "scale"
    | "scaleX"
    | "scaleY"
    | "rotationDeg"
    | "blendMode"
  >
>;

type MeshMetrics = {
  triangleCount: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
};

type Point2D = {
  x: number;
  y: number;
};

type LayerLocalBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LayerHandleKey = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "rotate";

type LayerTransformHandle = {
  key: LayerHandleKey;
  kind: "corner" | "edge" | "rotate";
  sx: -1 | 0 | 1;
  sy: -1 | 0 | 1;
  axis?: "x" | "y";
};

type InteractionState =
  | {
      mode: "layer-move";
      pointerId: number;
      layerId: string;
      startUv: [number, number];
      startPointerUv: {
        u: number;
        v: number;
      };
      hasMoved: boolean;
      hasCommittedHistory: boolean;
    }
  | {
      mode: "layer-transform";
      pointerId: number;
      layerId: string;
      startLayer: UvPortLayer;
      startImage: CanvasImageSource;
      transformHandle: LayerTransformHandle;
      targetLocalAngle: number;
      hasMoved: boolean;
      hasCommittedHistory: boolean;
    }
  | {
      mode: "rotate";
      pointerId: number;
      layerId: string;
      startLayer: UvPortLayer;
      startPointerAngle: number;
      hasMoved: boolean;
      hasCommittedHistory: boolean;
    }
  | {
      mode: "brush";
      pointerId: number;
      layerId: string;
      paintMode: "base" | "layer";
      paintLayer: UvPortLayer;
      lastPoint: {
        x: number;
        y: number;
      };
    }
  | {
      mode: "pan";
      pointerId: number;
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      mode: "crop-transform";
      pointerId: number;
      layerId: string;
      startLayer: UvPortLayer;
      startImage: CanvasImageSource;
      cropBox: LayerLocalBounds;
      startCropBox: LayerLocalBounds;
      cropHandle: LayerTransformHandle;
      hasMoved: boolean;
      hasCommittedHistory: boolean;
    }
  | {
      mode: "crop-move";
      pointerId: number;
      layerId: string;
      startLayer: UvPortLayer;
      startImage: CanvasImageSource;
      cropBox: LayerLocalBounds;
      startCropBox: LayerLocalBounds;
      startPointerLocal: Point2D;
      hasMoved: boolean;
      hasCommittedHistory: boolean;
    }
  | null;

type EditorHistorySnapshot = {
  selectedLayerId: string | null;
  soloLayerId: string | null;
  layerOverrides: Record<string, LayerOverride>;
  extraLayers: UvPortLayer[];
  appliedLayers: {
    id: string;
    assetId: string;
    fileName: string;
    meshName: string;
    uv: [number, number];
    scale: number;
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
    textureUrl: string;
    blendMode: UvLayerBlendMode;
    opacity: number;
    textStyle?: UvPortLayer["textStyle"];
    designStyle?: UvPortLayer["designStyle"];
    projection?: UvPortLayer["projection"];
  }[];
  baseLayerTextureUrls: Record<string, string>;
  paintedBaseSlots: Record<string, boolean>;
  draftTextureUrl: string | null;
  draftFileName: string;
  draftUv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
};

const DEFAULT_VIEWPORT: ViewportState = { zoom: 1, panX: 0, panY: 0 };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 10;
const MIN_SCREEN_SIZE = 4;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const SNAP_STEP = 0.025;
const MAX_HISTORY_STEPS = 40;
const MIN_LAYER_SIZE = 0.01;
const MIN_CROP_RATIO = 0.08;
const HANDLE_SIZE = 8;
const HANDLE_HIT_RADIUS = 12;
const ROTATION_HANDLE_OFFSET = 26;
const MIRROR_HANDLE_OFFSET = 20;
const MIRROR_HANDLE_RADIUS = 12;
const MIN_EDITABLE_TEXTURE_RESOLUTION = 1024;

const HANDLE_DEFINITIONS: LayerTransformHandle[] = [
  { key: "nw", kind: "corner", sx: -1, sy: 1 },
  { key: "n", kind: "edge", sx: 0, sy: 1, axis: "y" },
  { key: "ne", kind: "corner", sx: 1, sy: 1 },
  { key: "e", kind: "edge", sx: 1, sy: 0, axis: "x" },
  { key: "se", kind: "corner", sx: 1, sy: -1 },
  { key: "s", kind: "edge", sx: 0, sy: -1, axis: "y" },
  { key: "sw", kind: "corner", sx: -1, sy: -1 },
  { key: "w", kind: "edge", sx: -1, sy: 0, axis: "x" },
];

const ROTATION_HANDLE: LayerTransformHandle = {
  key: "rotate",
  kind: "rotate",
  sx: 0,
  sy: 1,
};

const TEXT_FONT_OPTIONS = GFTO_TEXT_FONT_OPTIONS;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const roundToStep = (value: number, step: number) => Math.round(value / step) * step;
const cloneUv = (uv: [number, number] | null | undefined) =>
  uv ? ([uv[0], uv[1]] as [number, number]) : null;
const cloneLayerOverride = (override: LayerOverride): LayerOverride => ({
  ...override,
  ...(override.uv ? { uv: [override.uv[0], override.uv[1]] as [number, number] } : {}),
});
const cloneLayerOverrides = (overrides: Record<string, LayerOverride>) =>
  Object.fromEntries(
    Object.entries(overrides).map(([layerId, override]) => [layerId, cloneLayerOverride(override)])
  );
const cloneLayer = (layer: UvPortLayer): UvPortLayer => ({
  ...layer,
  uv: cloneUv(layer.uv),
  textStyle: layer.textStyle ? { ...layer.textStyle } : layer.textStyle,
  designStyle: layer.designStyle ? sanitizeDesignLayerStyle(layer.designStyle) : layer.designStyle,
  projection: layer.projection
    ? {
        position: [...layer.projection.position] as [number, number, number],
        axisU: [...layer.projection.axisU] as [number, number, number],
        axisV: [...layer.projection.axisV] as [number, number, number],
        ...(layer.projection.normal
          ? { normal: [...layer.projection.normal] as [number, number, number] }
          : {}),
      }
    : layer.projection,
});
const getBrushPresetLabel = (preset: BrushPreset) => `${preset.group} - ${preset.name}`;

function BrushPresetInlineSwatch({ preset }: { preset: BrushPreset }) {
  return (
    <div className="uv-editor__preset-swatch" aria-hidden="true">
      {preset.previewSrc ? (
        <img src={preset.previewSrc} alt="" />
      ) : (
        <div className={`uv-editor__preset-dot${preset.id === "hard-round" ? " uv-editor__preset-dot--hard" : ""}`} />
      )}
    </div>
  );
}

const cloneAppliedLayer = (
  layer: {
    id: string;
    assetId: string;
    fileName: string;
    meshName: string;
    uv: [number, number];
    scale: number;
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
    textureUrl: string;
    blendMode: UvLayerBlendMode;
    opacity: number;
    textStyle?: UvPortLayer["textStyle"];
    designStyle?: UvPortLayer["designStyle"];
    projection?: DecalProjectionBasis | null;
  }
) => ({
  ...layer,
  uv: [layer.uv[0], layer.uv[1]] as [number, number],
  textStyle: layer.textStyle ? { ...layer.textStyle } : layer.textStyle,
  designStyle: layer.designStyle ? sanitizeDesignLayerStyle(layer.designStyle) : layer.designStyle,
  projection: layer.projection
    ? {
        position: [...layer.projection.position] as [number, number, number],
        axisU: [...layer.projection.axisU] as [number, number, number],
        axisV: [...layer.projection.axisV] as [number, number, number],
        ...(layer.projection.normal
          ? { normal: [...layer.projection.normal] as [number, number, number] }
          : {}),
      }
    : layer.projection,
});

const makeClientLayerId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `port:${crypto.randomUUID()}`;
  }
  return `port:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
};

const getMaterialTexture = (mesh: Mesh) => {
  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const texture = (sourceMaterial as { map?: Texture | null } | null)?.map || null;
  return texture?.image ? (texture.image as CanvasImageSource) : null;
};

const findMeshByName = (
  root: { traverse: (fn: (object: unknown) => void) => void },
  meshName: string
): Mesh | null => {
  let targetMesh: Mesh | null = null;
  const targetSlot = getCanonicalMeshSlot(meshName) || meshName;
  root.traverse((object) => {
    if (targetMesh) {
      return;
    }

    const mesh = object as Mesh & { isMesh?: boolean };
    if (
      mesh.isMesh &&
      (mesh.name === meshName || (mesh.name && (getCanonicalMeshSlot(mesh.name) || mesh.name) === targetSlot))
    ) {
      targetMesh = mesh;
    }
  });
  return targetMesh;
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });

let tintedBrushCanvas: HTMLCanvasElement | null = null;

const ensureTintedBrushCanvas = (width: number, height: number) => {
  if (typeof document === "undefined") {
    return null;
  }

  if (!tintedBrushCanvas) {
    tintedBrushCanvas = document.createElement("canvas");
  }

  if (tintedBrushCanvas.width !== width || tintedBrushCanvas.height !== height) {
    tintedBrushCanvas.width = width;
    tintedBrushCanvas.height = height;
  }

  return tintedBrushCanvas;
};

const sanitizeGeneratedTextFileName = (value: string, isRussian: boolean) => {
  const fallback = isRussian ? "Текст" : "Text";
  const normalized = value.replace(/\s+/g, " ").trim();
  const shortened = normalized.slice(0, 32).trim();
  const cleaned = (shortened || fallback).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").trim();
  return cleaned || fallback;
};

const trimCanvasTransparentBounds = (canvas: HTMLCanvasElement, paddingPx: number) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 8) {
        continue;
      }

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  const padding = Math.max(2, Math.round(paddingPx));
  const cropLeft = Math.max(0, minX - padding);
  const cropTop = Math.max(0, minY - padding);
  const cropRight = Math.min(width, maxX + padding + 1);
  const cropBottom = Math.min(height, maxY + padding + 1);
  const cropWidth = Math.max(1, cropRight - cropLeft);
  const cropHeight = Math.max(1, cropBottom - cropTop);

  if (cropWidth === width && cropHeight === height && cropLeft === 0 && cropTop === 0) {
    return canvas;
  }

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = cropWidth;
  trimmedCanvas.height = cropHeight;
  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) {
    return canvas;
  }

  trimmedContext.drawImage(
    canvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return trimmedCanvas;
};

const createTextDecalTexture = ({
  text,
  fontFamily,
  fontSize,
  color,
  isRussian,
}: {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  isRussian: boolean;
}) => {
  if (typeof document === "undefined") {
    return null;
  }

  const normalizedText = text.replace(/\r\n/g, "\n").trim();
  if (!normalizedText) {
    return null;
  }

  const lines = normalizedText.split("\n");
  const probeCanvas = document.createElement("canvas");
  const probeContext = probeCanvas.getContext("2d");
  if (!probeContext) {
    return null;
  }

  const safeFontSize = clamp(Math.round(fontSize), 18, 220);
  const fontDeclaration = `700 ${safeFontSize}px ${fontFamily}`;
  probeContext.font = fontDeclaration;

  const measuredWidth = lines.reduce(
    (maxWidth, line) => Math.max(maxWidth, probeContext.measureText(line || " ").width),
    safeFontSize
  );
  const lineHeight = Math.max(24, Math.round(safeFontSize * 1.18));
  const logicalWidth = Math.ceil(measuredWidth + safeFontSize * 1.5);
  const logicalHeight = Math.ceil(lines.length * lineHeight + safeFontSize);
  const scaleFactor = 2;

  const canvas = document.createElement("canvas");
  canvas.width = clamp(logicalWidth * scaleFactor, 256, 2048);
  canvas.height = clamp(logicalHeight * scaleFactor, 256, 2048);

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const width = canvas.width / scaleFactor;
  const height = canvas.height / scaleFactor;
  const startY = (height - lines.length * lineHeight) * 0.5 + lineHeight * 0.5;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(scaleFactor, scaleFactor);
  context.font = fontDeclaration;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = "rgba(0, 0, 0, 0.18)";
  context.shadowBlur = Math.max(2, safeFontSize * 0.08);
  context.shadowOffsetY = Math.max(1, safeFontSize * 0.03);

  lines.forEach((line, index) => {
    context.fillText(line || " ", width * 0.5, startY + index * lineHeight);
  });

  const fileStem = sanitizeGeneratedTextFileName(normalizedText, isRussian);
  const trimmedCanvas = trimCanvasTransparentBounds(canvas, safeFontSize * 0.12 * scaleFactor);
  return {
    fileName: `${fileStem}.png`,
    textureUrl: trimmedCanvas.toDataURL("image/png"),
    textStyle: {
      text: normalizedText,
      fontFamily,
      fontSize: safeFontSize,
      color,
    },
  };
};

const ensureTextFontLoaded = async ({
  fontFamily,
  fontSize,
  sample,
}: {
  fontFamily: string;
  fontSize: number;
  sample: string;
}) => {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return;
  }

  const safeFontSize = clamp(Math.round(fontSize), 18, 220);
  const sampleText = sample.trim() || "Text";
  await (document as Document & { fonts?: FontFaceSet }).fonts?.load?.(
    `700 ${safeFontSize}px ${fontFamily}`,
    sampleText
  );
};

const getCanvasMetrics = (size: CanvasSize, viewport: ViewportState) => {
  const viewSize = Math.min(size.width, size.height) * viewport.zoom;
  const originX = size.width * 0.5 + viewport.panX - viewSize * 0.5;
  const originY = size.height * 0.5 + viewport.panY - viewSize * 0.5;
  return { originX, originY, viewSize };
};

const uvToScreen = (uv: [number, number], size: CanvasSize, viewport: ViewportState) => {
  const metrics = getCanvasMetrics(size, viewport);
  return {
    x: metrics.originX + uv[0] * metrics.viewSize,
    y: metrics.originY + (1 - uv[1]) * metrics.viewSize,
  };
};

const screenToUv = (x: number, y: number, size: CanvasSize, viewport: ViewportState) => {
  const metrics = getCanvasMetrics(size, viewport);
  return {
    u: (x - metrics.originX) / Math.max(1, metrics.viewSize),
    v: 1 - (y - metrics.originY) / Math.max(1, metrics.viewSize),
  };
};

const getZoomedViewport = ({
  viewport,
  size,
  pointerX,
  pointerY,
  zoomFactor,
}: {
  viewport: ViewportState;
  size: CanvasSize;
  pointerX: number;
  pointerY: number;
  zoomFactor: number;
}) => {
  const uvBeforeZoom = screenToUv(pointerX, pointerY, size, viewport);
  const nextZoom = clamp(viewport.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
  const nextViewSize = Math.min(size.width, size.height) * nextZoom;
  const screenV = 1 - uvBeforeZoom.v;
  const nextOriginX = pointerX - uvBeforeZoom.u * nextViewSize;
  const nextOriginY = pointerY - screenV * nextViewSize;
  return {
    zoom: nextZoom,
    panX: nextOriginX + nextViewSize * 0.5 - size.width * 0.5,
    panY: nextOriginY + nextViewSize * 0.5 - size.height * 0.5,
  };
};

const rotationDegToRad = (rotationDeg: number) => (-rotationDeg * Math.PI) / 180;
const rotationRadToDeg = (rotationRad: number) => (-rotationRad * 180) / Math.PI;

const rotatePoint = (point: Point2D, angleRad: number): Point2D => ({
  x: point.x * Math.cos(angleRad) - point.y * Math.sin(angleRad),
  y: point.x * Math.sin(angleRad) + point.y * Math.cos(angleRad),
});

const getLayerAspect = (image: CanvasImageSource | null) => {
  const size = getCanvasImageSize(image);
  if (!size) {
    return 1;
  }
  return size.width / Math.max(1, size.height);
};

const getLayerUvDimensions = (layer: UvPortLayer, image: CanvasImageSource | null) => {
  const aspect = Math.max(0.1, getLayerAspect(image));
  const widthU = Math.max(MIN_LAYER_SIZE, Math.max(MIN_SCALE, layer.scale) * Math.max(0.01, layer.scaleX));
  const heightV =
    (Math.max(MIN_SCALE, layer.scale) * Math.max(0.01, layer.scaleY)) / aspect;

  return {
    aspect,
    widthU: Math.max(MIN_LAYER_SIZE, widthU),
    heightV: Math.max(MIN_LAYER_SIZE, heightV),
  };
};

const getLayerLocalBounds = (layer: UvPortLayer, image: CanvasImageSource | null): LayerLocalBounds => {
  const { widthU, heightV } = getLayerUvDimensions(layer, image);
  return {
    left: -widthU * 0.5,
    right: widthU * 0.5,
    top: heightV * 0.5,
    bottom: -heightV * 0.5,
  };
};

const uvToLayerLocal = (
  uv: { u: number; v: number },
  layer: Pick<UvPortLayer, "uv" | "rotationDeg">,
): Point2D => {
  if (!layer.uv) {
    return { x: 0, y: 0 };
  }

  const dx = uv.u - layer.uv[0];
  const dy = uv.v - layer.uv[1];
  const rotationRad = rotationDegToRad(layer.rotationDeg);
  return {
    x: dx * Math.cos(rotationRad) + dy * Math.sin(rotationRad),
    y: -dx * Math.sin(rotationRad) + dy * Math.cos(rotationRad),
  };
};

const layerLocalToUv = (
  point: Point2D,
  layer: Pick<UvPortLayer, "uv" | "rotationDeg">,
) => {
  if (!layer.uv) {
    return { u: 0.5, v: 0.5 };
  }

  const rotationRad = rotationDegToRad(layer.rotationDeg);
  return {
    u: layer.uv[0] + point.x * Math.cos(rotationRad) - point.y * Math.sin(rotationRad),
    v: layer.uv[1] + point.x * Math.sin(rotationRad) + point.y * Math.cos(rotationRad),
  };
};

const isPointInsideLocalBounds = (point: Point2D, bounds: LayerLocalBounds) =>
  point.x >= bounds.left &&
  point.x <= bounds.right &&
  point.y >= bounds.bottom &&
  point.y <= bounds.top;

const getHandleLocalPoint = (handle: LayerTransformHandle, bounds: LayerLocalBounds): Point2D => {
  if (handle.kind === "rotate") {
    return { x: 0, y: bounds.top };
  }

  const x =
    handle.kind === "edge" && handle.axis === "y"
      ? 0
      : handle.sx < 0
        ? bounds.left
        : handle.sx > 0
          ? bounds.right
          : 0;
  const y =
    handle.kind === "edge" && handle.axis === "x"
      ? 0
      : handle.sy < 0
        ? bounds.bottom
        : handle.sy > 0
          ? bounds.top
          : 0;

  return { x, y };
};

const getLayerHandleScreenPosition = ({
  handle,
  layer,
  image,
  size,
  viewport,
  bounds,
}: {
  handle: LayerTransformHandle;
  layer: UvPortLayer;
  image: CanvasImageSource | null;
  size: CanvasSize;
  viewport: ViewportState;
  bounds: LayerLocalBounds;
}) => {
  const center = layer.uv ? uvToScreen(layer.uv, size, viewport) : { x: 0, y: 0 };
  const localPoint = getHandleLocalPoint(handle, bounds);
  const uvPoint = layerLocalToUv(localPoint, layer);
  const point = uvToScreen([uvPoint.u, uvPoint.v], size, viewport);

  if (handle.kind !== "rotate") {
    return point;
  }

  const directionX = point.x - center.x;
  const directionY = point.y - center.y;
  const distance = Math.max(1, Math.hypot(directionX, directionY));
  return {
    x: point.x + (directionX / distance) * ROTATION_HANDLE_OFFSET,
    y: point.y + (directionY / distance) * ROTATION_HANDLE_OFFSET,
  };
};

const getLayerHandleScreenPositions = ({
  layer,
  image,
  size,
  viewport,
  bounds,
  includeRotationHandle,
}: {
  layer: UvPortLayer;
  image: CanvasImageSource | null;
  size: CanvasSize;
  viewport: ViewportState;
  bounds: LayerLocalBounds;
  includeRotationHandle: boolean;
}) => {
  const entries = HANDLE_DEFINITIONS.map((handle) => ({
    handle,
    point: getLayerHandleScreenPosition({ handle, layer, image, size, viewport, bounds }),
  }));

  if (includeRotationHandle) {
    entries.push({
      handle: ROTATION_HANDLE,
      point: getLayerHandleScreenPosition({
        handle: ROTATION_HANDLE,
        layer,
        image,
        size,
        viewport,
        bounds,
      }),
    });
  }

  return entries;
};

const hitTestLayerHandle = ({
  pointer,
  layer,
  image,
  size,
  viewport,
  bounds,
  includeRotationHandle,
}: {
  pointer: Point2D;
  layer: UvPortLayer;
  image: CanvasImageSource | null;
  size: CanvasSize;
  viewport: ViewportState;
  bounds: LayerLocalBounds;
  includeRotationHandle: boolean;
}) => {
  const handleEntries = getLayerHandleScreenPositions({
    layer,
    image,
    size,
    viewport,
    bounds,
    includeRotationHandle,
  });

  for (const entry of handleEntries) {
    const radius = entry.handle.kind === "rotate" ? HANDLE_HIT_RADIUS + 2 : HANDLE_HIT_RADIUS;
    const distance = Math.hypot(pointer.x - entry.point.x, pointer.y - entry.point.y);
    if (distance <= radius) {
      return entry.handle;
    }
  }

  return null;
};

const getLocalBoxCorners = (layer: UvPortLayer, bounds: LayerLocalBounds) => ({
  nw: layerLocalToUv({ x: bounds.left, y: bounds.top }, layer),
  ne: layerLocalToUv({ x: bounds.right, y: bounds.top }, layer),
  se: layerLocalToUv({ x: bounds.right, y: bounds.bottom }, layer),
  sw: layerLocalToUv({ x: bounds.left, y: bounds.bottom }, layer),
});

const getMirrorHandleScreenPosition = ({
  layer,
  size,
  viewport,
  bounds,
}: {
  layer: UvPortLayer;
  size: CanvasSize;
  viewport: ViewportState;
  bounds: LayerLocalBounds;
}) => {
  const { ne } = getLocalBoxCorners(layer, bounds);
  const point = uvToScreen([ne.u, ne.v], size, viewport);
  return {
    x: point.x + MIRROR_HANDLE_OFFSET,
    y: point.y - MIRROR_HANDLE_OFFSET,
  };
};

const createCropBoxFromLayer = (
  layer: UvPortLayer,
  image: CanvasImageSource | null,
  cropShape: UvPortCropShape
): LayerLocalBounds => {
  const bounds = getLayerLocalBounds(layer, image);
  if (cropShape !== "circle") {
    return bounds;
  }

  const centerX = (bounds.left + bounds.right) * 0.5;
  const centerY = (bounds.top + bounds.bottom) * 0.5;
  const size = Math.min(bounds.right - bounds.left, bounds.top - bounds.bottom);
  const half = size * 0.5;

  return {
    left: centerX - half,
    right: centerX + half,
    top: centerY + half,
    bottom: centerY - half,
  };
};

const clampRequestedBoxSize = (requestedSize: number, minSize: number, maxSize: number) => {
  if (!Number.isFinite(maxSize) || maxSize <= 0) {
    return 0;
  }
  const minimum = Math.min(minSize, maxSize);
  return Math.max(minimum, Math.min(Math.max(requestedSize, minimum), maxSize));
};

const applySquareCropHandleDrag = ({
  startCropBox,
  localPointer,
  handle,
  bounds,
  minSize,
}: {
  startCropBox: LayerLocalBounds;
  localPointer: Point2D;
  handle: LayerTransformHandle;
  bounds: LayerLocalBounds;
  minSize: number;
}): LayerLocalBounds => {
  if (handle.kind === "corner") {
    const anchorX = handle.sx > 0 ? startCropBox.left : startCropBox.right;
    const anchorY = handle.sy > 0 ? startCropBox.bottom : startCropBox.top;
    const requestedSize = Math.max(
      Math.abs(localPointer.x - anchorX),
      Math.abs(localPointer.y - anchorY)
    );
    const maxSizeX = handle.sx > 0 ? bounds.right - anchorX : anchorX - bounds.left;
    const maxSizeY = handle.sy > 0 ? bounds.top - anchorY : anchorY - bounds.bottom;
    const size = clampRequestedBoxSize(requestedSize, minSize, Math.min(maxSizeX, maxSizeY));
    return {
      left: handle.sx > 0 ? anchorX : anchorX - size,
      right: handle.sx > 0 ? anchorX + size : anchorX,
      bottom: handle.sy > 0 ? anchorY : anchorY - size,
      top: handle.sy > 0 ? anchorY + size : anchorY,
    };
  }

  if (handle.axis === "x") {
    const anchorX = handle.sx > 0 ? startCropBox.left : startCropBox.right;
    const centerY = (startCropBox.top + startCropBox.bottom) * 0.5;
    const requestedSize = Math.abs(localPointer.x - anchorX);
    const maxSizeX = handle.sx > 0 ? bounds.right - anchorX : anchorX - bounds.left;
    const maxHalfHeight = Math.min(bounds.top - centerY, centerY - bounds.bottom);
    const size = clampRequestedBoxSize(requestedSize, minSize, Math.min(maxSizeX, maxHalfHeight * 2));
    const half = size * 0.5;
    return {
      left: handle.sx > 0 ? anchorX : anchorX - size,
      right: handle.sx > 0 ? anchorX + size : anchorX,
      bottom: centerY - half,
      top: centerY + half,
    };
  }

  const anchorY = handle.sy > 0 ? startCropBox.bottom : startCropBox.top;
  const centerX = (startCropBox.left + startCropBox.right) * 0.5;
  const requestedSize = Math.abs(localPointer.y - anchorY);
  const maxSizeY = handle.sy > 0 ? bounds.top - anchorY : anchorY - bounds.bottom;
  const maxHalfWidth = Math.min(bounds.right - centerX, centerX - bounds.left);
  const size = clampRequestedBoxSize(requestedSize, minSize, Math.min(maxSizeY, maxHalfWidth * 2));
  const half = size * 0.5;
  return {
    left: centerX - half,
    right: centerX + half,
    bottom: handle.sy > 0 ? anchorY : anchorY - size,
    top: handle.sy > 0 ? anchorY + size : anchorY,
  };
};

const applyCropHandleDrag = ({
  startLayer,
  startCropBox,
  localPointer,
  handle,
  cropShape,
  image,
}: {
  startLayer: UvPortLayer;
  startCropBox: LayerLocalBounds;
  localPointer: Point2D;
  handle: LayerTransformHandle;
  cropShape: UvPortCropShape;
  image: CanvasImageSource | null;
}) => {
  const bounds = getLayerLocalBounds(startLayer, image);
  const nextBox = {
    ...startCropBox,
  };
  const minWidth = Math.max(MIN_LAYER_SIZE, (bounds.right - bounds.left) * MIN_CROP_RATIO);
  const minHeight = Math.max(MIN_LAYER_SIZE, (bounds.top - bounds.bottom) * MIN_CROP_RATIO);
  const keys = new Set(handle.key.split(""));

  if (keys.has("w")) {
    nextBox.left = Math.max(bounds.left, Math.min(localPointer.x, nextBox.right - minWidth));
  }
  if (keys.has("e")) {
    nextBox.right = Math.min(bounds.right, Math.max(localPointer.x, nextBox.left + minWidth));
  }
  if (keys.has("n")) {
    nextBox.top = Math.min(bounds.top, Math.max(localPointer.y, nextBox.bottom + minHeight));
  }
  if (keys.has("s")) {
    nextBox.bottom = Math.max(bounds.bottom, Math.min(localPointer.y, nextBox.top - minHeight));
  }

  if (cropShape === "circle") {
    return applySquareCropHandleDrag({
      startCropBox,
      localPointer,
      handle,
      bounds,
      minSize: Math.max(minWidth, minHeight),
    });
  }

  return nextBox;
};

const applyCropMoveDrag = ({
  startLayer,
  startCropBox,
  localPointer,
  startPointerLocal,
  image,
}: {
  startLayer: UvPortLayer;
  startCropBox: LayerLocalBounds;
  localPointer: Point2D;
  startPointerLocal: Point2D;
  image: CanvasImageSource | null;
}): LayerLocalBounds => {
  const bounds = getLayerLocalBounds(startLayer, image);
  const width = startCropBox.right - startCropBox.left;
  const height = startCropBox.top - startCropBox.bottom;
  const deltaX = localPointer.x - startPointerLocal.x;
  const deltaY = localPointer.y - startPointerLocal.y;

  let left = startCropBox.left + deltaX;
  let bottom = startCropBox.bottom + deltaY;

  left = Math.max(bounds.left, Math.min(left, bounds.right - width));
  bottom = Math.max(bounds.bottom, Math.min(bottom, bounds.top - height));

  return {
    left,
    right: left + width,
    bottom,
    top: bottom + height,
  };
};

const buildCroppedLayerTexture = ({
  startLayer,
  image,
  cropBox,
  cropShape,
}: {
  startLayer: UvPortLayer;
  image: CanvasImageSource;
  cropBox: LayerLocalBounds;
  cropShape: UvPortCropShape;
}) => {
  const sourceSize = getCanvasImageSize(image);
  if (!sourceSize) {
    return null;
  }

  const layerBounds = getLayerLocalBounds(startLayer, image);
  const normalizedLeft =
    (cropBox.left - layerBounds.left) / Math.max(MIN_LAYER_SIZE, layerBounds.right - layerBounds.left);
  const normalizedTop =
    (layerBounds.top - cropBox.top) / Math.max(MIN_LAYER_SIZE, layerBounds.top - layerBounds.bottom);
  const normalizedWidth =
    (cropBox.right - cropBox.left) / Math.max(MIN_LAYER_SIZE, layerBounds.right - layerBounds.left);
  const normalizedHeight =
    (cropBox.top - cropBox.bottom) / Math.max(MIN_LAYER_SIZE, layerBounds.top - layerBounds.bottom);

  const cropX = Math.max(0, Math.min(sourceSize.width - 1, Math.round(normalizedLeft * sourceSize.width)));
  const cropY = Math.max(0, Math.min(sourceSize.height - 1, Math.round(normalizedTop * sourceSize.height)));
  const cropWidth = Math.max(
    1,
    Math.min(sourceSize.width - cropX, Math.round(normalizedWidth * sourceSize.width))
  );
  const cropHeight = Math.max(
    1,
    Math.min(sourceSize.height - cropY, Math.round(normalizedHeight * sourceSize.height))
  );

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, cropWidth, cropHeight);
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  if (cropShape === "circle") {
    const radius = Math.min(cropWidth, cropHeight) * 0.5;
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.beginPath();
    context.arc(cropWidth * 0.5, cropHeight * 0.5, radius, 0, Math.PI * 2);
    context.closePath();
    context.fillStyle = "#ffffff";
    context.fill();
    context.restore();
  }

  const cropCenter = layerLocalToUv(
    {
      x: (cropBox.left + cropBox.right) * 0.5,
      y: (cropBox.top + cropBox.bottom) * 0.5,
    },
    startLayer
  );
  const nextAspect = cropWidth / Math.max(1, cropHeight);
  const nextWidthU = Math.max(MIN_LAYER_SIZE, cropBox.right - cropBox.left);
  const nextHeightV = Math.max(MIN_LAYER_SIZE, cropBox.top - cropBox.bottom);
  const nextScaleBase = Math.max(MIN_SCALE, startLayer.scale);

  return {
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
    uv: [cropCenter.u, cropCenter.v] as [number, number],
    scale: nextScaleBase,
    scaleX: clamp(nextWidthU / nextScaleBase, 0.01, MAX_SCALE),
    scaleY: clamp((nextHeightV * nextAspect) / nextScaleBase, 0.01, MAX_SCALE),
  };
};

const drawLayer = ({
  context,
  image,
  layer,
  size,
  viewport,
  strokeStyle,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  layer: UvPortLayer;
  size: CanvasSize;
  viewport: ViewportState;
  strokeStyle?: string;
}) => {
  if (!layer.uv) {
    return;
  }

  const center = uvToScreen(layer.uv, size, viewport);
  const { viewSize } = getCanvasMetrics(size, viewport);
  const baseWidth = Math.max(MIN_SCREEN_SIZE, viewSize * layer.scale);
  const imageWidth = "width" in image ? Number(image.width) || 1 : 1;
  const imageHeight = "height" in image ? Number(image.height) || 1 : 1;
  const aspect = imageWidth / Math.max(1, imageHeight);
  const width = Math.max(MIN_SCREEN_SIZE, baseWidth * Math.max(0.01, layer.scaleX));
  const height = Math.max(
    MIN_SCREEN_SIZE,
    (baseWidth / Math.max(0.1, aspect)) * Math.max(0.01, layer.scaleY)
  );

  context.save();
  context.globalAlpha = clamp(layer.opacity, 0, 1);
  context.globalCompositeOperation = getCanvasCompositeOperationForUvBlendMode(layer.blendMode);
  context.translate(center.x, center.y);
  context.rotate(rotationDegToRad(layer.rotationDeg));
  context.drawImage(image, -width * 0.5, -height * 0.5, width, height);
  if (strokeStyle) {
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = strokeStyle;
    context.lineWidth = 2;
    context.strokeRect(-width * 0.5, -height * 0.5, width, height);
  }
  context.restore();
};

const drawActiveLayerOverlay = ({
  context,
  layer,
  image,
  size,
  viewport,
  activeTool,
  cropShape,
  cropBox,
  showMirrorHandle,
}: {
  context: CanvasRenderingContext2D;
  layer: UvPortLayer;
  image: CanvasImageSource | null;
  size: CanvasSize;
  viewport: ViewportState;
  activeTool: UvPortTool;
  cropShape: UvPortCropShape;
  cropBox?: LayerLocalBounds | null;
  showMirrorHandle?: boolean;
}) => {
  if (!layer.uv || !image) {
    return;
  }

  const bounds = cropBox || getLayerLocalBounds(layer, image);
  const corners = getLocalBoxCorners(layer, bounds);
  const points = [corners.nw, corners.ne, corners.se, corners.sw].map((entry) =>
    uvToScreen([entry.u, entry.v], size, viewport)
  );
  const handleEntries = getLayerHandleScreenPositions({
    layer,
    image,
    size,
    viewport,
    bounds,
    includeRotationHandle: activeTool !== "crop",
  });

  context.save();
  context.strokeStyle = activeTool === "crop" ? "rgba(255, 200, 78, 0.98)" : "rgba(0, 217, 232, 0.98)";
  context.fillStyle = activeTool === "crop" ? "#ffc84e" : "#00d9e8";
  context.lineWidth = 1.5;

  context.beginPath();
  if (activeTool === "crop" && cropShape === "circle") {
    const centerUv = layerLocalToUv(
      {
        x: (bounds.left + bounds.right) * 0.5,
        y: (bounds.top + bounds.bottom) * 0.5,
      },
      layer
    );
    const topUv = layerLocalToUv(
      {
        x: (bounds.left + bounds.right) * 0.5,
        y: bounds.top,
      },
      layer
    );
    const centerPoint = uvToScreen([centerUv.u, centerUv.v], size, viewport);
    const topPoint = uvToScreen([topUv.u, topUv.v], size, viewport);
    const radius = Math.max(8, Math.hypot(topPoint.x - centerPoint.x, topPoint.y - centerPoint.y));
    context.arc(centerPoint.x, centerPoint.y, radius, 0, Math.PI * 2);
  } else {
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
  }
  context.stroke();

  const centerPoint = uvToScreen(layer.uv, size, viewport);
  const topCenterUv = layerLocalToUv(
    {
      x: 0,
      y: bounds.top,
    },
    layer
  );
  const topCenterPoint = uvToScreen([topCenterUv.u, topCenterUv.v], size, viewport);

  for (const entry of handleEntries) {
    if (entry.handle.kind === "rotate") {
      context.beginPath();
      context.moveTo(topCenterPoint.x, topCenterPoint.y);
      context.lineTo(entry.point.x, entry.point.y);
      context.stroke();
      context.beginPath();
      context.arc(entry.point.x, entry.point.y, HANDLE_SIZE * 0.55, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    context.beginPath();
    context.rect(
      entry.point.x - HANDLE_SIZE * 0.5,
      entry.point.y - HANDLE_SIZE * 0.5,
      HANDLE_SIZE,
      HANDLE_SIZE
    );
    context.fill();
  }

  if (activeTool !== "crop") {
    context.beginPath();
    context.arc(centerPoint.x, centerPoint.y, 3, 0, Math.PI * 2);
    context.fill();
  }

  if (showMirrorHandle) {
    const mirrorHandlePoint = getMirrorHandleScreenPosition({
      layer,
      size,
      viewport,
      bounds,
    });
    context.fillStyle = "#ffffff";
    context.strokeStyle = "rgba(0, 217, 232, 0.98)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(mirrorHandlePoint.x, mirrorHandlePoint.y, MIRROR_HANDLE_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#00d9e8";
    context.font = "700 14px 'Segoe UI', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("⇋", mirrorHandlePoint.x, mirrorHandlePoint.y + 0.5);
  }

  context.restore();
};

const buildMeshMetrics = (geometry: BufferGeometry | null | undefined): MeshMetrics | null => {
  const uvAttribute = geometry?.getAttribute("uv");
  if (!geometry || !uvAttribute) {
    return null;
  }

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < uvAttribute.count; index += 1) {
    const u = uvAttribute.getX(index);
    const v = uvAttribute.getY(index);
    if (u < minU) {
      minU = u;
    }
    if (u > maxU) {
      maxU = u;
    }
    if (v < minV) {
      minV = v;
    }
    if (v > maxV) {
      maxV = v;
    }
  }

  const indexAttribute = geometry.getIndex();
  const triangleCount = indexAttribute
    ? Math.floor(indexAttribute.count / 3)
    : Math.floor(uvAttribute.count / 3);

  return {
    triangleCount,
    minU: Number.isFinite(minU) ? minU : 0,
    maxU: Number.isFinite(maxU) ? maxU : 1,
    minV: Number.isFinite(minV) ? minV : 0,
    maxV: Number.isFinite(maxV) ? maxV : 1,
  };
};

const createUvMaskCanvas = (geometry: BufferGeometry | null | undefined, size = 1024) => {
  const uvAttribute = geometry?.getAttribute("uv");
  if (!geometry || !uvAttribute || size <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const getPoint = (index: number) => ({
    x: uvAttribute.getX(index) * canvas.width,
    y: (1 - uvAttribute.getY(index)) * canvas.height,
  });

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";

  const indexAttribute = geometry.getIndex();
  if (indexAttribute) {
    for (let triangleIndex = 0; triangleIndex < indexAttribute.count; triangleIndex += 3) {
      const pointA = getPoint(indexAttribute.getX(triangleIndex));
      const pointB = getPoint(indexAttribute.getX(triangleIndex + 1));
      const pointC = getPoint(indexAttribute.getX(triangleIndex + 2));
      context.beginPath();
      context.moveTo(pointA.x, pointA.y);
      context.lineTo(pointB.x, pointB.y);
      context.lineTo(pointC.x, pointC.y);
      context.closePath();
      context.fill();
    }
  } else {
    for (let triangleIndex = 0; triangleIndex + 2 < uvAttribute.count; triangleIndex += 3) {
      const pointA = getPoint(triangleIndex);
      const pointB = getPoint(triangleIndex + 1);
      const pointC = getPoint(triangleIndex + 2);
      context.beginPath();
      context.moveTo(pointA.x, pointA.y);
      context.lineTo(pointB.x, pointB.y);
      context.lineTo(pointC.x, pointC.y);
      context.closePath();
      context.fill();
    }
  }

  return canvas;
};

const getEditableCanvasSize = (width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const largestSide = Math.max(safeWidth, safeHeight);

  // RPM body presets can use tiny placeholder maps like 2x2. Painting onto
  // them directly makes a brush stroke look like a full fill on the avatar.
  if (largestSide > 16) {
    return { width: safeWidth, height: safeHeight };
  }

  if (safeWidth >= safeHeight) {
    return {
      width: MIN_EDITABLE_TEXTURE_RESOLUTION,
      height: Math.max(
        1,
        Math.round((safeHeight / safeWidth) * MIN_EDITABLE_TEXTURE_RESOLUTION)
      ),
    };
  }

  return {
    width: Math.max(
      1,
      Math.round((safeWidth / safeHeight) * MIN_EDITABLE_TEXTURE_RESOLUTION)
    ),
    height: MIN_EDITABLE_TEXTURE_RESOLUTION,
  };
};

const exportCanvasAsPng = (canvas: HTMLCanvasElement, fileName: string) => {
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
};

const getCanvasImageSize = (image: CanvasImageSource | null) => {
  if (!image) {
    return null;
  }

  if ("videoWidth" in image && typeof image.videoWidth === "number") {
    return {
      width: Math.max(1, Number(image.videoWidth) || 1),
      height: Math.max(1, Number(image.videoHeight) || 1),
    };
  }

  if ("naturalWidth" in image && typeof image.naturalWidth === "number") {
    return {
      width: Math.max(1, Number(image.naturalWidth) || 1),
      height: Math.max(1, Number(image.naturalHeight) || 1),
    };
  }

  if ("width" in image && typeof image.width === "number") {
    return {
      width: Math.max(1, Number(image.width) || 1),
      height: Math.max(1, Number(image.height) || 1),
    };
  }

  return null;
};

const cloneCanvasImageSourceToCanvas = (
  image: CanvasImageSource | null,
  options?: {
    upscaleTinyTextures?: boolean;
  }
) => {
  const size = getCanvasImageSize(image);
  if (!image || !size) {
    return null;
  }

  const nextSize = options?.upscaleTinyTextures
    ? getEditableCanvasSize(size.width, size.height)
    : size;

  const canvas = document.createElement("canvas");
  canvas.width = nextSize.width;
  canvas.height = nextSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const canvasImageSourceToDataUrl = (
  image: CanvasImageSource | null,
  options?: {
    upscaleTinyTextures?: boolean;
  }
) => {
  const canvas = cloneCanvasImageSourceToCanvas(image, options);
  return canvas ? canvas.toDataURL("image/png") : null;
};

const flipCanvasImageSourceHorizontally = (image: CanvasImageSource | null) => {
  const size = getCanvasImageSize(image);
  if (!image || !size) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const getUvPixelPoint = (uv: { u: number; v: number }, canvas: HTMLCanvasElement) => {
  if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) {
    return null;
  }

  return {
    x: Math.max(0, Math.min(canvas.width - 1, uv.u * canvas.width)),
    y: Math.max(0, Math.min(canvas.height - 1, (1 - uv.v) * canvas.height)),
  };
};

const hexToRgba = (hex: string, alpha: number) => {
  const value = (hex || "#ffb347").replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value.padEnd(6, "0").slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const paintBrushStamp = ({
  context,
  x,
  y,
  color,
  isEraser,
  paintTarget,
  radius,
  softness,
  maskImage,
}: {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  color: string;
  isEraser: boolean;
  paintTarget: UvPortPaintTarget;
  radius: number;
  softness: number;
  maskImage?: CanvasImageSource | null;
}) => {
  const clampedRadius = Math.max(0.5, radius);

  if (maskImage) {
    const sourceSize = getCanvasImageSize(maskImage);
    if (!sourceSize) {
      return;
    }
    const diameter = clampedRadius * 2;
    const scale = diameter / Math.max(sourceSize.width, sourceSize.height);
    const drawWidth = Math.max(1, Math.round(sourceSize.width * scale));
    const drawHeight = Math.max(1, Math.round(sourceSize.height * scale));
    const drawX = x - drawWidth * 0.5;
    const drawY = y - drawHeight * 0.5;
    const blurPx = softness > 0 ? Math.max(0, softness * Math.max(drawWidth, drawHeight) * 0.04) : 0;

    if (paintTarget === "mask" || isEraser) {
      context.save();
      context.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
      context.filter = blurPx > 0.25 ? `blur(${blurPx}px)` : "none";
      context.drawImage(maskImage, drawX, drawY, drawWidth, drawHeight);
      context.restore();
      return;
    }

    const tintCanvas = ensureTintedBrushCanvas(drawWidth, drawHeight);
    const tintContext = tintCanvas?.getContext("2d");

    if (!tintCanvas || !tintContext) {
      return;
    }

    tintContext.clearRect(0, 0, drawWidth, drawHeight);
    tintContext.drawImage(maskImage, 0, 0, drawWidth, drawHeight);
    tintContext.globalCompositeOperation = "source-in";
    tintContext.fillStyle = color;
    tintContext.fillRect(0, 0, drawWidth, drawHeight);
    tintContext.globalCompositeOperation = "source-over";

    context.save();
    context.globalCompositeOperation = "source-over";
    context.filter = blurPx > 0.25 ? `blur(${blurPx}px)` : "none";
    context.drawImage(tintCanvas, drawX, drawY, drawWidth, drawHeight);
    context.restore();
    return;
  }

  const innerRadius = clampedRadius * (1 - softness);
  const gradient = context.createRadialGradient(x, y, innerRadius, x, y, clampedRadius);
  const colorStop =
    paintTarget === "mask"
      ? isEraser
        ? "rgba(0, 0, 0, 1)"
        : "rgba(255, 255, 255, 1)"
      : hexToRgba(color, 1);
  const transparentStop =
    paintTarget === "mask"
      ? isEraser
        ? "rgba(0, 0, 0, 0)"
        : "rgba(255, 255, 255, 0)"
      : hexToRgba(color, 0);

  gradient.addColorStop(0, colorStop);
  gradient.addColorStop(Math.min(0.98, innerRadius / clampedRadius), colorStop);
  gradient.addColorStop(1, transparentStop);

  context.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, clampedRadius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
};

const getLocaleStrings = (copy: UvDecalEditorProps["copy"]) => {
  const isRussian = /[\u0400-\u04FF]/.test(`${copy.uvEditorTitle} ${copy.uvEditorHint}`);
  return {
    isRussian,
    summaryHint: isRussian
      ? "Рисуйте прямо по выбранной декали. Цвет и размер кисти можно менять в панели ниже."
      : "Paint on the base map or on the selected decal. Change brush color and size below.",
    statusEmpty: isRussian ? "Выберите меш с UV" : "Select a mesh with UVs",
    layersTitle: isRussian ? "Слои" : "Layers",
    layersEmpty: isRussian ? "Слой декалей ещё не загружен" : "No decal layers loaded yet",
    toolbarAdd: isRussian ? "Добавить" : "Add",
    toolbarApply: isRussian ? "Применить" : "Apply",
    toolbarSave: isRussian ? "Сохранить" : "Save",
    toolbarPng: "PNG",
    textTitle: isRussian ? "Текст" : "Text",
    textPlaceholder: isRussian ? "Введите текст для слоя" : "Enter text for the layer",
    textFont: isRussian ? "Шрифт" : "Font",
    textSize: isRussian ? "Размер" : "Size",
    textColor: isRussian ? "Цвет текста" : "Text color",
    addText: isRussian ? "Добавить текст" : "Add text",
    toolbarUndo: isRussian ? "Назад" : "Back",
    toolbarRedo: isRussian ? "Вперёд" : "Forward",
    toolbarSnap: isRussian ? "Шаг" : "Snap",
    toolbarFitView: isRussian ? "Вписать" : "Fit View",
    moveLeft: isRussian ? "Влево" : "Left",
    moveRight: isRussian ? "Вправо" : "Right",
    moveUp: isRussian ? "Вверх" : "Up",
    moveDown: isRussian ? "Вниз" : "Down",
    scaleUp: isRussian ? "Масштаб +" : "Scale +",
    scaleDown: isRussian ? "Масштаб -" : "Scale -",
    rotateLeft: isRussian ? "-15°" : "Rotate -15",
    rotateRight: isRussian ? "+15°" : "Rotate +15",
    reset: isRussian ? "Сброс" : "Reset",
    target: isRussian ? "Цель" : "Target",
    mode: isRussian ? "Режим" : "Mode",
    opacity: isRussian ? "Непрозрачность" : "Opacity",
    tool: isRussian ? "Инструмент" : "Tool",
    mirror: isRussian ? "Зеркало" : "Mirror",
    cropShape: isRussian ? "Форма обрезки" : "Crop Shape",
    brush: isRussian ? "Кисть" : "Brush",
    paintTo: isRussian ? "Рисовать" : "Paint To",
    transform: isRussian ? "Трансформ" : "Transform",
    crop: isRussian ? "Обрезка" : "Crop",
    brushTool: isRussian ? "Кисть" : "Brush",
    eraser: isRussian ? "Ластик" : "Eraser",
    eyedropper: isRussian ? "Пипетка" : "Pipette",
    fillTool: isRussian ? "Заливка" : "Fill",
    rect: isRussian ? "Прямоуг." : "Rect",
    circle: isRussian ? "Круг" : "Circle",
    image: isRussian ? "Изображение" : "Image",
    mask: isRussian ? "Маска" : "Mask",
    resetMask: isRussian ? "Сбросить маску" : "Reset Mask",
    showMask: isRussian ? "Маска" : "Show Mask",
    invertMask: isRussian ? "Инверт" : "Invert",
    rename: isRussian ? "Переименовать" : "Rename",
    duplicate: isRussian ? "Копия" : "Duplicate",
    lock: isRussian ? "Замок" : "Lock",
    unlock: isRussian ? "Разблок." : "Unlock",
    center: isRussian ? "Центровать" : "Center",
    fitLayer: isRussian ? "Вписать" : "Fit Layer",
    clearSlot: isRussian ? "Скрыть" : "Hide",
    activeSlot: isRussian ? "Слот" : "Slot",
    editing: isRussian ? "Редактируется" : "Editing",
    uvLayout: isRussian ? "UV раскладка" : "UV layout",
    baseMap: isRussian ? "Базовая карта" : "Base map",
    draft: isRussian ? "Черновик" : "Draft",
    decal: isRussian ? "Декаль" : "Decal",
    brushPreset: isRussian ? "\u041f\u0440\u0435\u0441\u0435\u0442" : "Preset",
    brushPresetType: isRussian ? "\u0422\u0438\u043f \u043a\u0438\u0441\u0442\u0438" : "Preset Type",
    brushPresets: isRussian ? "\u041a\u0438\u0441\u0442\u0438" : "Brushes",
    stampPresets: isRussian ? "\u0428\u0442\u0430\u043c\u043f\u044b" : "Stamps",
    designTitle: isRussian ? "\u0414\u0438\u0437\u0430\u0439\u043d" : "Design",
    designFill: "\u0417\u0430\u043b\u0438\u0432\u043a\u0430",
    designSolid: isRussian ? "\u0426\u0432\u0435\u0442" : "Solid",
    designPattern: isRussian ? "\u041f\u0430\u0442\u0442\u0435\u0440\u043d" : "Pattern",
    designTexture: isRussian ? "\u0422\u0435\u043a\u0441\u0442\u0443\u0440\u0430" : "Texture",
    designGradient: isRussian ? "\u0413\u0440\u0430\u0434\u0438\u0435\u043d\u0442" : "Gradient",
    designShape: isRussian ? "\u0424\u0438\u0433\u0443\u0440\u0430" : "Shape",
    designColor: isRussian ? "\u0426\u0432\u0435\u0442" : "Color",
    designStroke: isRussian ? "\u041e\u0431\u0432\u043e\u0434\u043a\u0430" : "Stroke",
    designStrokeColor: isRussian ? "\u0426\u0432\u0435\u0442 \u043e\u0431\u0432\u043e\u0434\u043a\u0438" : "Stroke color",
    designStrokeWidth: isRussian ? "\u0422\u043e\u043b\u0449\u0438\u043d\u0430" : "Thickness",
    designPatternPreset: isRussian ? "\u041f\u0430\u0442\u0442\u0435\u0440\u043d" : "Pattern",
    designTextureUpload: isRussian ? "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0442\u0435\u043a\u0441\u0442\u0443\u0440\u0443" : "Upload texture",
    designTextureReplace: isRussian ? "\u0417\u0430\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u043a\u0441\u0442\u0443\u0440\u0443" : "Replace texture",
    designTextureMissing: isRussian ? "\u0424\u0430\u0439\u043b \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d" : "No file selected",
    designTextureAutoCenter: isRussian
      ? "\u0410\u0432\u0442\u043e\u0446\u0435\u043d\u0442\u0440 \u0432 \u0444\u043e\u0440\u043c\u0435"
      : "Auto-center in shape",
    designGradientPreset: isRussian ? "\u0413\u0440\u0430\u0434\u0438\u0435\u043d\u0442" : "Gradient",
    designPatternScale: isRussian ? "\u041c\u0430\u0441\u0448\u0442\u0430\u0431" : "Scale",
    designPatternOffsetX: isRussian ? "\u0421\u0434\u0432\u0438\u0433 X" : "Offset X",
    designPatternOffsetY: isRussian ? "\u0421\u0434\u0432\u0438\u0433 Y" : "Offset Y",
    designPatternRotation: isRussian ? "\u041f\u043e\u0432\u043e\u0440\u043e\u0442" : "Rotation",
    designPatternRepeatX: isRussian ? "\u041f\u043e\u0432\u0442\u043e\u0440 X" : "Repeat X",
    designPatternRepeatY: isRussian ? "\u041f\u043e\u0432\u0442\u043e\u0440 Y" : "Repeat Y",
    designPatternMirrorRepeat: isRussian
      ? "\u0417\u0435\u0440\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u0432\u0442\u043e\u0440"
      : "Mirror repeat",
    designAddLayer: isRussian ? "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0434\u0438\u0437\u0430\u0439\u043d" : "Add design",
    previewTitle: "UV Preview",
    blendMode: isRussian ? "Наложение" : "Blend",
    blendModeHint: isRussian
      ? "Выбрать режим, по которому слой смешивается с тем, что находится ниже."
      : "Choose how the selected layer mixes with the pixels underneath it.",
    blendNormal: isRussian ? "Обычный" : "Normal",
    blendMultiply: isRussian ? "Умножение" : "Multiply",
    blendScreen: isRussian ? "Экран" : "Screen",
    blendOverlay: isRussian ? "Перекрытие" : "Overlay",
    blendSoftLight: isRussian ? "Мягкий свет" : "Soft light",
    blendHardLight: isRussian ? "Жесткий свет" : "Hard light",
    blendDarken: isRussian ? "Затемнение" : "Darken",
    blendLighten: isRussian ? "Осветление" : "Lighten",
    blendColorDodge: isRussian ? "Осветление основы" : "Color dodge",
    blendColorBurn: isRussian ? "Затемнение основы" : "Color burn",
    blendDifference: isRussian ? "Разница" : "Difference",
    blendExclusion: isRussian ? "Исключение" : "Exclusion",
    previewHint: isRussian ? "Колесо zoom, RMB/MMB pan, Alt + drag" : "Wheel zoom, RMB/MMB pan, Alt + drag",
    noMesh: isRussian ? "Нет UV-меша для текущего слота" : "No UV mesh for the current slot",
    removeAsset: isRussian ? "Удалить" : "Remove",
    removeLayer: isRussian ? "Удалить слой" : "Remove layer",
    moveLayerUp: isRussian ? "Поднять слой" : "Move layer up",
    moveLayerDown: isRussian ? "Опустить слой" : "Move layer down",
    currentFile: isRussian ? "Текущий файл" : "Current file",
    close: isRussian ? "Закрыть" : "Close",
    closeHint: isRussian
      ? "Закрыть UV-редактор. Текущий объект останется выбранным, пока вы не переключите его."
      : "Close the UV editor. The current object stays selected until you switch it.",
    renamePrompt: isRussian ? "Новое имя слоя" : "New layer name",
    saveHint: isRussian ? "Сохранить в аватар" : "Save current draft back to the avatar",
    exportPngHint: isRussian ? "Экспортировать preview как PNG" : "Export the preview as PNG",
    copySuffix: isRussian ? "копия" : "copy",
    selectLayerHint: isRussian ? "Выбрать слой" : "Select layer",
    selectLayerTooltip: (layerName: string) =>
      isRussian
        ? `Сделать активным слой «${layerName}», чтобы менять его видимость, прозрачность и трансформацию.`
        : `Select the "${layerName}" layer so you can edit its visibility, opacity, and transform.`,
    toggleVisibilityHint: isRussian
      ? "Показать или скрыть слой"
      : "Toggle layer visibility",
    toggleVisibilityTooltip: isRussian
      ? "Показать или скрыть этот слой в UV-preview и на аватаре."
      : "Show or hide this layer in the UV preview and on the avatar.",
    soloLayerHint: isRussian ? "Показать только этот слой" : "Solo this layer",
    soloLayerTooltip: isRussian
      ? "Оставить видимым только этот слой, чтобы проверить его отдельно от остальных."
      : "Show only this layer so you can inspect it separately from the others.",
    removeLayerHint: isRussian
      ? "Удалить этот слой из редактора и убрать его с аватара."
      : "Remove this layer from the editor and from the avatar.",
    moveLayerUpHint: isRussian
      ? "Поднять слой выше в порядке наложения, чтобы он рисовался поверх нижних слоёв."
      : "Move this layer higher in the stack so it renders above the layers below it.",
    moveLayerDownHint: isRussian
      ? "Опустить слой ниже в порядке наложения, чтобы другие слои могли перекрывать его."
      : "Move this layer lower in the stack so other layers can render above it.",
    currentFileTooltip: (fileName: string) =>
      isRussian
        ? `Сейчас загружен файл: ${fileName || "не выбран"}.`
        : `Currently loaded file: ${fileName || "none"}.`,
    modeDecalHint: isRussian
      ? "Работать с декалью: это отдельная наклейка или рисунок поверх базовой текстуры."
      : "Work with a decal: a separate sticker or image placed over the base texture.",
    modeTextureHint: isRussian
      ? "Работать с полной текстурой объекта: заменить или редактировать саму карту материала."
      : "Work with the full object texture: replace or edit the material map itself.",
    removeAssetHint: isRussian
      ? "Удалить текущий загруженный файл из редактора."
      : "Remove the currently loaded file from the editor.",
    undoHint: isRussian
      ? "Отменить последнее действие в редакторе."
      : "Undo the last action in the editor.",
    redoHint: isRussian
      ? "Вернуть последнее отменённое действие."
      : "Redo the last undone action.",
    addHint: isRussian
      ? "Загрузить новое изображение для декали или текстуры."
      : "Upload a new image for a decal or a texture.",
    applyHint: isRussian
      ? "Создать слой из текущего черновика, чтобы он появился в списке слоёв."
      : "Create a layer from the current draft so it appears in the layer list.",
    toolbarSnapHint: isRussian
      ? "Включить шаговую привязку для более точного перемещения и трансформации."
      : "Enable snap steps for more precise movement and transforms.",
    toolbarFitViewHint: isRussian
      ? "Сбросить зум и панораму так, чтобы вся UV-раскладка поместилась в окно."
      : "Reset zoom and pan so the full UV layout fits in the window.",
    moveLeftHint: isRussian
      ? "Сдвинуть выбранный слой немного влево по UV."
      : "Move the selected layer slightly to the left in UV space.",
    moveRightHint: isRussian
      ? "Сдвинуть выбранный слой немного вправо по UV."
      : "Move the selected layer slightly to the right in UV space.",
    moveUpHint: isRussian
      ? "Сдвинуть выбранный слой немного вверх по UV."
      : "Move the selected layer slightly upward in UV space.",
    moveDownHint: isRussian
      ? "Сдвинуть выбранный слой немного вниз по UV."
      : "Move the selected layer slightly downward in UV space.",
    scaleUpHint: isRussian
      ? "Немного увеличить выбранный слой."
      : "Increase the size of the selected layer slightly.",
    scaleDownHint: isRussian
      ? "Немного уменьшить выбранный слой."
      : "Decrease the size of the selected layer slightly.",
    rotateLeftHint: isRussian
      ? "Повернуть выбранный слой на 15 градусов против часовой стрелки."
      : "Rotate the selected layer 15 degrees counterclockwise.",
    rotateRightHint: isRussian
      ? "Повернуть выбранный слой на 15 градусов по часовой стрелке."
      : "Rotate the selected layer 15 degrees clockwise.",
    resetHint: isRussian
      ? "Сбросить положение, масштаб и поворот выбранного слоя."
      : "Reset the selected layer position, scale, and rotation.",
    opacityHint: isRussian
      ? "Изменить прозрачность выбранного слоя."
      : "Adjust the opacity of the selected layer.",
    transformHint: isRussian
      ? "Перемещать, масштабировать и поворачивать выбранный слой."
      : "Move, scale, and rotate the selected layer.",
    cropHint: isRussian
      ? "Обрезать изображение перед размещением на UV."
      : "Crop the image before placing it on the UV map.",
    brushToolHint: isRussian
      ? "Рисовать по базовой карте или по выбранному слою."
      : "Paint on the base map or on the selected layer.",
    mirrorHint: isRussian
      ? "Отзеркалить выделенную декаль по горизонтали. Повторное нажатие вернёт её обратно."
      : "Flip the selected decal horizontally. Click again to flip it back.",
    eraserHint: isRussian
      ? "Стирать часть рисунка на текущем слое."
      : "Erase part of the drawing on the current layer.",
    eyedropperHint: isRussian
      ? "Взять цвет с базовой карты под курсором."
      : "Pick a color from the base map under the cursor.",
    fillToolHint: isRussian
      ? "Залить весь выбранный базовый слой текущим цветом, сохранив прозрачные области."
      : "Fill the selected base layer with the current color while preserving transparent areas.",
    rectHint: isRussian ? "Прямоугольная форма обрезки." : "Use a rectangular crop shape.",
    circleHint: isRussian ? "Круглая форма обрезки." : "Use a circular crop shape.",
    brushColorHint: isRussian ? "Выбрать цвет, которым будет рисовать кисть." : "Choose the color used by the brush.",
    brushSizeHint: isRussian ? "Изменить размер кисти." : "Adjust the brush size.",
    brushSoftnessHint: isRussian ? "Настроить мягкость краёв кисти." : "Adjust how soft the brush edges are.",
    brushPresetHint: isRussian
      ? "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043e\u0440\u043c\u0443 \u043a\u0438\u0441\u0442\u0438 \u0438\u043b\u0438 \u0448\u0442\u0430\u043c\u043f\u0430 \u0434\u043b\u044f \u0440\u0438\u0441\u043e\u0432\u0430\u043d\u0438\u044f."
      : "Choose the brush or stamp shape used for painting.",
    brushPresetTypeHint: isRussian
      ? "\u041f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043c\u0435\u0436\u0434\u0443 \u043e\u0431\u044b\u0447\u043d\u044b\u043c\u0438 \u043a\u0438\u0441\u0442\u044f\u043c\u0438 \u0438 \u0448\u0442\u0430\u043c\u043f\u0430\u043c\u0438."
      : "Switch between continuous brushes and stamp presets.",
    textPlaceholderHint: isRussian
      ? "Введите слово, фразу или несколько строк, чтобы создать новый текстовый слой."
      : "Enter a word, phrase, or multiple lines to create a new text layer.",
    textFontHint: isRussian
      ? "Выберите шрифт, которым будет создан текстовый слой."
      : "Choose the font used to generate the text layer.",
    textSizeHint: isRussian
      ? "Настройте базовый размер текста перед созданием слоя."
      : "Adjust the base text size before creating the layer.",
    textColorHint: isRussian
      ? "Выберите цвет для нового текстового слоя."
      : "Choose the color for the new text layer.",
    addTextHint: isRussian
      ? "Создать новый слой-декаль из введённого текста и сделать его активным."
      : "Create a new decal layer from the entered text and make it active.",
    designFillHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c, \u0447\u0435\u043c \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0430 \u0444\u0438\u0433\u0443\u0440\u0430: \u0446\u0432\u0435\u0442\u043e\u043c, \u043f\u0430\u0442\u0442\u0435\u0440\u043d\u043e\u043c, \u0441\u0432\u043e\u0435\u0439 \u0442\u0435\u043a\u0441\u0442\u0443\u0440\u043e\u0439 \u0438\u043b\u0438 \u0433\u0440\u0430\u0434\u0438\u0435\u043d\u0442\u043e\u043c."
      : "Choose how the shape should be filled: a solid color, a pattern, a custom texture, or a gradient.",
    designColorHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u0446\u0432\u0435\u0442 \u0434\u043b\u044f \u043d\u043e\u0432\u043e\u0439 \u0444\u0438\u0433\u0443\u0440\u044b."
      : "Choose the main color for the new shape.",
    designStrokeColorHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0446\u0432\u0435\u0442 \u0432\u043d\u0435\u0448\u043d\u0435\u0439 \u043e\u0431\u0432\u043e\u0434\u043a\u0438 \u0444\u0438\u0433\u0443\u0440\u044b."
      : "Choose the color of the outer outline around the shape.",
    designStrokeWidthHint: isRussian
      ? "\u041d\u0430\u0441\u0442\u0440\u043e\u0438\u0442\u044c \u0442\u043e\u043b\u0449\u0438\u043d\u0443 \u0432\u043d\u0435\u0448\u043d\u0435\u0439 \u043e\u0431\u0432\u043e\u0434\u043a\u0438. 0 \u043e\u0442\u043a\u043b\u044e\u0447\u0430\u0435\u0442 \u044d\u0444\u0444\u0435\u043a\u0442."
      : "Adjust the outer outline thickness. Set it to 0 to disable the effect.",
    designPatternHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043f\u0430\u0442\u0442\u0435\u0440\u043d, \u043a\u043e\u0442\u043e\u0440\u044b\u043c \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0430 \u0444\u0438\u0433\u0443\u0440\u0430."
      : "Choose the pattern used to fill the shape.",
    designTextureHint: isRussian
      ? "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u0432\u043e\u044e \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0434\u043b\u044f \u0437\u0430\u043b\u0438\u0432\u043a\u0438 \u0444\u0438\u0433\u0443\u0440\u044b."
      : "Upload your own image to fill the shape.",
    designTextureUploadHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0438\u043b\u0438 \u0437\u0430\u043c\u0435\u043d\u0438\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443, \u043a\u043e\u0442\u043e\u0440\u0430\u044f \u0431\u0443\u0434\u0435\u0442 \u0432\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0430 \u0432\u043d\u0443\u0442\u0440\u044c \u0444\u0438\u0433\u0443\u0440\u044b."
      : "Choose or replace the image that will be placed inside the shape.",
    designTextureAutoCenterHint: isRussian
      ? "\u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0432\u044b\u0440\u0430\u0432\u043d\u044f\u0442\u044c \u0438 \u0446\u0435\u043d\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0442\u0435\u043a\u0441\u0442\u0443\u0440\u0443 \u0432\u043d\u0443\u0442\u0440\u0438 \u0444\u043e\u0440\u043c\u044b."
      : "Automatically align and center the texture inside the shape.",
    designGradientHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0433\u0440\u0430\u0434\u0438\u0435\u043d\u0442, \u043a\u043e\u0442\u043e\u0440\u044b\u043c \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0430 \u0444\u0438\u0433\u0443\u0440\u0430."
      : "Choose the gradient used to fill the shape.",
    designShapeHint: isRussian
      ? "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0444\u043e\u0440\u043c\u0443 \u043d\u043e\u0432\u043e\u0439 \u0434\u0435\u043a\u0430\u043b\u0438."
      : "Choose the shape of the new decal.",
    designPatternScaleHint: isRussian
      ? "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u043e\u0431\u0449\u0438\u0439 \u043c\u0430\u0441\u0448\u0442\u0430\u0431 \u0437\u0430\u043b\u0438\u0432\u043a\u0438 \u0432\u043d\u0443\u0442\u0440\u0438 \u0444\u0438\u0433\u0443\u0440\u044b."
      : "Adjust the overall size of the fill inside the shape.",
    designPatternOffsetXHint: isRussian
      ? "\u0421\u0434\u0432\u0438\u043d\u0443\u0442\u044c \u0437\u0430\u043b\u0438\u0432\u043a\u0443 \u043f\u043e \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u0438."
      : "Move the fill horizontally inside the shape.",
    designPatternOffsetYHint: isRussian
      ? "\u0421\u0434\u0432\u0438\u043d\u0443\u0442\u044c \u0437\u0430\u043b\u0438\u0432\u043a\u0443 \u043f\u043e \u0432\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u0438."
      : "Move the fill vertically inside the shape.",
    designPatternRotationHint: isRussian
      ? "\u041f\u043e\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0437\u0430\u043b\u0438\u0432\u043a\u0443 \u0432\u043d\u0443\u0442\u0440\u0438 \u0444\u0438\u0433\u0443\u0440\u044b."
      : "Rotate the fill inside the shape.",
    designPatternRepeatXHint: isRussian
      ? "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0447\u0430\u0441\u0442\u043e\u0442\u0443 \u043f\u043e\u0432\u0442\u043e\u0440\u0430 \u0437\u0430\u043b\u0438\u0432\u043a\u0438 \u043f\u043e X."
      : "Adjust how densely the fill repeats on the X axis.",
    designPatternRepeatYHint: isRussian
      ? "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0447\u0430\u0441\u0442\u043e\u0442\u0443 \u043f\u043e\u0432\u0442\u043e\u0440\u0430 \u0437\u0430\u043b\u0438\u0432\u043a\u0438 \u043f\u043e Y."
      : "Adjust how densely the fill repeats on the Y axis.",
    designPatternMirrorRepeatHint: isRussian
      ? "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0437\u0435\u0440\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u043e\u0442\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u043a\u0430\u0436\u0434\u043e\u0439 \u0432\u0442\u043e\u0440\u043e\u0439 \u043f\u043b\u0438\u0442\u043a\u0438 \u0437\u0430\u043b\u0438\u0432\u043a\u0438."
      : "Mirror every second fill tile for a reflected repeat.",
    designAddHint: isRussian
      ? "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043d\u043e\u0432\u0443\u044e \u0434\u0435\u043a\u0430\u043b\u044c \u0438\u0437 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u0444\u043e\u0440\u043c\u044b \u0438 \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u0437\u0430\u043b\u0438\u0432\u043a\u0438."
      : "Create a new decal from the selected shape and fill.",
    imageHint: isRussian ? "Рисовать по самому изображению слоя." : "Paint directly on the layer image.",
    maskHint: isRussian
      ? "Рисовать по маске слоя, чтобы скрывать или показывать части изображения."
      : "Paint on the layer mask to hide or reveal parts of the image.",
    resetMaskHint: isRussian ? "Сбросить маску и вернуть её к исходному состоянию." : "Reset the mask back to its original state.",
    showMaskHint: isRussian ? "Показать или скрыть предпросмотр маски." : "Show or hide the mask preview.",
    invertMaskHint: isRussian
      ? "Инвертировать маску: скрытое станет видимым и наоборот."
      : "Invert the mask so hidden areas become visible and vice versa.",
    renameHint: isRussian ? "Переименовать выбранный слой, чтобы его было проще отличать." : "Rename the selected layer so it is easier to identify.",
    duplicateHint: isRussian ? "Создать копию выбранного слоя." : "Create a copy of the selected layer.",
    lockHint: isRussian
      ? "Заблокировать слой, чтобы случайно не сдвинуть и не изменить его."
      : "Lock the layer so it cannot be moved or edited accidentally.",
    unlockHint: isRussian ? "Снять блокировку с выбранного слоя." : "Unlock the selected layer so it can be edited again.",
    centerHint: isRussian ? "Переместить выбранный слой в центр UV-области." : "Move the selected layer to the center of the UV area.",
    fitLayerHint: isRussian ? "Подогнать выбранный слой под доступную область UV." : "Fit the selected layer to the available UV area.",
    clearSlotHint: isRussian ? "Временно скрыть или снова показать выбранный слой." : "Temporarily hide or show the selected layer.",
    clearAppliedHint: isRussian ? "Убрать все применённые слои текущего объекта с аватара." : "Remove all applied layers for the current object from the avatar.",
    previewCanvasHint: isRussian
      ? "Колесо мыши меняет масштаб, ПКМ или средняя кнопка двигают вид, Alt + drag помогает точнее работать со слоем."
      : "Use the wheel to zoom, right or middle mouse to pan, and Alt + drag for more precise layer work.",
  };
};

type ExtractedUvEditorPortProps = UvDecalEditorProps & {
  extractedControls?: UvPortToolbarControls;
};

export function ExtractedUvEditorPort(props: ExtractedUvEditorPortProps) {
  const {
    copy,
    slotOptions,
    selectedSlot,
    onSelectAssetId,
    modelUrl,
    decalTextureUrl,
    baseTextureOverrideUrl,
    appliedDecals,
    draftUv,
    scale,
    scaleX,
    scaleY,
    rotationDeg,
    onDraftUvChange,
    onDraftTextureUrlChange,
    onDraftOpacityChange,
    onDraftBlendModeChange,
    draftAssetId,
    onDraftFileNameChange,
    onCreateGeneratedDecal,
    onCreateDecalLayer,
    onBaseLayerPreviewChange,
    onScaleChange,
    onScaleXChange,
    onScaleYChange,
    onRotationDegChange,
    draftFileName,
    onApply,
    onReset,
    onClearApplied,
    onRemoveAppliedLayer,
    onReplaceAppliedLayers,
    onUpdateAppliedLayer,
    onMoveAppliedLayer,
    hasApplied,
    onCloseRequested,
    extractedControls,
  } = props;

  const locale = useMemo(() => getLocaleStrings(copy), [copy]);
  const isTextureMode = extractedControls?.mode === "texture";
  const toolHints: Record<UvPortTool, string> = {
    transform: locale.transformHint,
    crop: locale.cropHint,
    brush: locale.brushToolHint,
    eraser: locale.eraserHint,
    eyedropper: locale.eyedropperHint,
    fill: locale.fillToolHint,
  };
  const cropShapeHints: Record<UvPortCropShape, string> = {
    rect: locale.rectHint,
    circle: locale.circleHint,
  };
  const paintTargetHints: Record<UvPortPaintTarget, string> = {
    image: locale.imageHint,
    mask: locale.maskHint,
  };
  const documentModel = useMemo(() => createUvPortDocumentFromLegacyProps(props), [props]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(documentModel.selectedLayerId);
  const [activeTool, setActiveTool] = useState<UvPortTool>(documentModel.activeTool);
  const [paintTarget, setPaintTarget] = useState<UvPortPaintTarget>(documentModel.paintTarget);
  const [cropShape, setCropShape] = useState<UvPortCropShape>(documentModel.cropShape);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [loadedMesh, setLoadedMesh] = useState<LoadedUvMesh | null>(null);
  const [images, setImages] = useState<Record<string, CanvasImageSource>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [brushColor, setBrushColor] = useState("#ffb347");
  const [brushSize, setBrushSize] = useState(24);
  const [brushSoftness, setBrushSoftness] = useState(38);
  const [brushPresetKind, setBrushPresetKind] = useState<BrushPresetKind>("brush");
  const [brushPresetId, setBrushPresetId] = useState(DEFAULT_BRUSH_PRESET_ID);
  const [isBrushPresetMenuOpen, setIsBrushPresetMenuOpen] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [textFontFamily, setTextFontFamily] = useState(TEXT_FONT_OPTIONS[0]?.value || 'Arial, sans-serif');
  const [textFontSize, setTextFontSize] = useState(96);
  const [textColor, setTextColor] = useState("#111111");
  const [showMaskPreview, setShowMaskPreview] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);
  const [layerOverrides, setLayerOverrides] = useState<Record<string, LayerOverride>>({});
  const [extraLayers, setExtraLayers] = useState<UvPortLayer[]>([]);
  const [baseLayerTextureUrls, setBaseLayerTextureUrls] = useState<Record<string, string>>({});
  const [paintedBaseSlots, setPaintedBaseSlots] = useState<Record<string, boolean>>({});
  const [cropPreview, setCropPreview] = useState<{ layerId: string; box: LayerLocalBounds } | null>(null);
  const [undoStack, setUndoStack] = useState<EditorHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorHistorySnapshot[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const brushPresetMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedBrushPresetOptionRef = useRef<HTMLButtonElement | null>(null);
  const interactionRef = useRef<InteractionState>(null);
  const baseLayerCanvasRef = useRef<Record<string, HTMLCanvasElement>>({});
  const editableLayerCanvasRef = useRef<Record<string, HTMLCanvasElement>>({});
  const baseLayerModelUrlRef = useRef<Record<string, string>>({});
  const previousBaseTextureOverrideUrlRef = useRef<string | null | undefined>(undefined);
  const latestInteractiveLayerIdRef = useRef<string | null>(null);
  const lastSyncedTextLayerSignatureRef = useRef<string | null>(null);

  const activeSlot = selectedSlot || slotOptions[0]?.id || null;
  const activeLoadedMesh = loadedMesh && loadedMesh.meshName === activeSlot ? loadedMesh : null;
  const activeBrushPresetOptions = brushPresetKind === "stamp" ? STAMP_PRESETS : BRUSH_PRESETS;
  const activeBrushPreset: BrushPreset | null =
    activeBrushPresetOptions.find((preset) => preset.id === brushPresetId) ||
    activeBrushPresetOptions[0] ||
    BRUSH_PRESETS[0] ||
    null;
  const editorWindow = useFloatingWindow({
    initialRect: () => {
      if (typeof window === "undefined") {
        return { left: 8, top: 62, width: 448, height: 510 };
      }

      const width = Math.min(448, Math.max(416, Math.round(window.innerWidth * 0.235)));
      const height = Math.min(590, Math.max(500, Math.round(window.innerHeight * 0.525)));
      return { left: 8, top: 62, width, height };
    },
    minWidth: 380,
    minHeight: 420,
  });
  const previewWindow = useFloatingWindow({
    initialRect: () => {
      if (typeof window === "undefined") {
        return { left: 1030, top: 72, width: 420, height: 470 };
      }

      const width = Math.min(420, Math.max(380, Math.round(window.innerWidth * 0.22)));
      const height = Math.min(500, Math.max(460, Math.round(window.innerHeight * 0.49)));
      const left = Math.max(470, window.innerWidth - 460 - width - 18);
      return { left, top: 72, width, height };
    },
    minWidth: 260,
    minHeight: 220,
  });

  useEffect(() => {
    setSelectedLayerId(documentModel.selectedLayerId);
    setActiveTool(documentModel.activeTool);
    setPaintTarget(documentModel.paintTarget);
    setCropShape(documentModel.cropShape);
    setViewport(DEFAULT_VIEWPORT);
    setSoloLayerId(null);
    setLayerOverrides({});
    setExtraLayers([]);
    setCropPreview(null);
    setUndoStack([]);
    setRedoStack([]);
    editableLayerCanvasRef.current = {};
  }, [
    activeSlot,
    modelUrl,
  ]);

  useEffect(() => {
    if (!activeBrushPresetOptions.some((preset) => preset.id === brushPresetId)) {
      setBrushPresetId(activeBrushPresetOptions[0]?.id || DEFAULT_BRUSH_PRESET_ID);
    }
  }, [activeBrushPresetOptions, brushPresetId]);

  useEffect(() => {
    setIsBrushPresetMenuOpen(false);
  }, [brushPresetKind]);

  useEffect(() => {
    if (!isBrushPresetMenuOpen) {
      return;
    }

    selectedBrushPresetOptionRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [activeBrushPreset?.id, isBrushPresetMenuOpen]);

  useEffect(() => {
    if (!isBrushPresetMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (brushPresetMenuRef.current?.contains(target)) {
        return;
      }

      setIsBrushPresetMenuOpen(false);
    };

    const handlePresetMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBrushPresetMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handlePresetMenuKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handlePresetMenuKeyDown);
    };
  }, [isBrushPresetMenuOpen]);

  useEffect(() => {
    if (!activeSlot || !modelUrl) {
      return;
    }

    if (baseLayerModelUrlRef.current[activeSlot] === modelUrl) {
      return;
    }

    baseLayerModelUrlRef.current[activeSlot] = modelUrl;
    delete baseLayerCanvasRef.current[activeSlot];
    setBaseLayerTextureUrls((current) => {
      if (!(activeSlot in current)) {
        return current;
      }

      const next = { ...current };
      delete next[activeSlot];
      return next;
    });
    setPaintedBaseSlots((current) => {
      if (!current[activeSlot]) {
        return current;
      }

      const next = { ...current };
      delete next[activeSlot];
      return next;
    });
  }, [activeSlot, modelUrl]);

  const renderLayers = useMemo(
    () => [
      ...documentModel.layers.map((layer) => ({
        ...layer,
        textureUrl:
          layer.kind === "base" && layer.meshName
            ? baseLayerTextureUrls[layer.meshName] || layer.textureUrl
            : layer.textureUrl,
        ...(layerOverrides[layer.id] || {}),
      })),
      ...extraLayers.map((layer) => ({ ...layer, ...(layerOverrides[layer.id] || {}) })),
    ],
    [baseLayerTextureUrls, documentModel.layers, extraLayers, layerOverrides]
  );

  useEffect(() => {
    if (!selectedLayerId || !renderLayers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(documentModel.selectedLayerId || renderLayers[0]?.id || null);
    }
  }, [documentModel.selectedLayerId, renderLayers, selectedLayerId]);

  const selectedLayer =
    renderLayers.find((layer) => layer.id === selectedLayerId) ||
    renderLayers.find((layer) => layer.kind === "draft") ||
    renderLayers.find((layer) => layer.kind === "base") ||
    renderLayers[0] ||
    null;
  const selectedTextLayer =
    selectedLayer &&
    (selectedLayer.kind === "decal" || selectedLayer.kind === "draft") &&
    selectedLayer.textStyle
      ? selectedLayer
      : null;
  const selectedDesignLayer =
    selectedLayer &&
    (selectedLayer.kind === "decal" || selectedLayer.kind === "draft") &&
    selectedLayer.designStyle
      ? selectedLayer
      : null;
  const latestInteractiveLayerId =
    [...renderLayers]
      .reverse()
      .find((layer) => layer.kind === "decal" || layer.kind === "draft")?.id || null;

  useEffect(() => {
    const previousLatest = latestInteractiveLayerIdRef.current;
    latestInteractiveLayerIdRef.current = latestInteractiveLayerId;
    if (
      latestInteractiveLayerId &&
      latestInteractiveLayerId !== previousLatest &&
      (!selectedLayer || selectedLayer.kind === "base" || selectedLayer.kind === "uv-layout")
    ) {
      setSelectedLayerId(latestInteractiveLayerId);
    }
  }, [latestInteractiveLayerId, selectedLayer]);

  useEffect(() => {
    if (!onSelectAssetId || !selectedLayer?.assetId) {
      return;
    }
    onSelectAssetId(selectedLayer.assetId);
  }, [onSelectAssetId, selectedLayer?.assetId]);

  const getLayerPreviewImage = (layer: UvPortLayer | null) => {
    if (!layer) {
      return null;
    }
    if (layer.kind === "base" && layer.meshName) {
      return (
        baseLayerCanvasRef.current[layer.meshName] ||
        (layer.textureUrl ? images[layer.textureUrl] || null : null) ||
        null
      );
    }
    return layer.textureUrl ? images[layer.textureUrl] || null : null;
  };
  const selectedLayerPreviewImage = getLayerPreviewImage(selectedLayer);
  const activeBrushPresetImage =
    activeBrushPreset?.shape === "mask" && activeBrushPreset.maskSrc
      ? images[activeBrushPreset.maskSrc] || null
      : null;

  useEffect(() => {
    if (!selectedTextLayer?.textStyle) {
      return;
    }

    const nextSignature = JSON.stringify({
      id: selectedTextLayer.id,
      text: selectedTextLayer.textStyle.text,
      fontFamily: selectedTextLayer.textStyle.fontFamily,
      fontSize: selectedTextLayer.textStyle.fontSize,
      color: selectedTextLayer.textStyle.color,
    });
    if (lastSyncedTextLayerSignatureRef.current === nextSignature) {
      return;
    }

    lastSyncedTextLayerSignatureRef.current = nextSignature;
    setTextValue(selectedTextLayer.textStyle.text);
    setTextFontFamily(selectedTextLayer.textStyle.fontFamily);
    setTextFontSize(selectedTextLayer.textStyle.fontSize);
    setTextColor(selectedTextLayer.textStyle.color);
  }, [selectedTextLayer]);

  const getBlendModeLabel = (blendMode: UvLayerBlendMode) => {
    switch (blendMode) {
      case "multiply":
        return locale.blendMultiply;
      case "screen":
        return locale.blendScreen;
      case "overlay":
        return locale.blendOverlay;
      case "soft-light":
        return locale.blendSoftLight;
      case "hard-light":
        return locale.blendHardLight;
      case "darken":
        return locale.blendDarken;
      case "lighten":
        return locale.blendLighten;
      case "color-dodge":
        return locale.blendColorDodge;
      case "color-burn":
        return locale.blendColorBurn;
      case "difference":
        return locale.blendDifference;
      case "exclusion":
        return locale.blendExclusion;
      case "normal":
      default:
        return locale.blendNormal;
    }
  };
  const blendModeOptions = UV_LAYER_BLEND_MODES.map((blendMode) => ({
    value: blendMode,
    label: getBlendModeLabel(blendMode),
  }));
  const getLayerKindLabel = (layer: UvPortLayer) =>
    layer.kind === "uv-layout"
      ? locale.uvLayout
      : layer.kind === "base"
        ? locale.baseMap
        : layer.kind === "draft"
          ? extractedControls?.mode === "texture"
            ? extractedControls.labels.texture
            : locale.draft
          : extractedControls?.mode === "texture"
            ? extractedControls.labels.texture
            : `${locale.decal} · ${getBlendModeLabel(layer.blendMode)}`;
  const getTooltipProps = (label: string) => ({
    title: label,
    "aria-label": label,
  });

  const textureUrls = useMemo(() => {
    const layerTextureUrls = renderLayers
      .map((layer) => layer.textureUrl)
      .filter((value): value is string => Boolean(value));
    const brushTextureUrls = activeBrushPresetOptions
      .map((preset) => preset.maskSrc)
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set([...layerTextureUrls, ...brushTextureUrls]));
  }, [activeBrushPresetOptions, renderLayers]);

  useEffect(() => {
    if (!modelUrl || !activeSlot) {
      setLoadedMesh(null);
      return;
    }

    let cancelled = false;
    const loader = new GLTFLoader();
    setLoadedMesh(null);
    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) {
          return;
        }

        const mesh = findMeshByName(gltf.scene, activeSlot);
        if (!mesh) {
          setLoadedMesh(null);
          return;
        }

        setLoadedMesh({
          meshName: activeSlot,
          geometry: mesh.geometry.clone(),
          baseTextureImage: getMaterialTexture(mesh),
        });
      },
      undefined,
      () => {
        if (!cancelled) {
          setLoadedMesh(null);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [activeSlot, modelUrl]);

  useEffect(() => {
    let cancelled = false;
    const missing = textureUrls.filter((url) => !images[url]);
    if (!missing.length) {
      return;
    }

    (async () => {
      const loadedPairs = await Promise.all(
        missing.map(async (url) => {
          try {
            return [url, await loadImage(url)] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setImages((current) => {
        const next = { ...current };
        for (const pair of loadedPairs) {
          if (pair) {
            next[pair[0]] = pair[1];
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [images, textureUrls]);

  useEffect(() => {
    if (!activeSlot || !activeLoadedMesh?.baseTextureImage || baseLayerTextureUrls[activeSlot]) {
      return;
    }

    const dataUrl = canvasImageSourceToDataUrl(activeLoadedMesh.baseTextureImage, {
      upscaleTinyTextures: true,
    });
    const baseCanvas = cloneCanvasImageSourceToCanvas(activeLoadedMesh.baseTextureImage, {
      upscaleTinyTextures: true,
    });
    if (!dataUrl || !baseCanvas) {
      return;
    }

    baseLayerCanvasRef.current[activeSlot] = baseCanvas;
    setBaseLayerTextureUrls((current) =>
      current[activeSlot] ? current : { ...current, [activeSlot]: dataUrl }
    );
  }, [activeLoadedMesh?.baseTextureImage, activeSlot, baseLayerTextureUrls]);

  useEffect(() => {
    if (!isTextureMode || !activeSlot) {
      return;
    }

    const previousOverrideUrl = previousBaseTextureOverrideUrlRef.current;
    previousBaseTextureOverrideUrlRef.current = baseTextureOverrideUrl;

    if (baseTextureOverrideUrl) {
      setBaseLayerTextureUrls((current) =>
        current[activeSlot] === baseTextureOverrideUrl
          ? current
          : { ...current, [activeSlot]: baseTextureOverrideUrl }
      );
      setPaintedBaseSlots((current) =>
        current[activeSlot] ? current : { ...current, [activeSlot]: true }
      );

      const overrideImage = images[baseTextureOverrideUrl] || null;
      const overrideCanvas = cloneCanvasImageSourceToCanvas(overrideImage, {
        upscaleTinyTextures: true,
      });
      if (overrideCanvas) {
        baseLayerCanvasRef.current[activeSlot] = overrideCanvas;
      }
      return;
    }

    if (!previousOverrideUrl) {
      return;
    }

    const restoredBaseCanvas = cloneCanvasImageSourceToCanvas(
      activeLoadedMesh?.baseTextureImage || null,
      {
        upscaleTinyTextures: true,
      }
    );
    const restoredBaseUrl = canvasImageSourceToDataUrl(activeLoadedMesh?.baseTextureImage || null, {
      upscaleTinyTextures: true,
    });

    if (restoredBaseCanvas) {
      baseLayerCanvasRef.current[activeSlot] = restoredBaseCanvas;
    } else {
      delete baseLayerCanvasRef.current[activeSlot];
    }

    setBaseLayerTextureUrls((current) => {
      const previousValue = current[activeSlot] || null;
      if (previousValue === restoredBaseUrl) {
        return current;
      }

      const next = { ...current };
      if (restoredBaseUrl) {
        next[activeSlot] = restoredBaseUrl;
      } else {
        delete next[activeSlot];
      }
      return next;
    });
    setPaintedBaseSlots((current) => {
      if (!current[activeSlot]) {
        return current;
      }

      const next = { ...current };
      delete next[activeSlot];
      return next;
    });
  }, [
    activeLoadedMesh?.baseTextureImage,
    activeSlot,
    baseTextureOverrideUrl,
    images,
    isTextureMode,
  ]);

  useEffect(() => {
    if (!activeSlot || !onBaseLayerPreviewChange) {
      return;
    }

    onBaseLayerPreviewChange(
      activeSlot,
      paintedBaseSlots[activeSlot] ? baseLayerTextureUrls[activeSlot] || null : null
    );
  }, [activeSlot, baseLayerTextureUrls, onBaseLayerPreviewChange, paintedBaseSlots]);

  useEffect(() => {
    const element = canvasWrapRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const meshMetrics = useMemo(
    () => buildMeshMetrics(activeLoadedMesh?.geometry),
    [activeLoadedMesh?.geometry]
  );
  const uvLayoutLayer = renderLayers.find((layer) => layer.kind === "uv-layout") || null;
  const baseLayer = renderLayers.find((layer) => layer.kind === "base") || null;

  const visiblePreviewLayers = useMemo(
    () =>
      renderLayers.filter((layer) => {
        if (layer.kind !== "decal" && layer.kind !== "draft") {
          return false;
        }
        if (
          activeSlot &&
          (baseLayer?.visible ?? true) &&
          paintedBaseSlots[activeSlot] &&
          layer.kind === "draft" &&
          layer.textureUrl === baseLayerTextureUrls[activeSlot] &&
          layer.uv?.[0] === 0.5 &&
          layer.uv?.[1] === 0.5 &&
          layer.scale === 1 &&
          layer.scaleX === 1 &&
          layer.scaleY === 1 &&
          layer.rotationDeg === 0 &&
          (!soloLayerId || soloLayerId !== layer.id)
        ) {
          return false;
        }
        if (!layer.visible || !layer.textureUrl) {
          return false;
        }
        if (soloLayerId && layer.id !== soloLayerId) {
          return false;
        }
        return true;
      }),
    [activeSlot, baseLayer?.visible, baseLayerTextureUrls, paintedBaseSlots, renderLayers, soloLayerId]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const geometry = activeLoadedMesh?.geometry;
    const uvAttribute = geometry?.getAttribute("uv");
    if (!canvas || !geometry || !uvAttribute || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvasSize.width * dpr));
    canvas.height = Math.max(1, Math.round(canvasSize.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const { originX, originY, viewSize } = getCanvasMetrics(canvasSize, viewport);
    context.fillStyle = "#eef1f3";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#ffffff";
    context.fillRect(originX, originY, viewSize, viewSize);

    const basePreviewImage =
      (activeSlot ? baseLayerCanvasRef.current[activeSlot] : null) ||
      (baseLayer?.textureUrl ? images[baseLayer.textureUrl] : null) ||
      activeLoadedMesh?.baseTextureImage ||
      null;
    const showBaseLayer = (baseLayer?.visible ?? true) && (!soloLayerId || soloLayerId === baseLayer?.id);
    const showUvLayout =
      (uvLayoutLayer?.visible ?? true) && (!soloLayerId || soloLayerId === uvLayoutLayer?.id);

    if (showBaseLayer && basePreviewImage) {
      context.globalAlpha = clamp(baseLayer?.opacity ?? 0.96, 0, 1);
      context.drawImage(basePreviewImage, originX, originY, viewSize, viewSize);
      context.globalAlpha = 1;
    }

    if (showUvLayout) {
      context.save();
      context.globalAlpha = clamp(uvLayoutLayer?.opacity ?? 1, 0, 1);
      context.strokeStyle = "rgba(0, 0, 0, 0.12)";
      context.lineWidth = 1;
      context.beginPath();

      const indexAttribute = geometry.getIndex();
      const triangleCount = indexAttribute
        ? Math.floor(indexAttribute.count / 3)
        : Math.floor(uvAttribute.count / 3);

      for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
        const readIndex = (vertexOffset: number) =>
          indexAttribute
            ? indexAttribute.getX(triangleIndex * 3 + vertexOffset)
            : triangleIndex * 3 + vertexOffset;

        const a = readIndex(0);
        const b = readIndex(1);
        const c = readIndex(2);
        const pointA = uvToScreen([uvAttribute.getX(a), uvAttribute.getY(a)], canvasSize, viewport);
        const pointB = uvToScreen([uvAttribute.getX(b), uvAttribute.getY(b)], canvasSize, viewport);
        const pointC = uvToScreen([uvAttribute.getX(c), uvAttribute.getY(c)], canvasSize, viewport);
        context.moveTo(pointA.x, pointA.y);
        context.lineTo(pointB.x, pointB.y);
        context.lineTo(pointC.x, pointC.y);
        context.lineTo(pointA.x, pointA.y);
      }

      context.stroke();
      context.restore();
    }

    context.strokeStyle = "rgba(0, 0, 0, 0.12)";
    context.strokeRect(originX, originY, viewSize, viewSize);

    for (const layer of visiblePreviewLayers) {
      const image = images[layer.textureUrl!];
      if (!image) {
        continue;
      }
      drawLayer({
        context,
        image,
        layer,
        size: canvasSize,
        viewport,
        strokeStyle:
          layer.id === selectedLayer?.id &&
          (selectedLayer?.kind === "base" || selectedLayer?.kind === "uv-layout")
            ? "#00d9e8"
            : undefined,
      });
    }

    if (
      selectedLayer &&
      selectedLayer.kind !== "base" &&
      selectedLayer.kind !== "uv-layout" &&
      selectedLayer.uv &&
      selectedLayerPreviewImage
    ) {
      drawActiveLayerOverlay({
        context,
        layer: selectedLayer,
        image: selectedLayerPreviewImage,
        size: canvasSize,
        viewport,
        activeTool,
        cropShape,
        showMirrorHandle:
          activeTool === "transform" &&
          !isTextureMode &&
          !selectedLayer.textStyle,
        cropBox:
          activeTool === "crop" && cropPreview?.layerId === selectedLayer.id
            ? cropPreview.box
            : activeTool === "crop"
              ? createCropBoxFromLayer(selectedLayer, selectedLayerPreviewImage, cropShape)
              : null,
      });
    }
  }, [
    activeTool,
    baseLayer?.id,
    baseLayer?.opacity,
    baseLayer?.textureUrl,
    baseLayer?.visible,
    canvasSize,
    cropPreview,
    cropShape,
    images,
    activeLoadedMesh,
    selectedLayer?.id,
    selectedLayer?.kind,
    selectedLayer?.rotationDeg,
    selectedLayer?.scale,
    selectedLayer?.scaleX,
    selectedLayer?.scaleY,
    selectedLayer?.textStyle,
    selectedLayer?.textureUrl,
    selectedLayer?.uv,
    soloLayerId,
    uvLayoutLayer?.id,
    uvLayoutLayer?.opacity,
    uvLayoutLayer?.visible,
    viewport,
    visiblePreviewLayers,
    selectedLayerPreviewImage,
    isTextureMode,
  ]);

  const buildHistorySnapshot = (): EditorHistorySnapshot => ({
    selectedLayerId,
    soloLayerId,
    layerOverrides: cloneLayerOverrides(layerOverrides),
    extraLayers: extraLayers.map(cloneLayer),
    appliedLayers: appliedDecals.map(cloneAppliedLayer),
    baseLayerTextureUrls: { ...baseLayerTextureUrls },
    paintedBaseSlots: { ...paintedBaseSlots },
    draftTextureUrl: decalTextureUrl,
    draftFileName: draftFileName || "",
    draftUv: [draftUv[0], draftUv[1]],
    scale,
    scaleX,
    scaleY,
    rotationDeg,
  });

  const syncBaseLayerCanvases = (nextTextureUrls: Record<string, string>) => {
    const nextCanvases: Record<string, HTMLCanvasElement> = {};
    for (const [slot, textureUrl] of Object.entries(nextTextureUrls)) {
      const cachedImage = textureUrl ? images[textureUrl] || null : null;
      const restoredCanvas = cloneCanvasImageSourceToCanvas(cachedImage, {
        upscaleTinyTextures: true,
      });
      if (restoredCanvas) {
        nextCanvases[slot] = restoredCanvas;
      }
    }
    baseLayerCanvasRef.current = nextCanvases;
  };

  const applyHistorySnapshot = (snapshot: EditorHistorySnapshot) => {
    setSelectedLayerId(snapshot.selectedLayerId);
    setSoloLayerId(snapshot.soloLayerId);
    setLayerOverrides(cloneLayerOverrides(snapshot.layerOverrides));
    setExtraLayers(snapshot.extraLayers.map(cloneLayer));
    onReplaceAppliedLayers?.(snapshot.appliedLayers.map(cloneAppliedLayer));
    setBaseLayerTextureUrls({ ...snapshot.baseLayerTextureUrls });
    setPaintedBaseSlots({ ...snapshot.paintedBaseSlots });
    syncBaseLayerCanvases(snapshot.baseLayerTextureUrls);
    onDraftTextureUrlChange?.(snapshot.draftTextureUrl);
    onDraftFileNameChange?.(snapshot.draftFileName);
    onDraftUvChange([snapshot.draftUv[0], snapshot.draftUv[1]]);
    onScaleChange?.(snapshot.scale);
    onScaleXChange(snapshot.scaleX);
    onScaleYChange(snapshot.scaleY);
    onRotationDegChange?.(snapshot.rotationDeg);
  };

  const pushHistorySnapshot = () => {
    const snapshot = buildHistorySnapshot();
    setUndoStack((current) => [...current.slice(-(MAX_HISTORY_STEPS - 1)), snapshot]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (!undoStack.length) {
      return;
    }

    const previousSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [
      ...current.slice(-(MAX_HISTORY_STEPS - 1)),
      buildHistorySnapshot(),
    ]);
    applyHistorySnapshot(previousSnapshot);
  };

  const handleRedo = () => {
    if (!redoStack.length) {
      return;
    }

    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [
      ...current.slice(-(MAX_HISTORY_STEPS - 1)),
      buildHistorySnapshot(),
    ]);
    applyHistorySnapshot(nextSnapshot);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndoModifier = event.ctrlKey || event.metaKey;
      if (!isUndoModifier) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName || "";
      const isTextEntry =
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        (tagName === "INPUT" &&
          !["button", "checkbox", "color", "file", "radio", "range"].includes(
            (target as HTMLInputElement).type
          )) ||
        Boolean(target?.isContentEditable);

      if (isTextEntry) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoStack.length, undoStack.length]);

  const setLayerUiPatch = (layerId: string, patch: LayerOverride) => {
    setLayerOverrides((current) => ({
      ...current,
      [layerId]: {
        ...(current[layerId] || {}),
        ...patch,
      },
    }));
  };

  const commitLayerPatch = (
    layerId: string,
    patch: LayerOverride,
    options?: {
      recordHistory?: boolean;
    }
  ) => {
    const layer = renderLayers.find((entry) => entry.id === layerId);
    if (!layer) {
      return;
    }

    if (options?.recordHistory !== false) {
      pushHistorySnapshot();
    }

    const nextPatch: LayerOverride = { ...patch };
    if (nextPatch.uv) {
      nextPatch.uv = [
        clamp01(snapEnabled ? roundToStep(nextPatch.uv[0], SNAP_STEP) : nextPatch.uv[0]),
        clamp01(snapEnabled ? roundToStep(nextPatch.uv[1], SNAP_STEP) : nextPatch.uv[1]),
      ];
    }
    if (typeof nextPatch.scale === "number") {
      nextPatch.scale = clamp(nextPatch.scale, MIN_SCALE, MAX_SCALE);
    }
    if (typeof nextPatch.scaleX === "number") {
      nextPatch.scaleX = clamp(nextPatch.scaleX, 0.01, MAX_SCALE);
    }
    if (typeof nextPatch.scaleY === "number") {
      nextPatch.scaleY = clamp(nextPatch.scaleY, 0.01, MAX_SCALE);
    }

    if (layer.kind === "uv-layout" || layer.kind === "base") {
      const uiPatch: LayerOverride = {};
      if (typeof nextPatch.opacity === "number") {
        uiPatch.opacity = clamp(nextPatch.opacity, 0, 1);
      }
      if (typeof nextPatch.visible === "boolean") {
        uiPatch.visible = nextPatch.visible;
      }
      if (typeof nextPatch.locked === "boolean") {
        uiPatch.locked = nextPatch.locked;
      }
      if (nextPatch.blendMode) {
        uiPatch.blendMode = nextPatch.blendMode;
      }
      if (typeof nextPatch.name === "string") {
        uiPatch.name = nextPatch.name;
      }
      if (Object.keys(uiPatch).length > 0) {
        setLayerUiPatch(layerId, uiPatch);
      }
      return;
    }

    if (layer.kind === "draft") {
      if (typeof nextPatch.textureUrl === "string" || nextPatch.textureUrl === null) {
        onDraftTextureUrlChange?.(nextPatch.textureUrl);
      }
      if (nextPatch.uv) {
        onDraftUvChange(nextPatch.uv);
      }
      if (typeof nextPatch.scale === "number") {
        if (onScaleChange) {
          onScaleChange(nextPatch.scale);
        } else {
          setLayerUiPatch(layerId, { scale: nextPatch.scale });
        }
      }
      if (typeof nextPatch.scaleX === "number") {
        onScaleXChange(nextPatch.scaleX);
      }
      if (typeof nextPatch.scaleY === "number") {
        onScaleYChange(nextPatch.scaleY);
      }
      if (typeof nextPatch.rotationDeg === "number") {
        if (onRotationDegChange) {
          onRotationDegChange(nextPatch.rotationDeg);
        } else {
          setLayerUiPatch(layerId, { rotationDeg: nextPatch.rotationDeg });
        }
      }

      const uiPatch: LayerOverride = {};
      if (typeof nextPatch.opacity === "number") {
        onDraftOpacityChange?.(clamp(nextPatch.opacity, 0, 1));
        uiPatch.opacity = nextPatch.opacity;
      }
      if (typeof nextPatch.visible === "boolean") {
        uiPatch.visible = nextPatch.visible;
      }
      if (typeof nextPatch.locked === "boolean") {
        uiPatch.locked = nextPatch.locked;
      }
      if (nextPatch.blendMode) {
        onDraftBlendModeChange?.(nextPatch.blendMode);
        uiPatch.blendMode = nextPatch.blendMode;
      }
      if (typeof nextPatch.name === "string") {
        uiPatch.name = nextPatch.name;
      }
      if (typeof nextPatch.textureUrl === "string" || nextPatch.textureUrl === null) {
        uiPatch.textureUrl = nextPatch.textureUrl;
      }
      if (Object.keys(uiPatch).length > 0) {
        setLayerUiPatch(layerId, uiPatch);
      }
      return;
    }

    const isExtraLayer = extraLayers.some((entry) => entry.id === layerId);
    if (isExtraLayer) {
      setExtraLayers((current) =>
        current.map((entry) =>
          entry.id === layerId
            ? {
                ...entry,
                ...nextPatch,
                ...(nextPatch.uv ? { uv: [nextPatch.uv[0], nextPatch.uv[1]] as [number, number] } : {}),
              }
            : entry
        )
      );
      return;
    }

    onUpdateAppliedLayer?.(layerId, {
      ...(typeof nextPatch.name === "string" ? { fileName: nextPatch.name } : {}),
      ...(typeof nextPatch.textureUrl === "string" || nextPatch.textureUrl === null
        ? { textureUrl: nextPatch.textureUrl }
        : {}),
      ...(nextPatch.uv ? { uv: [nextPatch.uv[0], nextPatch.uv[1]] as [number, number] } : {}),
      ...(typeof nextPatch.scale === "number" ? { scale: nextPatch.scale } : {}),
      ...(typeof nextPatch.scaleX === "number" ? { scaleX: nextPatch.scaleX } : {}),
      ...(typeof nextPatch.scaleY === "number" ? { scaleY: nextPatch.scaleY } : {}),
      ...(typeof nextPatch.rotationDeg === "number"
        ? { rotationDeg: nextPatch.rotationDeg }
        : {}),
      ...(nextPatch.blendMode ? { blendMode: nextPatch.blendMode } : {}),
      ...(typeof nextPatch.opacity === "number" ? { opacity: nextPatch.opacity } : {}),
    });

    const uiPatch: LayerOverride = {};
    if (typeof nextPatch.opacity === "number") {
      uiPatch.opacity = nextPatch.opacity;
    }
    if (typeof nextPatch.visible === "boolean") {
      uiPatch.visible = nextPatch.visible;
    }
    if (typeof nextPatch.locked === "boolean") {
      uiPatch.locked = nextPatch.locked;
    }
    if (nextPatch.blendMode) {
      uiPatch.blendMode = nextPatch.blendMode;
    }
    if (Object.keys(uiPatch).length > 0) {
      setLayerUiPatch(layerId, uiPatch);
    }
  };

  const movableLayer =
    selectedLayer &&
    selectedLayer.kind !== "base" &&
    selectedLayer.kind !== "uv-layout" &&
    !selectedLayer.locked &&
    selectedLayer.uv
      ? selectedLayer
      : null;
  const brushLayerName = locale.isRussian ? "Слой кисти" : "Brush layer";

  const createTransparentCanvas = (sourceImage: CanvasImageSource | null) => {
    const sourceSize = getCanvasImageSize(sourceImage);
    const size = sourceSize
      ? getEditableCanvasSize(sourceSize.width, sourceSize.height)
      : {
          width: MIN_EDITABLE_TEXTURE_RESOLUTION,
          height: MIN_EDITABLE_TEXTURE_RESOLUTION,
        };
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const getLayerPixelPoint = (
    pointerUv: { u: number; v: number },
    layer: UvPortLayer,
    image: CanvasImageSource | null,
    canvas: HTMLCanvasElement
  ) => {
    const bounds = getLayerLocalBounds(layer, image);
    const localPoint = uvToLayerLocal(pointerUv, layer);
    if (
      localPoint.x < bounds.left ||
      localPoint.x > bounds.right ||
      localPoint.y < bounds.bottom ||
      localPoint.y > bounds.top
    ) {
      return null;
    }

    const width = Math.max(1e-6, bounds.right - bounds.left);
    const height = Math.max(1e-6, bounds.top - bounds.bottom);
    const normalizedX = (localPoint.x - bounds.left) / width;
    const normalizedY = (bounds.top - localPoint.y) / height;

    return {
      x: Math.max(0, Math.min(canvas.width - 1, normalizedX * canvas.width)),
      y: Math.max(0, Math.min(canvas.height - 1, normalizedY * canvas.height)),
    };
  };

  const ensureEditableBaseCanvas = () => {
    if (!activeSlot) {
      return null;
    }

    const existingCanvas = baseLayerCanvasRef.current[activeSlot];
    if (existingCanvas) {
      return existingCanvas;
    }

    const sourceImage =
      (baseLayerTextureUrls[activeSlot] ? images[baseLayerTextureUrls[activeSlot]] : null) ||
      activeLoadedMesh?.baseTextureImage ||
      null;
    const nextCanvas =
      cloneCanvasImageSourceToCanvas(sourceImage, { upscaleTinyTextures: true }) ||
      createUvMaskCanvas(activeLoadedMesh?.geometry);
    if (!nextCanvas) {
      return null;
    }

    baseLayerCanvasRef.current[activeSlot] = nextCanvas;
    return nextCanvas;
  };

  const syncEditableLayerTexture = (layer: UvPortLayer, canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL("image/png");
    setImages((current) => ({
      ...current,
      [dataUrl]: canvas,
    }));
    if (layer.kind === "draft") {
      onDraftTextureUrlChange?.(dataUrl);
      setLayerUiPatch(layer.id, {
        textureUrl: dataUrl,
        ...(!layer.textureUrl ? { name: brushLayerName } : {}),
      });
      return dataUrl;
    }

    if (layer.kind === "decal" && onUpdateAppliedLayer) {
      onUpdateAppliedLayer(layer.id, {
        textureUrl: dataUrl,
        ...(!layer.textureUrl ? { fileName: layer.name || brushLayerName } : {}),
      });
      setLayerUiPatch(layer.id, {
        textureUrl: dataUrl,
        ...(!layer.textureUrl ? { name: layer.name || brushLayerName } : {}),
      });
      return dataUrl;
    }
    commitLayerPatch(
      layer.id,
      {
        textureUrl: dataUrl,
        // @ts-expect-error fallback branch keeps legacy draft-name patching for non-standard callers.
        ...(layer.kind === "draft" && !layer.textureUrl ? { name: locale.isRussian ? "Слой кисти" : "Brush layer" } : {}),
      },
      { recordHistory: false }
    );
    return dataUrl;
  };

  const ensurePaintableOverlayLayer = () => {
    if (
      selectedLayer &&
      (selectedLayer.kind === "draft" || selectedLayer.kind === "decal") &&
      selectedLayer.meshName === activeSlot
    ) {
      return selectedLayer;
    }

    if (draftLayer && draftLayer.meshName === activeSlot) {
      setSelectedLayerId(draftLayer.id);
      return draftLayer;
    }

    if (!activeSlot) {
      return null;
    }

    const blankCanvas = createTransparentCanvas(activeLoadedMesh?.baseTextureImage || null);
    if (!blankCanvas) {
      return null;
    }

    const dataUrl = blankCanvas.toDataURL("image/png");
    editableLayerCanvasRef.current["draft:current"] = blankCanvas;
    setImages((current) => ({
      ...current,
      [dataUrl]: blankCanvas,
    }));
    if (onCreateGeneratedDecal) {
      const created = onCreateGeneratedDecal({
        fileName: brushLayerName,
        textureUrl: dataUrl,
        textStyle: null,
        designStyle: null,
        meshName: activeSlot,
        uv: [0.5, 0.5],
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
        projection: null,
      });
      if (!created?.layerId) {
        return null;
      }
      const { layerId, assetId } = created;

      delete editableLayerCanvasRef.current["draft:current"];
      editableLayerCanvasRef.current[layerId] = blankCanvas;
      setLayerUiPatch(layerId, {
        name: brushLayerName,
        textureUrl: dataUrl,
        opacity: 1,
        visible: true,
        locked: false,
      });
      setSelectedLayerId(layerId);

      return {
        id: layerId,
        assetId,
        textStyle: null,
        designStyle: null,
        projection: null,
        kind: "decal" as const,
        name: brushLayerName,
        meshName: activeSlot,
        textureUrl: dataUrl,
        uv: [0.5, 0.5] as [number, number],
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
        opacity: 1,
        visible: true,
        locked: false,
      };
    }

    if (!onDraftTextureUrlChange) {
      delete editableLayerCanvasRef.current["draft:current"];
      return null;
    }
    onDraftTextureUrlChange(dataUrl);
    onDraftFileNameChange?.(locale.isRussian ? "Слой кисти" : "Brush layer");
    onDraftUvChange([0.5, 0.5]);
    onScaleChange?.(1);
    onScaleXChange(1);
    onScaleYChange(1);
    onRotationDegChange?.(0);
    setSelectedLayerId("draft:current");

    return {
      id: "draft:current",
      assetId: draftAssetId || null,
      textStyle: null,
      designStyle: null,
      projection: null,
      kind: "draft" as const,
      name: locale.isRussian ? "Слой кисти" : "Brush layer",
      meshName: activeSlot,
      textureUrl: dataUrl,
      uv: [0.5, 0.5] as [number, number],
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
      opacity: 1,
      visible: true,
      locked: false,
    };
  };

  const ensureEditableLayerCanvas = (layer: UvPortLayer) => {
    const existingCanvas = editableLayerCanvasRef.current[layer.id];
    if (existingCanvas) {
      return existingCanvas;
    }

    const sourceImage = getLayerPreviewImage(layer);
    const nextCanvas =
      cloneCanvasImageSourceToCanvas(sourceImage, { upscaleTinyTextures: true }) ||
      createTransparentCanvas(activeLoadedMesh?.baseTextureImage || null);
    if (!nextCanvas) {
      return null;
    }

    editableLayerCanvasRef.current[layer.id] = nextCanvas;
    return nextCanvas;
  };

  const syncPaintedBaseLayer = (slot: string, canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL("image/png");
    setBaseLayerTextureUrls((current) => ({ ...current, [slot]: dataUrl }));
    setPaintedBaseSlots((current) => ({ ...current, [slot]: true }));
  };

  const fillBaseLayerWithColor = () => {
    if (!activeSlot) {
      return false;
    }

    const canvas = ensureEditableBaseCanvas();
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return false;
    }

    const normalizedHex = brushColor.replace("#", "");
    const normalizedValue =
      normalizedHex.length === 3
        ? normalizedHex
            .split("")
            .map((entry) => `${entry}${entry}`)
            .join("")
        : normalizedHex.padEnd(6, "0").slice(0, 6);
    const nextColor = Number.parseInt(normalizedValue, 16);
    if (!Number.isFinite(nextColor)) {
      return false;
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const red = (nextColor >> 16) & 255;
    const green = (nextColor >> 8) & 255;
    const blue = nextColor & 255;

    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) {
        continue;
      }

      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
    }

    context.putImageData(imageData, 0, 0);
    syncPaintedBaseLayer(activeSlot, canvas);
    return true;
  };

  const paintBaseLayerAt = (pointerUv: { u: number; v: number }, previousPoint?: { x: number; y: number }) => {
    if (!activeSlot) {
      return null;
    }

    if (activeBrushPreset?.shape === "mask" && !activeBrushPresetImage) {
      return null;
    }

    const canvas = ensureEditableBaseCanvas();
    const point = canvas ? getUvPixelPoint(pointerUv, canvas) : null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !point) {
      return null;
    }

    const distance = previousPoint ? Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) : 0;
    const step = Math.max(1, brushSize * (activeBrushPreset?.spacing || 0.18));
    const steps = previousPoint ? Math.max(1, Math.ceil(distance / step)) : 1;
    const softness =
      activeBrushPreset?.id === "hard-round" ? 0 : clamp(brushSoftness / 100, 0, 1);

    context.save();
    for (let index = 0; index < steps; index += 1) {
      const progress = steps === 1 ? 1 : index / (steps - 1);
      const stampX = previousPoint ? previousPoint.x + (point.x - previousPoint.x) * progress : point.x;
      const stampY = previousPoint ? previousPoint.y + (point.y - previousPoint.y) * progress : point.y;
      paintBrushStamp({
        context,
        x: stampX,
        y: stampY,
        color: brushColor,
        isEraser: activeTool === "eraser",
        paintTarget,
        radius: brushSize * 0.5,
        softness,
        maskImage: activeBrushPreset?.shape === "mask" ? activeBrushPresetImage : null,
      });
    }
    context.restore();

    syncPaintedBaseLayer(activeSlot, canvas);
    return point;
  };

  const paintEditableLayerAt = (
    layer: UvPortLayer,
    pointerUv: { u: number; v: number },
    previousPoint?: { x: number; y: number }
  ) => {
    if (activeBrushPreset?.shape === "mask" && !activeBrushPresetImage) {
      return null;
    }

    const canvas = ensureEditableLayerCanvas(layer);
    const context = canvas?.getContext("2d");
    const point = canvas ? getLayerPixelPoint(pointerUv, layer, canvas, canvas) : null;
    if (!canvas || !context || !point) {
      return null;
    }

    const distance = previousPoint ? Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) : 0;
    const step = Math.max(1, brushSize * (activeBrushPreset?.spacing || 0.18));
    const steps = previousPoint ? Math.max(1, Math.ceil(distance / step)) : 1;
    const softness =
      activeBrushPreset?.id === "hard-round" ? 0 : clamp(brushSoftness / 100, 0, 1);

    context.save();
    for (let index = 0; index < steps; index += 1) {
      const progress = steps === 1 ? 1 : index / (steps - 1);
      const stampX = previousPoint ? previousPoint.x + (point.x - previousPoint.x) * progress : point.x;
      const stampY = previousPoint ? previousPoint.y + (point.y - previousPoint.y) * progress : point.y;
      paintBrushStamp({
        context,
        x: stampX,
        y: stampY,
        color: brushColor,
        isEraser: activeTool === "eraser",
        paintTarget: "image",
        radius: brushSize * 0.5,
        softness,
        maskImage: activeBrushPreset?.shape === "mask" ? activeBrushPresetImage : null,
      });
    }
    context.restore();

    syncEditableLayerTexture(layer, canvas);
    return point;
  };

  const sampleBaseLayerColor = (pointerUv: { u: number; v: number }) => {
    const canvas = ensureEditableBaseCanvas();
    const point = canvas ? getUvPixelPoint(pointerUv, canvas) : null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !point) {
      return null;
    }

    const pixel = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
    return {
      alpha: pixel[3],
      color: `#${[pixel[0], pixel[1], pixel[2]]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")}`,
    };
  };

  const finishInteraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const completedInteraction = interactionRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (
      completedInteraction &&
      (completedInteraction.mode === "crop-transform" || completedInteraction.mode === "crop-move") &&
      completedInteraction.hasMoved
    ) {
      const targetLayer =
        renderLayers.find((entry) => entry.id === completedInteraction.layerId) ||
        completedInteraction.startLayer;
      const cropped = buildCroppedLayerTexture({
        startLayer: completedInteraction.startLayer,
        image: completedInteraction.startImage,
        cropBox: completedInteraction.cropBox,
        cropShape,
      });
      applyCroppedLayerToState(targetLayer, cropped);
    }

    interactionRef.current = null;
    setCropPreview(null);
    setIsPanning(false);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    if (event.button === 1 || event.button === 2 || event.altKey) {
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
      };
      setIsPanning(true);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nextUv = screenToUv(pointer.x, pointer.y, canvasSize, viewport);

    if (selectedLayer?.kind === "base") {
      if (activeTool === "eyedropper") {
        const sample = sampleBaseLayerColor(nextUv);
        if (sample && sample.alpha > 0) {
          setBrushColor(sample.color);
        }
        return;
      }

      if (
        activeTool === "fill" &&
        nextUv.u >= 0 &&
        nextUv.u <= 1 &&
        nextUv.v >= 0 &&
        nextUv.v <= 1
      ) {
        pushHistorySnapshot();
        fillBaseLayerWithColor();
        return;
      }

      if (isTextureMode && (activeTool === "brush" || activeTool === "eraser")) {
        pushHistorySnapshot();
        const initialPoint = paintBaseLayerAt(nextUv);
        if (!initialPoint) {
          return;
        }

        canvas.setPointerCapture(event.pointerId);
        interactionRef.current = {
          mode: "brush",
          pointerId: event.pointerId,
          layerId: selectedLayer.id,
          paintMode: "base",
          paintLayer: selectedLayer,
          lastPoint: initialPoint,
        };
        return;
      }
    }

    if (!isTextureMode && (activeTool === "brush" || activeTool === "eraser")) {
      const paintLayer = ensurePaintableOverlayLayer();
      if (!paintLayer) {
        return;
      }

      pushHistorySnapshot();
      const initialPoint = paintEditableLayerAt(paintLayer, nextUv);
      if (!initialPoint) {
        return;
      }

      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        mode: "brush",
        pointerId: event.pointerId,
        layerId: paintLayer.id,
        paintMode: "layer",
        paintLayer,
        lastPoint: initialPoint,
      };
      return;
    }

    if (!movableLayer || !selectedLayerPreviewImage) {
      return;
    }

    const localPointer = uvToLayerLocal(nextUv, movableLayer);
    const layerBounds = getLayerLocalBounds(movableLayer, selectedLayerPreviewImage);

    if (activeTool === "transform" && canMirrorSelected) {
      const mirrorHandlePoint = getMirrorHandleScreenPosition({
        layer: movableLayer,
        size: canvasSize,
        viewport,
        bounds: layerBounds,
      });
      const mirrorDistance = Math.hypot(
        pointer.x - mirrorHandlePoint.x,
        pointer.y - mirrorHandlePoint.y
      );
      if (mirrorDistance <= MIRROR_HANDLE_RADIUS + 2) {
        event.preventDefault();
        handleMirrorSelectedLayer();
        return;
      }
    }

    if (activeTool === "crop") {
      const cropBox = createCropBoxFromLayer(movableLayer, selectedLayerPreviewImage, cropShape);
      const cropHandle = hitTestLayerHandle({
        pointer,
        layer: movableLayer,
        image: selectedLayerPreviewImage,
        size: canvasSize,
        viewport,
        bounds: cropBox,
        includeRotationHandle: false,
      });

      if (cropHandle || isPointInsideLocalBounds(localPointer, cropBox)) {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        interactionRef.current = cropHandle
          ? {
              mode: "crop-transform",
              pointerId: event.pointerId,
              layerId: movableLayer.id,
              startLayer: cloneLayer(movableLayer),
              startImage: selectedLayerPreviewImage,
              cropBox,
              startCropBox: cropBox,
              cropHandle,
              hasMoved: false,
              hasCommittedHistory: false,
            }
          : {
              mode: "crop-move",
              pointerId: event.pointerId,
              layerId: movableLayer.id,
              startLayer: cloneLayer(movableLayer),
              startImage: selectedLayerPreviewImage,
              cropBox,
              startCropBox: cropBox,
              startPointerLocal: localPointer,
              hasMoved: false,
              hasCommittedHistory: false,
            };
        setCropPreview({ layerId: movableLayer.id, box: cropBox });
        return;
      }
    }

    if (activeTool !== "transform" || !movableLayer.uv) {
      return;
    }

    const handleHit = hitTestLayerHandle({
      pointer,
      layer: movableLayer,
      image: selectedLayerPreviewImage,
      size: canvasSize,
      viewport,
      bounds: layerBounds,
      includeRotationHandle: true,
    });

    if (handleHit) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      if (handleHit.kind === "rotate") {
        interactionRef.current = {
          mode: "rotate",
          pointerId: event.pointerId,
          layerId: movableLayer.id,
          startLayer: cloneLayer(movableLayer),
          startPointerAngle: Math.atan2(nextUv.v - movableLayer.uv[1], nextUv.u - movableLayer.uv[0]),
          hasMoved: false,
          hasCommittedHistory: false,
        };
        return;
      }

      const handleLocal = getHandleLocalPoint(handleHit, layerBounds);
      interactionRef.current = {
        mode: "layer-transform",
        pointerId: event.pointerId,
        layerId: movableLayer.id,
        startLayer: cloneLayer(movableLayer),
        startImage: selectedLayerPreviewImage,
        transformHandle: handleHit,
        targetLocalAngle: Math.atan2(handleLocal.y, handleLocal.x),
        hasMoved: false,
        hasCommittedHistory: false,
      };
      return;
    }

    if (!isPointInsideLocalBounds(localPointer, layerBounds)) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode: "layer-move",
      pointerId: event.pointerId,
      layerId: movableLayer.id,
      startUv: [movableLayer.uv[0], movableLayer.uv[1]],
      startPointerUv: nextUv,
      hasMoved: false,
      hasCommittedHistory: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (!interaction || !canvas || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (interaction.mode === "pan") {
      setViewport((current) => ({
        ...current,
        panX: interaction.startPanX + (event.clientX - interaction.startX),
        panY: interaction.startPanY + (event.clientY - interaction.startY),
      }));
      return;
    }

    if (interaction.mode === "brush") {
      const rect = canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const uv = screenToUv(pointer.x, pointer.y, canvasSize, viewport);
      const currentPaintLayer =
        interaction.paintMode === "layer"
          ? renderLayers.find((entry) => entry.id === interaction.layerId) || interaction.paintLayer
          : interaction.paintLayer;
      const nextPoint =
        interaction.paintMode === "layer"
          ? paintEditableLayerAt(currentPaintLayer, uv, interaction.lastPoint)
          : paintBaseLayerAt(uv, interaction.lastPoint);
      if (nextPoint) {
        interactionRef.current = {
          ...interaction,
          paintLayer: currentPaintLayer,
          lastPoint: nextPoint,
        };
      }
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const uv = screenToUv(pointer.x, pointer.y, canvasSize, viewport);

    if (
      interaction.mode === "layer-move" ||
      interaction.mode === "layer-transform" ||
      interaction.mode === "rotate" ||
      interaction.mode === "crop-transform" ||
      interaction.mode === "crop-move"
    ) {
      const hasCommittedHistory = interaction.hasCommittedHistory;
      if (!hasCommittedHistory) {
        pushHistorySnapshot();
      }

      if (interaction.mode === "layer-move") {
        commitLayerPatch(
          interaction.layerId,
          {
            uv: [
              interaction.startUv[0] + (uv.u - interaction.startPointerUv.u),
              interaction.startUv[1] + (uv.v - interaction.startPointerUv.v),
            ],
          },
          { recordHistory: false }
        );
        interactionRef.current = {
          ...interaction,
          hasMoved: true,
          hasCommittedHistory: true,
        };
        return;
      }

      if (interaction.mode === "rotate") {
        const layerCenter = interaction.startLayer.uv;
        if (!layerCenter) {
          return;
        }

        const nextAngle = Math.atan2(uv.v - layerCenter[1], uv.u - layerCenter[0]);
        const startRotation = rotationDegToRad(interaction.startLayer.rotationDeg);
        let nextRotationDeg = rotationRadToDeg(
          startRotation + (nextAngle - interaction.startPointerAngle)
        );
        if (snapEnabled) {
          nextRotationDeg = roundToStep(nextRotationDeg, 15);
        }

        commitLayerPatch(
          interaction.layerId,
          {
            rotationDeg: nextRotationDeg,
          },
          { recordHistory: false }
        );
        interactionRef.current = {
          ...interaction,
          hasMoved: true,
          hasCommittedHistory: true,
        };
        return;
      }

      if (interaction.mode === "layer-transform") {
        const startLayer = interaction.startLayer;
        const scaleBase = Math.max(MIN_SCALE, startLayer.scale);
        const aspect = Math.max(0.1, getLayerAspect(interaction.startImage));
        if (interaction.transformHandle.kind === "edge") {
          const local = uvToLayerLocal(uv, startLayer);
          if (interaction.transformHandle.axis === "x") {
            commitLayerPatch(
              interaction.layerId,
              {
                scaleX: Math.max(0.01, (Math.abs(local.x) * 2) / scaleBase),
              },
              { recordHistory: false }
            );
          } else {
            commitLayerPatch(
              interaction.layerId,
              {
                scaleY: Math.max(0.01, ((Math.abs(local.y) * 2) * aspect) / scaleBase),
              },
              { recordHistory: false }
            );
          }
        } else {
          const center = startLayer.uv;
          if (!center) {
            return;
          }
          const vectorAngle = Math.atan2(uv.v - center[1], uv.u - center[0]);
          const nextRotationRad = vectorAngle - interaction.targetLocalAngle;
          const dx = uv.u - center[0];
          const dy = uv.v - center[1];
          const cos = Math.cos(nextRotationRad);
          const sin = Math.sin(nextRotationRad);
          const localX = dx * cos + dy * sin;
          const localY = -dx * sin + dy * cos;
          let nextRotationDeg = rotationRadToDeg(nextRotationRad);
          if (snapEnabled) {
            nextRotationDeg = roundToStep(nextRotationDeg, 15);
          }

          commitLayerPatch(
            interaction.layerId,
            {
              rotationDeg: nextRotationDeg,
              scaleX: Math.max(0.01, (Math.abs(localX) * 2) / scaleBase),
              scaleY: Math.max(0.01, ((Math.abs(localY) * 2) * aspect) / scaleBase),
            },
            { recordHistory: false }
          );
        }

        interactionRef.current = {
          ...interaction,
          hasMoved: true,
          hasCommittedHistory: true,
        };
        return;
      }

      if (interaction.mode === "crop-transform") {
        const localPointer = uvToLayerLocal(uv, interaction.startLayer);
        const nextBox = applyCropHandleDrag({
          startLayer: interaction.startLayer,
          startCropBox: interaction.startCropBox,
          localPointer,
          handle: interaction.cropHandle,
          cropShape,
          image: interaction.startImage,
        });
        interactionRef.current = {
          ...interaction,
          cropBox: nextBox,
          hasMoved: true,
          hasCommittedHistory: true,
        };
        setCropPreview({ layerId: interaction.layerId, box: nextBox });
        return;
      }

      const localPointer = uvToLayerLocal(uv, interaction.startLayer);
      const nextBox = applyCropMoveDrag({
        startLayer: interaction.startLayer,
        startCropBox: interaction.startCropBox,
        localPointer,
        startPointerLocal: interaction.startPointerLocal,
        image: interaction.startImage,
      });
      interactionRef.current = {
        ...interaction,
        cropBox: nextBox,
        hasMoved: true,
        hasCommittedHistory: true,
      };
      setCropPreview({ layerId: interaction.layerId, box: nextBox });
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((current) =>
      getZoomedViewport({
        viewport: current,
        size: canvasSize,
        pointerX,
        pointerY,
        zoomFactor,
      })
    );
  };

  const draftLayer = renderLayers.find((layer) => layer.kind === "draft") || null;
  const hasDraftLayer = Boolean(draftLayer?.textureUrl);
  const nonBaseLayers = renderLayers.filter(
    (layer) => layer.kind === "decal" || layer.kind === "draft"
  );
  const listedLayers = useMemo(
    () =>
      isTextureMode
        ? renderLayers.filter(
            (layer) => layer.kind === "base" || layer.kind === "uv-layout"
          )
        : renderLayers,
    [isTextureMode, renderLayers]
  );
  const appliedLayerOrder = renderLayers
    .filter((layer) => layer.kind === "decal")
    .map((layer) => layer.id);
  const opacityPercent = Math.round((selectedLayer?.opacity ?? 1) * 100);
  const selectedBlendMode = selectedLayer?.blendMode || DEFAULT_UV_LAYER_BLEND_MODE;
  const isStructuralLayer =
    selectedLayer?.kind === "base" || selectedLayer?.kind === "uv-layout";
  const canAdjustBlendMode = Boolean(selectedLayer && selectedLayer.kind === "decal");
  const canTransformSelected = Boolean(movableLayer);
  const canMirrorSelected = Boolean(
    !isTextureMode &&
      movableLayer &&
      selectedLayerPreviewImage &&
      !movableLayer.textStyle &&
      (movableLayer.kind === "decal" || movableLayer.kind === "draft")
  );
  const canDuplicateSelected = Boolean(
    selectedLayer &&
      selectedLayer.kind !== "base" &&
      selectedLayer.kind !== "uv-layout" &&
      selectedLayer.textureUrl
  );
  const canApplyDraftLayer = hasDraftLayer && Boolean(onApply);
  const isTextCreationAvailable = true;
  const canCreateTextLayer = Boolean(onCreateGeneratedDecal) && Boolean(textValue.trim());
  const canCreateDesignLayer = Boolean(onCreateGeneratedDecal);

  const getBaseLayerId = () =>
    renderLayers.find((layer) => layer.kind === "base" && layer.meshName === activeSlot)?.id ||
    renderLayers.find((layer) => layer.kind === "base")?.id ||
    null;

  const handleMirrorSelectedLayer = () => {
    if (!movableLayer || !selectedLayerPreviewImage || !canMirrorSelected) {
      return;
    }

    const mirroredCanvas = flipCanvasImageSourceHorizontally(selectedLayerPreviewImage);
    if (!mirroredCanvas) {
      return;
    }

    pushHistorySnapshot();
    editableLayerCanvasRef.current[movableLayer.id] = mirroredCanvas;
    syncEditableLayerTexture(movableLayer, mirroredCanvas);
    setActiveTool("transform");
  };

  const handleSelectTool = (tool: UvPortTool) => {
    setActiveTool(tool);
    if (!BASE_PAINT_TOOLS.has(tool)) {
      return;
    }

    if (!isTextureMode && (tool === "brush" || tool === "eraser")) {
      const nextOverlayLayer =
        (selectedLayer &&
          (selectedLayer.kind === "draft" || selectedLayer.kind === "decal") &&
          selectedLayer.meshName === activeSlot
          ? selectedLayer
          : draftLayer) ||
        null;
      if (nextOverlayLayer) {
        setSelectedLayerId(nextOverlayLayer.id);
      }
      return;
    }

    if (selectedLayer?.kind === "base") {
      return;
    }

    const baseLayerId = getBaseLayerId();
    if (baseLayerId) {
      setSelectedLayerId(baseLayerId);
    }
  };

  const handleApplyDraftLayer = () => {
    if (!hasDraftLayer) {
      return;
    }

    pushHistorySnapshot();
    const nextLayerId = onApply();
    if (typeof nextLayerId === "string" && nextLayerId) {
      setSelectedLayerId(nextLayerId);
    }
  };

  const handleCreateDesignLayer = (style: DesignLayerStyle) => {
    if (!onCreateGeneratedDecal) {
      return;
    }

    const generated = createGeneratedDesignAsset({
      style,
      isRussian: locale.isRussian,
    });
    const normalizedStyle = sanitizeDesignLayerStyle(style);

    pushHistorySnapshot();
    const created = onCreateGeneratedDecal({
      ...generated,
      designStyle: normalizedStyle,
      blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
      ...(activeSlot ? { meshName: activeSlot, uv: draftUv } : {}),
    });
    if (created?.layerId) {
      setSelectedLayerId(created.layerId);
    }
    setActiveTool("transform");
  };

  const handlePreviewDesignLayer = (style: DesignLayerStyle) => {
    if (!selectedDesignLayer) {
      return;
    }

    const normalizedStyle = sanitizeDesignLayerStyle(style);
    if (!normalizedStyle) {
      return;
    }

    const generated = createGeneratedDesignAsset({
      style: normalizedStyle,
      isRussian: locale.isRussian,
    });

    if (selectedDesignLayer.kind === "draft") {
      onDraftTextureUrlChange?.(generated.textureUrl);
      onDraftFileNameChange?.(generated.fileName);
      setLayerUiPatch(selectedDesignLayer.id, {
        textureUrl: generated.textureUrl,
        name: generated.fileName,
      });
      return;
    }

    onUpdateAppliedLayer?.(selectedDesignLayer.id, {
      fileName: generated.fileName,
      textureUrl: generated.textureUrl,
      designStyle: normalizedStyle,
    });
  };

  const handleCreateTextLayer = async () => {
    if (!canCreateTextLayer || !onCreateGeneratedDecal) {
      return;
    }

    await ensureTextFontLoaded({
      fontFamily: textFontFamily,
      fontSize: textFontSize,
      sample: textValue,
    });

    const generated = createTextDecalTexture({
      text: textValue,
      fontFamily: textFontFamily,
      fontSize: textFontSize,
      color: textColor,
      isRussian: locale.isRussian,
    });
    if (!generated) {
      return;
    }

    pushHistorySnapshot();
    const created = onCreateGeneratedDecal({
      ...generated,
      blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
      ...(activeSlot ? { meshName: activeSlot, uv: draftUv } : {}),
    });
    if (created?.layerId) {
      setSelectedLayerId(created.layerId);
    }
    setActiveTool("transform");
  };

  useEffect(() => {
    if (!selectedTextLayer?.textStyle) {
      return;
    }

    const normalizedText = textValue.replace(/\r\n/g, "\n").trim();
    if (!normalizedText) {
      return;
    }

    const currentTextStyle = selectedTextLayer.textStyle;
    if (
      currentTextStyle.text === normalizedText &&
      currentTextStyle.fontFamily === textFontFamily &&
      currentTextStyle.fontSize === textFontSize &&
      currentTextStyle.color === textColor
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      await ensureTextFontLoaded({
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        sample: normalizedText,
      });
      if (cancelled) {
        return;
      }

      const generated = createTextDecalTexture({
        text: normalizedText,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        color: textColor,
        isRussian: locale.isRussian,
      });
      if (!generated || cancelled) {
        return;
      }

      if (selectedTextLayer.kind === "draft") {
        onDraftTextureUrlChange?.(generated.textureUrl);
        onDraftFileNameChange?.(generated.fileName);
        return;
      }

      onUpdateAppliedLayer?.(selectedTextLayer.id, {
        fileName: generated.fileName,
        textureUrl: generated.textureUrl,
        textStyle: generated.textStyle,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    locale.isRussian,
    onDraftFileNameChange,
    onDraftTextureUrlChange,
    onUpdateAppliedLayer,
    selectedTextLayer,
    textColor,
    textFontFamily,
    textFontSize,
    textValue,
  ]);

  const applyCroppedLayerToState = (
    layer: UvPortLayer,
    cropped: ReturnType<typeof buildCroppedLayerTexture>
  ) => {
    if (!cropped) {
      return;
    }

    setImages((current) => ({
      ...current,
      [cropped.dataUrl]: cropped.canvas,
    }));

    if (layer.kind === "draft") {
      onDraftTextureUrlChange?.(cropped.dataUrl);
      onDraftUvChange(cropped.uv);
      onScaleChange?.(cropped.scale);
      onScaleXChange(cropped.scaleX);
      onScaleYChange(cropped.scaleY);
      onRotationDegChange?.(layer.rotationDeg);
      return;
    }

    if (extraLayers.some((entry) => entry.id === layer.id)) {
      setExtraLayers((current) =>
        current.map((entry) =>
          entry.id === layer.id
            ? {
                ...entry,
                textureUrl: cropped.dataUrl,
                uv: [cropped.uv[0], cropped.uv[1]],
                scale: cropped.scale,
                scaleX: cropped.scaleX,
                scaleY: cropped.scaleY,
              }
            : entry
        )
      );
      return;
    }

    commitLayerPatch(
      layer.id,
      {
        textureUrl: cropped.dataUrl,
        uv: [cropped.uv[0], cropped.uv[1]],
        scale: cropped.scale,
        scaleX: cropped.scaleX,
        scaleY: cropped.scaleY,
      },
      { recordHistory: false }
    );
  };

  const centerSelected = () => {
    if (!movableLayer) {
      return;
    }
    commitLayerPatch(movableLayer.id, { uv: [0.5, 0.5] });
  };

  const fitSelected = () => {
    if (!movableLayer) {
      return;
    }
    commitLayerPatch(movableLayer.id, {
      uv: [0.5, 0.5],
      scale: 0.35,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
    });
  };

  const resetSelected = () => {
    if (selectedLayer?.kind === "draft") {
      pushHistorySnapshot();
      setViewport(DEFAULT_VIEWPORT);
      onReset();
      return;
    }
    if (selectedLayer?.kind === "base" || selectedLayer?.kind === "uv-layout") {
      commitLayerPatch(selectedLayer.id, { opacity: 1, visible: true });
      setViewport(DEFAULT_VIEWPORT);
      return;
    }
    fitSelected();
    setViewport(DEFAULT_VIEWPORT);
  };

  const handleDuplicateLayer = () => {
    if (
      !selectedLayer ||
      selectedLayer.kind === "base" ||
      selectedLayer.kind === "uv-layout" ||
      !selectedLayer.textureUrl ||
      !selectedLayer.meshName ||
      !selectedLayer.uv
    ) {
      return;
    }

    if (onCreateDecalLayer) {
      pushHistorySnapshot();
      const nextLayerId = onCreateDecalLayer({
        assetId: selectedLayer.assetId || draftAssetId || null,
        fileName: `${selectedLayer.name} ${locale.copySuffix}`,
        meshName: selectedLayer.meshName,
        uv: [clamp01(selectedLayer.uv[0] + 0.02), clamp01(selectedLayer.uv[1] - 0.02)],
        scale: selectedLayer.scale,
        scaleX: selectedLayer.scaleX,
        scaleY: selectedLayer.scaleY,
        rotationDeg: selectedLayer.rotationDeg,
        textureUrl: selectedLayer.textureUrl,
        blendMode: selectedLayer.blendMode,
        opacity: selectedLayer.opacity,
        textStyle: selectedLayer.textStyle || null,
        designStyle: selectedLayer.designStyle || null,
        projection: selectedLayer.projection || null,
      });
      if (nextLayerId) {
        setSelectedLayerId(nextLayerId);
      }
      return;
    }

    const nextLayer: UvPortLayer = {
      ...selectedLayer,
      id: makeClientLayerId(),
      kind: "decal",
      name: `${selectedLayer.name} ${locale.copySuffix}`,
      uv: selectedLayer.uv ? [selectedLayer.uv[0], selectedLayer.uv[1]] : null,
      locked: false,
      visible: true,
    };

    pushHistorySnapshot();
    setExtraLayers((current) => [...current, nextLayer]);
    setSelectedLayerId(nextLayer.id);
  };

  const handleRenameLayer = () => {
    if (!selectedLayer || typeof window === "undefined") {
      return;
    }

    const nextName = window.prompt(locale.renamePrompt, selectedLayer.name);
    if (!nextName?.trim()) {
      return;
    }
    commitLayerPatch(selectedLayer.id, { name: nextName.trim() });
  };

  const handleRemoveLayer = (layer: UvPortLayer) => {
    if (layer.kind !== "draft" && layer.kind !== "decal") {
      return;
    }

    pushHistorySnapshot();

    if (layer.kind === "draft") {
      const isPaintedBaseDraft =
        Boolean(activeSlot) &&
        layer.meshName === activeSlot &&
        paintedBaseSlots[activeSlot || ""] &&
        layer.textureUrl === baseLayerTextureUrls[activeSlot || ""];

      if (isPaintedBaseDraft && activeSlot) {
        const restoredBaseCanvas = cloneCanvasImageSourceToCanvas(
          activeLoadedMesh?.baseTextureImage || null,
          {
            upscaleTinyTextures: true,
          }
        );
        const restoredBaseUrl = canvasImageSourceToDataUrl(activeLoadedMesh?.baseTextureImage || null, {
          upscaleTinyTextures: true,
        });

        if (restoredBaseCanvas) {
          baseLayerCanvasRef.current[activeSlot] = restoredBaseCanvas;
        } else {
          delete baseLayerCanvasRef.current[activeSlot];
        }

        setBaseLayerTextureUrls((current) => {
          const next = { ...current };
          if (restoredBaseUrl) {
            next[activeSlot] = restoredBaseUrl;
          } else {
            delete next[activeSlot];
          }
          return next;
        });
        setPaintedBaseSlots((current) => {
          const next = { ...current };
          delete next[activeSlot];
          return next;
        });
      }

      onDraftTextureUrlChange?.(null);
      onDraftFileNameChange?.("");
      onDraftUvChange([0.5, 0.5]);
      onScaleChange?.(isPaintedBaseDraft ? 1 : scale);
      onScaleXChange(1);
      onScaleYChange(1);
      onRotationDegChange?.(0);
      return;
    }

    const isExtraLayer = extraLayers.some((entry) => entry.id === layer.id);
    if (isExtraLayer) {
      setExtraLayers((current) => current.filter((entry) => entry.id !== layer.id));
      setLayerOverrides((current) => {
        const next = { ...current };
        delete next[layer.id];
        return next;
      });
      setSoloLayerId((current) => (current === layer.id ? null : current));
      return;
    }

    onRemoveAppliedLayer?.(layer.id);
  };

  const handleSave = () => {
    if (hasDraftLayer) {
      handleApplyDraftLayer();
    }
    onCloseRequested?.();
  };

  const handleExportPng = () => {
    if (!canvasRef.current) {
      return;
    }
    exportCanvasAsPng(canvasRef.current, `uv-preview-${activeSlot || "mesh"}.png`);
  };

  const handleSelectBrushPreset = (presetId: string) => {
    setBrushPresetId(presetId);
    setIsBrushPresetMenuOpen(false);
  };

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const visibleSelected = selectedLayer?.visible ?? true;
  const isLockedSelected = selectedLayer?.locked ?? false;
  const meshStatus = activeLoadedMesh?.meshName || documentModel.meshName || locale.statusEmpty;
  const meshMeta = meshMetrics
    ? `${meshMetrics.triangleCount} ${locale.isRussian ? "треугольников" : "triangles"} | U ${meshMetrics.minU.toFixed(2)}..${meshMetrics.maxU.toFixed(2)} | V ${meshMetrics.minV.toFixed(2)}..${meshMetrics.maxV.toFixed(2)} | ${nonBaseLayers.length} ${locale.isRussian ? "декалей" : "layers"}`
    : `${nonBaseLayers.length} ${locale.isRussian ? "слоёв" : "layers"}`;
  return (
    <>
      <div
        className={`uv-editor uv-editor-port uv-editor-port--window${editorWindow.isDragging ? " uv-window-frame--dragging" : ""}${editorWindow.isResizing ? " uv-window-frame--resizing" : ""}`}
        style={editorWindow.frameStyle}
      >
        <div className="uv-editor__header" {...editorWindow.headerProps}>
          <div className="uv-editor__header-spacer" aria-hidden />
          <button
            type="button"
            className="uv-editor__close"
            {...getTooltipProps(locale.closeHint)}
            onClick={onCloseRequested}
          />
        </div>

        <div className="uv-editor__content">
          <div className="uv-editor__workspace">
            <section className="uv-editor__main">
              <div className="uv-editor__layers-panel">
                <div className="uv-editor__sidebar-header">
                  <div className="uv-editor__sidebar-title">{locale.layersTitle}</div>
                </div>
                <div className="uv-editor__layers">
                {listedLayers.map((layer) => {
                  const layerOpacity = Math.round(layer.opacity * 100);
                  const isRemovableLayer = layer.kind === "draft" || layer.kind === "decal";
                  const appliedOrderIndex =
                    layer.kind === "decal" ? appliedLayerOrder.indexOf(layer.id) : -1;
                  const canMoveLayerUp = appliedOrderIndex > 0;
                  const canMoveLayerDown =
                    appliedOrderIndex >= 0 && appliedOrderIndex < appliedLayerOrder.length - 1;
                  return (
                    <div
                      key={layer.id}
                      className={`uv-editor__layer${selectedLayer?.id === layer.id ? " uv-editor__layer--active" : ""}${!layer.visible ? " uv-editor__layer--hidden" : ""}${layer.locked ? " uv-editor__layer--locked" : ""}${soloLayerId === layer.id ? " uv-editor__layer--solo" : ""}`}
                      role="button"
                      tabIndex={0}
                      {...getTooltipProps(locale.selectLayerTooltip(layer.name))}
                      onClick={() => setSelectedLayerId(layer.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedLayerId(layer.id);
                        }
                      }}
                    >
                      <span
                        className={`uv-editor__layer-grip${layer.kind === "base" || layer.kind === "uv-layout" ? " uv-editor__layer-grip--static" : ""}`}
                      >
                        ⋮⋮
                      </span>
                      <span className={`uv-editor__layer-thumb${layer.kind === "uv-layout" ? " uv-editor__layer-thumb--uv" : ""}`}>
                        {layer.textureUrl ? (
                          <img src={layer.textureUrl} alt="" />
                        ) : (
                          <span>{layer.kind === "uv-layout" ? "UV" : "Б."}</span>
                        )}
                      </span>
                      <span className="uv-editor__layer-text">
                        <span className="uv-editor__layer-header">
                          <span className="uv-editor__layer-name">{layer.name}</span>
                        </span>
                        <span className="uv-editor__layer-meta">
                          {getLayerKindLabel(layer)}
                        </span>
                      </span>
                      <span className="uv-editor__layer-actions">
                        <span className="uv-editor__layer-action uv-editor__layer-action--label">
                          {layerOpacity}%
                        </span>
                        {layer.kind === "decal" ? (
                          <>
                            <button
                              type="button"
                              className="uv-editor__layer-action"
                              disabled={!canMoveLayerUp || !onMoveAppliedLayer}
                              {...getTooltipProps(locale.moveLayerUpHint)}
                              onClick={(event) => {
                                event.stopPropagation();
                                pushHistorySnapshot();
                                onMoveAppliedLayer?.(layer.id, "up");
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="uv-editor__layer-action"
                              disabled={!canMoveLayerDown || !onMoveAppliedLayer}
                              {...getTooltipProps(locale.moveLayerDownHint)}
                              onClick={(event) => {
                                event.stopPropagation();
                                pushHistorySnapshot();
                                onMoveAppliedLayer?.(layer.id, "down");
                              }}
                            >
                              ↓
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className={`uv-editor__layer-action${layer.visible ? " uv-editor__layer-action--active" : ""}`}
                          {...getTooltipProps(locale.toggleVisibilityTooltip)}
                          onClick={(event) => {
                            event.stopPropagation();
                            commitLayerPatch(layer.id, { visible: !layer.visible });
                          }}
                        >
                          V
                        </button>
                        <button
                          type="button"
                          className={`uv-editor__layer-action${soloLayerId === layer.id ? " uv-editor__layer-action--active" : ""}`}
                          {...getTooltipProps(locale.soloLayerTooltip)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSoloLayerId((current) => (current === layer.id ? null : layer.id));
                          }}
                        >
                          S
                        </button>
                        {isRemovableLayer ? (
                          <button
                            type="button"
                            className="uv-editor__layer-action uv-editor__layer-action--danger"
                            {...getTooltipProps(locale.removeLayerHint)}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveLayer(layer);
                            }}
                          />
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!isTextureMode && !nonBaseLayers.length ? (
                <div className="uv-editor__layers-empty">{locale.layersEmpty}</div>
              ) : null}
              </div>

              <div className="uv-editor__toolbar">
                <div className="uv-editor__toolbar-section uv-editor__toolbar-section--double">
                  <button
                    type="button"
                    className="uv-editor__tool"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    {...getTooltipProps(locale.undoHint)}
                  >
                    {locale.toolbarUndo}
                  </button>
                  <button
                    type="button"
                    className="uv-editor__tool"
                    onClick={handleApplyDraftLayer}
                    disabled={!canApplyDraftLayer}
                    {...getTooltipProps(locale.applyHint)}
                  >
                    {locale.toolbarApply}
                  </button>
                </div>
              </div>

              <div className="uv-editor__controls">
                <div className="uv-editor__control-panel uv-editor__control-panel--meta">
                  {extractedControls?.onSwitchMode ? (
                    <div className="uv-editor__control-group">
                      <div className="uv-editor__control-label">{locale.mode}</div>
                      <div className="uv-editor__chip-row">
                        <button
                          type="button"
                          className={`uv-editor__tool uv-editor__tool--secondary${extractedControls.mode === "decal" ? " uv-editor__tool--active" : ""}`}
                          {...getTooltipProps(locale.modeDecalHint)}
                          onClick={() => extractedControls.onSwitchMode?.("decal")}
                        >
                          {extractedControls.labels.decal}
                        </button>
                        <button
                          type="button"
                          className={`uv-editor__tool uv-editor__tool--secondary${extractedControls.mode === "texture" ? " uv-editor__tool--active" : ""}`}
                          {...getTooltipProps(locale.modeTextureHint)}
                          onClick={() => extractedControls.onSwitchMode?.("texture")}
                        >
                          {extractedControls.labels.texture}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.target}</div>
                    <div className="uv-editor__selected-target">
                      {selectedLayer?.name || locale.baseMap}
                    </div>
                  </div>
                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.opacity}</div>
                    <div className="uv-editor__slider-row">
                      <input
                        className="uv-editor__slider"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={opacityPercent}
                        {...getTooltipProps(locale.opacityHint)}
                        disabled={!selectedLayer}
                        onChange={(event) =>
                          selectedLayer
                            ? commitLayerPatch(selectedLayer.id, {
                                opacity: Number(event.target.value) / 100,
                              })
                            : undefined
                        }
                      />
                      <span className="uv-editor__value-chip">{opacityPercent}%</span>
                    </div>
                  </div>
                  {canAdjustBlendMode ? (
                    <div className="uv-editor__control-group">
                      <div className="uv-editor__control-label">{locale.blendMode}</div>
                      <select
                        className="uv-editor__text-select"
                        value={selectedBlendMode}
                        {...getTooltipProps(locale.blendModeHint)}
                        onChange={(event) =>
                          selectedLayer
                            ? commitLayerPatch(selectedLayer.id, {
                                blendMode: event.target.value as UvLayerBlendMode,
                              })
                            : undefined
                        }
                      >
                        {blendModeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {extractedControls ? (
                    <div className="uv-editor__control-group">
                      <div className="uv-editor__control-label">{locale.currentFile}</div>
                      <div
                        className="uv-editor__selected-target"
                        {...getTooltipProps(locale.currentFileTooltip(extractedControls.fileLabel))}
                      >
                        {extractedControls.fileLabel}
                      </div>
                      <div className="uv-editor__control-actions">
                        <button
                          type="button"
                          className="uv-editor__tool uv-editor__tool--secondary"
                          {...getTooltipProps(locale.addHint)}
                          onClick={extractedControls.onUpload}
                          disabled={!extractedControls.onUpload}
                        >
                          {extractedControls.labels.upload}
                        </button>
                        <button
                          type="button"
                          className="uv-editor__tool uv-editor__tool--secondary"
                          {...getTooltipProps(locale.removeAssetHint)}
                          onClick={extractedControls.onRemove}
                          disabled={!extractedControls.onRemove || !extractedControls.hasAsset}
                        >
                          {extractedControls.labels.remove}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="uv-editor__control-panel uv-editor__control-panel--modes">
                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.tool}</div>
                    <div className="uv-editor__chip-row">
                      {([
                        ["transform", locale.transform],
                        ["crop", locale.crop],
                        ["brush", locale.brushTool],
                        ["eraser", locale.eraser],
                        ["eyedropper", locale.eyedropper],
                        ["fill", locale.fillTool],
                      ] as [UvPortTool, string][]).map(([tool, label]) => (
                        <button
                          key={tool}
                          type="button"
                          className={`uv-editor__tool uv-editor__tool--secondary${activeTool === tool ? " uv-editor__tool--active" : ""}`}
                          {...getTooltipProps(toolHints[tool])}
                          onClick={() => handleSelectTool(tool)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {!isTextureMode ? (
                      <div className="uv-editor__control-actions">
                        <button
                          type="button"
                          className="uv-editor__tool uv-editor__tool--secondary"
                          {...getTooltipProps(locale.mirrorHint)}
                          disabled={!canMirrorSelected}
                          onClick={handleMirrorSelectedLayer}
                        >
                          {`⇋ ${locale.mirror}`}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.cropShape}</div>
                    <div className="uv-editor__chip-row">
                      {([
                        ["rect", locale.rect],
                        ["circle", locale.circle],
                      ] as [UvPortCropShape, string][]).map(([shape, label]) => (
                        <button
                          key={shape}
                          type="button"
                          className={`uv-editor__tool uv-editor__tool--secondary${cropShape === shape ? " uv-editor__tool--active" : ""}`}
                          {...getTooltipProps(cropShapeHints[shape])}
                          onClick={() => setCropShape(shape)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="uv-editor__control-panel uv-editor__control-panel--paint">
                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.brushPresetType}</div>
                    <div className="uv-editor__chip-row">
                      {([
                        ["brush", locale.brushPresets],
                        ["stamp", locale.stampPresets],
                      ] as [BrushPresetKind, string][]).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className={`uv-editor__tool uv-editor__tool--secondary${brushPresetKind === kind ? " uv-editor__tool--active" : ""}`}
                          {...getTooltipProps(locale.brushPresetTypeHint)}
                          onClick={() => setBrushPresetKind(kind)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.brushPreset}</div>
                    <div className="uv-editor__preset-picker" ref={brushPresetMenuRef}>
                      <button
                        type="button"
                        className={`uv-editor__preset-trigger${isBrushPresetMenuOpen ? " uv-editor__preset-trigger--open" : ""}`}
                        aria-haspopup="listbox"
                        aria-expanded={isBrushPresetMenuOpen}
                        {...getTooltipProps(locale.brushPresetHint)}
                        onClick={() => setIsBrushPresetMenuOpen((current) => !current)}
                      >
                        {activeBrushPreset ? <BrushPresetInlineSwatch preset={activeBrushPreset} /> : null}
                        <span className="uv-editor__preset-trigger-copy">
                          <span className="uv-editor__preset-trigger-title">
                            {activeBrushPreset ? getBrushPresetLabel(activeBrushPreset) : locale.brushPreset}
                          </span>
                          {activeBrushPreset ? (
                            <span className="uv-editor__preset-trigger-subtitle">{activeBrushPreset.source}</span>
                          ) : null}
                        </span>
                        <span
                          className={`uv-editor__preset-trigger-icon${isBrushPresetMenuOpen ? " uv-editor__preset-trigger-icon--open" : ""}`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </button>

                      {isBrushPresetMenuOpen ? (
                        <div className="uv-editor__preset-menu" role="listbox" aria-label={locale.brushPreset}>
                          {activeBrushPresetOptions.map((preset) => {
                            const isSelected = preset.id === activeBrushPreset?.id;

                            return (
                              <button
                                key={preset.id}
                                ref={isSelected ? selectedBrushPresetOptionRef : undefined}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`uv-editor__preset-option${isSelected ? " uv-editor__preset-option--active" : ""}`}
                                onClick={() => handleSelectBrushPreset(preset.id)}
                              >
                                <BrushPresetInlineSwatch preset={preset} />
                                <span className="uv-editor__preset-option-copy">
                                  <span className="uv-editor__preset-option-title">{getBrushPresetLabel(preset)}</span>
                                  <span className="uv-editor__preset-option-subtitle">{preset.source}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="uv-editor__control-group">
                    <div className="uv-editor__control-label">{locale.brush}</div>
                    <div className="uv-editor__paint-row">
                      <input
                        className="uv-editor__brush-color"
                        type="color"
                        value={brushColor}
                        {...getTooltipProps(locale.brushColorHint)}
                        onChange={(event) => setBrushColor(event.target.value)}
                      />
                      <input
                        className="uv-editor__slider"
                        type="range"
                        min="1"
                        max="128"
                        step="1"
                        value={brushSize}
                        {...getTooltipProps(locale.brushSizeHint)}
                        onChange={(event) => setBrushSize(Number(event.target.value))}
                      />
                      <span className="uv-editor__value-chip">{brushSize}px</span>
                      <input
                        className="uv-editor__slider"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={brushSoftness}
                        {...getTooltipProps(locale.brushSoftnessHint)}
                        onChange={(event) => setBrushSoftness(Number(event.target.value))}
                      />
                      <span className="uv-editor__value-chip">{brushSoftness}%</span>
                    </div>
                  </div>

                </div>

                {canCreateDesignLayer ? (
                  <DesignLayerPanel
                    locale={locale}
                    brushColor={brushColor}
                    selectedStyleId={selectedDesignLayer?.id || null}
                    selectedStyle={selectedDesignLayer?.designStyle || null}
                    canAdd={canCreateDesignLayer}
                    onBrushColorChange={setBrushColor}
                    onAdd={handleCreateDesignLayer}
                    onPreviewChange={handlePreviewDesignLayer}
                  />
                ) : null}

                {isTextCreationAvailable ? (
                  <div className="uv-editor__control-panel uv-editor__control-panel--text">
                    <div className="uv-editor__control-group">
                      <div className="uv-editor__control-label">{locale.textTitle}</div>
                      <textarea
                        className="uv-editor__text-input"
                        value={textValue}
                        placeholder={locale.textPlaceholder}
                        {...getTooltipProps(locale.textPlaceholderHint)}
                        onChange={(event) => setTextValue(event.target.value)}
                      />
                    </div>

                    <div className="uv-editor__text-grid">
                      <div className="uv-editor__control-group">
                        <div className="uv-editor__control-label">{locale.textFont}</div>
                        <select
                          className="uv-editor__text-select"
                          value={textFontFamily}
                          style={{ fontFamily: textFontFamily }}
                          {...getTooltipProps(locale.textFontHint)}
                          onChange={(event) => setTextFontFamily(event.target.value)}
                        >
                          {TEXT_FONT_OPTIONS.map((option) => (
                            <option key={option.label} value={option.value} style={{ fontFamily: option.value }}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="uv-editor__control-group">
                        <div className="uv-editor__control-label">{locale.textColor}</div>
                        <input
                          className="uv-editor__brush-color uv-editor__brush-color--text"
                          type="color"
                          value={textColor}
                          {...getTooltipProps(locale.textColorHint)}
                          onChange={(event) => setTextColor(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="uv-editor__control-group">
                      <div className="uv-editor__control-label">{locale.textSize}</div>
                      <div className="uv-editor__slider-row">
                        <input
                          className="uv-editor__slider"
                          type="range"
                          min="24"
                          max="180"
                          step="1"
                          value={textFontSize}
                          {...getTooltipProps(locale.textSizeHint)}
                          onChange={(event) => setTextFontSize(Number(event.target.value))}
                        />
                        <span className="uv-editor__value-chip">{textFontSize}px</span>
                      </div>
                    </div>

                    <div className="uv-editor__control-actions">
                      <button
                        type="button"
                        className="uv-editor__tool uv-editor__tool--secondary"
                        {...getTooltipProps(locale.addTextHint)}
                        onClick={handleCreateTextLayer}
                        disabled={!canCreateTextLayer}
                      >
                        {locale.addText}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="uv-editor__control-panel uv-editor__control-panel--actions">
                  <div className="uv-editor__control-actions">
                    <button
                      type="button"
                      className="uv-editor__tool uv-editor__tool--secondary"
                      {...getTooltipProps(locale.duplicateHint)}
                      onClick={handleDuplicateLayer}
                      disabled={!canDuplicateSelected}
                    >
                      {locale.duplicate}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
        {editorWindow.resizeEdges.map((edge) => (
          <div
            key={`editor-handle:${edge}`}
            className={`uv-window-handle uv-window-handle--${edge}`}
            {...editorWindow.getHandleProps(edge)}
          />
        ))}
      </div>

      <div
        className={`uv-editor-preview uv-editor-port-preview${previewWindow.isDragging ? " uv-window-frame--dragging" : ""}${previewWindow.isResizing ? " uv-window-frame--resizing" : ""}`}
        style={previewWindow.frameStyle}
      >
        <div className="uv-editor-preview__header" {...previewWindow.headerProps}>
          <div className="uv-editor-preview__header-copy">
            <div className="uv-editor-preview__title">{locale.previewTitle}</div>
            <div className="uv-editor-preview__meta">{locale.previewHint}</div>
          </div>
        </div>
        <div className="uv-editor-preview__content">
          <div ref={canvasWrapRef} className="uv-editor__viewport">
            {activeLoadedMesh ? (
              <canvas
                ref={canvasRef}
                className={`uv-editor__canvas${isPanning ? " uv-editor__canvas--panning" : ""}`}
                {...getTooltipProps(locale.previewCanvasHint)}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishInteraction}
                onPointerCancel={finishInteraction}
                onPointerLeave={(event) => {
                  if (!canvasRef.current?.hasPointerCapture(event.pointerId)) {
                    finishInteraction(event);
                  }
                }}
                onWheel={handleWheel}
                onContextMenu={(event) => event.preventDefault()}
              />
            ) : (
              <div className="uv-editor__empty">{locale.noMesh}</div>
            )}
          </div>
        </div>
        {previewWindow.resizeEdges.map((edge) => (
          <div
            key={`preview-handle:${edge}`}
            className={`uv-window-handle uv-window-handle--${edge}`}
            {...previewWindow.getHandleProps(edge)}
          />
        ))}
      </div>
    </>
  );
}
