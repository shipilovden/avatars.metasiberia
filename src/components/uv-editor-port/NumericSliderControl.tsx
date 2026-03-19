import { useEffect, useState } from "react";

type NumericSliderControlProps = {
  label: string;
  tooltip: string;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  sliderValue: number;
  inputMin: number;
  inputMax: number;
  inputStep: number;
  inputValue: number;
  inputSuffix?: string;
  disabled?: boolean;
  onSliderChange: (value: number) => void;
  onInputChange: (value: number) => void;
};

const formatNumericInputValue = (value: number) => Number.parseFloat(value.toFixed(4)).toString();

export function NumericSliderControl({
  label,
  tooltip,
  sliderMin,
  sliderMax,
  sliderStep,
  sliderValue,
  inputMin,
  inputMax,
  inputStep,
  inputValue,
  inputSuffix,
  disabled,
  onSliderChange,
  onInputChange,
}: NumericSliderControlProps) {
  const [draftInputValue, setDraftInputValue] = useState(() => formatNumericInputValue(inputValue));
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    if (isInputFocused) {
      return;
    }
    setDraftInputValue(formatNumericInputValue(inputValue));
  }, [inputValue, isInputFocused]);

  const applyDraftInputValue = (nextDraftValue: string) => {
    setDraftInputValue(nextDraftValue);
    const normalized = nextDraftValue.replace(",", ".").trim();
    if (
      normalized.length === 0 ||
      normalized === "-" ||
      normalized === "." ||
      normalized === "-."
    ) {
      return;
    }

    const parsedValue = Number.parseFloat(normalized);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    const nextValue = Math.max(inputMin, Math.min(inputMax, parsedValue));
    onInputChange(nextValue);
  };

  const commitDraftInputValue = () => {
    const normalized = draftInputValue.replace(",", ".");
    const parsedValue = Number.parseFloat(normalized);
    if (!Number.isFinite(parsedValue)) {
      setDraftInputValue(formatNumericInputValue(inputValue));
      return;
    }

    const nextValue = Math.max(inputMin, Math.min(inputMax, parsedValue));
    onInputChange(nextValue);
    setDraftInputValue(formatNumericInputValue(nextValue));
  };

  return (
    <div className="uv-editor__control-group">
      <div className="uv-editor__control-label">{label}</div>
      <div className="uv-editor__slider-row">
        <input
          className="uv-editor__slider"
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={sliderValue}
          title={tooltip}
          aria-label={tooltip}
          disabled={disabled}
          onChange={(event) => onSliderChange(Number(event.target.value))}
        />
        <label className="uv-editor__number-input">
          <input
            className="uv-editor__slider-number"
            type="number"
            min={inputMin}
            max={inputMax}
            step={inputStep}
            value={draftInputValue}
            title={tooltip}
            aria-label={tooltip}
            disabled={disabled}
            onChange={(event) => applyDraftInputValue(event.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => {
              setIsInputFocused(false);
              commitDraftInputValue();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          {inputSuffix ? <span className="uv-editor__number-suffix">{inputSuffix}</span> : null}
        </label>
      </div>
    </div>
  );
}
