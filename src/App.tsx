import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Camera, Group, Mesh, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import type { PaintPanelProps } from "./components/PaintPanel";
import type { UvDecalEditorProps } from "./components/UvDecalEditor";
import { sanitizeDesignLayerStyle } from "./components/uv-editor-port/design-presets";
import type { DesignLayerStyle } from "./components/uv-editor-port/design-presets";
import { sanitizePrintModeId } from "./components/uv-editor-port/print-mode-presets";
import { sanitizePrintTextureStyle } from "./components/uv-editor-port/print-texture";
import { AssetSidebar } from "./components/avatar/AssetSidebar";
import { StagePanel } from "./components/avatar/StagePanel";
import { SiteSeo } from "./components/seo/SiteSeo";
import {
  applyAssetToAvatarAssets,
  createAnonymousUser,
  createAvatarFromTemplate,
  patchAvatarGlb,
  postProcessExportedAvatarBlob,
} from "./components/avatar/export-utils";
import {
  getDefaultTextShadowStyle,
  getDefaultTextStrokeStyle,
  datasetAssets,
  DEFAULT_UV_LAYER_BLEND_MODE,
  FACIAL_FEATURE_TYPES,
  getCanonicalMeshSlot,
  getAppliedUvDecalsForMesh,
  groups,
  HAIR_COLOR_SWATCHES,
  isUvLayerBlendMode,
  IDLE_ANIMATION_URL,
  localAssetCapabilities,
  localLibrary,
  makeClientId,
  makeLookupKey,
  RPM_APP_NAME,
  SLOT_NAMES,
  TYPE_LABELS,
  UI_TEXT,
} from "./components/avatar/shared";
import type {
  AppliedUvDecal,
  AssetRecord,
  DecalProjectionBasis,
  DecalAsset,
  LocalItem,
  MeshSlot,
  MeshTintMap,
  StickerTransform,
  SupportedType,
  TextDecalStyle,
  UvLayerBlendMode,
  UiGender,
  UiLocale,
} from "./components/avatar/shared";

type UvEditorMode = "decal" | "texture" | null;

const BASE_SCENE_UV_SLOTS: readonly MeshSlot[] = [
  SLOT_NAMES.body,
  SLOT_NAMES.head,
  SLOT_NAMES.teeth,
  SLOT_NAMES.eyeLeft,
  SLOT_NAMES.eyeRight,
  SLOT_NAMES.top,
  SLOT_NAMES.bottom,
  SLOT_NAMES.footwear,
];

const SCENE_UV_SLOT_ORDER: readonly MeshSlot[] = [
  SLOT_NAMES.body,
  SLOT_NAMES.head,
  SLOT_NAMES.teeth,
  SLOT_NAMES.eyeLeft,
  SLOT_NAMES.eyeRight,
  SLOT_NAMES.top,
  SLOT_NAMES.bottom,
  SLOT_NAMES.footwear,
  SLOT_NAMES.hair,
  SLOT_NAMES.beard,
  SLOT_NAMES.headwear,
  SLOT_NAMES.facewear,
  SLOT_NAMES.faceMask,
  SLOT_NAMES.glasses,
];

const TYPE_TO_PREFERRED_UV_SLOT: Partial<Record<SupportedType, MeshSlot>> = {
  top: SLOT_NAMES.top,
  bottom: SLOT_NAMES.bottom,
  footwear: SLOT_NAMES.footwear,
  outfit: SLOT_NAMES.top,
  hair: SLOT_NAMES.hair,
  beard: SLOT_NAMES.beard,
  headwear: SLOT_NAMES.headwear,
  facewear: SLOT_NAMES.facewear,
  glasses: SLOT_NAMES.glasses,
  facemask: SLOT_NAMES.faceMask,
};

const getSceneUvSlotForMeshName = (meshName: string | null | undefined): MeshSlot | null =>
  getCanonicalMeshSlot(meshName);

const getDefaultDecalScaleForSlot = (slot: MeshSlot | null | undefined) => {
  if (slot === SLOT_NAMES.body) {
    return 0.04;
  }

  if (slot === SLOT_NAMES.head || slot === SLOT_NAMES.faceMask) {
    return 0.2;
  }

  return 0.35;
};

const getInitialDecalScale = ({
  slot,
  textStyle,
}: {
  slot: MeshSlot | null | undefined;
  textStyle?: TextDecalStyle | null;
}) => {
  const baseScale = getDefaultDecalScaleForSlot(slot);
  if (slot === SLOT_NAMES.body && textStyle) {
    return Math.max(baseScale, 0.085);
  }

  return baseScale;
};

const isSameUvPlacement = (
  left: Pick<
    AppliedUvDecal,
    | "meshName"
    | "textureUrl"
    | "blendMode"
    | "opacity"
    | "uv"
    | "scale"
    | "scaleX"
    | "scaleY"
    | "rotationDeg"
  >,
  right: Pick<
    AppliedUvDecal,
    | "meshName"
    | "textureUrl"
    | "blendMode"
    | "opacity"
    | "uv"
    | "scale"
    | "scaleX"
    | "scaleY"
    | "rotationDeg"
  >
) =>
  left.meshName === right.meshName &&
  left.textureUrl === right.textureUrl &&
  left.blendMode === right.blendMode &&
  left.opacity === right.opacity &&
  left.uv[0] === right.uv[0] &&
  left.uv[1] === right.uv[1] &&
  left.scale === right.scale &&
  left.scaleX === right.scaleX &&
  left.scaleY === right.scaleY &&
  left.rotationDeg === right.rotationDeg;

const mergeUniqueUvOverlays = (...groups: readonly AppliedUvDecal[][]) => {
  const merged: AppliedUvDecal[] = [];

  for (const group of groups) {
    for (const entry of group) {
      if (merged.some((current) => current.id === entry.id || isSameUvPlacement(current, entry))) {
        continue;
      }
      merged.push(entry);
    }
  }

  return merged;
};

const APP_SESSION_STORAGE_KEY = "metasibir:avatar-session:v1";
const APP_SESSION_STORAGE_VERSION = 1 as const;
const VALID_SUPPORTED_TYPES = new Set<SupportedType>([
  "top",
  "bottom",
  "footwear",
  "outfit",
  "hair",
  "eye",
  "eyeshape",
  "eyebrows",
  "faceshape",
  "noseshape",
  "lipshape",
  "glasses",
  "headwear",
  "beard",
  "facewear",
  "facemask",
]);
const VALID_LOCALES = new Set<UiLocale>(["ru", "en"]);
const VALID_GENDERS = new Set<UiGender>(["male", "female"]);
const VALID_UV_EDITOR_MODES = new Set<Exclude<UvEditorMode, null>>(["decal", "texture"]);
const VALID_MESH_SLOTS = new Set<MeshSlot>(Object.values(SLOT_NAMES) as MeshSlot[]);

type PersistedDraftDecalTextureState =
  | { mode: "inherit" }
  | { mode: "value"; value: string | null };

type AvatarSessionState = {
  version: typeof APP_SESSION_STORAGE_VERSION;
  activeType: SupportedType;
  locale: UiLocale;
  isPaintPanelOpen: boolean;
  uvEditorMode: UvEditorMode;
  isAvatarStatic: boolean;
  decalAssets: DecalAsset[];
  selectedDecalAssetId: string | null;
  draftDecalTextureState: PersistedDraftDecalTextureState;
  replaceTextureUrlState: string | null;
  replaceFileName: string;
  isStickerEditMode: boolean;
  draftDecalOpacity: number;
  draftDecalBlendMode: UvLayerBlendMode;
  uvDecalDraftUv: [number, number];
  uvDecalSlot: MeshSlot | null;
  appliedUvDecals: AppliedUvDecal[];
  uvTextureDraftUv: [number, number];
  uvTextureSlot: MeshSlot | null;
  appliedUvTextures: AppliedUvDecal[];
  paintedBasePreviewBySlot: Partial<Record<MeshSlot, string>>;
  paintedBaseFileNameBySlot: Partial<Record<MeshSlot, string>>;
  decalTransform: StickerTransform;
  replaceScale: number;
  replaceScaleX: number;
  replaceScaleY: number;
  replaceRotationDeg: number;
  selectedGender: UiGender;
  selectedPresetId: string;
  selectedHairColor: string | null;
  selectedBeardColor: string | null;
  selectedEyebrowColor: string;
  selectedLipColor: string;
  selectedByType: Partial<Record<SupportedType, string>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isTuple2 = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((entry) => isFiniteNumber(entry));

const isTuple3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((entry) => isFiniteNumber(entry));

const sanitizeTextDecalStyle = (value: unknown): TextDecalStyle | null => {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    typeof value.fontFamily !== "string" ||
    !isFiniteNumber(value.fontSize) ||
    typeof value.color !== "string"
  ) {
    return null;
  }

  const defaultStroke = getDefaultTextStrokeStyle();
  const defaultShadow = getDefaultTextShadowStyle(value.fontSize);
  return {
    text: value.text,
    fontFamily: value.fontFamily,
    fontSize: value.fontSize,
    color: value.color,
    strokeColor: typeof value.strokeColor === "string" ? value.strokeColor : defaultStroke.strokeColor,
    strokeWidth: isFiniteNumber(value.strokeWidth) ? Math.max(0, Math.min(20, value.strokeWidth)) : defaultStroke.strokeWidth,
    shadowColor: typeof value.shadowColor === "string" ? value.shadowColor : defaultShadow.shadowColor,
    shadowOpacity: isFiniteNumber(value.shadowOpacity) ? Math.max(0, Math.min(1, value.shadowOpacity)) : defaultShadow.shadowOpacity,
    shadowBlur: isFiniteNumber(value.shadowBlur) ? Math.max(0, Math.min(40, value.shadowBlur)) : defaultShadow.shadowBlur,
    shadowOffsetX: isFiniteNumber(value.shadowOffsetX) ? Math.max(-40, Math.min(40, value.shadowOffsetX)) : defaultShadow.shadowOffsetX,
    shadowOffsetY: isFiniteNumber(value.shadowOffsetY) ? Math.max(-40, Math.min(40, value.shadowOffsetY)) : defaultShadow.shadowOffsetY,
    printTexture: sanitizePrintTextureStyle(value.printTexture),
    printModeId: sanitizePrintModeId(value.printModeId),
  };
};

const sanitizeDecalProjectionBasis = (value: unknown): DecalProjectionBasis | null => {
  if (!isRecord(value) || !isTuple3(value.position) || !isTuple3(value.axisU) || !isTuple3(value.axisV)) {
    return null;
  }

  return {
    position: [value.position[0], value.position[1], value.position[2]],
    axisU: [value.axisU[0], value.axisU[1], value.axisU[2]],
    axisV: [value.axisV[0], value.axisV[1], value.axisV[2]],
    ...(isTuple3(value.normal)
      ? {
          normal: [value.normal[0], value.normal[1], value.normal[2]] as [number, number, number],
        }
      : {}),
  };
};

const isSupportedTypeValue = (value: unknown): value is SupportedType =>
  typeof value === "string" && VALID_SUPPORTED_TYPES.has(value as SupportedType);

const isLocaleValue = (value: unknown): value is UiLocale =>
  typeof value === "string" && VALID_LOCALES.has(value as UiLocale);

const isGenderValue = (value: unknown): value is UiGender =>
  typeof value === "string" && VALID_GENDERS.has(value as UiGender);

const isMeshSlotValue = (value: unknown): value is MeshSlot =>
  typeof value === "string" && VALID_MESH_SLOTS.has(value as MeshSlot);

const isUvEditorModeValue = (value: unknown): value is UvEditorMode =>
  value === null || (typeof value === "string" && VALID_UV_EDITOR_MODES.has(value as "decal" | "texture"));

const sanitizeDecalAssets = (value: unknown): DecalAsset[] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is DecalAsset =>
            isRecord(entry) &&
            typeof entry.id === "string" &&
            typeof entry.fileName === "string" &&
            typeof entry.textureUrl === "string"
        )
        .map((entry) => ({
          id: entry.id,
          fileName: entry.fileName,
          textureUrl: entry.textureUrl,
          textStyle: sanitizeTextDecalStyle(entry.textStyle),
          designStyle: sanitizeDesignLayerStyle(entry.designStyle),
        }))
    : [];

const sanitizeAppliedUvDecals = (value: unknown): AppliedUvDecal[] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is AppliedUvDecal =>
            isRecord(entry) &&
            typeof entry.id === "string" &&
            typeof entry.assetId === "string" &&
            typeof entry.fileName === "string" &&
            isMeshSlotValue(entry.meshName) &&
            isTuple2(entry.uv) &&
            isFiniteNumber(entry.scale) &&
            isFiniteNumber(entry.scaleX) &&
            isFiniteNumber(entry.scaleY) &&
            isFiniteNumber(entry.rotationDeg) &&
            typeof entry.textureUrl === "string"
        )
        .map((entry) => ({
          id: entry.id,
          assetId: entry.assetId,
          fileName: entry.fileName,
          meshName: entry.meshName,
          uv: [entry.uv[0], entry.uv[1]],
          scale: entry.scale,
          scaleX: entry.scaleX,
          scaleY: entry.scaleY,
          rotationDeg: entry.rotationDeg,
          textureUrl: entry.textureUrl,
          blendMode: isUvLayerBlendMode(entry.blendMode)
            ? entry.blendMode
            : DEFAULT_UV_LAYER_BLEND_MODE,
          opacity: isFiniteNumber(entry.opacity)
            ? Math.max(0, Math.min(1, entry.opacity))
            : 1,
          textStyle: sanitizeTextDecalStyle(entry.textStyle),
          designStyle: sanitizeDesignLayerStyle(entry.designStyle),
          projection: sanitizeDecalProjectionBasis(entry.projection),
        }))
    : [];

const sanitizeSelectedByType = (
  value: unknown
): Partial<Record<SupportedType, string>> => {
  if (!isRecord(value)) {
    return {};
  }

  const next: Partial<Record<SupportedType, string>> = {};
  for (const [type, assetId] of Object.entries(value)) {
    if (isSupportedTypeValue(type) && typeof assetId === "string") {
      next[type] = assetId;
    }
  }
  return next;
};

const sanitizePaintedBasePreviewBySlot = (
  value: unknown
): Partial<Record<MeshSlot, string>> => {
  if (!isRecord(value)) {
    return {};
  }

  const next: Partial<Record<MeshSlot, string>> = {};
  for (const [slot, textureUrl] of Object.entries(value)) {
    if (isMeshSlotValue(slot) && typeof textureUrl === "string") {
      next[slot] = textureUrl;
    }
  }
  return next;
};

const sanitizePaintedBaseFileNameBySlot = (
  value: unknown
): Partial<Record<MeshSlot, string>> => {
  if (!isRecord(value)) {
    return {};
  }

  const next: Partial<Record<MeshSlot, string>> = {};
  for (const [slot, fileName] of Object.entries(value)) {
    if (isMeshSlotValue(slot) && typeof fileName === "string") {
      next[slot] = fileName;
    }
  }
  return next;
};

const sanitizeStickerTransform = (value: unknown): StickerTransform | null => {
  if (!isRecord(value) || !isTuple3(value.position) || !isTuple3(value.normal)) {
    return null;
  }

  const uv: [number, number] | undefined = isTuple2(value.uv)
    ? [value.uv[0], value.uv[1]]
    : undefined;
  if (
    !isFiniteNumber(value.scale) ||
    !isFiniteNumber(value.scaleX) ||
    !isFiniteNumber(value.scaleY) ||
    !isFiniteNumber(value.rotationDeg)
  ) {
    return null;
  }

  return {
    position: [value.position[0], value.position[1], value.position[2]],
    normal: [value.normal[0], value.normal[1], value.normal[2]],
    uv,
    scale: value.scale,
    scaleX: value.scaleX,
    scaleY: value.scaleY,
    rotationDeg: value.rotationDeg,
  };
};

const sanitizeDraftDecalTextureState = (
  value: unknown
): string | null | undefined => {
  if (!isRecord(value) || typeof value.mode !== "string") {
    return undefined;
  }

  if (value.mode === "inherit") {
    return undefined;
  }

  if (value.mode === "value") {
    return typeof value.value === "string" || value.value === null ? value.value : undefined;
  }

  return undefined;
};

const readAvatarSession = (): Partial<AvatarSessionState> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!isRecord(parsed) || parsed.version !== APP_SESSION_STORAGE_VERSION) {
      return null;
    }

    const next: Partial<AvatarSessionState> = {};

    if (isSupportedTypeValue(parsed.activeType)) {
      next.activeType = parsed.activeType;
    }
    if (isLocaleValue(parsed.locale)) {
      next.locale = parsed.locale;
    }
    if (typeof parsed.isPaintPanelOpen === "boolean") {
      next.isPaintPanelOpen = parsed.isPaintPanelOpen;
    }
    if (isUvEditorModeValue(parsed.uvEditorMode)) {
      next.uvEditorMode = parsed.uvEditorMode;
    }
    if (typeof parsed.isAvatarStatic === "boolean") {
      next.isAvatarStatic = parsed.isAvatarStatic;
    }
    if (typeof parsed.selectedDecalAssetId === "string" || parsed.selectedDecalAssetId === null) {
      next.selectedDecalAssetId = parsed.selectedDecalAssetId;
    }
    if (typeof parsed.replaceTextureUrlState === "string" || parsed.replaceTextureUrlState === null) {
      next.replaceTextureUrlState = parsed.replaceTextureUrlState;
    }
    if (typeof parsed.replaceFileName === "string") {
      next.replaceFileName = parsed.replaceFileName;
    }
    if (typeof parsed.isStickerEditMode === "boolean") {
      next.isStickerEditMode = parsed.isStickerEditMode;
    }
    if (isFiniteNumber(parsed.draftDecalOpacity)) {
      next.draftDecalOpacity = Math.max(0, Math.min(1, parsed.draftDecalOpacity));
    }
    if (isUvLayerBlendMode(parsed.draftDecalBlendMode)) {
      next.draftDecalBlendMode = parsed.draftDecalBlendMode;
    }
    if (isTuple2(parsed.uvDecalDraftUv)) {
      next.uvDecalDraftUv = [parsed.uvDecalDraftUv[0], parsed.uvDecalDraftUv[1]];
    }
    if (isMeshSlotValue(parsed.uvDecalSlot) || parsed.uvDecalSlot === null) {
      next.uvDecalSlot = parsed.uvDecalSlot;
    }
    if (isTuple2(parsed.uvTextureDraftUv)) {
      next.uvTextureDraftUv = [parsed.uvTextureDraftUv[0], parsed.uvTextureDraftUv[1]];
    }
    if (isMeshSlotValue(parsed.uvTextureSlot) || parsed.uvTextureSlot === null) {
      next.uvTextureSlot = parsed.uvTextureSlot;
    }
    if (isFiniteNumber(parsed.replaceScale)) {
      next.replaceScale = parsed.replaceScale;
    }
    if (isFiniteNumber(parsed.replaceScaleX)) {
      next.replaceScaleX = parsed.replaceScaleX;
    }
    if (isFiniteNumber(parsed.replaceScaleY)) {
      next.replaceScaleY = parsed.replaceScaleY;
    }
    if (isFiniteNumber(parsed.replaceRotationDeg)) {
      next.replaceRotationDeg = parsed.replaceRotationDeg;
    }
    if (isGenderValue(parsed.selectedGender)) {
      next.selectedGender = parsed.selectedGender;
    }
    if (typeof parsed.selectedPresetId === "string") {
      next.selectedPresetId = parsed.selectedPresetId;
    }
    if (typeof parsed.selectedHairColor === "string" || parsed.selectedHairColor === null) {
      next.selectedHairColor = parsed.selectedHairColor;
    }
    if (typeof parsed.selectedBeardColor === "string" || parsed.selectedBeardColor === null) {
      next.selectedBeardColor = parsed.selectedBeardColor;
    }
    if (typeof parsed.selectedEyebrowColor === "string") {
      next.selectedEyebrowColor = parsed.selectedEyebrowColor;
    }
    if (typeof parsed.selectedLipColor === "string") {
      next.selectedLipColor = parsed.selectedLipColor;
    }

    next.decalAssets = sanitizeDecalAssets(parsed.decalAssets);
    next.appliedUvDecals = sanitizeAppliedUvDecals(parsed.appliedUvDecals);
    next.appliedUvTextures = sanitizeAppliedUvDecals(parsed.appliedUvTextures);
    next.selectedByType = sanitizeSelectedByType(parsed.selectedByType);
    next.paintedBasePreviewBySlot = sanitizePaintedBasePreviewBySlot(
      parsed.paintedBasePreviewBySlot
    );
    next.paintedBaseFileNameBySlot = sanitizePaintedBaseFileNameBySlot(
      parsed.paintedBaseFileNameBySlot
    );

    const restoredTransform = sanitizeStickerTransform(parsed.decalTransform);
    if (restoredTransform) {
      next.decalTransform = restoredTransform;
    }

    const restoredDraftState = sanitizeDraftDecalTextureState(parsed.draftDecalTextureState);
    if (restoredDraftState !== undefined || (isRecord(parsed.draftDecalTextureState) && parsed.draftDecalTextureState.mode === "inherit")) {
      next.draftDecalTextureState =
        restoredDraftState === undefined
          ? { mode: "inherit" }
          : { mode: "value", value: restoredDraftState };
    }

    return next;
  } catch (error) {
    console.warn("Failed to restore avatar session state", error);
    return null;
  }
};

function App() {
  const restoredSession = useMemo(() => readAvatarSession(), []);
  const [activeType, setActiveType] = useState<SupportedType>(
    restoredSession?.activeType || groups[0]?.types[0] || "top"
  );
  const [locale, setLocale] = useState<UiLocale>(restoredSession?.locale || "ru");
  const [isPaintPanelOpen, setIsPaintPanelOpen] = useState(
    restoredSession?.isPaintPanelOpen ?? false
  );
  const [uvEditorMode, setUvEditorMode] = useState<UvEditorMode>(
    restoredSession?.uvEditorMode ?? null
  );
  const [decalAssets, setDecalAssets] = useState<DecalAsset[]>(
    restoredSession?.decalAssets || []
  );
  const [selectedDecalAssetId, setSelectedDecalAssetId] = useState<string | null>(
    restoredSession?.selectedDecalAssetId ?? null
  );
  const [draftDecalTextureUrlState, setDraftDecalTextureUrlState] = useState<
    string | null | undefined
  >(
    restoredSession?.draftDecalTextureState?.mode === "value"
      ? restoredSession.draftDecalTextureState.value
      : undefined
  );
  const [replaceTextureUrlState, setReplaceTextureUrlState] = useState<string | null>(
    restoredSession?.replaceTextureUrlState ?? null
  );
  const [replaceFileName, setReplaceFileName] = useState<string>(
    restoredSession?.replaceFileName || ""
  );
  const [isStickerEditMode, setIsStickerEditMode] = useState(
    restoredSession?.isStickerEditMode ?? false
  );
  const [draftDecalOpacity, setDraftDecalOpacity] = useState(
    restoredSession?.draftDecalOpacity ?? 1
  );
  const [draftDecalBlendMode, setDraftDecalBlendMode] = useState<UvLayerBlendMode>(
    restoredSession?.draftDecalBlendMode ?? DEFAULT_UV_LAYER_BLEND_MODE
  );
  const [isStickerDragging, setIsStickerDragging] = useState(false);
  const [isAvatarStatic, setIsAvatarStatic] = useState(
    restoredSession?.isAvatarStatic ?? false
  );
  const [stickerTargetMesh, setStickerTargetMesh] = useState<Mesh | null>(null);
  const [decalProjectionBasis, setDecalProjectionBasis] = useState<DecalProjectionBasis | null>(
    null
  );
  const [uvDecalDraftUv, setUvDecalDraftUv] = useState<[number, number]>(
    restoredSession?.uvDecalDraftUv || [0.5, 0.5]
  );
  const [uvDecalSlot, setUvDecalSlot] = useState<MeshSlot | null>(
    restoredSession?.uvDecalSlot ?? null
  );
  const [appliedUvDecals, setAppliedUvDecals] = useState<AppliedUvDecal[]>(
    restoredSession?.appliedUvDecals || []
  );
  const [uvTextureDraftUv, setUvTextureDraftUv] = useState<[number, number]>(
    restoredSession?.uvTextureDraftUv || [0.5, 0.5]
  );
  const [uvTextureSlot, setUvTextureSlot] = useState<MeshSlot | null>(
    restoredSession?.uvTextureSlot ?? null
  );
  const [appliedUvTextures, setAppliedUvTextures] = useState<AppliedUvDecal[]>(
    restoredSession?.appliedUvTextures || []
  );
  const [paintedBasePreviewBySlot, setPaintedBasePreviewBySlot] = useState<
    Partial<Record<MeshSlot, string>>
  >(restoredSession?.paintedBasePreviewBySlot || {});
  const [paintedBaseFileNameBySlot, setPaintedBaseFileNameBySlot] = useState<
    Partial<Record<MeshSlot, string>>
  >(restoredSession?.paintedBaseFileNameBySlot || {});
  const [decalTransform, setDecalTransform] = useState<StickerTransform>({
    position: restoredSession?.decalTransform?.position || [0, 0.35, 0.25],
    normal: restoredSession?.decalTransform?.normal || [0, 0, 1],
    uv: restoredSession?.decalTransform?.uv || [0.5, 0.5],
    scale: restoredSession?.decalTransform?.scale ?? 0.35,
    scaleX: restoredSession?.decalTransform?.scaleX ?? 1,
    scaleY: restoredSession?.decalTransform?.scaleY ?? 1,
    rotationDeg: restoredSession?.decalTransform?.rotationDeg ?? 0,
  });
  const [replaceScale, setReplaceScale] = useState(restoredSession?.replaceScale ?? 1);
  const [replaceScaleX, setReplaceScaleX] = useState(restoredSession?.replaceScaleX ?? 1);
  const [replaceScaleY, setReplaceScaleY] = useState(restoredSession?.replaceScaleY ?? 1);
  const [replaceRotationDeg, setReplaceRotationDeg] = useState(
    restoredSession?.replaceRotationDeg ?? 0
  );
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState("metasibir-avatar.glb");
  const [selectedGender, setSelectedGender] = useState<UiGender>(
    restoredSession?.selectedGender || "male"
  );
  const [selectedPresetId, setSelectedPresetId] = useState(
    restoredSession?.selectedPresetId || "preset-1"
  );
  const [selectedHairColor, setSelectedHairColor] = useState<string | null>(
    restoredSession?.selectedHairColor ?? null
  );
  const [selectedBeardColor, setSelectedBeardColor] = useState<string | null>(
    restoredSession?.selectedBeardColor ?? null
  );
  const [selectedEyebrowColor, setSelectedEyebrowColor] = useState<string>(
    restoredSession?.selectedEyebrowColor || HAIR_COLOR_SWATCHES[0]
  );
  const [selectedLipColor, setSelectedLipColor] = useState<string>(
    restoredSession?.selectedLipColor || HAIR_COLOR_SWATCHES[23]
  );
  const [selectedByType, setSelectedByType] = useState<
    Partial<Record<SupportedType, string>>
  >(restoredSession?.selectedByType || {});
  const previousBaseSelectionRef = useRef<{
    gender: UiGender;
    presetId: string;
  }>({
    gender: restoredSession?.selectedGender || "male",
    presetId: restoredSession?.selectedPresetId || "preset-1",
  });
  const decalUploadInputRef = useRef<HTMLInputElement | null>(null);
  const textureUploadInputRef = useRef<HTMLInputElement | null>(null);
  const avatarExportGroupRef = useRef<Group | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const skipInitialDraftResetRef = useRef(Boolean(restoredSession));
  const skipInitialPreferredSlotSyncRef = useRef(
    Boolean(restoredSession?.uvDecalSlot || restoredSession?.uvTextureSlot)
  );
  const skipInitialDecalSlotSyncRef = useRef(Boolean(restoredSession));
  const skipInitialTextureSlotSyncRef = useRef(Boolean(restoredSession));
  const sessionPersistTimeoutRef = useRef<number | null>(null);
  const sessionPersistWarnedRef = useRef(false);

  const sessionSnapshot = useMemo<AvatarSessionState>(
    () => ({
      version: APP_SESSION_STORAGE_VERSION,
      activeType,
      locale,
      isPaintPanelOpen,
      uvEditorMode,
      isAvatarStatic,
      decalAssets,
      selectedDecalAssetId,
      draftDecalTextureState:
        draftDecalTextureUrlState === undefined
          ? { mode: "inherit" }
          : { mode: "value", value: draftDecalTextureUrlState },
      replaceTextureUrlState,
      replaceFileName,
      isStickerEditMode,
      draftDecalOpacity,
      draftDecalBlendMode,
      uvDecalDraftUv,
      uvDecalSlot,
      appliedUvDecals,
      uvTextureDraftUv,
      uvTextureSlot,
      appliedUvTextures,
      paintedBasePreviewBySlot,
      paintedBaseFileNameBySlot,
      decalTransform,
      replaceScale,
      replaceScaleX,
      replaceScaleY,
      replaceRotationDeg,
      selectedGender,
      selectedPresetId,
      selectedHairColor,
      selectedBeardColor,
      selectedEyebrowColor,
      selectedLipColor,
      selectedByType,
    }),
    [
      activeType,
      appliedUvDecals,
      appliedUvTextures,
      decalAssets,
      decalTransform,
      draftDecalBlendMode,
      draftDecalOpacity,
      draftDecalTextureUrlState,
      isAvatarStatic,
      isPaintPanelOpen,
      isStickerEditMode,
      locale,
      paintedBaseFileNameBySlot,
      paintedBasePreviewBySlot,
      replaceFileName,
      replaceRotationDeg,
      replaceScale,
      replaceScaleX,
      replaceScaleY,
      replaceTextureUrlState,
      selectedBeardColor,
      selectedByType,
      selectedDecalAssetId,
      selectedEyebrowColor,
      selectedGender,
      selectedHairColor,
      selectedLipColor,
      selectedPresetId,
      uvDecalDraftUv,
      uvDecalSlot,
      uvEditorMode,
      uvTextureDraftUv,
      uvTextureSlot,
    ]
  );

  const selectedDecalAsset = useMemo(() => {
    if (!decalAssets.length) {
      return null;
    }

    return (
      decalAssets.find((asset) => asset.id === selectedDecalAssetId) ||
      decalAssets[decalAssets.length - 1] ||
      null
    );
  }, [decalAssets, selectedDecalAssetId]);
  const decalTextureUrl =
    draftDecalTextureUrlState !== undefined
      ? draftDecalTextureUrlState
      : selectedDecalAsset?.textureUrl || null;
  const decalFiles = useMemo(
    () =>
      decalAssets.map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        isSelected: asset.id === selectedDecalAsset?.id,
      })),
    [decalAssets, selectedDecalAsset]
  );
  const isDecalUvEditorOpen = uvEditorMode === "decal";
  const isTextureUvEditorOpen = uvEditorMode === "texture";

  useEffect(() => {
    if (restoredSession?.locale) {
      return;
    }
    const browserLocale = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
    setLocale(browserLocale);
  }, [restoredSession?.locale]);

  useEffect(() => {
    if (!isStickerEditMode) {
      setIsStickerDragging(false);
    }
  }, [isStickerEditMode]);

  useEffect(() => {
    if (skipInitialDraftResetRef.current) {
      skipInitialDraftResetRef.current = false;
      return;
    }
    setDraftDecalTextureUrlState(undefined);
  }, [selectedDecalAssetId]);

  useEffect(() => {
    if (
      draftDecalTextureUrlState !== undefined ||
      !selectedDecalAssetId ||
      !uvDecalSlot ||
      isStickerEditMode
    ) {
      return;
    }

    const hasAppliedLayerForSelectedAsset = getAppliedUvDecalsForMesh(
      appliedUvDecals,
      uvDecalSlot
    ).some((entry) => entry.assetId === selectedDecalAssetId);

    if (!hasAppliedLayerForSelectedAsset) {
      return;
    }

    setDraftDecalTextureUrlState(null);
  }, [
    appliedUvDecals,
    draftDecalTextureUrlState,
    isStickerEditMode,
    selectedDecalAssetId,
    uvDecalSlot,
  ]);

  useEffect(() => {
    if (selectedDecalAsset || typeof draftDecalTextureUrlState === "string") {
      return;
    }

    setDraftDecalTextureUrlState(undefined);
    setDecalProjectionBasis(null);
    setIsStickerEditMode(false);
    setStickerTargetMesh(null);
    setUvEditorMode((current) => (current === "decal" ? null : current));
  }, [draftDecalTextureUrlState, selectedDecalAsset]);

  useEffect(() => {
    setStickerTargetMesh(null);
  }, [selectedGender, selectedPresetId]);

  useEffect(() => {
    setPaintedBasePreviewBySlot({});
    setPaintedBaseFileNameBySlot({});
  }, [selectedGender, selectedPresetId]);

  const resetPresetVisualOverrides = useCallback(() => {
    setSelectedByType({});
    setSelectedHairColor(null);
    setSelectedBeardColor(null);
    setSelectedEyebrowColor(HAIR_COLOR_SWATCHES[0]);
    setSelectedLipColor(HAIR_COLOR_SWATCHES[23]);
    setAppliedUvDecals([]);
    setAppliedUvTextures([]);
    setPaintedBasePreviewBySlot({});
    setPaintedBaseFileNameBySlot({});
    setDraftDecalTextureUrlState(undefined);
    setDraftDecalOpacity(1);
    setDraftDecalBlendMode(DEFAULT_UV_LAYER_BLEND_MODE);
    setReplaceTextureUrlState(null);
    setReplaceFileName("");
    setUvEditorMode(null);
    setIsStickerEditMode(false);
    setStickerTargetMesh(null);
    setUvDecalDraftUv([0.5, 0.5]);
    setUvTextureDraftUv([0.5, 0.5]);
    setDecalTransform({
      position: [0, 0.35, 0.25],
      normal: [0, 0, 1],
      uv: [0.5, 0.5],
      scale: 0.35,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
    });
    setReplaceScale(1);
    setReplaceScaleX(1);
    setReplaceScaleY(1);
    setReplaceRotationDeg(0);
  }, []);

  useEffect(() => {
    return () => {
      if (sessionPersistTimeoutRef.current != null) {
        window.clearTimeout(sessionPersistTimeoutRef.current);
      }
      if (exportDownloadUrl) {
        URL.revokeObjectURL(exportDownloadUrl);
      }
    };
  }, [exportDownloadUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (sessionPersistTimeoutRef.current != null) {
      window.clearTimeout(sessionPersistTimeoutRef.current);
    }

    sessionPersistTimeoutRef.current = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(
          APP_SESSION_STORAGE_KEY,
          JSON.stringify(sessionSnapshot)
        );
      } catch (error) {
        if (!sessionPersistWarnedRef.current) {
          console.warn("Failed to persist avatar session state", error);
          sessionPersistWarnedRef.current = true;
        }
      }
    }, 180);

    return () => {
      if (sessionPersistTimeoutRef.current != null) {
        window.clearTimeout(sessionPersistTimeoutRef.current);
        sessionPersistTimeoutRef.current = null;
      }
    };
  }, [sessionSnapshot]);

  const presetOptions = useMemo(
    () => localLibrary.presets?.[selectedGender]?.items || [],
    [selectedGender]
  );

  useEffect(() => {
    const nextPresetId =
      localLibrary.presets?.[selectedGender]?.defaultPresetId || presetOptions[0]?.id || "";

    setSelectedPresetId((current) =>
      presetOptions.some((preset) => preset.id === current) ? current : nextPresetId
    );
  }, [presetOptions, selectedGender]);

  const assetsByType = useMemo(() => {
    const grouped = new Map<SupportedType, AssetRecord[]>();

    for (const asset of datasetAssets) {
      if (!grouped.has(asset.type)) {
        grouped.set(asset.type, []);
      }
      grouped.get(asset.type)?.push(asset);
    }

    for (const assets of grouped.values()) {
      assets.sort((left, right) => {
        const byName = String(left.name).localeCompare(String(right.name));
        if (byName !== 0) return byName;
        return String(left.id).localeCompare(String(right.id));
      });
    }

    return grouped;
  }, []);

  const localItemsByAsset = useMemo(() => {
    const map = new Map<string, LocalItem>();

    for (const item of localLibrary.libraries?.[selectedGender]?.items || []) {
      map.set(makeLookupKey(item.type, item.id), item);
    }

    return map;
  }, [selectedGender]);

  const capabilityByAsset = useMemo(() => {
    const map = new Map<
      string,
      {
        meshes: string[];
        hasBeard: boolean;
        hasFacewear: boolean;
        hasGlasses: boolean;
        hasHair: boolean;
        hasHeadwear: boolean;
        hasTop: boolean;
        hasBottom: boolean;
        hasFootwear: boolean;
      }
    >();

    for (const [key, value] of Object.entries(localAssetCapabilities.items || {})) {
      if (!key.startsWith(`${selectedGender}:`)) {
        continue;
      }

      map.set(key.slice(selectedGender.length + 1), value);
    }

    return map;
  }, [selectedGender]);

  const assetByKey = useMemo(
    () =>
      new Map(
        datasetAssets.map((asset) => [makeLookupKey(asset.type, String(asset.id)), asset])
      ),
    []
  );

  const isAssetAvailableForGender = (asset: AssetRecord) =>
    asset.gender === "neutral" || asset.gender === selectedGender;

  const isAssetCompatibleWithType = (asset: AssetRecord) => {
    const capability = capabilityByAsset.get(makeLookupKey(asset.type, String(asset.id)));
    if (!capability) {
      return true;
    }

    if (asset.type === "headwear") {
      return capability.hasHeadwear;
    }

    if (asset.type === "facewear") {
      return capability.hasFacewear;
    }

    return true;
  };

  const getSelectedAssetRecord = (type: SupportedType) => {
    const assetId = selectedByType[type];
    if (!assetId) return null;
    return assetByKey.get(makeLookupKey(type, assetId)) || null;
  };

  const visibleAssets = useMemo(() => {
    return (assetsByType.get(activeType) || []).filter(
      (asset) => isAssetAvailableForGender(asset) && isAssetCompatibleWithType(asset)
    );
  }, [activeType, assetsByType, capabilityByAsset, selectedGender]);

  useEffect(() => {
    setSelectedByType((current) => {
      let changed = false;
      const next: Partial<Record<SupportedType, string>> = { ...current };

      for (const [type, assetId] of Object.entries(current) as [SupportedType, string][]) {
        const asset = assetByKey.get(makeLookupKey(type, assetId));
        const localItem = localItemsByAsset.get(makeLookupKey(type, assetId));

        if (!asset || !isAssetAvailableForGender(asset) || !localItem || localItem.error) {
          delete next[type];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [assetByKey, localItemsByAsset, selectedGender]);

  useEffect(() => {
    const previous = previousBaseSelectionRef.current;
    if (previous.gender === selectedGender && previous.presetId === selectedPresetId) {
      return;
    }

    previousBaseSelectionRef.current = {
      gender: selectedGender,
      presetId: selectedPresetId,
    };
    resetPresetVisualOverrides();
  }, [resetPresetVisualOverrides, selectedGender, selectedPresetId]);

  const selectedAssetId = selectedByType[activeType] || "";

  const selectedLocalByType = useMemo(() => {
    const byType = new Map<SupportedType, LocalItem>();

    for (const [type, assetId] of Object.entries(selectedByType) as [
      SupportedType,
      string,
    ][]) {
      const localItem = localItemsByAsset.get(makeLookupKey(type, assetId));
      const capability = capabilityByAsset.get(makeLookupKey(type, assetId));

      if (type === "headwear" && capability && !capability.hasHeadwear) {
        continue;
      }

      if (type === "facewear" && capability && !capability.hasFacewear) {
        continue;
      }

      if (localItem && !localItem.error) {
        byType.set(type, localItem);
      }
    }

    return byType;
  }, [capabilityByAsset, localItemsByAsset, selectedByType]);

  const selectedPreset =
    presetOptions.find((preset) => preset.id === selectedPresetId) || presetOptions[0] || null;
  const tintByMesh = useMemo<MeshTintMap>(() => {
    const next: MeshTintMap = {};

    if (selectedHairColor) {
      next[SLOT_NAMES.hair] = { color: selectedHairColor, mode: "flat" };
      next["Wolf3D_Hair.001"] = { color: selectedHairColor, mode: "flat" };
      next["hair-60"] = { color: selectedHairColor, mode: "flat" };
      next.low = { color: selectedHairColor, mode: "flat" };
    }

    if (selectedBeardColor) {
      next[SLOT_NAMES.beard] = { color: selectedBeardColor, mode: "flat" };
    }

    if (selectedByType.lipshape) {
      next[SLOT_NAMES.head] = { color: selectedLipColor, mode: "lips" };
    }

    return next;
  }, [selectedBeardColor, selectedByType.lipshape, selectedHairColor, selectedLipColor]);
  const composedScene = useMemo(() => {
    const slotOwners = new Map<MeshSlot, string>();
    const getUrl = (type: SupportedType) => selectedLocalByType.get(type)?.glbUrl || null;
    const getCapability = (type: SupportedType) => {
      const assetId = selectedByType[type];
      if (!assetId) return null;
      return capabilityByAsset.get(makeLookupKey(type, assetId)) || null;
    };
    const suppressFacewear =
      activeType === "beard" || activeType === "headwear";
    const selectedBeardAsset = getSelectedAssetRecord("beard");
    const selectedEyebrowAsset = getSelectedAssetRecord("eyebrows");
    const selectedFacemaskAsset = getSelectedAssetRecord("facemask");

    const outfitUrl = getUrl("outfit");
    if (outfitUrl) {
      slotOwners.set(SLOT_NAMES.top, outfitUrl);
      slotOwners.set(SLOT_NAMES.bottom, outfitUrl);
      slotOwners.set(SLOT_NAMES.footwear, outfitUrl);
    } else {
      const topUrl = getUrl("top");
      const bottomUrl = getUrl("bottom");
      const footwearUrl = getUrl("footwear");

      if (topUrl) slotOwners.set(SLOT_NAMES.top, topUrl);
      if (bottomUrl) slotOwners.set(SLOT_NAMES.bottom, bottomUrl);
      if (footwearUrl) slotOwners.set(SLOT_NAMES.footwear, footwearUrl);
    }

    for (const featureType of FACIAL_FEATURE_TYPES) {
      const featureUrl = getUrl(featureType);
      const featureCapability = getCapability(featureType);
      if (!featureUrl || !featureCapability) {
        continue;
      }

      if (featureCapability.meshes.includes(SLOT_NAMES.head)) {
        slotOwners.set(SLOT_NAMES.head, featureUrl);
      }

      if (
        featureCapability.meshes.includes(SLOT_NAMES.eyeLeft) &&
        featureCapability.meshes.includes(SLOT_NAMES.eyeRight)
      ) {
        slotOwners.set(SLOT_NAMES.eyeLeft, featureUrl);
        slotOwners.set(SLOT_NAMES.eyeRight, featureUrl);
      }
    }

    const eyeUrl = getUrl("eye");
    if (eyeUrl) {
      slotOwners.set(SLOT_NAMES.eyeLeft, eyeUrl);
      slotOwners.set(SLOT_NAMES.eyeRight, eyeUrl);
    }

    const beardUrl = getUrl("beard");
    const eyebrowUrl = getUrl("eyebrows");
    const facemaskUrl = getUrl("facemask");
    const beardCapability = getCapability("beard");
    const facemaskCapability = getCapability("facemask");
    if (beardUrl) {
      slotOwners.set(SLOT_NAMES.head, beardUrl);

      if (beardCapability?.hasBeard) {
        slotOwners.set(SLOT_NAMES.beard, beardUrl);
      }
    }

    const headwearUrl = getUrl("headwear");
    if (headwearUrl) {
      slotOwners.set(SLOT_NAMES.hair, headwearUrl);
      slotOwners.set(SLOT_NAMES.headwear, headwearUrl);
    } else {
      const hairUrl = getUrl("hair");
      if (hairUrl) {
        slotOwners.set(SLOT_NAMES.hair, hairUrl);
      }
    }

    const glassesUrl = getUrl("glasses");
    if (glassesUrl) {
      slotOwners.set(SLOT_NAMES.glasses, glassesUrl);
    }

    const facewearUrl = suppressFacewear ? null : getUrl("facewear");
    if (facewearUrl) {
      slotOwners.set(SLOT_NAMES.head, facewearUrl);
      slotOwners.set(SLOT_NAMES.facewear, facewearUrl);
    } else if (
      beardUrl &&
      beardCapability?.hasFacewear &&
      !beardCapability?.hasBeard &&
      !selectedBeardAsset?.maskUrl
    ) {
      slotOwners.set(SLOT_NAMES.facewear, beardUrl);
    }

    if (facemaskUrl) {
      if (facemaskCapability?.meshes.includes(SLOT_NAMES.head)) {
        slotOwners.set(SLOT_NAMES.head, facemaskUrl);
      }
      if (facemaskCapability?.meshes.includes(SLOT_NAMES.faceMask)) {
        slotOwners.set(SLOT_NAMES.faceMask, facemaskUrl);
      }
    }

    const partsByUrl = new Map<string, MeshSlot[]>();
    for (const [slot, url] of slotOwners.entries()) {
      if (!partsByUrl.has(url)) {
        partsByUrl.set(url, []);
      }
      partsByUrl.get(url)?.push(slot);
    }

    const activeHeadModelUrl = slotOwners.get(SLOT_NAMES.head) || selectedPreset?.baseModelUrl || null;

    return {
      hiddenBaseMeshes: Array.from(slotOwners.keys()),
      slotModelUrls: Object.fromEntries(slotOwners.entries()) as Partial<Record<MeshSlot, string>>,
      beardMaskUrl: selectedBeardAsset?.maskUrl || null,
      beardMaskModelUrl: beardUrl,
      eyebrowMaskUrl: selectedEyebrowAsset?.maskUrl || null,
      eyebrowMaskModelUrl: eyebrowUrl,
      facemaskMaskUrl: facemaskUrl ? null : selectedFacemaskAsset?.maskUrl || null,
      facemaskMaskModelUrl: facemaskUrl ? null : activeHeadModelUrl,
      parts: Array.from(partsByUrl.entries()).map(([modelUrl, includeMeshes]) => ({
        modelUrl,
        includeMeshes,
      })),
    };
  }, [activeType, capabilityByAsset, selectedByType, selectedLocalByType, selectedPreset]);

  const pendingPickedDecalUvRef = useRef<{ slot: MeshSlot; uv: [number, number] } | null>(null);
  const pendingPickedTextureUvRef = useRef<{ slot: MeshSlot; uv: [number, number] } | null>(null);
  const pendingPickedDecalProjectionRef = useRef<{
    slot: MeshSlot;
    projection: DecalProjectionBasis | null;
  } | null>(null);

  const consumeLatestPickedDecalPlacement = useCallback(
    (
      fallbackSlot: MeshSlot,
      fallbackUv: [number, number],
      fallbackProjection: DecalProjectionBasis | null
    ) => {
      const pending = pendingPickedDecalUvRef.current;
      if (pending) {
        const pendingProjection =
          pendingPickedDecalProjectionRef.current &&
          pendingPickedDecalProjectionRef.current.slot === pending.slot
            ? pendingPickedDecalProjectionRef.current.projection
            : null;
        pendingPickedDecalUvRef.current = null;
        pendingPickedDecalProjectionRef.current = null;
        return {
          slot: pending.slot,
          uv: pending.uv,
          projection: pendingProjection,
        };
      }

      return {
        slot: fallbackSlot,
        uv: fallbackUv,
        projection: fallbackProjection,
      };
    },
    []
  );

  const computeDecalProjectionBasis = useCallback(
    (
      mesh: Mesh,
      surfaceHit: {
        face?: { a: number; b: number; c: number; normal: Vector3 } | null;
        point: Vector3;
      }
    ): DecalProjectionBasis | null => {
      const geometry = mesh.geometry;
      const face = surfaceHit.face;
      if (!geometry || !("getAttribute" in geometry) || !face) {
        return null;
      }

      const uvAttribute = geometry.getAttribute("uv");
      if (
        !uvAttribute ||
        typeof uvAttribute.getX !== "function" ||
        typeof uvAttribute.getY !== "function"
      ) {
        return null;
      }

      const positionA = mesh.getVertexPosition(face.a, new Vector3());
      const positionB = mesh.getVertexPosition(face.b, new Vector3());
      const positionC = mesh.getVertexPosition(face.c, new Vector3());
      mesh.localToWorld(positionA);
      mesh.localToWorld(positionB);
      mesh.localToWorld(positionC);

      const uvA = new Vector2(uvAttribute.getX(face.a), uvAttribute.getY(face.a));
      const uvB = new Vector2(uvAttribute.getX(face.b), uvAttribute.getY(face.b));
      const uvC = new Vector2(uvAttribute.getX(face.c), uvAttribute.getY(face.c));
      const deltaUvAB = uvB.clone().sub(uvA);
      const deltaUvAC = uvC.clone().sub(uvA);
      const determinant = deltaUvAB.x * deltaUvAC.y - deltaUvAC.x * deltaUvAB.y;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-6) {
        return null;
      }

      const edgeAB = positionB.clone().sub(positionA);
      const edgeAC = positionC.clone().sub(positionA);
      const inverseDeterminant = 1 / determinant;
      const axisU = edgeAB
        .clone()
        .multiplyScalar(deltaUvAC.y)
        .addScaledVector(edgeAC, -deltaUvAB.y)
        .multiplyScalar(inverseDeterminant);
      const axisV = edgeAC
        .clone()
        .multiplyScalar(deltaUvAB.x)
        .addScaledVector(edgeAB, -deltaUvAC.x)
        .multiplyScalar(inverseDeterminant);

      if (axisU.lengthSq() < 1e-10 || axisV.lengthSq() < 1e-10) {
        return null;
      }

      const worldNormal = face.normal.clone().transformDirection(mesh.matrixWorld).normalize();

      return {
        position: [surfaceHit.point.x, surfaceHit.point.y, surfaceHit.point.z],
        axisU: [axisU.x, axisU.y, axisU.z],
        axisV: [axisV.x, axisV.y, axisV.z],
        normal: [worldNormal.x, worldNormal.y, worldNormal.z],
      };
    },
    []
  );

  const syncUvSlotFromMesh = (
    mesh: Mesh | null,
    pickedUv?: [number, number] | null,
    pickedProjection?: DecalProjectionBasis | null
  ) => {
    const pickedSlot = getSceneUvSlotForMeshName(mesh?.name);
    if (!pickedSlot) {
      return;
    }

    if (pickedUv) {
      pendingPickedDecalUvRef.current = {
        slot: pickedSlot,
        uv: pickedUv,
      };
      pendingPickedTextureUvRef.current = {
        slot: pickedSlot,
        uv: pickedUv,
      };
      setUvDecalDraftUv(pickedUv);
      setUvTextureDraftUv(pickedUv);
    }

    if (pickedProjection) {
      pendingPickedDecalProjectionRef.current = {
        slot: pickedSlot,
        projection: pickedProjection,
      };
      setDecalProjectionBasis(pickedProjection);
    } else if (pickedUv) {
      pendingPickedDecalProjectionRef.current = {
        slot: pickedSlot,
        projection: null,
      };
      setDecalProjectionBasis(null);
    }

    setUvDecalSlot(pickedSlot);
    setUvTextureSlot(pickedSlot);
  };

  const updateStickerTransformFromEvent = (
    event: ThreeEvent<PointerEvent>,
    lockedMesh: Mesh | null = null
  ) => {
    const avatarSurfaceHits = event.intersections.filter((hit) => {
      const object = hit.object as { visible?: boolean; userData?: Record<string, unknown> };
      return object.visible !== false && Boolean(object.userData?.avatarSurface);
    });
    const surfaceHit = lockedMesh
      ? avatarSurfaceHits.find((hit) => hit.object === lockedMesh) || null
      : avatarSurfaceHits[0] || null;

    if (!surfaceHit) {
      return;
    }

    const hitObject = surfaceHit.object as Mesh;
    const worldNormal = surfaceHit.face
      ? surfaceHit.face.normal.clone().transformDirection(hitObject.matrixWorld).normalize()
      : new Vector3(0, 0, 1);

    const pickedUv = surfaceHit.uv ? ([surfaceHit.uv.x, surfaceHit.uv.y] as [number, number]) : null;
    const projectionBasis = computeDecalProjectionBasis(hitObject, surfaceHit);

    setDecalTransform((current) => ({
      ...current,
      position: [surfaceHit.point.x, surfaceHit.point.y, surfaceHit.point.z],
      normal: [worldNormal.x, worldNormal.y, worldNormal.z],
      uv: pickedUv || current.uv,
    }));
    setDecalProjectionBasis(projectionBasis);
    setStickerTargetMesh(hitObject);
    syncUvSlotFromMesh(hitObject, pickedUv, projectionBasis);
  };

  const appendAppliedDecalLayer = useCallback(
    ({
      assetId,
      fileName,
      textureUrl,
      meshName,
      uv,
      scale,
      scaleX,
      scaleY,
      rotationDeg,
      blendMode,
      opacity,
      textStyle,
      designStyle,
      projection,
    }: {
      assetId?: string | null;
      fileName?: string;
      textureUrl: string;
      meshName: MeshSlot;
      uv: [number, number];
      scale: number;
      scaleX: number;
      scaleY: number;
      rotationDeg: number;
      blendMode?: UvLayerBlendMode;
      opacity?: number;
      textStyle?: TextDecalStyle | null;
      designStyle?: DesignLayerStyle | null;
      projection?: DecalProjectionBasis | null;
    }) => {
      const nextLayerId = makeClientId();
      setAppliedUvDecals((current) => [
        ...current,
        {
          id: nextLayerId,
          assetId: assetId || `generated:${nextLayerId}`,
          fileName: fileName || "decal",
          meshName,
          uv,
          scale,
          scaleX,
          scaleY,
          rotationDeg,
          textureUrl,
          blendMode: blendMode || DEFAULT_UV_LAYER_BLEND_MODE,
          opacity: typeof opacity === "number" ? opacity : 1,
          textStyle: textStyle || null,
          designStyle: designStyle || null,
          projection: projection || null,
        },
      ]);
      return nextLayerId;
    },
    []
  );

  const handleUploadByTarget = (file: File | null, target: "decal" | "replace") => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        return;
      }

      if (target === "decal") {
        const nextAsset: DecalAsset = {
          id: makeClientId(),
          fileName: file.name,
          textureUrl: result,
          textStyle: null,
        };
        const fallbackSlot = uvDecalSlot || TYPE_TO_PREFERRED_UV_SLOT[activeType] || SLOT_NAMES.top;
        const { slot: nextSlot, uv: nextUv, projection: nextProjection } = consumeLatestPickedDecalPlacement(
          fallbackSlot,
          uvDecalDraftUv,
          decalProjectionBasis
        );
        setDecalAssets((current) => [...current, nextAsset]);
        selectDecalAssetWithoutDraft(nextAsset.id);
        setUvDecalSlot(nextSlot);
        const nextScale = getInitialDecalScale({ slot: nextSlot, textStyle: null });
        appendAppliedDecalLayer({
          assetId: nextAsset.id,
          fileName: nextAsset.fileName,
          textureUrl: nextAsset.textureUrl,
          meshName: nextSlot,
          uv: nextUv,
          scale: nextScale,
          scaleX: 1,
          scaleY: 1,
          rotationDeg: 0,
          blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
          projection: nextProjection,
        });
        setUvDecalDraftUv(nextUv);
        setDecalTransform((current) => ({
          ...current,
          uv: nextUv,
          scale: nextScale,
          scaleX: 1,
          scaleY: 1,
          rotationDeg: 0,
        }));
        setIsStickerEditMode(false);
        setStickerTargetMesh(null);
      } else {
        const nextSlot = uvTextureSlot || TYPE_TO_PREFERRED_UV_SLOT[activeType] || SLOT_NAMES.top;
        const nextLayerId = makeClientId();
        setReplaceTextureUrlState((current) => {
          if (current && current.startsWith("blob:")) {
            URL.revokeObjectURL(current);
          }
          return result;
        });
        setReplaceFileName(file.name);
        setUvTextureSlot(nextSlot);
        setAppliedUvTextures((current) => [
          ...current.filter((entry) => entry.meshName !== nextSlot),
          {
            id: current.find((entry) => entry.meshName === nextSlot)?.id || nextLayerId,
            assetId: `texture:${nextSlot}`,
            fileName: file.name,
            meshName: nextSlot,
            uv: [0.5, 0.5],
            scale: 1,
            scaleX: 1,
            scaleY: 1,
            rotationDeg: 0,
            textureUrl: result,
            blendMode: DEFAULT_UV_LAYER_BLEND_MODE,
            opacity: 1,
          },
        ]);
        setPaintedBasePreviewBySlot((current) => {
          if (!current[nextSlot]) {
            return current;
          }

          const next = { ...current };
          delete next[nextSlot];
          return next;
        });
        setPaintedBaseFileNameBySlot((current) => {
          if (!current[nextSlot]) {
            return current;
          }

          const next = { ...current };
          delete next[nextSlot];
          return next;
        });
        setUvTextureDraftUv([0.5, 0.5]);
        setReplaceScale(1);
        setReplaceScaleX(1);
        setReplaceScaleY(1);
        setReplaceRotationDeg(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeDecalAsset = (assetId: string) => {
    let nextSelectedId: string | null = selectedDecalAssetId;
    let removedSelected = false;
    setDecalAssets((current) => {
      const assetToRemove = current.find((asset) => asset.id === assetId) || null;
      removedSelected = selectedDecalAssetId === assetId;
      const remaining = current.filter((asset) => asset.id !== assetId);
      if (removedSelected) {
        nextSelectedId = remaining[remaining.length - 1]?.id || null;
      }
      if (assetToRemove?.textureUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(assetToRemove.textureUrl);
      }
      return remaining;
    });
    setAppliedUvDecals((current) => current.filter((entry) => entry.assetId !== assetId));
    setSelectedDecalAssetId(nextSelectedId);
    if (selectedDecalAssetId === assetId) {
      setDecalProjectionBasis(null);
      setStickerTargetMesh(null);
      setIsStickerEditMode(Boolean(nextSelectedId));
    }
  };

  const selectDecalAssetWithoutDraft = useCallback((assetId: string | null) => {
    skipInitialDraftResetRef.current = true;
    setSelectedDecalAssetId(assetId);
    setDraftDecalTextureUrlState(null);
  }, []);

  const createGeneratedDecalAsset = useCallback(
    ({
      fileName,
      textureUrl,
      textStyle,
      designStyle,
      meshName,
      uv,
      scale,
      scaleX,
      scaleY,
      rotationDeg,
      blendMode,
      opacity,
      projection,
    }: {
      fileName: string;
      textureUrl: string;
      textStyle?: TextDecalStyle | null;
      designStyle?: DesignLayerStyle | null;
      meshName?: string;
      uv?: [number, number];
      scale?: number;
      scaleX?: number;
      scaleY?: number;
      rotationDeg?: number;
      blendMode?: UvLayerBlendMode;
      opacity?: number;
      projection?: DecalProjectionBasis | null;
    }) => {
      const fallbackSlot = uvDecalSlot || TYPE_TO_PREFERRED_UV_SLOT[activeType] || SLOT_NAMES.top;
      const explicitSlot = meshName ? (meshName as MeshSlot) : null;
      const pickedPlacement = explicitSlot
        ? null
        : consumeLatestPickedDecalPlacement(fallbackSlot, uvDecalDraftUv, decalProjectionBasis);
      const nextSlot = explicitSlot || pickedPlacement?.slot || fallbackSlot;
      const nextUv = uv || pickedPlacement?.uv || uvDecalDraftUv;
      const nextProjection =
        projection !== undefined ? projection : explicitSlot ? null : pickedPlacement?.projection || null;
      const nextAsset: DecalAsset = {
        id: makeClientId(),
        fileName,
        textureUrl,
        textStyle: textStyle || null,
        designStyle: designStyle || null,
      };
      const nextScale =
        typeof scale === "number"
          ? scale
          : getInitialDecalScale({ slot: nextSlot, textStyle: nextAsset.textStyle });
      const nextScaleX = typeof scaleX === "number" ? scaleX : 1;
      const nextScaleY = typeof scaleY === "number" ? scaleY : 1;
      const nextRotationDeg = typeof rotationDeg === "number" ? rotationDeg : 0;
      const nextBlendMode = blendMode || DEFAULT_UV_LAYER_BLEND_MODE;
      const nextLayerId = appendAppliedDecalLayer({
        assetId: nextAsset.id,
        fileName: nextAsset.fileName,
        textureUrl: nextAsset.textureUrl,
        meshName: nextSlot,
        uv: nextUv,
        scale: nextScale,
        scaleX: nextScaleX,
        scaleY: nextScaleY,
        rotationDeg: nextRotationDeg,
        blendMode: nextBlendMode,
        opacity: typeof opacity === "number" ? opacity : 1,
        textStyle: nextAsset.textStyle,
        designStyle: nextAsset.designStyle,
        projection: nextProjection,
      });

      setDecalAssets((current) => [...current, nextAsset]);
      selectDecalAssetWithoutDraft(nextAsset.id);
      setUvDecalSlot(nextSlot);
      setUvDecalDraftUv(nextUv);
      setDecalTransform((current) => ({
        ...current,
        uv: nextUv,
        scale: nextScale,
        scaleX: nextScaleX,
        scaleY: nextScaleY,
        rotationDeg: nextRotationDeg,
      }));
      setIsStickerEditMode(false);
      setStickerTargetMesh(null);
      return {
        assetId: nextAsset.id,
        layerId: nextLayerId,
      };
    },
    [
      activeType,
      appendAppliedDecalLayer,
      consumeLatestPickedDecalPlacement,
      decalProjectionBasis,
      uvDecalDraftUv,
      uvDecalSlot,
    ]
  );

  const createDecalLayer = useCallback(
    ({
      assetId,
      fileName,
      textureUrl,
      meshName,
      uv,
      scale,
      scaleX,
      scaleY,
      rotationDeg,
      blendMode,
      opacity,
      textStyle,
      designStyle,
      projection,
    }: {
      assetId?: string | null;
      fileName?: string;
      textureUrl: string;
      meshName: string;
      uv: [number, number];
      scale: number;
      scaleX: number;
      scaleY: number;
      rotationDeg: number;
      blendMode?: UvLayerBlendMode;
      opacity?: number;
      textStyle?: TextDecalStyle | null;
      designStyle?: DesignLayerStyle | null;
      projection?: DecalProjectionBasis | null;
    }) => {
      const nextLayerId = appendAppliedDecalLayer({
        assetId,
        fileName,
        textureUrl,
        meshName: meshName as MeshSlot,
        uv,
        scale,
        scaleX,
        scaleY,
        rotationDeg,
        blendMode,
        opacity,
        textStyle,
        designStyle,
        projection,
      });

      setUvDecalSlot(meshName as MeshSlot);
      if (assetId) {
        selectDecalAssetWithoutDraft(assetId);
      }
      setIsStickerEditMode(false);
      setStickerTargetMesh(null);
      return nextLayerId;
    },
    [appendAppliedDecalLayer, selectDecalAssetWithoutDraft]
  );

  const updateAppliedDecalLayer = useCallback(
    (
      layerId: string,
        patch: Partial<{
          fileName: string;
          textureUrl: string | null;
          uv: [number, number];
          scale: number;
          scaleX: number;
          scaleY: number;
          rotationDeg: number;
          blendMode: UvLayerBlendMode;
          opacity: number;
          textStyle: TextDecalStyle | null;
          designStyle: DesignLayerStyle | null;
        }>
    ) => {
      let assetIdToUpdate: string | null = null;
      setAppliedUvDecals((current) =>
        current.map((entry) => {
          if (entry.id !== layerId) {
            return entry;
          }

          assetIdToUpdate = entry.assetId;
          return {
            ...entry,
            ...(typeof patch.fileName === "string" ? { fileName: patch.fileName } : {}),
            ...(typeof patch.textureUrl === "string" ? { textureUrl: patch.textureUrl } : {}),
            ...(patch.uv
              ? {
                  uv: [patch.uv[0], patch.uv[1]] as [number, number],
                  projection: null,
                }
              : {}),
            ...(typeof patch.scale === "number" ? { scale: patch.scale } : {}),
            ...(typeof patch.scaleX === "number" ? { scaleX: patch.scaleX } : {}),
            ...(typeof patch.scaleY === "number" ? { scaleY: patch.scaleY } : {}),
            ...(typeof patch.rotationDeg === "number" ? { rotationDeg: patch.rotationDeg } : {}),
            ...(patch.blendMode ? { blendMode: patch.blendMode } : {}),
            ...(typeof patch.opacity === "number" ? { opacity: patch.opacity } : {}),
            ...("textStyle" in patch ? { textStyle: patch.textStyle || null } : {}),
            ...("designStyle" in patch ? { designStyle: patch.designStyle || null } : {}),
          };
        })
      );
      if (assetIdToUpdate) {
        setDecalAssets((current) =>
          current.map((asset) =>
            asset.id === assetIdToUpdate
              ? {
                  ...asset,
                  ...(typeof patch.fileName === "string" ? { fileName: patch.fileName } : {}),
                  ...(typeof patch.textureUrl === "string" ? { textureUrl: patch.textureUrl } : {}),
                  ...("textStyle" in patch ? { textStyle: patch.textStyle || null } : {}),
                  ...("designStyle" in patch ? { designStyle: patch.designStyle || null } : {}),
                }
              : asset
          )
        );
      }
    },
    []
  );

  const moveAppliedDecalLayer = useCallback((layerId: string, direction: "up" | "down") => {
    setAppliedUvDecals((current) => {
      const layer = current.find((entry) => entry.id === layerId);
      if (!layer) {
        return current;
      }

      const slotLayers = current.filter((entry) => entry.meshName === layer.meshName);
      const slotIndex = slotLayers.findIndex((entry) => entry.id === layerId);
      const targetIndex = direction === "up" ? slotIndex - 1 : slotIndex + 1;
      if (slotIndex < 0 || targetIndex < 0 || targetIndex >= slotLayers.length) {
        return current;
      }

      const reorderedSlotLayers = slotLayers.slice();
      const [movedLayer] = reorderedSlotLayers.splice(slotIndex, 1);
      reorderedSlotLayers.splice(targetIndex, 0, movedLayer);

      let slotCursor = 0;
      return current.map((entry) =>
        entry.meshName === layer.meshName ? reorderedSlotLayers[slotCursor++] : entry
      );
    });
  }, []);

  const updateAppliedTextureLayer = useCallback(
    (
      layerId: string,
      patch: Partial<{
        fileName: string;
        textureUrl: string | null;
        uv: [number, number];
        scale: number;
        scaleX: number;
        scaleY: number;
        rotationDeg: number;
        blendMode: UvLayerBlendMode;
        opacity: number;
      }>
    ) => {
      setAppliedUvTextures((current) =>
        current.map((entry) =>
          entry.id !== layerId
            ? entry
            : {
                ...entry,
                ...(typeof patch.fileName === "string" ? { fileName: patch.fileName } : {}),
                ...(typeof patch.textureUrl === "string" ? { textureUrl: patch.textureUrl } : {}),
                ...(patch.uv ? { uv: [patch.uv[0], patch.uv[1]] as [number, number] } : {}),
                ...(typeof patch.scale === "number" ? { scale: patch.scale } : {}),
                ...(typeof patch.scaleX === "number" ? { scaleX: patch.scaleX } : {}),
                ...(typeof patch.scaleY === "number" ? { scaleY: patch.scaleY } : {}),
                ...(typeof patch.rotationDeg === "number" ? { rotationDeg: patch.rotationDeg } : {}),
                ...(patch.blendMode ? { blendMode: patch.blendMode } : {}),
                ...(typeof patch.opacity === "number" ? { opacity: patch.opacity } : {}),
              }
        )
      );
    },
    []
  );

  const handleSelectAsset = (asset: AssetRecord) => {
    const id = String(asset.id);

    setSelectedByType((current) => {
      const next: Partial<Record<SupportedType, string>> = { ...current };
      const isSameAsset = next[asset.type] === id;

      if (isSameAsset) {
        delete next[asset.type];
        return next;
      }

      next[asset.type] = id;

      if (FACIAL_FEATURE_TYPES.includes(asset.type)) {
        for (const featureType of FACIAL_FEATURE_TYPES) {
          if (featureType !== asset.type) {
            delete next[featureType];
          }
        }
      }

      if (asset.type === "outfit") {
        delete next.top;
        delete next.bottom;
        delete next.footwear;
      }

      if (asset.type === "top" || asset.type === "bottom" || asset.type === "footwear") {
        delete next.outfit;
      }

      if (asset.type === "beard" || asset.type === "headwear") {
        delete next.facewear;
      }

      return next;
    });
  };

  const handleClearType = () => {
    setSelectedByType((current) => {
      const next: Partial<Record<SupportedType, string>> = { ...current };
      delete next[activeType];
      return next;
    });
  };

  const copy = UI_TEXT[locale];
  const colorPanelLabel =
    activeType === "beard"
      ? copy.beardColor || copy.hairColor
      : activeType === "eyebrows"
        ? copy.eyebrowColor || copy.hairColor
        : activeType === "lipshape"
          ? copy.lipColor || copy.hairColor
          : copy.hairColor;
  const typeLabels = TYPE_LABELS[locale];
  const idleAnimationUrl = IDLE_ANIMATION_URL[selectedGender];
  const replacementSlots = useMemo<readonly MeshSlot[]>(() => {
    if (activeType === "top") return [SLOT_NAMES.top];
    if (activeType === "bottom") return [SLOT_NAMES.bottom];
    if (activeType === "footwear") return [SLOT_NAMES.footwear];
    if (activeType === "headwear") return [SLOT_NAMES.headwear];
    if (activeType === "facewear") return [SLOT_NAMES.facewear];
    if (activeType === "facemask") return [SLOT_NAMES.faceMask];
    if (activeType === "outfit")
      return [SLOT_NAMES.top, SLOT_NAMES.bottom, SLOT_NAMES.footwear];
    return [];
  }, [activeType]);
  const canUseReplacement = replacementSlots.length > 0;
  const shouldReplaceTexture = false;
  const preferredSceneUvSlot = TYPE_TO_PREFERRED_UV_SLOT[activeType] || null;

  useEffect(() => {
    if (!preferredSceneUvSlot) {
      return;
    }

    if (skipInitialPreferredSlotSyncRef.current) {
      skipInitialPreferredSlotSyncRef.current = false;
      return;
    }

    setUvDecalSlot(preferredSceneUvSlot);
    setUvTextureSlot(preferredSceneUvSlot);
  }, [preferredSceneUvSlot]);

  const getSceneUvSlotLabel = (slot: MeshSlot) => {
    if (slot === SLOT_NAMES.body) return locale === "ru" ? "Тело" : "Body";
    if (slot === SLOT_NAMES.head) return locale === "ru" ? "Голова" : "Head";
    if (slot === SLOT_NAMES.teeth) return locale === "ru" ? "Зубы" : "Teeth";
    if (slot === SLOT_NAMES.eyeLeft) return locale === "ru" ? "Левый глаз" : "Left eye";
    if (slot === SLOT_NAMES.eyeRight) return locale === "ru" ? "Правый глаз" : "Right eye";
    if (slot === SLOT_NAMES.top) return typeLabels.top;
    if (slot === SLOT_NAMES.bottom) return typeLabels.bottom;
    if (slot === SLOT_NAMES.footwear) return typeLabels.footwear;
    if (slot === SLOT_NAMES.hair) return typeLabels.hair;
    if (slot === SLOT_NAMES.beard) return typeLabels.beard;
    if (slot === SLOT_NAMES.headwear) return typeLabels.headwear;
    if (slot === SLOT_NAMES.facewear) return typeLabels.facewear;
    if (slot === SLOT_NAMES.faceMask) return typeLabels.facemask;
    if (slot === SLOT_NAMES.glasses) return typeLabels.glasses;
    return slot;
  };
  const buildSceneUvSlotOptions = (selectedSlot: MeshSlot | null) => {
    const slotSet = new Set<MeshSlot>(BASE_SCENE_UV_SLOTS);

    for (const slot of Object.keys(composedScene.slotModelUrls) as MeshSlot[]) {
      const canonicalSlot = getSceneUvSlotForMeshName(slot) || slot;
      if (SCENE_UV_SLOT_ORDER.includes(canonicalSlot)) {
        slotSet.add(canonicalSlot);
      }
    }

    if (preferredSceneUvSlot) {
      slotSet.add(preferredSceneUvSlot);
    }
    if (selectedSlot) {
      slotSet.add(selectedSlot);
    }

    return SCENE_UV_SLOT_ORDER.filter((slot) => slotSet.has(slot)).map((slot) => ({
      id: slot,
      label: getSceneUvSlotLabel(slot),
    }));
  };
  const decalSlotOptions = useMemo(
    () => buildSceneUvSlotOptions(uvDecalSlot),
    [composedScene.slotModelUrls, preferredSceneUvSlot, typeLabels, uvDecalSlot]
  );
  const textureSlotOptions = useMemo(
    () => buildSceneUvSlotOptions(uvTextureSlot),
    [composedScene.slotModelUrls, preferredSceneUvSlot, typeLabels, uvTextureSlot]
  );
  const previewDraftDecals = useMemo(() => {
    const overlays: AppliedUvDecal[] = [];
    if (decalTextureUrl && uvDecalSlot && (isStickerEditMode || isDecalUvEditorOpen)) {
      const candidate = {
        meshName: uvDecalSlot,
        textureUrl: decalTextureUrl,
        blendMode: draftDecalBlendMode,
        opacity: draftDecalOpacity,
        uv: uvDecalDraftUv,
        scale: decalTransform.scale,
        scaleX: decalTransform.scaleX,
        scaleY: decalTransform.scaleY,
        rotationDeg: decalTransform.rotationDeg,
        projection: decalProjectionBasis,
      };

      if (!appliedUvDecals.some((entry) => isSameUvPlacement(entry, candidate))) {
        overlays.push({
          id: "draft-preview:decal",
          assetId: selectedDecalAsset?.id || "draft-preview:decal",
          fileName: selectedDecalAsset?.fileName || "draft-preview",
          textStyle: selectedDecalAsset?.textStyle || null,
          designStyle: selectedDecalAsset?.designStyle || null,
          ...candidate,
        });
      }
    }

    return overlays;
  }, [
    appliedUvDecals,
    decalTextureUrl,
    draftDecalBlendMode,
    draftDecalOpacity,
    decalProjectionBasis,
    decalTransform.rotationDeg,
    decalTransform.scale,
    decalTransform.scaleX,
    decalTransform.scaleY,
    isDecalUvEditorOpen,
    isStickerEditMode,
    selectedDecalAsset,
    uvDecalDraftUv,
    uvDecalSlot,
  ]);
  const stageUvDecals = useMemo(
    () => mergeUniqueUvOverlays(appliedUvDecals, previewDraftDecals),
    [appliedUvDecals, previewDraftDecals]
  );
  const stageUvTextures = useMemo(() => appliedUvTextures, [appliedUvTextures]);

  useEffect(() => {
    const firstSlot = (decalSlotOptions[0]?.id as MeshSlot | undefined) || null;
    const preferredSlot =
      preferredSceneUvSlot && decalSlotOptions.some((slot) => slot.id === preferredSceneUvSlot)
        ? preferredSceneUvSlot
        : firstSlot;
    if (!firstSlot) {
      setUvDecalSlot(null);
      return;
    }

    setUvDecalSlot((current) =>
      current && decalSlotOptions.some((slot) => slot.id === current) ? current : preferredSlot
    );
  }, [decalSlotOptions, preferredSceneUvSlot]);

  useEffect(() => {
    const firstSlot = (textureSlotOptions[0]?.id as MeshSlot | undefined) || null;
    const preferredSlot =
      preferredSceneUvSlot &&
      textureSlotOptions.some((slot) => slot.id === preferredSceneUvSlot)
        ? preferredSceneUvSlot
        : firstSlot;
    if (!firstSlot) {
      setUvTextureSlot(null);
      return;
    }

    setUvTextureSlot((current) =>
      current && textureSlotOptions.some((slot) => slot.id === current)
        ? current
        : preferredSlot
    );
  }, [preferredSceneUvSlot, textureSlotOptions]);

  useEffect(() => {
    if (!uvDecalSlot) {
      return;
    }

    if (skipInitialDecalSlotSyncRef.current) {
      skipInitialDecalSlotSyncRef.current = false;
      return;
    }

    const pendingPickedUv = pendingPickedDecalUvRef.current;
    if (pendingPickedUv && pendingPickedUv.slot === uvDecalSlot) {
      const pendingProjection =
        pendingPickedDecalProjectionRef.current &&
        pendingPickedDecalProjectionRef.current.slot === uvDecalSlot
          ? pendingPickedDecalProjectionRef.current.projection
          : null;
      pendingPickedDecalUvRef.current = null;
      pendingPickedDecalProjectionRef.current = null;
      const nextScale = getDefaultDecalScaleForSlot(uvDecalSlot);
      setUvDecalDraftUv(pendingPickedUv.uv);
      setDecalProjectionBasis(pendingProjection);
      setDecalTransform((current) => ({
        ...current,
        uv: pendingPickedUv.uv,
        scale: nextScale,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
      }));
      return;
    }

    const slotDecals = getAppliedUvDecalsForMesh(appliedUvDecals, uvDecalSlot);
    const latestSlotDecal = slotDecals[slotDecals.length - 1];
    if (latestSlotDecal) {
      if (decalAssets.some((asset) => asset.id === latestSlotDecal.assetId)) {
        selectDecalAssetWithoutDraft(latestSlotDecal.assetId);
      }
      setUvDecalDraftUv(latestSlotDecal.uv);
      setDecalProjectionBasis(latestSlotDecal.projection || null);
      setDecalTransform((current) => ({
        ...current,
        scale: latestSlotDecal.scale,
        scaleX: latestSlotDecal.scaleX,
        scaleY: latestSlotDecal.scaleY,
        rotationDeg: latestSlotDecal.rotationDeg,
      }));
      return;
    }

    setUvDecalDraftUv([0.5, 0.5]);
    setDecalProjectionBasis(null);
    const nextScale = getDefaultDecalScaleForSlot(uvDecalSlot);
    setDecalTransform((current) => ({
      ...current,
      scale: nextScale,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
    }));
  }, [appliedUvDecals, decalAssets, selectDecalAssetWithoutDraft, uvDecalSlot]);

  useEffect(() => {
    if (!uvTextureSlot) {
      return;
    }

    if (skipInitialTextureSlotSyncRef.current) {
      skipInitialTextureSlotSyncRef.current = false;
      return;
    }

    pendingPickedTextureUvRef.current = null;
    const slotTextures = getAppliedUvDecalsForMesh(appliedUvTextures, uvTextureSlot);
    const latestSlotTexture = slotTextures[slotTextures.length - 1] || null;

    setReplaceTextureUrlState((current) =>
      current === (latestSlotTexture?.textureUrl || null) ? current : latestSlotTexture?.textureUrl || null
    );
    setReplaceFileName((current) =>
      current === (latestSlotTexture?.fileName || "") ? current : latestSlotTexture?.fileName || ""
    );
    setUvTextureDraftUv(latestSlotTexture?.uv || [0.5, 0.5]);
    setReplaceScale(latestSlotTexture?.scale || 1);
    setReplaceScaleX(latestSlotTexture?.scaleX || 1);
    setReplaceScaleY(latestSlotTexture?.scaleY || 1);
    setReplaceRotationDeg(latestSlotTexture?.rotationDeg || 0);
  }, [appliedUvTextures, uvTextureSlot]);
  const uvEditorModelUrl =
    (uvDecalSlot ? composedScene.slotModelUrls[uvDecalSlot] || null : null) ||
    selectedPreset?.baseModelUrl ||
    null;
  const uvTextureEditorModelUrl =
    (uvTextureSlot ? composedScene.slotModelUrls[uvTextureSlot] || null : null) ||
    selectedPreset?.baseModelUrl ||
    null;
  const handleNext = () => {
    const exportRoot = avatarExportGroupRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!exportRoot || !renderer || !scene || !camera) {
      return;
    }

    renderer.render(scene, camera);

    const sourceCanvas = renderer.domElement;
    const previewCanvas = document.createElement("canvas");
    const previewHeight = 1200;
    const previewWidth = 900;
    const cropHeight = sourceCanvas.height * 0.8;
    const cropWidth = cropHeight * (previewWidth / previewHeight);
    const cropX = Math.max(0, (sourceCanvas.width - cropWidth) * 0.5);
    const cropY = Math.max(0, sourceCanvas.height * 0.05);
    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;
    const previewContext = previewCanvas.getContext("2d");
    if (!previewContext) {
      return;
    }
    previewContext.fillStyle = "#ffffff";
    previewContext.fillRect(0, 0, previewWidth, previewHeight);
    previewContext.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      previewWidth,
      previewHeight
    );
    const previewUrl = previewCanvas.toDataURL("image/png");
    setExportPreviewUrl(previewUrl);
    setIsExportModalOpen(true);

    setExportDownloadUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });

    const fileName = `metasibir-avatar-${selectedGender}-${selectedPresetId}.glb`;
    setExportFileName(fileName);
    const templateId = selectedPreset?.templateId;
    if (!templateId) {
      return;
    }

    void (async () => {
      try {
        const { token, userId } = await createAnonymousUser(RPM_APP_NAME);
        const avatar = await createAvatarFromTemplate({
          token,
          userId,
          templateId,
          appName: RPM_APP_NAME,
        });

        const finalAssets = Object.entries(selectedByType).reduce<Record<string, string>>(
          (current, [type, assetId]) =>
            applyAssetToAvatarAssets({
              type: type as SupportedType,
              assetId,
              baseAssets: current,
            }),
          avatar.assets || {}
        );

        const blob = await patchAvatarGlb({
          token,
          avatarId: avatar.id,
          assets: finalAssets,
        });
        const processedBlob = await postProcessExportedAvatarBlob({
          sourceBlob: blob,
          replaceTextureUrl: shouldReplaceTexture ? replaceTextureUrlState : null,
          replaceTextureMeshes: shouldReplaceTexture ? replacementSlots : [],
          replaceTextureScale: replaceScale,
          replaceTextureScaleX: replaceScaleX,
          replaceTextureScaleY: replaceScaleY,
          replaceTextureRotationDeg: replaceRotationDeg,
          appliedUvDecals,
          appliedUvTextures,
          baseTextureOverrideUrls: paintedBasePreviewBySlot,
          baseModelUrl: selectedPreset?.baseModelUrl || null,
          slotModelUrls: composedScene.slotModelUrls,
        });

        const url = URL.createObjectURL(processedBlob);
        setExportDownloadUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return url;
        });
      } catch (error) {
        console.error("Failed to export RPM avatar", error);
      }
    })();
  };

  const handleToggleLocale = () => {
    setLocale((current) => (current === "ru" ? "en" : "ru"));
  };

  const handleSceneReady = ({
    renderer,
    scene,
    camera,
  }: {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
  }) => {
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
  };

  const handleCanvasPointerReset = () => {
    setIsStickerDragging(false);
  };

  const handleStagePointerDown = (event: ThreeEvent<PointerEvent>) => {
    const clickedSurface = event.intersections.find((hit) => {
      const object = hit.object as { visible?: boolean; userData?: Record<string, unknown> };
      return object.visible !== false && Boolean(object.userData?.avatarSurface);
    });
    if (clickedSurface && isPaintPanelOpen && uvEditorMode === null) {
      setUvEditorMode(selectedDecalAssetId && !replaceTextureUrlState ? "decal" : "texture");
    }
    if (clickedSurface && (isDecalUvEditorOpen || isTextureUvEditorOpen || isStickerEditMode)) {
      updateStickerTransformFromEvent(event, null);
    } else {
      const pickedUv = clickedSurface?.uv
        ? ([clickedSurface.uv.x, clickedSurface.uv.y] as [number, number])
        : null;
      const pickedMesh = (clickedSurface?.object as Mesh | undefined) || null;
      const projectionBasis =
        clickedSurface && pickedMesh ? computeDecalProjectionBasis(pickedMesh, clickedSurface) : null;
      syncUvSlotFromMesh(pickedMesh, pickedUv, projectionBasis);
    }

    if (!decalTextureUrl || !isStickerEditMode) return;
    setIsStickerDragging(true);
    event.stopPropagation();
  };

  const handleStagePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!decalTextureUrl || !isStickerEditMode || !isStickerDragging) return;
    updateStickerTransformFromEvent(event, stickerTargetMesh);
    event.stopPropagation();
  };

  const handleStagePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!decalTextureUrl || !isStickerEditMode) return;
    setIsStickerDragging(false);
    event.stopPropagation();
  };

  const handleAutoStickerPick = ({
    mesh,
    point,
    normal,
    uv,
  }: {
    mesh: Mesh;
    point: Vector3;
    normal: Vector3;
    uv: [number, number] | null;
  }) => {
    setStickerTargetMesh(mesh);
    setDecalTransform((current) => ({
      ...current,
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z],
      uv: uv || current.uv,
    }));
    if (uv) {
      setUvDecalDraftUv(uv);
      setUvTextureDraftUv(uv);
    }
    setDecalProjectionBasis(null);
    syncUvSlotFromMesh(mesh, uv);
  };

  const handleSelectColor = (color: string) => {
    if (activeType === "beard") {
      setSelectedBeardColor(color);
      return;
    }

    if (activeType === "eyebrows") {
      setSelectedEyebrowColor(color);
      return;
    }

    if (activeType === "lipshape") {
      setSelectedLipColor(color);
      return;
    }

    setSelectedHairColor(color);
  };

  const selectedColor =
    activeType === "beard"
      ? selectedBeardColor
      : activeType === "eyebrows"
        ? selectedEyebrowColor
        : activeType === "lipshape"
          ? selectedLipColor
          : selectedHairColor;

  const showColorPanel =
    activeType === "hair" ||
    activeType === "beard" ||
    activeType === "eyebrows" ||
    activeType === "lipshape";

  const paintPanelProps: PaintPanelProps = {
    copy,
    decalFiles,
    hasDecal: Boolean(decalAssets.length),
    onUploadDecal: () => decalUploadInputRef.current?.click(),
    onRemoveDecal: () => {
      if (selectedDecalAssetId) {
        removeDecalAsset(selectedDecalAssetId);
      }
    },
    onSelectDecalFile: (id) => {
      setSelectedDecalAssetId(id);
      setDraftDecalTextureUrlState(undefined);
    },
    onRemoveDecalFile: removeDecalAsset,
    isUvEditorOpen: isDecalUvEditorOpen,
    onToggleUvEditor: () =>
      setUvEditorMode((current) => (current === "decal" ? null : "decal")),
    isTextureUvEditorOpen,
    onToggleTextureUvEditor: () =>
      setUvEditorMode((current) => (current === "texture" ? null : "texture")),
    isDecalEditMode: isStickerEditMode,
    onToggleDecalEditMode: setIsStickerEditMode,
    decalScale: decalTransform.scale,
    onDecalScale: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scale: value,
      })),
    decalRotationDeg: decalTransform.rotationDeg,
    onDecalRotationDeg: (value) =>
      setDecalTransform((current) => ({
        ...current,
        rotationDeg: value,
      })),
    textureFileName: replaceFileName,
    hasTexture: Boolean(replaceTextureUrlState),
    canUseReplacement,
    onUploadTexture: () => textureUploadInputRef.current?.click(),
    onRemoveTexture: () => {
      if (uvTextureSlot) {
        setAppliedUvTextures((current) =>
          current.filter((entry) => entry.meshName !== uvTextureSlot)
        );
        setPaintedBasePreviewBySlot((current) => {
          if (!current[uvTextureSlot]) {
            return current;
          }

          const next = { ...current };
          delete next[uvTextureSlot];
          return next;
        });
        setPaintedBaseFileNameBySlot((current) => {
          if (!current[uvTextureSlot]) {
            return current;
          }

          const next = { ...current };
          delete next[uvTextureSlot];
          return next;
        });
      }
      setReplaceTextureUrlState((current) => {
        if (current && current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      setReplaceFileName("");
      setUvTextureDraftUv([0.5, 0.5]);
      setReplaceScale(1);
      setReplaceScaleX(1);
      setReplaceScaleY(1);
      setReplaceRotationDeg(0);
    },
    replaceScale,
    onReplaceScale: setReplaceScale,
    replaceScaleX,
    onReplaceScaleX: setReplaceScaleX,
    replaceScaleY,
    onReplaceScaleY: setReplaceScaleY,
    replaceRotationDeg: replaceRotationDeg,
    onReplaceRotationDeg: setReplaceRotationDeg,
    isAvatarStatic,
    onToggleAvatarStatic: setIsAvatarStatic,
  };

  const textureUvCopy = useMemo(
    () => ({
      ...copy,
      uvEditorTitle: locale === "ru" ? "UV-текстура" : "UV texture",
      uvEditorHint:
        locale === "ru"
          ? "Двигайте текстуру по UV-канве и нажмите применить"
          : "Move the texture on the UV canvas and apply it to the avatar",
    }),
    [copy, locale]
  );

  const decalUvEditorProps: UvDecalEditorProps = {
    copy,
    slotOptions: decalSlotOptions,
    selectedSlot: uvDecalSlot,
    onSelectSlot: (slot) => {
      pendingPickedDecalUvRef.current = null;
      pendingPickedDecalProjectionRef.current = null;
      setDecalProjectionBasis(null);
      setUvDecalSlot(slot as MeshSlot);
    },
    onSelectAssetId: selectDecalAssetWithoutDraft,
    modelUrl: uvEditorModelUrl,
    decalTextureUrl,
    appliedDecals: appliedUvDecals,
    draftAssetId: selectedDecalAsset?.id || null,
    draftFileName: selectedDecalAsset?.fileName || "",
    draftUv: uvDecalDraftUv,
    scale: decalTransform.scale,
    scaleX: decalTransform.scaleX,
    scaleY: decalTransform.scaleY,
    rotationDeg: decalTransform.rotationDeg,
    draftOpacity: draftDecalOpacity,
    draftBlendMode: draftDecalBlendMode,
    onDraftUvChange: (value) => {
      pendingPickedDecalProjectionRef.current = null;
      setDecalProjectionBasis(null);
      setUvDecalDraftUv(value);
    },
    onCreateGeneratedDecal: createGeneratedDecalAsset,
    onCreateDecalLayer: createDecalLayer,
    onBaseLayerPreviewChange: (slot, textureUrl) =>
      setPaintedBasePreviewBySlot((current) => {
        const meshSlot = slot as MeshSlot;
        const previousValue = current[meshSlot] || null;
        if (previousValue === textureUrl) {
          return current;
        }

        const next = { ...current };
        if (textureUrl) {
          next[meshSlot] = textureUrl;
        } else {
          delete next[meshSlot];
        }
        return next;
      }),
    onDraftTextureUrlChange: (url) => {
      const selectedTextureUrl = selectedDecalAsset?.textureUrl || null;
      setDraftDecalTextureUrlState(url === selectedTextureUrl ? undefined : url);
      if (!url) {
        setIsStickerEditMode(false);
        setStickerTargetMesh(null);
      }
    },
    onDraftOpacityChange: setDraftDecalOpacity,
    onDraftBlendModeChange: setDraftDecalBlendMode,
    onScaleChange: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scale: value,
      })),
    onScaleXChange: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scaleX: value,
      })),
    onScaleYChange: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scaleY: value,
      })),
    onRotationDegChange: (value) =>
      setDecalTransform((current) => ({
        ...current,
        rotationDeg: value,
      })),
    onApply: () => {
      if (!decalTextureUrl || !uvDecalSlot || !selectedDecalAsset) {
        return;
      }

      return createDecalLayer({
        assetId: selectedDecalAsset.id,
        fileName: selectedDecalAsset.fileName,
        meshName: uvDecalSlot,
        uv: uvDecalDraftUv,
        scale: decalTransform.scale,
        scaleX: decalTransform.scaleX,
        scaleY: decalTransform.scaleY,
        rotationDeg: decalTransform.rotationDeg,
        textureUrl: decalTextureUrl,
        blendMode: draftDecalBlendMode,
        opacity: draftDecalOpacity,
        textStyle: selectedDecalAsset.textStyle || null,
        designStyle: selectedDecalAsset.designStyle || null,
        projection: decalProjectionBasis,
      });
    },
    onReset: () => {
      setDecalProjectionBasis(null);
      setUvDecalDraftUv([0.5, 0.5]);
      setDecalTransform((current) => ({
        ...current,
        scaleX: 1,
        scaleY: 1,
      }));
    },
    onClearApplied: () =>
      setAppliedUvDecals((current) =>
        uvDecalSlot ? current.filter((entry) => entry.meshName !== uvDecalSlot) : current
      ),
    onRemoveAppliedLayer: (layerId) =>
      setAppliedUvDecals((current) => current.filter((entry) => entry.id !== layerId)),
    onReplaceAppliedLayers: (layers) =>
      setAppliedUvDecals(
        layers.map((layer) => ({
          ...layer,
          meshName: layer.meshName as MeshSlot,
          blendMode: isUvLayerBlendMode(layer.blendMode)
            ? layer.blendMode
            : DEFAULT_UV_LAYER_BLEND_MODE,
          opacity: isFiniteNumber(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1,
          designStyle: sanitizeDesignLayerStyle(layer.designStyle),
        }))
      ),
    onUpdateAppliedLayer: updateAppliedDecalLayer,
    onMoveAppliedLayer: moveAppliedDecalLayer,
    onCloseRequested: () => setIsPaintPanelOpen(false),
    hasApplied: Boolean(
      uvDecalSlot && getAppliedUvDecalsForMesh(appliedUvDecals, uvDecalSlot).length
    ),
  };

  const textureUvEditorProps: UvDecalEditorProps = {
    copy: textureUvCopy,
    slotOptions: textureSlotOptions,
    selectedSlot: uvTextureSlot,
    onSelectSlot: (slot) => {
      pendingPickedTextureUvRef.current = null;
      setUvTextureSlot(slot as MeshSlot);
    },
    modelUrl: uvTextureEditorModelUrl,
    decalTextureUrl: null,
    baseTextureOverrideUrl: null,
    appliedDecals: appliedUvTextures,
    draftFileName: replaceFileName || "",
    draftUv: uvTextureDraftUv,
    scale: replaceScale,
    scaleX: replaceScaleX,
    scaleY: replaceScaleY,
    rotationDeg: replaceRotationDeg,
    onDraftUvChange: setUvTextureDraftUv,
    onBaseLayerPreviewChange: (slot, textureUrl) => {
      const meshSlot = slot as MeshSlot;
      setPaintedBasePreviewBySlot((current) => {
        const previousValue = current[meshSlot] || null;
        if (previousValue === textureUrl) {
          return current;
        }

        const next = { ...current };
        if (textureUrl) {
          next[meshSlot] = textureUrl;
        } else {
          delete next[meshSlot];
        }
        return next;
      });
      setPaintedBaseFileNameBySlot((current) => {
        const nextFileName =
          textureUrl
            ? current[meshSlot] ||
              (uvTextureSlot === meshSlot ? replaceFileName || "texture" : "texture")
            : null;
        const previousValue = current[meshSlot] || null;
        if (previousValue === nextFileName) {
          return current;
        }

        const next = { ...current };
        if (nextFileName) {
          next[meshSlot] = nextFileName;
        } else {
          delete next[meshSlot];
        }
        return next;
      });
    },
    onDraftTextureUrlChange: (url) =>
      setReplaceTextureUrlState((current) => {
        if (current && current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return url;
      }),
    onDraftFileNameChange: setReplaceFileName,
    onScaleChange: setReplaceScale,
    onScaleXChange: setReplaceScaleX,
    onScaleYChange: setReplaceScaleY,
    onRotationDegChange: setReplaceRotationDeg,
    onApply: () => undefined,
    onReset: () => {
      setUvTextureDraftUv([0.5, 0.5]);
      setReplaceScale(1);
      setReplaceScaleX(1);
      setReplaceScaleY(1);
      setReplaceRotationDeg(0);
    },
    onClearApplied: () => {
      if (!uvTextureSlot) {
        return;
      }

      setAppliedUvTextures((current) =>
        current.filter((entry) => entry.meshName !== uvTextureSlot)
      );
      setPaintedBasePreviewBySlot((current) => {
        if (!current[uvTextureSlot]) {
          return current;
        }

        const next = { ...current };
        delete next[uvTextureSlot];
        return next;
      });
      setPaintedBaseFileNameBySlot((current) => {
        if (!current[uvTextureSlot]) {
          return current;
        }

        const next = { ...current };
        delete next[uvTextureSlot];
        return next;
      });
    },
    onRemoveAppliedLayer: (layerId) =>
      setAppliedUvTextures((current) => current.filter((entry) => entry.id !== layerId)),
    onReplaceAppliedLayers: (layers) =>
      setAppliedUvTextures(
        layers.map((layer) => ({
          ...layer,
          meshName: layer.meshName as MeshSlot,
          blendMode: isUvLayerBlendMode(layer.blendMode)
            ? layer.blendMode
            : DEFAULT_UV_LAYER_BLEND_MODE,
          opacity: isFiniteNumber(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1,
        }))
      ),
    onUpdateAppliedLayer: updateAppliedTextureLayer,
    onCloseRequested: () => setIsPaintPanelOpen(false),
    hasApplied: Boolean(
      uvTextureSlot && getAppliedUvDecalsForMesh(appliedUvTextures, uvTextureSlot).length
    ),
  };

  const uvEditorProps =
    uvEditorMode === "texture" ? textureUvEditorProps : decalUvEditorProps;
  return (
    <>
      <SiteSeo locale={locale} />
      <main className="creator-shell">
        <StagePanel
          copy={copy}
          locale={locale}
          onToggleLocale={handleToggleLocale}
          onNext={handleNext}
          isPaintPanelOpen={isPaintPanelOpen}
          onTogglePaintPanel={() => setIsPaintPanelOpen((current) => !current)}
          paintPanelProps={paintPanelProps}
          showUvEditor={isPaintPanelOpen && uvEditorMode !== null}
          uvEditorProps={uvEditorProps}
          avatarExportGroupRef={avatarExportGroupRef}
          onSceneReady={handleSceneReady}
          onCanvasPointerReset={handleCanvasPointerReset}
          onStagePointerDown={handleStagePointerDown}
          onStagePointerMove={handleStagePointerMove}
          onStagePointerUp={handleStagePointerUp}
          selectedPresetBaseModelUrl={selectedPreset?.baseModelUrl || null}
          composedScene={composedScene}
          tintByMesh={tintByMesh}
          idleAnimationUrl={idleAnimationUrl}
          shouldReplaceTexture={shouldReplaceTexture}
          replaceTextureUrl={replaceTextureUrlState}
          replacementSlots={replacementSlots}
          replaceScale={replaceScale}
          replaceScaleX={replaceScaleX}
          replaceScaleY={replaceScaleY}
          replaceRotationDeg={replaceRotationDeg}
          isAvatarStatic={isAvatarStatic}
          isStickerDragging={isStickerDragging}
          appliedUvDecals={stageUvDecals}
          appliedUvTextures={stageUvTextures}
          baseTextureOverrideUrls={paintedBasePreviewBySlot}
          selectedEyebrowColor={selectedEyebrowColor}
          decalTextureUrl={decalTextureUrl}
          stickerTargetMesh={stickerTargetMesh}
          onAutoStickerPick={handleAutoStickerPick}
          showColorPanel={showColorPanel}
          colorPanelLabel={colorPanelLabel}
          selectedColor={selectedColor}
          onSelectColor={handleSelectColor}
          decalUploadInputRef={decalUploadInputRef}
          textureUploadInputRef={textureUploadInputRef}
          onUploadByTarget={handleUploadByTarget}
          isExportModalOpen={isExportModalOpen}
          exportPreviewUrl={exportPreviewUrl}
          exportDownloadUrl={exportDownloadUrl}
          exportFileName={exportFileName}
          onCloseExportModal={() => setIsExportModalOpen(false)}
        />
        <AssetSidebar
          copy={copy}
          selectedGender={selectedGender}
          onSelectGender={setSelectedGender}
          presetOptions={presetOptions}
          selectedPresetId={selectedPresetId}
          onSelectPresetId={setSelectedPresetId}
          activeType={activeType}
          onSelectType={setActiveType}
          typeLabels={typeLabels}
          selectedAssetId={selectedAssetId}
          onClearType={handleClearType}
          visibleAssets={visibleAssets}
          localItemsByAsset={localItemsByAsset}
          onSelectAsset={handleSelectAsset}
        />
      </main>
    </>
  );}

useGLTF.preload(IDLE_ANIMATION_URL.male);
useGLTF.preload(IDLE_ANIMATION_URL.female);

export default App;
