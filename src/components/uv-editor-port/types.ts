import type {
  DecalProjectionBasis,
  TextDecalStyle,
  UvLayerBlendMode,
} from "../avatar/shared";

export type UvPortTool = "transform" | "crop" | "brush" | "eraser" | "eyedropper" | "fill";

export type UvPortPaintTarget = "image" | "mask";

export type UvPortCropShape = "rect" | "circle";

export type UvPortMode = "decal" | "texture";

export type UvPortLayerKind = "uv-layout" | "base" | "decal" | "draft";

export type UvPortLayer = {
  id: string;
  assetId?: string | null;
  textStyle?: TextDecalStyle | null;
  projection?: DecalProjectionBasis | null;
  kind: UvPortLayerKind;
  name: string;
  meshName: string | null;
  textureUrl: string | null;
  uv: [number, number] | null;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  blendMode: UvLayerBlendMode;
  opacity: number;
  visible: boolean;
  locked: boolean;
};

export type UvPortMeshDocument = {
  meshName: string | null;
  selectedLayerId: string | null;
  activeTool: UvPortTool;
  paintTarget: UvPortPaintTarget;
  cropShape: UvPortCropShape;
  layers: UvPortLayer[];
  plannedFeatures: string[];
};

export type UvPortToolbarControls = {
  mode: UvPortMode;
  onSwitchMode?: (mode: UvPortMode) => void;
  onUpload?: () => void;
  onRemove?: () => void;
  hasAsset: boolean;
  fileLabel: string;
  labels: {
    decal: string;
    texture: string;
    upload: string;
    remove: string;
    file: string;
  };
};
