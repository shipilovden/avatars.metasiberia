import type { ChangeEvent } from "react";
import type { UiLocale } from "./shared";

type LightRotationControlProps = {
  locale: UiLocale;
  value: number;
  onChange: (value: number) => void;
};

function LightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.75a6.4 6.4 0 0 0-3.97 11.42c.86.7 1.3 1.41 1.43 2.12h5.08c.13-.71.57-1.42 1.43-2.12A6.4 6.4 0 0 0 12 2.75Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 19.1h4.4M10.35 21.25h3.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const normalizeDegrees = (value: number) => ((Math.round(value) % 360) + 360) % 360;

export function LightRotationControl({
  locale,
  value,
  onChange,
}: LightRotationControlProps) {
  const label = locale === "ru" ? "Поворот света" : "Light rotation";
  const normalizedValue = normalizeDegrees(value);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <label className="light-rotation-control" title={label} aria-label={label}>
      <span className="light-rotation-control__icon">
        <LightIcon />
      </span>
      <input
        className="light-rotation-control__slider"
        type="range"
        min="0"
        max="360"
        step="1"
        value={normalizedValue}
        onChange={handleChange}
        aria-label={label}
      />
      <span className="light-rotation-control__value">{normalizedValue}°</span>
    </label>
  );
}
