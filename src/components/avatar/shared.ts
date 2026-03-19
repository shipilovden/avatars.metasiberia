import assetSchema from "../../config/asset-schema.json";
import assetDataset from "../../data/assets-catalog.json";
import localAssetCapabilitiesManifest from "../../data/generated/local-asset-capabilities.json";
import localLibraryManifest from "../../data/generated/local-library-manifest.json";

export type SupportedType =
  | "top"
  | "bottom"
  | "footwear"
  | "outfit"
  | "hair"
  | "eye"
  | "eyeshape"
  | "eyebrows"
  | "faceshape"
  | "noseshape"
  | "lipshape"
  | "glasses"
  | "headwear"
  | "beard"
  | "facewear"
  | "facemask";

export type UiGender = "male" | "female";
export type AssetGender = UiGender | "neutral";
export type UiLocale = "ru" | "en";

export type AssetRecord = {
  id: string | number;
  name: string;
  type: SupportedType;
  gender: AssetGender;
  bodyType?: string;
  iconUrl?: string;
  maskUrl?: string;
  beardStyle?: string;
};

export type GroupSchema = {
  id: string;
  label: string;
  types: SupportedType[];
};

export type LocalItem = {
  id: string;
  type: SupportedType;
  glbUrl: string;
  iconUrl: string | null;
  error: string | null;
};

export type LocalPreset = {
  id: string;
  label: string;
  gender: UiGender;
  templateId: string;
  baseModelUrl: string | null;
  previewUrl: string | null;
};

export type LocalGenderLibrary = {
  gender: UiGender;
  defaultPresetId: string;
  baseModelUrl: string | null;
  items: LocalItem[];
};

export type LocalLibraryManifest = {
  libraries: Record<UiGender, LocalGenderLibrary>;
  presets: Record<
    UiGender,
    {
      defaultPresetId: string;
      items: LocalPreset[];
    }
  >;
};

export type LocalAssetCapabilityItem = {
  meshes: string[];
  hasBeard: boolean;
  hasFacewear: boolean;
  hasGlasses: boolean;
  hasHair: boolean;
  hasHeadwear: boolean;
  hasTop: boolean;
  hasBottom: boolean;
  hasFootwear: boolean;
};

export type LocalAssetCapabilitiesManifest = {
  items: Record<string, LocalAssetCapabilityItem>;
};

export type StickerTransform = {
  position: [number, number, number];
  normal: [number, number, number];
  uv?: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
};

export type TextDecalStyle = {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
};

export type DecalProjectionBasis = {
  position: [number, number, number];
  axisU: [number, number, number];
  axisV: [number, number, number];
  normal?: [number, number, number];
};

export type DecalAsset = {
  id: string;
  fileName: string;
  textureUrl: string;
  textStyle?: TextDecalStyle | null;
};

export const SLOT_NAMES = {
  body: "Wolf3D_Body",
  head: "Wolf3D_Head",
  teeth: "Wolf3D_Teeth",
  hair: "Wolf3D_Hair",
  beard: "Wolf3D_Beard",
  glasses: "Wolf3D_Glasses",
  headwear: "Wolf3D_Headwear",
  facewear: "Wolf3D_Facewear",
  faceMask: "Wolf3D_FaceMask",
  top: "Wolf3D_Outfit_Top",
  bottom: "Wolf3D_Outfit_Bottom",
  footwear: "Wolf3D_Outfit_Footwear",
  eyeLeft: "EyeLeft",
  eyeRight: "EyeRight",
} as const;

export type MeshSlot = (typeof SLOT_NAMES)[keyof typeof SLOT_NAMES];
const CANONICAL_MESH_SLOTS = new Set<MeshSlot>(Object.values(SLOT_NAMES) as MeshSlot[]);
const MESH_SLOT_EXACT_ALIASES: Partial<Record<string, MeshSlot>> = {
  "Mesh.009": SLOT_NAMES.top,
  "Mesh.003": SLOT_NAMES.headwear,
  Wolf3D_Skin: SLOT_NAMES.head,
  "hair-60": SLOT_NAMES.hair,
  low: SLOT_NAMES.hair,
};

export const normalizeMeshName = (value: string) =>
  value.trim().replace(/\.+$/, "").replace(/\.\d+$/, "");

export const getCanonicalMeshSlot = (meshName: string | null | undefined): MeshSlot | null => {
  if (!meshName) {
    return null;
  }

  const exactAlias = MESH_SLOT_EXACT_ALIASES[meshName];
  if (exactAlias) {
    return exactAlias;
  }

  if (CANONICAL_MESH_SLOTS.has(meshName as MeshSlot)) {
    return meshName as MeshSlot;
  }

  const normalizedMeshName = normalizeMeshName(meshName);
  if (CANONICAL_MESH_SLOTS.has(normalizedMeshName as MeshSlot)) {
    return normalizedMeshName as MeshSlot;
  }

  const normalizedLower = normalizedMeshName.toLowerCase();
  if (normalizedLower.startsWith("hair-") || normalizedLower.includes("wolf3d_hair")) {
    return SLOT_NAMES.hair;
  }
  if (normalizedLower.startsWith("beard-") || normalizedLower.includes("wolf3d_beard")) {
    return SLOT_NAMES.beard;
  }
  if (normalizedLower.includes("wolf3d_headwear")) {
    return SLOT_NAMES.headwear;
  }
  if (normalizedLower.includes("wolf3d_facewear")) {
    return SLOT_NAMES.facewear;
  }
  if (normalizedLower.includes("wolf3d_facemask")) {
    return SLOT_NAMES.faceMask;
  }
  if (normalizedLower.includes("wolf3d_outfit_top")) {
    return SLOT_NAMES.top;
  }
  if (normalizedLower.includes("wolf3d_outfit_bottom")) {
    return SLOT_NAMES.bottom;
  }
  if (normalizedLower.includes("wolf3d_outfit_footwear")) {
    return SLOT_NAMES.footwear;
  }
  if (normalizedLower.includes("wolf3d_body")) {
    return SLOT_NAMES.body;
  }
  if (normalizedLower.includes("wolf3d_head") || normalizedLower === "wolf3d_skin") {
    return SLOT_NAMES.head;
  }
  if (normalizedLower === "eyeleft" || normalizedLower === "wolf3d_eyeleft") {
    return SLOT_NAMES.eyeLeft;
  }
  if (normalizedLower === "eyeright" || normalizedLower === "wolf3d_eyeright") {
    return SLOT_NAMES.eyeRight;
  }
  if (normalizedLower.includes("wolf3d_teeth")) {
    return SLOT_NAMES.teeth;
  }
  if (normalizedLower.includes("wolf3d_glasses")) {
    return SLOT_NAMES.glasses;
  }

  return null;
};

export type MeshTintMode = "flat" | "eyebrows" | "lips";
export type MeshTintEntry = { color: string; mode: MeshTintMode };
export type MeshTintMap = Partial<Record<string, MeshTintEntry>>;

export const UV_LAYER_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "difference",
  "exclusion",
] as const;

export type UvLayerBlendMode = (typeof UV_LAYER_BLEND_MODES)[number];

export const DEFAULT_UV_LAYER_BLEND_MODE: UvLayerBlendMode = "normal";

export const isUvLayerBlendMode = (value: unknown): value is UvLayerBlendMode =>
  typeof value === "string" &&
  (UV_LAYER_BLEND_MODES as readonly string[]).includes(value);

export const getCanvasCompositeOperationForUvBlendMode = (
  blendMode: UvLayerBlendMode
): GlobalCompositeOperation => (blendMode === "normal" ? "source-over" : blendMode);

export type AppliedUvDecal = {
  id: string;
  assetId: string;
  fileName: string;
  meshName: MeshSlot;
  uv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  textureUrl: string;
  blendMode: UvLayerBlendMode;
  opacity: number;
  textStyle?: TextDecalStyle | null;
  projection?: DecalProjectionBasis | null;
};

export type UiCopy = {
  next: string;
  clearSelection: string;
  settings: string;
  male: string;
  female: string;
  preset: string;
  hairColor: string;
  beardColor?: string;
  eyebrowColor?: string;
  lipColor?: string;
  texture: string;
  textureUploadTitle: string;
  textureUploadHint: string;
  texturePickFile: string;
  textureRemove: string;
  textureEditMode: string;
  textureScale: string;
  textureRotation: string;
  textureModeDecal: string;
  textureModeReplace: string;
  uploadDecal: string;
  uploadTexture: string;
  removeDecal: string;
  removeTexture: string;
  notLoaded: string;
  paintPanel: string;
  textureScaleX: string;
  textureScaleY: string;
  replaceHint: string;
  avatarStatic: string;
  uvEditorTitle: string;
  uvEditorHint: string;
  uvApply: string;
  uvReset: string;
  uvUndoLabel: string;
  uvClearApplied: string;
  uvTarget: string;
  uvEmpty: string;
  uvZoomInLabel: string;
  uvZoomOutLabel: string;
  uvResetViewLabel: string;
  uvMoveLeftLabel: string;
  uvMoveRightLabel: string;
  uvMoveUpLabel: string;
  uvMoveDownLabel: string;
  exportPreviewTitle: string;
  exportPreviewHint: string;
  exportDownload: string;
  exportClose: string;
  exportLinkLabel: string;
  exportBusy: string;
};

export const groups = assetSchema.groups as GroupSchema[];
export const allTypes = assetSchema.types as { id: SupportedType; label: string }[];
export const datasetAssets = assetDataset.assets as AssetRecord[];
export const localAssetCapabilities =
  localAssetCapabilitiesManifest as LocalAssetCapabilitiesManifest;
export const localLibrary = localLibraryManifest as LocalLibraryManifest;

export const RPM_API_BASE = "https://api.readyplayer.me";
export const RPM_APP_NAME =
  (assetDataset as { source?: { subdomain?: string } }).source?.subdomain || "demo";

export const TYPE_TO_AVATAR_ASSET_KEY: Partial<Record<SupportedType, string>> = {
  top: "top",
  bottom: "bottom",
  footwear: "footwear",
  outfit: "outfit",
  hair: "hairStyle",
  eye: "eyeColor",
  eyeshape: "eyeStyle",
  eyebrows: "eyebrowStyle",
  faceshape: "faceShape",
  noseshape: "noseShape",
  lipshape: "lipShape",
  glasses: "glasses",
  headwear: "headwear",
  beard: "beardStyle",
  facewear: "facewear",
  facemask: "faceMask",
};

export const TYPE_LABELS: Record<UiLocale, Record<SupportedType, string>> = {
  ru: {
    top: "Верх",
    bottom: "Низ",
    footwear: "Обувь",
    outfit: "Образы",
    hair: "Волосы",
    eye: "Глаза",
    eyeshape: "Форма глаз",
    eyebrows: "Брови",
    faceshape: "Форма головы",
    noseshape: "Форма носа",
    lipshape: "Форма губ",
    glasses: "Очки",
    headwear: "Головные",
    beard: "Борода",
    facewear: "Маски",
    facemask: "Грим",
  },
  en: {
    top: "Tops",
    bottom: "Bottoms",
    footwear: "Footwear",
    outfit: "Outfits",
    hair: "Hair",
    eye: "Eyes",
    eyeshape: "Eye shape",
    eyebrows: "Eyebrows",
    faceshape: "Head shape",
    noseshape: "Nose shape",
    lipshape: "Lip shape",
    glasses: "Glasses",
    headwear: "Headwear",
    beard: "Beard",
    facewear: "Facewear",
    facemask: "Face paint",
  },
};

export const UI_TEXT: Record<UiLocale, UiCopy> = {
  ru: {
    next: "ДАЛЕЕ",
    clearSelection: "Снять",
    settings: "Настройки",
    male: "Муж",
    female: "Жен",
    preset: "База",
    hairColor: "Цвет волос",
    beardColor: "Цвет бороды",
    eyebrowColor: "Цвет бровей",
    lipColor: "Цвет губ",
    texture: "◈",
    textureUploadTitle: "Своя текстура",
    textureUploadHint: "Загрузите PNG и двигайте по поверхности аватара",
    texturePickFile: "Выбрать PNG",
    textureRemove: "Убрать",
    textureEditMode: "Двигать по модели",
    textureScale: "Размер",
    textureRotation: "Поворот",
    textureModeDecal: "Декаль",
    textureModeReplace: "Текстура",
    uploadDecal: "Загрузить декаль",
    uploadTexture: "Загрузить текстуру",
    removeDecal: "Удалить декаль",
    removeTexture: "Удалить текстуру",
    notLoaded: "Не загружено",
    paintPanel: "Панель наложения",
    textureScaleX: "Scale X",
    textureScaleY: "Scale Y",
    replaceHint: "Для замены выберите: Верх / Низ / Обувь / Образы / Головные / Маски",
    avatarStatic: "Неподвижный аватар",
    uvEditorTitle: "UV-декаль",
    uvEditorHint: "Двигайте декаль по UV-канве и нажмите применить",
    uvApply: "Применить на аватар",
    uvReset: "Сбросить",
    uvUndoLabel: "Отменить",
    uvClearApplied: "Очистить с аватара",
    uvTarget: "Слот UV",
    uvEmpty: "Для этого типа UV-редактор недоступен",
    uvZoomInLabel: "Приблизить UV",
    uvZoomOutLabel: "Отдалить UV",
    uvResetViewLabel: "Сбросить вид UV",
    uvMoveLeftLabel: "Сдвинуть декаль влево",
    uvMoveRightLabel: "Сдвинуть декаль вправо",
    uvMoveUpLabel: "Сдвинуть декаль вверх",
    uvMoveDownLabel: "Сдвинуть декаль вниз",
    exportPreviewTitle: "Экспорт аватара",
    exportPreviewHint: "Локальный предпросмотр и скачивание текущего .glb",
    exportDownload: "Скачать .glb",
    exportClose: "Закрыть",
    exportLinkLabel: "Локальный файл .glb:",
    exportBusy: "Подготавливаю .glb...",
  },
  en: {
    next: "NEXT",
    clearSelection: "Clear",
    settings: "Settings",
    male: "Male",
    female: "Female",
    preset: "Base",
    hairColor: "Hair color",
    beardColor: "Beard color",
    eyebrowColor: "Eyebrow color",
    lipColor: "Lip color",
    texture: "◈",
    textureUploadTitle: "Custom texture",
    textureUploadHint: "Upload PNG and drag it across avatar surface",
    texturePickFile: "Choose PNG",
    textureRemove: "Remove",
    textureEditMode: "Move on model",
    textureScale: "Scale",
    textureRotation: "Rotation",
    textureModeDecal: "Decal",
    textureModeReplace: "Texture",
    uploadDecal: "Upload decal",
    uploadTexture: "Upload texture",
    removeDecal: "Remove decal",
    removeTexture: "Remove texture",
    notLoaded: "Not loaded",
    paintPanel: "Overlay panel",
    textureScaleX: "Scale X",
    textureScaleY: "Scale Y",
    replaceHint: "Choose Tops / Bottoms / Footwear / Outfits / Headwear / Facewear",
    avatarStatic: "Static avatar",
    uvEditorTitle: "UV decal",
    uvEditorHint: "Move the decal on the UV canvas and apply it to the avatar",
    uvApply: "Apply to avatar",
    uvReset: "Reset",
    uvUndoLabel: "Undo",
    uvClearApplied: "Clear from avatar",
    uvTarget: "UV slot",
    uvEmpty: "UV editor is not available for this type",
    uvZoomInLabel: "Zoom in UV",
    uvZoomOutLabel: "Zoom out UV",
    uvResetViewLabel: "Reset UV view",
    uvMoveLeftLabel: "Move decal left",
    uvMoveRightLabel: "Move decal right",
    uvMoveUpLabel: "Move decal up",
    uvMoveDownLabel: "Move decal down",
    exportPreviewTitle: "Avatar export",
    exportPreviewHint: "Local preview and download for current .glb",
    exportDownload: "Download .glb",
    exportClose: "Close",
    exportLinkLabel: "Local .glb file:",
    exportBusy: "Preparing .glb...",
  },
};

export const POSITION_OFFSET: [number, number, number] = [0, -1.06, 0];
export const IDLE_ANIMATION_URL: Record<UiGender, string> = {
  male: "/local-assets/animations/male-idle-animation.glb",
  female: "/local-assets/animations/female-idle-animation.glb",
};

export const HAIR_COLOR_SWATCHES = [
  "#151515",
  "#242424",
  "#2d1f1a",
  "#3b2a1f",
  "#473225",
  "#5b3b29",
  "#6c4430",
  "#7a4c30",
  "#885437",
  "#965733",
  "#a76337",
  "#b86b3b",
  "#c97a3c",
  "#d1863f",
  "#df994a",
  "#ebb04f",
  "#f1c261",
  "#f3d06f",
  "#e9a95d",
  "#de8e4e",
  "#d8733f",
  "#d34134",
  "#cf3b51",
  "#b93a67",
  "#9d3d7b",
  "#7f4a8f",
  "#5e4d9f",
  "#4155ae",
  "#2e659f",
  "#1f7389",
  "#2c816f",
  "#4d8a55",
  "#739246",
  "#9a8c40",
  "#b3823f",
  "#c4572e",
  "#a83d24",
  "#a48f66",
  "#b09b77",
  "#c2b289",
  "#8d7964",
  "#735f50",
  "#5f4a41",
  "#8b8b8b",
  "#8f9394",
  "#acb0b2",
  "#c7cacb",
  "#dddddd",
  "#f2f2f2",
] as const;

export const FACIAL_FEATURE_TYPES: SupportedType[] = [
  "faceshape",
  "eyeshape",
  "eyebrows",
  "noseshape",
  "lipshape",
];

export const getAppliedUvDecalsForMesh = (
  appliedUvDecals: readonly AppliedUvDecal[],
  meshName: string
) => {
  const targetSlot = getCanonicalMeshSlot(meshName) || meshName;
  return appliedUvDecals.filter((entry) => (getCanonicalMeshSlot(entry.meshName) || entry.meshName) === targetSlot);
};

export const makeClientId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const makeLookupKey = (type: string, id: string) => `${type}:${id}`;
