export type DesignFillMode = "solid" | "pattern" | "gradient";

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

export type DesignLayerRequest = {
  fillMode: DesignFillMode;
  solidColor: string;
  shapePreset: DesignShapePreset;
  patternPreset: DesignPatternPreset;
  gradientPreset: DesignGradientPreset;
};

type ShapeDefinition = Omit<DesignShapePreset, "previewSrc">;
type PatternDefinition = Omit<DesignPatternPreset, "previewSrc">;
type GradientDefinition = Omit<DesignGradientPreset, "previewSrc">;
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
  stroke: string
) =>
  svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <defs>
        ${defs}
        <filter id="shape-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="3.4" flood-color="rgba(15, 23, 32, 0.22)" />
        </filter>
      </defs>
      <rect width="100" height="100" fill="transparent" />
      <g filter="url(#shape-shadow)">
        ${shapePreset.renderBody(fill, stroke)}
      </g>
    </svg>
  `);

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

export const createGeneratedDesignAsset = ({
  fillMode,
  solidColor,
  shapePreset,
  patternPreset,
  gradientPreset,
  isRussian,
}: DesignLayerRequest & { isRussian: boolean }) => {
  const solidFill = createSolidFill(solidColor);
  let defs = solidFill.defs;
  let fill = solidFill.fill;
  let fileSuffix = "solid";

  if (fillMode === "pattern") {
    defs = patternPreset.renderDefinition("shape-fill");
    fill = "url(#shape-fill)";
    fileSuffix = patternPreset.fileStem;
  } else if (fillMode === "gradient") {
    defs = gradientPreset.renderDefinition("shape-fill");
    fill = "url(#shape-fill)";
    fileSuffix = gradientPreset.fileStem;
  }

  return {
    fileName: `${isRussian ? "Фигура" : "Shape"} ${shapePreset.name} ${fileSuffix}.svg`,
    textureUrl: createShapeTextureSvg(shapePreset, defs, fill, solidFill.stroke),
    scale: shapePreset.defaultScale,
  };
};
