import { useEffect, useMemo, useRef, useState } from "react";
import {
  DESIGN_GRADIENT_PRESETS,
  DESIGN_PATTERN_PRESETS,
  DESIGN_SHAPE_PRESETS,
} from "./design-presets";
import type {
  DesignFillMode,
  DesignGradientPreset,
  DesignLayerRequest,
  DesignPatternPreset,
  DesignShapePreset,
} from "./design-presets";

type DesignLayerPanelLocale = {
  designTitle: string;
  designFill: string;
  designSolid: string;
  designPattern: string;
  designGradient: string;
  designShape: string;
  designColor: string;
  designPatternPreset: string;
  designGradientPreset: string;
  designAddLayer: string;
  designFillHint: string;
  designColorHint: string;
  designPatternHint: string;
  designGradientHint: string;
  designShapeHint: string;
  designAddHint: string;
};

type DesignLayerPanelProps = {
  locale: DesignLayerPanelLocale;
  brushColor: string;
  canAdd: boolean;
  onBrushColorChange: (value: string) => void;
  onAdd: (request: DesignLayerRequest) => void;
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

export function DesignLayerPanel({ locale, brushColor, canAdd, onBrushColorChange, onAdd }: DesignLayerPanelProps) {
  const [fillMode, setFillMode] = useState<DesignFillMode>("solid");
  const [shapePresetId, setShapePresetId] = useState(DESIGN_SHAPE_PRESETS[0]?.id || "badge");
  const [patternPresetId, setPatternPresetId] = useState(DESIGN_PATTERN_PRESETS[0]?.id || "checker");
  const [gradientPresetId, setGradientPresetId] = useState(DESIGN_GRADIENT_PRESETS[0]?.id || "sunset");
  const [openPicker, setOpenPicker] = useState<"shape" | "pattern" | "gradient" | null>(null);

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

  const handleAdd = () => {
    if (!activeShapePreset || !activePatternPreset || !activeGradientPreset) {
      return;
    }

    onAdd({
      fillMode,
      solidColor: brushColor,
      shapePreset: activeShapePreset,
      patternPreset: activePatternPreset,
      gradientPreset: activeGradientPreset,
    });
  };

  return (
    <div className="uv-editor__control-panel uv-editor__control-panel--design">
      <div className="uv-editor__control-group">
        <div className="uv-editor__control-label">{locale.designTitle}</div>
        <div className="uv-editor__chip-row">
          {([
            ["solid", locale.designSolid],
            ["pattern", locale.designPattern],
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
              value={brushColor}
              title={locale.designColorHint}
              aria-label={locale.designColorHint}
              onChange={(event) => onBrushColorChange(event.target.value)}
            />
            <span className="uv-editor__value-chip uv-editor__design-color-chip">{brushColor.toUpperCase()}</span>
          </div>
        </div>
      ) : null}

      {fillMode === "pattern" ? (
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

      <div className="uv-editor__control-actions">
        <button
          type="button"
          className="uv-editor__tool uv-editor__tool--secondary"
          title={locale.designAddHint}
          aria-label={locale.designAddHint}
          onClick={handleAdd}
          disabled={!canAdd}
        >
          {locale.designAddLayer}
        </button>
      </div>
    </div>
  );
}
