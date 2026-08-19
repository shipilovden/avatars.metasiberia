import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  createGeneratedDesignAsset,
  DESIGN_STYLE_PRESETS,
  DEFAULT_DESIGN_PATTERN_CONTROLS,
  DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS,
  DESIGN_GRADIENT_PRESETS,
  DESIGN_PATTERN_PRESETS,
  DESIGN_SHAPE_PRESETS,
  applyDesignStylePreset,
  getMatchingDesignStylePresetId,
  serializeDesignLayerStyle,
} from "./design-presets";
import type {
  DesignFillMode,
  DesignGradientPreset,
  DesignPatternControls,
  DesignPatternPreset,
  DesignShapePreset,
  DesignStylePreset,
  DesignTextureContentBounds,
  DesignLayerStyle,
} from "./design-presets";
import { NumericSliderControl } from "./NumericSliderControl";
import {
  applyDesignPrintModePreset,
  sanitizePrintModeId,
} from "./print-mode-presets";
import type { PrintModeId } from "./print-mode-presets";
import {
  DEFAULT_PRINT_TEXTURE_STYLE,
  sanitizePrintTextureStyle,
} from "./print-texture";
import type { PrintTextureStyle } from "./print-texture";

type DesignLayerPanelLocale = {
  designTitle: string;
  designStylePresets: string;
  designStyleSport: string;
  designStyleCyber: string;
  designStyleVintage: string;
  designStyleGrunge: string;
  designStyleLuxury: string;
  designStyleCustom: string;
  designPrintMode: string;
  designPrintModeCustom: string;
  designPrintModePatch: string;
  designPrintModeVintage: string;
  designPrintModeNeon: string;
  designPrintModeSilkscreen: string;
  designPrintModeEmbroidery: string;
  designFill: string;
  designSolid: string;
  designPattern: string;
  designTexture: string;
  designGradient: string;
  designShape: string;
  designColor: string;
  designStroke: string;
  designStrokeColor: string;
  designStrokeWidth: string;
  designShadow: string;
  designShadowColor: string;
  designShadowOpacity: string;
  designShadowBlur: string;
  designShadowOffsetX: string;
  designShadowOffsetY: string;
  designPrintTexture: string;
  designPrintTextureAmount: string;
  designPrintTextureGrain: string;
  designPrintTextureDistress: string;
  designPrintTextureFade: string;
  designPrintTextureFabric: string;
  designPatternPreset: string;
  designTextureUpload: string;
  designTextureReplace: string;
  designTextureMissing: string;
  designTextureAutoCenter: string;
  designGradientPreset: string;
  designPatternScale: string;
  designPatternOffsetX: string;
  designPatternOffsetY: string;
  designPatternRotation: string;
  designPatternRepeatX: string;
  designPatternRepeatY: string;
  designPatternMirrorRepeat: string;
  designAddLayer: string;
  designFillHint: string;
  designColorHint: string;
  designStyleHint: string;
  designPrintModeHint: string;
  designStrokeColorHint: string;
  designStrokeWidthHint: string;
  designShadowColorHint: string;
  designShadowOpacityHint: string;
  designShadowBlurHint: string;
  designShadowOffsetXHint: string;
  designShadowOffsetYHint: string;
  designPrintTextureHint: string;
  designPrintTextureAmountHint: string;
  designPrintTextureGrainHint: string;
  designPrintTextureDistressHint: string;
  designPrintTextureFadeHint: string;
  designPrintTextureFabricHint: string;
  designPatternHint: string;
  designTextureHint: string;
  designTextureUploadHint: string;
  designTextureAutoCenterHint: string;
  designGradientHint: string;
  designShapeHint: string;
  designPatternScaleHint: string;
  designPatternOffsetXHint: string;
  designPatternOffsetYHint: string;
  designPatternRotationHint: string;
  designPatternRepeatXHint: string;
  designPatternRepeatYHint: string;
  designPatternMirrorRepeatHint: string;
  designAddHint: string;
};

type DesignLayerPanelProps = {
  locale: DesignLayerPanelLocale;
  brushColor: string;
  selectedStyleId?: string | null;
  selectedStyle?: DesignLayerStyle | null;
  canAdd: boolean;
  onBrushColorChange: (value: string) => void;
  onAdd: (style: DesignLayerStyle) => void;
  onPreviewChange?: (style: DesignLayerStyle) => void;
};

type DesignPreviewPreset = {
  id: string;
  name: string;
  previewSrc: string;
};

type CompactPresetPickerProps = {
  label: string;
  tooltip: string;
  presets: readonly DesignPreviewPreset[];
  activePreset: DesignPreviewPreset;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
};

const hasDefaultTextureContentBounds = (value: DesignTextureContentBounds) =>
  Math.abs(value.left - DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS.left) < 0.0001 &&
  Math.abs(value.top - DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS.top) < 0.0001 &&
  Math.abs(value.width - DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS.width) < 0.0001 &&
  Math.abs(value.height - DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS.height) < 0.0001;

const analyzeTextureContentBounds = (
  image: HTMLImageElement,
  width: number,
  height: number
): DesignTextureContentBounds => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { ...DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS };
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha < 8) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { ...DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS };
  }

  return {
    left: minX / width,
    top: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };
};

const readTextureFile = (file: File) =>
  new Promise<{
    dataUrl: string;
    width: number;
    height: number;
    fileName: string;
    contentBounds: DesignTextureContentBounds;
  }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("texture-read-failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("texture-empty-result"));
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("texture-image-invalid"));
      image.onload = () => {
        resolve({
          dataUrl: result,
          width: image.naturalWidth || 1024,
          height: image.naturalHeight || 1024,
          fileName: file.name,
          contentBounds: analyzeTextureContentBounds(
            image,
            image.naturalWidth || 1024,
            image.naturalHeight || 1024
          ),
        });
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  });

function DesignPresetInlineSwatch({ src }: { src: string }) {
  return (
    <div className="uv-editor__design-swatch" aria-hidden="true">
      <img src={src} alt="" />
    </div>
  );
}

function CompactPresetPicker({
  label,
  tooltip,
  presets,
  activePreset,
  isOpen,
  onToggle,
  onClose,
  onSelect,
}: CompactPresetPickerProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    selectedOptionRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [activePreset.id, isOpen]);

  return (
    <div className="uv-editor__control-group">
      <div className="uv-editor__control-label">{label}</div>
      <div className="uv-editor__preset-picker" ref={pickerRef}>
        <button
          type="button"
          className={`uv-editor__preset-trigger${isOpen ? " uv-editor__preset-trigger--open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          title={tooltip}
          aria-label={tooltip}
          onClick={onToggle}
        >
          <DesignPresetInlineSwatch src={activePreset.previewSrc} />
          <span className="uv-editor__preset-trigger-copy">
            <span className="uv-editor__preset-trigger-title">{activePreset.name}</span>
          </span>
          <span
            className={`uv-editor__preset-trigger-icon${isOpen ? " uv-editor__preset-trigger-icon--open" : ""}`}
            aria-hidden="true"
          >
            {"\u25BE"}
          </span>
        </button>

        {isOpen ? (
          <div className="uv-editor__preset-menu" role="listbox" aria-label={label}>
            {presets.map((preset) => {
              const isSelected = preset.id === activePreset.id;
              return (
                <button
                  key={preset.id}
                  ref={isSelected ? selectedOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`uv-editor__preset-option${isSelected ? " uv-editor__preset-option--active" : ""}`}
                  title={tooltip}
                  aria-label={`${label}: ${preset.name}`}
                  onClick={() => {
                    onSelect(preset.id);
                    onClose();
                  }}
                >
                  <DesignPresetInlineSwatch src={preset.previewSrc} />
                  <span className="uv-editor__preset-option-copy">
                    <span className="uv-editor__preset-option-title">{preset.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const getStylePresetLabel = (
  locale: DesignLayerPanelLocale,
  presetId: string,
  fallbackName: string
) => {
  switch (presetId) {
    case "sport":
      return locale.designStyleSport;
    case "cyber":
      return locale.designStyleCyber;
    case "vintage":
      return locale.designStyleVintage;
    case "grunge":
      return locale.designStyleGrunge;
    case "luxury":
      return locale.designStyleLuxury;
    default:
      return fallbackName;
  }
};

export function DesignLayerPanel({
  locale,
  brushColor,
  selectedStyleId,
  selectedStyle,
  canAdd,
  onBrushColorChange,
  onAdd,
  onPreviewChange,
}: DesignLayerPanelProps) {
  const isSyncingSelectedStyleRef = useRef(false);
  const syncedSelectedStyleIdRef = useRef<string | null>(null);
  const textureUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [fillMode, setFillMode] = useState<DesignFillMode>("solid");
  const [solidColor, setSolidColor] = useState(brushColor);
  const [strokeColor, setStrokeColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [printModeId, setPrintModeId] = useState<PrintModeId | null>(null);
  const [shadowColor, setShadowColor] = useState("#0f1720");
  const [shadowOpacity, setShadowOpacity] = useState(0.22);
  const [shadowBlur, setShadowBlur] = useState(3.4);
  const [shadowOffsetX, setShadowOffsetX] = useState(0);
  const [shadowOffsetY, setShadowOffsetY] = useState(2.4);
  const [textureDataUrl, setTextureDataUrl] = useState("");
  const [textureFileName, setTextureFileName] = useState("");
  const [textureWidth, setTextureWidth] = useState(1024);
  const [textureHeight, setTextureHeight] = useState(1024);
  const [textureAutoCenter, setTextureAutoCenter] = useState(false);
  const [textureContentBounds, setTextureContentBounds] = useState<DesignTextureContentBounds>(
    () => ({ ...DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS })
  );
  const [printTexture, setPrintTexture] = useState<PrintTextureStyle>(() => ({
    ...DEFAULT_PRINT_TEXTURE_STYLE,
  }));
  const [shapePresetId, setShapePresetId] = useState(DESIGN_SHAPE_PRESETS[0]?.id || "badge");
  const [patternPresetId, setPatternPresetId] = useState(DESIGN_PATTERN_PRESETS[0]?.id || "checker");
  const [gradientPresetId, setGradientPresetId] = useState(DESIGN_GRADIENT_PRESETS[0]?.id || "sunset");
  const [openPicker, setOpenPicker] = useState<"style" | "shape" | "pattern" | "gradient" | null>(null);
  const [patternControls, setPatternControls] = useState<DesignPatternControls>(() => ({
    ...DEFAULT_DESIGN_PATTERN_CONTROLS,
  }));

  const activeShapePreset = useMemo<DesignShapePreset>(
    () => DESIGN_SHAPE_PRESETS.find((preset) => preset.id === shapePresetId) || DESIGN_SHAPE_PRESETS[0]!,
    [shapePresetId]
  );
  const activePatternPreset = useMemo<DesignPatternPreset>(
    () => DESIGN_PATTERN_PRESETS.find((preset) => preset.id === patternPresetId) || DESIGN_PATTERN_PRESETS[0]!,
    [patternPresetId]
  );
  const activeGradientPreset = useMemo<DesignGradientPreset>(
    () => DESIGN_GRADIENT_PRESETS.find((preset) => preset.id === gradientPresetId) || DESIGN_GRADIENT_PRESETS[0]!,
    [gradientPresetId]
  );
  const localizedStylePresets = useMemo<DesignPreviewPreset[]>(
    () =>
      DESIGN_STYLE_PRESETS.map((preset) => ({
        id: preset.id,
        name: getStylePresetLabel(locale, preset.id, preset.name),
        previewSrc: preset.previewSrc,
      })),
    [
      locale.designStyleCyber,
      locale.designStyleGrunge,
      locale.designStyleLuxury,
      locale.designStyleSport,
      locale.designStyleVintage,
    ]
  );
  const currentStyle = useMemo<DesignLayerStyle>(
    () => ({
      fillMode,
      solidColor,
      strokeColor,
      strokeWidth,
      printModeId,
      shadowColor,
      shadowOpacity,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      textureDataUrl,
      textureFileName,
      textureWidth,
      textureHeight,
      textureAutoCenter,
      textureContentBounds,
      printTexture,
      shapePresetId,
      patternPresetId,
      gradientPresetId,
      patternControls: { ...patternControls },
    }),
    [
      fillMode,
      printModeId,
      gradientPresetId,
      patternControls,
      patternPresetId,
      shapePresetId,
      solidColor,
      strokeColor,
      strokeWidth,
      shadowColor,
      shadowOpacity,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      textureDataUrl,
      textureFileName,
      textureHeight,
      textureAutoCenter,
      textureContentBounds,
      textureWidth,
      printTexture,
    ]
  );
  const selectedStyleSignature = useMemo(
    () => serializeDesignLayerStyle(selectedStyle),
    [selectedStyle]
  );
  const currentStyleSignature = useMemo(
    () => serializeDesignLayerStyle(currentStyle),
    [currentStyle]
  );
  const activeStylePresetId = useMemo(() => getMatchingDesignStylePresetId(currentStyle), [currentStyle]);
  const activeStylePreset = useMemo<DesignPreviewPreset>(() => {
    const matchedPreset = localizedStylePresets.find((preset) => preset.id === activeStylePresetId);
    if (matchedPreset) {
      return matchedPreset;
    }

    const generated = createGeneratedDesignAsset({
      style: currentStyle,
      isRussian: false,
    });

    return {
      id: "custom-style",
      name: locale.designStyleCustom,
      previewSrc: generated.textureUrl,
    };
  }, [activeStylePresetId, currentStyle, locale.designStyleCustom, localizedStylePresets]);
  const updatePatternControls = (patch: Partial<DesignPatternControls>) =>
    setPatternControls((current) => ({
      ...current,
      ...patch,
    }));
  const markPrintModeCustom = () => setPrintModeId(null);
  const updatePrintTexture = (patch: Partial<PrintTextureStyle>) => {
    markPrintModeCustom();
    setPrintTexture((current) => sanitizePrintTextureStyle({ ...current, ...patch }));
  };
  const designPrintModeOptions = [
    { value: "custom", label: locale.designPrintModeCustom },
    { value: "patch", label: locale.designPrintModePatch },
    { value: "vintage", label: locale.designPrintModeVintage },
    { value: "neon", label: locale.designPrintModeNeon },
    { value: "silkscreen", label: locale.designPrintModeSilkscreen },
    { value: "embroidery", label: locale.designPrintModeEmbroidery },
  ] as const;
  const hasTextureSource = Boolean(textureDataUrl);
  const usesTiledFillControls = fillMode === "pattern" || fillMode === "texture";
  const isTextureAutoCenterLocked = fillMode === "texture" && textureAutoCenter;
  const canSubmitDesign = canAdd && (fillMode !== "texture" || hasTextureSource);
  const hasPendingTextureUpload = Boolean(
    selectedStyle &&
      fillMode === "texture" &&
      hasTextureSource &&
      (selectedStyle.fillMode !== "texture" ||
        (selectedStyle.textureDataUrl || "") !== textureDataUrl ||
        (selectedStyle.textureFileName || "") !== textureFileName ||
        (selectedStyle.textureWidth || 1024) !== textureWidth ||
        (selectedStyle.textureHeight || 1024) !== textureHeight)
  );

  const applyStylePresetToPanel = (preset: DesignStylePreset) => {
    const nextStyle = applyDesignStylePreset(currentStyle, preset);
    setFillMode(nextStyle.fillMode);
    setSolidColor(nextStyle.solidColor);
    setStrokeColor(nextStyle.strokeColor);
    setStrokeWidth(nextStyle.strokeWidth);
    setPrintModeId(null);
    setShadowColor(nextStyle.shadowColor);
    setShadowOpacity(nextStyle.shadowOpacity);
    setShadowBlur(nextStyle.shadowBlur);
    setShadowOffsetX(nextStyle.shadowOffsetX);
    setShadowOffsetY(nextStyle.shadowOffsetY);
    setPrintTexture(sanitizePrintTextureStyle(nextStyle.printTexture));
    setPatternPresetId(nextStyle.patternPresetId);
    setGradientPresetId(nextStyle.gradientPresetId);
    setPatternControls({
      ...DEFAULT_DESIGN_PATTERN_CONTROLS,
      ...nextStyle.patternControls,
    });
    setOpenPicker(null);
    onBrushColorChange(nextStyle.solidColor);
  };

  const applyPrintModePresetToPanel = (nextPrintModeId: PrintModeId) => {
    const nextStyle = applyDesignPrintModePreset(currentStyle, nextPrintModeId);
    setStrokeColor(nextStyle.strokeColor);
    setStrokeWidth(nextStyle.strokeWidth);
    setShadowColor(nextStyle.shadowColor);
    setShadowOpacity(nextStyle.shadowOpacity);
    setShadowBlur(nextStyle.shadowBlur);
    setShadowOffsetX(nextStyle.shadowOffsetX);
    setShadowOffsetY(nextStyle.shadowOffsetY);
    setPrintTexture(sanitizePrintTextureStyle(nextStyle.printTexture));
    setPrintModeId(nextPrintModeId);
  };

  const handleTextureFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const texture = await readTextureFile(file);
      setTextureDataUrl(texture.dataUrl);
      setTextureFileName(texture.fileName);
      setTextureWidth(texture.width);
      setTextureHeight(texture.height);
      setTextureContentBounds(texture.contentBounds);
    } catch {
      // Ignore invalid uploads and keep the previous texture unchanged.
    }
  };

  useEffect(() => {
    if (!selectedStyle || !selectedStyleId) {
      isSyncingSelectedStyleRef.current = false;
      syncedSelectedStyleIdRef.current = selectedStyleId || null;
      return;
    }

    if (syncedSelectedStyleIdRef.current === selectedStyleId) {
      return;
    }

    syncedSelectedStyleIdRef.current = selectedStyleId;
    isSyncingSelectedStyleRef.current = true;
    setFillMode(selectedStyle.fillMode);
    setSolidColor(selectedStyle.solidColor);
    setStrokeColor(selectedStyle.strokeColor || "#ffffff");
    setStrokeWidth(typeof selectedStyle.strokeWidth === "number" ? selectedStyle.strokeWidth : 0);
    setPrintModeId(sanitizePrintModeId(selectedStyle.printModeId));
    setShadowColor(selectedStyle.shadowColor || "#0f1720");
    setShadowOpacity(typeof selectedStyle.shadowOpacity === "number" ? selectedStyle.shadowOpacity : 0.22);
    setShadowBlur(typeof selectedStyle.shadowBlur === "number" ? selectedStyle.shadowBlur : 3.4);
    setShadowOffsetX(typeof selectedStyle.shadowOffsetX === "number" ? selectedStyle.shadowOffsetX : 0);
    setShadowOffsetY(typeof selectedStyle.shadowOffsetY === "number" ? selectedStyle.shadowOffsetY : 2.4);
    setTextureDataUrl(selectedStyle.textureDataUrl || "");
    setTextureFileName(selectedStyle.textureFileName || "");
    setTextureWidth(typeof selectedStyle.textureWidth === "number" ? selectedStyle.textureWidth : 1024);
    setTextureHeight(typeof selectedStyle.textureHeight === "number" ? selectedStyle.textureHeight : 1024);
    setTextureAutoCenter(Boolean(selectedStyle.textureAutoCenter));
    setTextureContentBounds(selectedStyle.textureContentBounds || { ...DEFAULT_DESIGN_TEXTURE_CONTENT_BOUNDS });
    setPrintTexture(sanitizePrintTextureStyle(selectedStyle.printTexture));
    setShapePresetId(selectedStyle.shapePresetId);
    setPatternPresetId(selectedStyle.patternPresetId);
    setGradientPresetId(selectedStyle.gradientPresetId);
    setPatternControls({
      ...DEFAULT_DESIGN_PATTERN_CONTROLS,
      ...selectedStyle.patternControls,
    });
  }, [selectedStyleId, selectedStyle]);

  useEffect(() => {
    if (!selectedStyle) {
      isSyncingSelectedStyleRef.current = false;
      return;
    }

    if (currentStyleSignature === selectedStyleSignature) {
      isSyncingSelectedStyleRef.current = false;
    }
  }, [currentStyleSignature, selectedStyle, selectedStyleSignature]);

  useEffect(() => {
    if (selectedStyle) {
      return;
    }
    setSolidColor(brushColor);
  }, [brushColor, selectedStyle]);

  useEffect(() => {
    if (!textureDataUrl || !hasDefaultTextureContentBounds(textureContentBounds)) {
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onerror = () => undefined;
    image.onload = () => {
      if (cancelled) {
        return;
      }
      setTextureContentBounds(
        analyzeTextureContentBounds(image, image.naturalWidth || textureWidth, image.naturalHeight || textureHeight)
      );
    };
    image.src = textureDataUrl;

    return () => {
      cancelled = true;
    };
  }, [textureContentBounds, textureDataUrl, textureHeight, textureWidth]);

  useEffect(() => {
    if (!selectedStyle || !onPreviewChange) {
      return;
    }
    if (isSyncingSelectedStyleRef.current) {
      return;
    }
    if (fillMode === "texture" && !hasTextureSource) {
      return;
    }
    if (hasPendingTextureUpload) {
      return;
    }
    if (currentStyleSignature === selectedStyleSignature) {
      return;
    }
    onPreviewChange(currentStyle);
  }, [
    currentStyle,
    currentStyleSignature,
    fillMode,
    hasTextureSource,
    hasPendingTextureUpload,
    onPreviewChange,
    selectedStyle,
    selectedStyleSignature,
  ]);

  const handleAdd = () => {
    if (!activeShapePreset || !activePatternPreset || !activeGradientPreset || !canSubmitDesign) {
      return;
    }

    onAdd(currentStyle);
  };

  return (
    <div className="uv-editor__control-panel uv-editor__control-panel--design">
      <div className="uv-editor__control-group">
        <div className="uv-editor__control-label">{locale.designFill}</div>
        <div className="uv-editor__chip-row">
          {([
            ["solid", locale.designSolid],
            ["pattern", locale.designPattern],
            ["texture", locale.designTexture],
            ["gradient", locale.designGradient],
          ] as [DesignFillMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`uv-editor__tool uv-editor__tool--secondary${fillMode === mode ? " uv-editor__tool--active" : ""}`}
              title={locale.designFillHint}
              aria-label={locale.designFillHint}
              onClick={() => {
                setFillMode(mode);
                setOpenPicker(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CompactPresetPicker
        label={locale.designStylePresets}
        tooltip={locale.designStyleHint}
        presets={localizedStylePresets}
        activePreset={activeStylePreset}
        isOpen={openPicker === "style"}
        onToggle={() => setOpenPicker((current) => (current === "style" ? null : "style"))}
        onClose={() => setOpenPicker((current) => (current === "style" ? null : current))}
        onSelect={(id) => {
          const preset = DESIGN_STYLE_PRESETS.find((entry) => entry.id === id);
          if (preset) {
            applyStylePresetToPanel(preset);
          }
        }}
      />

      <div className="uv-editor__control-group">
        <div className="uv-editor__control-label">{locale.designPrintMode}</div>
        <select
          className="uv-editor__text-select"
          value={printModeId || "custom"}
          title={locale.designPrintModeHint}
          aria-label={locale.designPrintModeHint}
          onChange={(event) => {
            const nextValue = sanitizePrintModeId(event.target.value);
            if (!nextValue) {
              setPrintModeId(null);
              return;
            }
            applyPrintModePresetToPanel(nextValue);
          }}
        >
          {designPrintModeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <CompactPresetPicker
        label={locale.designShape}
        tooltip={locale.designShapeHint}
        presets={DESIGN_SHAPE_PRESETS}
        activePreset={activeShapePreset}
        isOpen={openPicker === "shape"}
        onToggle={() => setOpenPicker((current) => (current === "shape" ? null : "shape"))}
        onClose={() => setOpenPicker((current) => (current === "shape" ? null : current))}
        onSelect={setShapePresetId}
      />

      {fillMode === "solid" ? (
        <div className="uv-editor__control-group">
          <div className="uv-editor__control-label">{locale.designColor}</div>
          <div className="uv-editor__design-color-row">
            <input
              className="uv-editor__brush-color"
              type="color"
              value={solidColor}
              title={locale.designColorHint}
              aria-label={locale.designColorHint}
              onChange={(event) => {
                setSolidColor(event.target.value);
                onBrushColorChange(event.target.value);
              }}
            />
            <span className="uv-editor__value-chip uv-editor__design-color-chip">{solidColor.toUpperCase()}</span>
          </div>
        </div>
      ) : null}

      {fillMode === "pattern" ? (
        <>
          <CompactPresetPicker
            label={locale.designPatternPreset}
            tooltip={locale.designPatternHint}
            presets={DESIGN_PATTERN_PRESETS}
            activePreset={activePatternPreset}
            isOpen={openPicker === "pattern"}
            onToggle={() => setOpenPicker((current) => (current === "pattern" ? null : "pattern"))}
            onClose={() => setOpenPicker((current) => (current === "pattern" ? null : current))}
            onSelect={setPatternPresetId}
          />

        </>
      ) : null}

      {fillMode === "texture" ? (
        <div className="uv-editor__control-group">
          <div className="uv-editor__control-label">{locale.designTexture}</div>
          <div className="uv-editor__design-upload-row">
            <div className="uv-editor__design-upload-preview">
              <div className="uv-editor__design-swatch" aria-hidden="true">
                {hasTextureSource ? <img src={textureDataUrl} alt="" /> : null}
              </div>
              <span className="uv-editor__value-chip uv-editor__design-upload-name">
                {textureFileName || locale.designTextureMissing}
              </span>
            </div>
            <button
              type="button"
              className="uv-editor__tool uv-editor__tool--secondary"
              title={locale.designTextureUploadHint}
              aria-label={locale.designTextureUploadHint}
              onClick={() => textureUploadInputRef.current?.click()}
            >
              {hasTextureSource ? locale.designTextureReplace : locale.designTextureUpload}
            </button>
          </div>
          <input
            ref={textureUploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="texture-file-input"
            onChange={handleTextureFileChange}
          />
          <label className="sticker-check" title={locale.designTextureAutoCenterHint}>
            <input
              type="checkbox"
              checked={textureAutoCenter}
              onChange={(event) => setTextureAutoCenter(event.target.checked)}
            />
            <span>{locale.designTextureAutoCenter}</span>
          </label>
        </div>
      ) : null}

      {fillMode === "gradient" ? (
        <CompactPresetPicker
          label={locale.designGradientPreset}
          tooltip={locale.designGradientHint}
          presets={DESIGN_GRADIENT_PRESETS}
          activePreset={activeGradientPreset}
          isOpen={openPicker === "gradient"}
          onToggle={() => setOpenPicker((current) => (current === "gradient" ? null : "gradient"))}
          onClose={() => setOpenPicker((current) => (current === "gradient" ? null : current))}
          onSelect={setGradientPresetId}
        />
      ) : null}

      {usesTiledFillControls ? (
        <>
          <div className="uv-editor__design-grid">
            <NumericSliderControl
              label={locale.designPatternScale}
              tooltip={locale.designPatternScaleHint}
              sliderMin={25}
              sliderMax={400}
              sliderStep={5}
              sliderValue={Math.round(patternControls.scale * 100)}
              inputMin={25}
              inputMax={400}
              inputStep={5}
              inputValue={patternControls.scale * 100}
              inputSuffix="%"
              onSliderChange={(value) => updatePatternControls({ scale: value / 100 })}
              onInputChange={(value) => updatePatternControls({ scale: value / 100 })}
            />
            <NumericSliderControl
              label={locale.designPatternRotation}
              tooltip={locale.designPatternRotationHint}
              sliderMin={-180}
              sliderMax={180}
              sliderStep={1}
              sliderValue={Math.round(patternControls.rotationDeg)}
              inputMin={-180}
              inputMax={180}
              inputStep={1}
              inputValue={patternControls.rotationDeg}
              inputSuffix="°"
              disabled={isTextureAutoCenterLocked}
              onSliderChange={(value) => updatePatternControls({ rotationDeg: value })}
              onInputChange={(value) => updatePatternControls({ rotationDeg: value })}
            />
          </div>

          <div className="uv-editor__design-grid">
            <NumericSliderControl
              label={locale.designPatternOffsetX}
              tooltip={locale.designPatternOffsetXHint}
              sliderMin={-200}
              sliderMax={200}
              sliderStep={1}
              sliderValue={Math.round(patternControls.offsetX)}
              inputMin={-200}
              inputMax={200}
              inputStep={1}
              inputValue={patternControls.offsetX}
              inputSuffix="%"
              disabled={isTextureAutoCenterLocked}
              onSliderChange={(value) => updatePatternControls({ offsetX: value })}
              onInputChange={(value) => updatePatternControls({ offsetX: value })}
            />
            <NumericSliderControl
              label={locale.designPatternOffsetY}
              tooltip={locale.designPatternOffsetYHint}
              sliderMin={-200}
              sliderMax={200}
              sliderStep={1}
              sliderValue={Math.round(patternControls.offsetY)}
              inputMin={-200}
              inputMax={200}
              inputStep={1}
              inputValue={patternControls.offsetY}
              inputSuffix="%"
              disabled={isTextureAutoCenterLocked}
              onSliderChange={(value) => updatePatternControls({ offsetY: value })}
              onInputChange={(value) => updatePatternControls({ offsetY: value })}
            />
          </div>

          <div className="uv-editor__design-grid">
            <NumericSliderControl
              label={locale.designPatternRepeatX}
              tooltip={locale.designPatternRepeatXHint}
              sliderMin={25}
              sliderMax={400}
              sliderStep={5}
              sliderValue={Math.round(patternControls.repeatX * 100)}
              inputMin={0.25}
              inputMax={4}
              inputStep={0.05}
              inputValue={patternControls.repeatX}
              inputSuffix="x"
              disabled={isTextureAutoCenterLocked}
              onSliderChange={(value) => updatePatternControls({ repeatX: value / 100 })}
              onInputChange={(value) => updatePatternControls({ repeatX: value })}
            />
            <NumericSliderControl
              label={locale.designPatternRepeatY}
              tooltip={locale.designPatternRepeatYHint}
              sliderMin={25}
              sliderMax={400}
              sliderStep={5}
              sliderValue={Math.round(patternControls.repeatY * 100)}
              inputMin={0.25}
              inputMax={4}
              inputStep={0.05}
              inputValue={patternControls.repeatY}
              inputSuffix="x"
              disabled={isTextureAutoCenterLocked}
              onSliderChange={(value) => updatePatternControls({ repeatY: value / 100 })}
              onInputChange={(value) => updatePatternControls({ repeatY: value })}
            />
          </div>

          <div className="uv-editor__control-group">
            <div className="uv-editor__control-label">{locale.designPatternMirrorRepeat}</div>
            <div className="uv-editor__control-actions">
              <button
                type="button"
                className={`uv-editor__tool uv-editor__tool--secondary${
                  patternControls.mirrorRepeat ? " uv-editor__tool--active" : ""
                }`}
                title={locale.designPatternMirrorRepeatHint}
                aria-label={locale.designPatternMirrorRepeatHint}
                disabled={isTextureAutoCenterLocked}
                onClick={() =>
                  updatePatternControls({
                    mirrorRepeat: !patternControls.mirrorRepeat,
                  })
                }
              >
                {locale.designPatternMirrorRepeat}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="uv-editor__control-group">
        <div className="uv-editor__control-label">{locale.designStroke}</div>
        <div className="uv-editor__design-grid">
          <div className="uv-editor__control-group">
            <div className="uv-editor__control-label">{locale.designStrokeColor}</div>
            <div className="uv-editor__design-color-row">
              <input
                className="uv-editor__brush-color"
                type="color"
                value={strokeColor}
                title={locale.designStrokeColorHint}
                aria-label={locale.designStrokeColorHint}
                onChange={(event) => {
                  markPrintModeCustom();
                  setStrokeColor(event.target.value);
                }}
              />
              <span className="uv-editor__value-chip uv-editor__design-color-chip">{strokeColor.toUpperCase()}</span>
            </div>
          </div>

          <NumericSliderControl
            label={locale.designStrokeWidth}
            tooltip={locale.designStrokeWidthHint}
            sliderMin={0}
            sliderMax={6}
            sliderStep={0.1}
            sliderValue={strokeWidth}
            inputMin={0}
            inputMax={6}
            inputStep={0.1}
            inputValue={strokeWidth}
            onSliderChange={(value) => {
              markPrintModeCustom();
              setStrokeWidth(value);
            }}
            onInputChange={(value) => {
              markPrintModeCustom();
              setStrokeWidth(value);
            }}
          />
        </div>
      </div>

      <div className="uv-editor__control-group">
        <div className="uv-editor__control-label">{locale.designShadow}</div>
        <div className="uv-editor__shadow-grid">
          <div className="uv-editor__control-group">
            <div className="uv-editor__control-label">{locale.designShadowColor}</div>
            <div className="uv-editor__design-color-row uv-editor__design-color-row--compact">
              <input
                className="uv-editor__brush-color uv-editor__brush-color--compact"
                type="color"
                value={shadowColor}
                title={locale.designShadowColorHint}
                aria-label={locale.designShadowColorHint}
                onChange={(event) => {
                  markPrintModeCustom();
                  setShadowColor(event.target.value);
                }}
              />
              <span className="uv-editor__value-chip uv-editor__design-color-chip uv-editor__design-color-chip--compact">
                {shadowColor.toUpperCase()}
              </span>
            </div>
          </div>

          <NumericSliderControl
            label={locale.designShadowOpacity}
            tooltip={locale.designShadowOpacityHint}
            sliderMin={0}
            sliderMax={100}
            sliderStep={1}
            sliderValue={Math.round(shadowOpacity * 100)}
            inputMin={0}
            inputMax={100}
            inputStep={1}
            inputValue={shadowOpacity * 100}
            inputSuffix="%"
            onSliderChange={(value) => {
              markPrintModeCustom();
              setShadowOpacity(value / 100);
            }}
            onInputChange={(value) => {
              markPrintModeCustom();
              setShadowOpacity(value / 100);
            }}
          />
        </div>

        <NumericSliderControl
          label={locale.designShadowBlur}
          tooltip={locale.designShadowBlurHint}
          sliderMin={0}
          sliderMax={20}
          sliderStep={0.1}
          sliderValue={shadowBlur}
          inputMin={0}
          inputMax={20}
          inputStep={0.1}
          inputValue={shadowBlur}
          onSliderChange={(value) => {
            markPrintModeCustom();
            setShadowBlur(value);
          }}
          onInputChange={(value) => {
            markPrintModeCustom();
            setShadowBlur(value);
          }}
        />

        <div className="uv-editor__shadow-grid">
          <NumericSliderControl
            label={locale.designShadowOffsetX}
            tooltip={locale.designShadowOffsetXHint}
            sliderMin={-20}
            sliderMax={20}
            sliderStep={0.1}
            sliderValue={shadowOffsetX}
            inputMin={-20}
            inputMax={20}
            inputStep={0.1}
            inputValue={shadowOffsetX}
            onSliderChange={(value) => {
              markPrintModeCustom();
              setShadowOffsetX(value);
            }}
            onInputChange={(value) => {
              markPrintModeCustom();
              setShadowOffsetX(value);
            }}
          />
          <NumericSliderControl
            label={locale.designShadowOffsetY}
            tooltip={locale.designShadowOffsetYHint}
            sliderMin={-20}
            sliderMax={20}
            sliderStep={0.1}
            sliderValue={shadowOffsetY}
            inputMin={-20}
            inputMax={20}
            inputStep={0.1}
            inputValue={shadowOffsetY}
            onSliderChange={(value) => {
              markPrintModeCustom();
              setShadowOffsetY(value);
            }}
            onInputChange={(value) => {
              markPrintModeCustom();
              setShadowOffsetY(value);
            }}
          />
        </div>
      </div>

      <div className="uv-editor__control-group">
        <div className="uv-editor__control-label">{locale.designPrintTexture}</div>
        <NumericSliderControl
          label={locale.designPrintTextureAmount}
          tooltip={locale.designPrintTextureAmountHint}
          sliderMin={0}
          sliderMax={100}
          sliderStep={1}
          sliderValue={Math.round(printTexture.amount * 100)}
          inputMin={0}
          inputMax={100}
          inputStep={1}
          inputValue={printTexture.amount * 100}
          inputSuffix="%"
          onSliderChange={(value) => updatePrintTexture({ amount: value / 100 })}
          onInputChange={(value) => updatePrintTexture({ amount: value / 100 })}
        />

        <div className="uv-editor__shadow-grid">
          <NumericSliderControl
            label={locale.designPrintTextureGrain}
            tooltip={locale.designPrintTextureGrainHint}
            sliderMin={0}
            sliderMax={100}
            sliderStep={1}
            sliderValue={Math.round(printTexture.grain * 100)}
            inputMin={0}
            inputMax={100}
            inputStep={1}
            inputValue={printTexture.grain * 100}
            inputSuffix="%"
            onSliderChange={(value) => updatePrintTexture({ grain: value / 100 })}
            onInputChange={(value) => updatePrintTexture({ grain: value / 100 })}
          />
          <NumericSliderControl
            label={locale.designPrintTextureDistress}
            tooltip={locale.designPrintTextureDistressHint}
            sliderMin={0}
            sliderMax={100}
            sliderStep={1}
            sliderValue={Math.round(printTexture.distress * 100)}
            inputMin={0}
            inputMax={100}
            inputStep={1}
            inputValue={printTexture.distress * 100}
            inputSuffix="%"
            onSliderChange={(value) => updatePrintTexture({ distress: value / 100 })}
            onInputChange={(value) => updatePrintTexture({ distress: value / 100 })}
          />
        </div>

        <div className="uv-editor__shadow-grid">
          <NumericSliderControl
            label={locale.designPrintTextureFade}
            tooltip={locale.designPrintTextureFadeHint}
            sliderMin={0}
            sliderMax={100}
            sliderStep={1}
            sliderValue={Math.round(printTexture.fade * 100)}
            inputMin={0}
            inputMax={100}
            inputStep={1}
            inputValue={printTexture.fade * 100}
            inputSuffix="%"
            onSliderChange={(value) => updatePrintTexture({ fade: value / 100 })}
            onInputChange={(value) => updatePrintTexture({ fade: value / 100 })}
          />
          <NumericSliderControl
            label={locale.designPrintTextureFabric}
            tooltip={locale.designPrintTextureFabricHint}
            sliderMin={0}
            sliderMax={100}
            sliderStep={1}
            sliderValue={Math.round(printTexture.fabricNoise * 100)}
            inputMin={0}
            inputMax={100}
            inputStep={1}
            inputValue={printTexture.fabricNoise * 100}
            inputSuffix="%"
            onSliderChange={(value) => updatePrintTexture({ fabricNoise: value / 100 })}
            onInputChange={(value) => updatePrintTexture({ fabricNoise: value / 100 })}
          />
        </div>
      </div>

      <div className="uv-editor__control-actions">
        <button
          type="button"
          className="uv-editor__tool uv-editor__tool--secondary"
          title={locale.designAddHint}
          aria-label={locale.designAddHint}
          onClick={handleAdd}
          disabled={!canSubmitDesign}
        >
          {locale.designAddLayer}
        </button>
      </div>
    </div>
  );
}
