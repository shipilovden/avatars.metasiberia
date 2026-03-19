import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Mesh,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from "three";
import {
  getCanvasCompositeOperationForUvBlendMode,
} from "./shared";
import type {
  AppliedUvDecal,
  DecalProjectionBasis,
  UvLayerBlendMode,
} from "./shared";

const MIN_DECAL_BAKE_RESOLUTION = 1024;

const getBakeCanvasSize = (width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const largestSide = Math.max(safeWidth, safeHeight);

  // RPM base presets can ship a 2x2 body placeholder. Upscale the bake target
  // so body decals remain visible in the live preview.
  if (largestSide > 16) {
    return { width: safeWidth, height: safeHeight };
  }

  if (safeWidth >= safeHeight) {
    return {
      width: MIN_DECAL_BAKE_RESOLUTION,
      height: Math.max(1, Math.round((safeHeight / safeWidth) * MIN_DECAL_BAKE_RESOLUTION)),
    };
  }

  return {
    width: Math.max(1, Math.round((safeWidth / safeHeight) * MIN_DECAL_BAKE_RESOLUTION)),
    height: MIN_DECAL_BAKE_RESOLUTION,
  };
};

export const readFileAsImage = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image."));
    };
    image.src = url;
  });

export const getPrimaryTextureMap = (material: unknown) => {
  const entry = Array.isArray(material) ? material[0] : material;
  const map = (entry as { map?: Texture | null } | null)?.map || null;
  return map?.image ? map : null;
};

export const drawReplacementPatternFromImage = ({
  canvas,
  image,
  uvCenter = [0.5, 0.5],
  scale,
  scaleX,
  scaleY,
  rotationDeg,
  opacity = 1,
}: {
  canvas: HTMLCanvasElement;
  image: CanvasImageSource;
  uvCenter?: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  opacity?: number;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const uniform = Math.max(0.2, scale);
  const nextScaleX = Math.max(0.2, scaleX);
  const nextScaleY = Math.max(0.2, scaleY);
  const repeatX = Math.max(0.1, Math.min(8, 1 / (uniform * nextScaleX)));
  const repeatY = Math.max(0.1, Math.min(8, 1 / (uniform * nextScaleY)));
  const centerU = Math.max(0, Math.min(1, uvCenter[0]));
  const centerV = Math.max(0, Math.min(1, uvCenter[1]));
  const uvTransformTexture = new Texture();
  uvTransformTexture.wrapS = ClampToEdgeWrapping;
  uvTransformTexture.wrapT = ClampToEdgeWrapping;
  uvTransformTexture.flipY = false;
  uvTransformTexture.center.set(centerU, centerV);
  uvTransformTexture.rotation = (rotationDeg * Math.PI) / 180;
  uvTransformTexture.repeat.set(repeatX, repeatY);
  uvTransformTexture.offset.set(centerU - repeatX * centerU, centerV - repeatY * centerV);
  uvTransformTexture.updateMatrix();
  const uv = new Vector2();

  const sourceCanvas = document.createElement("canvas");
  const sourceWidth = "width" in image ? Number(image.width) || 0 : 0;
  const sourceHeight = "height" in image ? Number(image.height) || 0 : 0;
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext || sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const sourcePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const output = context.getImageData(0, 0, canvas.width, canvas.height);
  const resolvedOpacity = Math.max(0, Math.min(1, opacity));

  for (let y = 0; y < canvas.height; y += 1) {
    const v = (y + 0.5) / canvas.height;
    for (let x = 0; x < canvas.width; x += 1) {
      const u = (x + 0.5) / canvas.width;
      uv.set(u, v);
      uvTransformTexture.transformUv(uv);

      const sampleX = Math.max(
        0,
        Math.min(
          sourceCanvas.width - 1,
          Math.round(Math.max(0, Math.min(1, uv.x)) * (sourceCanvas.width - 1))
        )
      );
      const sampleY = Math.max(
        0,
        Math.min(
          sourceCanvas.height - 1,
          Math.round(Math.max(0, Math.min(1, uv.y)) * (sourceCanvas.height - 1))
        )
      );

      const sourceIndex = (sampleY * sourceCanvas.width + sampleX) * 4;
      const targetIndex = (y * canvas.width + x) * 4;
      const sourceAlpha = (sourcePixels.data[sourceIndex + 3] / 255) * resolvedOpacity;
      if (sourceAlpha <= 0) {
        continue;
      }

      const backdropAlpha = output.data[targetIndex + 3] / 255;
      const outputAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
      if (outputAlpha <= 0) {
        continue;
      }

      for (let channelOffset = 0; channelOffset < 3; channelOffset += 1) {
        const sourceValue = sourcePixels.data[sourceIndex + channelOffset] / 255;
        const backdropValue = output.data[targetIndex + channelOffset] / 255;
        const composited =
          sourceValue * sourceAlpha + backdropValue * backdropAlpha * (1 - sourceAlpha);
        output.data[targetIndex + channelOffset] = Math.round((composited / outputAlpha) * 255);
      }

      output.data[targetIndex + 3] = Math.round(outputAlpha * 255);
    }
  }

  context.putImageData(output, 0, 0);
};

export const drawUvDecalOverlayToCanvas = ({
  canvas,
  decalImage,
  uv,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
  blendMode,
  opacity = 1,
}: {
  canvas: HTMLCanvasElement;
  decalImage: CanvasImageSource;
  uv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  blendMode?: UvLayerBlendMode;
  opacity?: number;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const centerX = uv[0] * canvas.width;
  const centerY = (1 - uv[1]) * canvas.height;
  const decalWidth = "width" in decalImage ? Number(decalImage.width) || 1 : 1;
  const decalHeight = "height" in decalImage ? Number(decalImage.height) || 1 : 1;
  const aspect = decalWidth / Math.max(1, decalHeight);
  const widthUv = Math.max(0.01, scale) * Math.max(0.01, scaleX);
  const heightUv =
    (Math.max(0.01, scale) * Math.max(0.01, scaleY)) / Math.max(0.1, aspect);
  const width = Math.max(2, canvas.width * widthUv);
  const height = Math.max(2, canvas.height * heightUv);

  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  context.globalCompositeOperation = getCanvasCompositeOperationForUvBlendMode(
    blendMode || "normal"
  );
  context.translate(centerX, centerY);
  context.rotate((-rotationDeg * Math.PI) / 180);
  context.drawImage(decalImage, -width / 2, -height / 2, width, height);
  context.restore();
};

const getDecalDimensions = (
  decalImage: CanvasImageSource,
  scale: number,
  scaleX: number,
  scaleY: number
) => {
  const decalWidth = "width" in decalImage ? Number(decalImage.width) || 1 : 1;
  const decalHeight = "height" in decalImage ? Number(decalImage.height) || 1 : 1;
  const aspect = decalWidth / Math.max(1, decalHeight);
  return {
    widthUv: Math.max(0.01, scale) * Math.max(0.01, scaleX),
    heightUv: (Math.max(0.01, scale) * Math.max(0.01, scaleY)) / Math.max(0.1, aspect),
    sourceWidth: Math.max(1, Math.round(decalWidth)),
    sourceHeight: Math.max(1, Math.round(decalHeight)),
  };
};

const getSourceImageData = (image: CanvasImageSource) => {
  const width = "width" in image ? Number(image.width) || 0 : 0;
  const height = "height" in image ? Number(image.height) || 0 : 0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    return null;
  }

  sourceContext.drawImage(image, 0, 0, width, height);
  return sourceContext.getImageData(0, 0, width, height);
};

const blendChannel = (
  backdrop: number,
  source: number,
  blendMode: UvLayerBlendMode
) => {
  switch (blendMode) {
    case "multiply":
      return backdrop * source;
    case "screen":
      return 1 - (1 - backdrop) * (1 - source);
    case "darken":
      return Math.min(backdrop, source);
    case "lighten":
      return Math.max(backdrop, source);
    case "color-dodge":
      return source >= 1 ? 1 : Math.min(1, backdrop / Math.max(1e-6, 1 - source));
    case "color-burn":
      return source <= 0 ? 0 : 1 - Math.min(1, (1 - backdrop) / Math.max(1e-6, source));
    case "overlay":
      return backdrop <= 0.5
        ? 2 * backdrop * source
        : 1 - 2 * (1 - backdrop) * (1 - source);
    case "hard-light":
      return source <= 0.5
        ? 2 * backdrop * source
        : 1 - 2 * (1 - backdrop) * (1 - source);
    case "soft-light": {
      const softLightHelper =
        backdrop <= 0.25
          ? ((16 * backdrop - 12) * backdrop + 4) * backdrop
          : Math.sqrt(backdrop);
      return source <= 0.5
        ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
        : backdrop + (2 * source - 1) * (softLightHelper - backdrop);
    }
    case "difference":
      return Math.abs(backdrop - source);
    case "exclusion":
      return backdrop + source - 2 * backdrop * source;
    case "normal":
    default:
      return source;
  }
};

const compositeBlendPixel = ({
  targetData,
  targetIndex,
  sourceData,
  sourceIndex,
  blendMode,
  opacity = 1,
}: {
  targetData: Uint8ClampedArray;
  targetIndex: number;
  sourceData: Uint8ClampedArray;
  sourceIndex: number;
  blendMode: UvLayerBlendMode;
  opacity?: number;
}) => {
  const sourceAlpha = (sourceData[sourceIndex + 3] / 255) * Math.max(0, Math.min(1, opacity));
  if (sourceAlpha <= 0) {
    return;
  }

  const backdropAlpha = targetData[targetIndex + 3] / 255;
  const outputAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) {
    return;
  }

  for (let channelOffset = 0; channelOffset < 3; channelOffset += 1) {
    const source = sourceData[sourceIndex + channelOffset] / 255;
    const backdrop = targetData[targetIndex + channelOffset] / 255;
    const blended = blendChannel(backdrop, source, blendMode);
    const composited =
      sourceAlpha * ((1 - backdropAlpha) * source + backdropAlpha * blended) +
      (1 - sourceAlpha) * backdropAlpha * backdrop;
    targetData[targetIndex + channelOffset] = Math.round(
      (composited / outputAlpha) * 255
    );
  }

  targetData[targetIndex + 3] = Math.round(outputAlpha * 255);
};

const getVertexWorldPosition = (
  mesh: Mesh,
  vertexIndex: number,
  cache: Map<number, Vector3>
) => {
  const cached = cache.get(vertexIndex);
  if (cached) {
    return cached;
  }

  const worldPosition = mesh.getVertexPosition(vertexIndex, new Vector3());
  mesh.localToWorld(worldPosition);
  cache.set(vertexIndex, worldPosition);
  return worldPosition;
};

const getBarycentricCoordinates = (
  pointU: number,
  pointV: number,
  uvA: Vector2,
  uvB: Vector2,
  uvC: Vector2
) => {
  const denominator =
    (uvB.y - uvC.y) * (uvA.x - uvC.x) + (uvC.x - uvB.x) * (uvA.y - uvC.y);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) {
    return null;
  }

  const weightA =
    ((uvB.y - uvC.y) * (pointU - uvC.x) + (uvC.x - uvB.x) * (pointV - uvC.y)) /
    denominator;
  const weightB =
    ((uvC.y - uvA.y) * (pointU - uvC.x) + (uvA.x - uvC.x) * (pointV - uvC.y)) /
    denominator;
  const weightC = 1 - weightA - weightB;
  const epsilon = -1e-4;

  if (weightA < epsilon || weightB < epsilon || weightC < epsilon) {
    return null;
  }

  return { weightA, weightB, weightC };
};

const drawProjectedUvDecalOverlayToCanvas = ({
  canvas,
  decalImage,
  mesh,
  projection,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
  blendMode,
  opacity = 1,
}: {
  canvas: HTMLCanvasElement;
  decalImage: CanvasImageSource;
  mesh: Mesh;
  projection: DecalProjectionBasis;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  blendMode?: UvLayerBlendMode;
  opacity?: number;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const geometry = mesh.geometry;
  if (!geometry || !("getAttribute" in geometry)) {
    return false;
  }

  const uvAttribute = geometry.getAttribute("uv");
  if (
    !uvAttribute ||
    typeof uvAttribute.getX !== "function" ||
    typeof uvAttribute.getY !== "function"
  ) {
    return false;
  }

  const sourceImageData = getSourceImageData(decalImage);
  if (!sourceImageData) {
    return false;
  }

  const targetImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { widthUv, heightUv, sourceWidth, sourceHeight } = getDecalDimensions(
    decalImage,
    scale,
    scaleX,
    scaleY
  );
  const center = new Vector3(
    projection.position[0],
    projection.position[1],
    projection.position[2]
  );
  const axisU = new Vector3(projection.axisU[0], projection.axisU[1], projection.axisU[2]);
  const axisV = new Vector3(projection.axisV[0], projection.axisV[1], projection.axisV[2]);
  const projectionNormal = projection.normal
    ? new Vector3(projection.normal[0], projection.normal[1], projection.normal[2]).normalize()
    : axisU.clone().cross(axisV).normalize();
  const gramUU = axisU.dot(axisU);
  const gramUV = axisU.dot(axisV);
  const gramVV = axisV.dot(axisV);
  const gramDeterminant = gramUU * gramVV - gramUV * gramUV;
  if (!Number.isFinite(gramDeterminant) || Math.abs(gramDeterminant) < 1e-10) {
    return false;
  }

  const cosRotation = Math.cos((rotationDeg * Math.PI) / 180);
  const sinRotation = Math.sin((rotationDeg * Math.PI) / 180);
  const projectionWorldSize = Math.max(
    axisU.length() * widthUv,
    axisV.length() * heightUv,
    1e-4
  );
  const projectionDepthThreshold = Math.max(
    projectionWorldSize * 0.85,
    2e-3
  );
  const projectionNormalDotThreshold = 0.05;
  const vertexWorldCache = new Map<number, Vector3>();
  const worldPoint = new Vector3();
  const planePoint = new Vector3();
  const deltaPoint = new Vector3();
  const triangleNormal = new Vector3();

  const getSourceIndex = (sourceU: number, sourceV: number) => {
    const sampleX = Math.max(
      0,
      Math.min(sourceWidth - 1, Math.round(sourceU * (sourceWidth - 1)))
    );
    const sampleY = Math.max(
      0,
      Math.min(sourceHeight - 1, Math.round(sourceV * (sourceHeight - 1)))
    );
    return (sampleY * sourceWidth + sampleX) * 4;
  };

  const resolvedBlendMode = blendMode || "normal";

  const indexAttribute = geometry.index;
  const triangleCount = indexAttribute
    ? Math.floor(indexAttribute.count / 3)
    : Math.floor(uvAttribute.count / 3);

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const vertexIndexA = indexAttribute ? indexAttribute.getX(triangleIndex * 3) : triangleIndex * 3;
    const vertexIndexB = indexAttribute
      ? indexAttribute.getX(triangleIndex * 3 + 1)
      : triangleIndex * 3 + 1;
    const vertexIndexC = indexAttribute
      ? indexAttribute.getX(triangleIndex * 3 + 2)
      : triangleIndex * 3 + 2;

    const uvA = new Vector2(uvAttribute.getX(vertexIndexA), uvAttribute.getY(vertexIndexA));
    const uvB = new Vector2(uvAttribute.getX(vertexIndexB), uvAttribute.getY(vertexIndexB));
    const uvC = new Vector2(uvAttribute.getX(vertexIndexC), uvAttribute.getY(vertexIndexC));

    const minCanvasX = Math.max(
      0,
      Math.floor(Math.min(uvA.x, uvB.x, uvC.x) * canvas.width)
    );
    const maxCanvasX = Math.min(
      canvas.width - 1,
      Math.ceil(Math.max(uvA.x, uvB.x, uvC.x) * canvas.width)
    );
    const minCanvasY = Math.max(
      0,
      Math.floor((1 - Math.max(uvA.y, uvB.y, uvC.y)) * canvas.height)
    );
    const maxCanvasY = Math.min(
      canvas.height - 1,
      Math.ceil((1 - Math.min(uvA.y, uvB.y, uvC.y)) * canvas.height)
    );

    if (minCanvasX > maxCanvasX || minCanvasY > maxCanvasY) {
      continue;
    }

    const worldA = getVertexWorldPosition(mesh, vertexIndexA, vertexWorldCache);
    const worldB = getVertexWorldPosition(mesh, vertexIndexB, vertexWorldCache);
    const worldC = getVertexWorldPosition(mesh, vertexIndexC, vertexWorldCache);
    triangleNormal
      .copy(worldB)
      .sub(worldA)
      .cross(worldC.clone().sub(worldA));
    if (triangleNormal.lengthSq() < 1e-10) {
      continue;
    }
    triangleNormal.normalize();
    if (triangleNormal.dot(projectionNormal) <= projectionNormalDotThreshold) {
      continue;
    }

    for (let canvasY = minCanvasY; canvasY <= maxCanvasY; canvasY += 1) {
      const pointV = 1 - (canvasY + 0.5) / canvas.height;
      for (let canvasX = minCanvasX; canvasX <= maxCanvasX; canvasX += 1) {
        const pointU = (canvasX + 0.5) / canvas.width;
        const barycentric = getBarycentricCoordinates(pointU, pointV, uvA, uvB, uvC);
        if (!barycentric) {
          continue;
        }

        worldPoint
          .copy(worldA)
          .multiplyScalar(barycentric.weightA)
          .addScaledVector(worldB, barycentric.weightB)
          .addScaledVector(worldC, barycentric.weightC);

        deltaPoint.copy(worldPoint).sub(center);
        const dotU = deltaPoint.dot(axisU);
        const dotV = deltaPoint.dot(axisV);
        const localU = (dotU * gramVV - dotV * gramUV) / gramDeterminant;
        const localV = (dotV * gramUU - dotU * gramUV) / gramDeterminant;

        planePoint
          .copy(center)
          .addScaledVector(axisU, localU)
          .addScaledVector(axisV, localV);
        if (planePoint.distanceTo(worldPoint) > projectionDepthThreshold) {
          continue;
        }

        const rotatedU = localU * cosRotation - localV * sinRotation;
        const rotatedV = localU * sinRotation + localV * cosRotation;
        if (Math.abs(rotatedU) > widthUv * 0.5 || Math.abs(rotatedV) > heightUv * 0.5) {
          continue;
        }

        const sourceU = rotatedU / widthUv + 0.5;
        const sourceV = 0.5 - rotatedV / heightUv;
        if (sourceU < 0 || sourceU > 1 || sourceV < 0 || sourceV > 1) {
          continue;
        }

        const targetIndex = (canvasY * canvas.width + canvasX) * 4;
        const sourceIndex = getSourceIndex(sourceU, sourceV);
        compositeBlendPixel({
          targetData: targetImageData.data,
          targetIndex,
          sourceData: sourceImageData.data,
          sourceIndex,
          blendMode: resolvedBlendMode,
          opacity,
        });
      }
    }
  }

  context.putImageData(targetImageData, 0, 0);
  return true;
};

export const buildCombinedPreviewTexture = async ({
  baseMap,
  baseTextureOverrideUrl,
  mesh,
  replacementTexture,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
  appliedUvTextures,
  appliedUvDecals,
}: {
  baseMap: Texture | null;
  baseTextureOverrideUrl?: string | null;
  mesh?: Mesh | null;
  replacementTexture: Texture | null;
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
  appliedUvTextures: readonly AppliedUvDecal[];
  appliedUvDecals: readonly AppliedUvDecal[];
}) => {
  const baseOverrideImage = baseTextureOverrideUrl
    ? await readFileAsImage(await fetch(baseTextureOverrideUrl).then((response) => response.blob()))
    : null;
  const baseImage =
    baseOverrideImage || ((baseMap?.image as CanvasImageSource | undefined) || null);
  const width = baseImage && "width" in baseImage ? Number(baseImage.width) || 0 : 0;
  const height = baseImage && "height" in baseImage ? Number(baseImage.height) || 0 : 0;
  if (!baseImage || width <= 0 || height <= 0) {
    return null;
  }

  const bakeSize = getBakeCanvasSize(width, height);

  const canvas = document.createElement("canvas");
  canvas.width = bakeSize.width;
  canvas.height = bakeSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  if (replacementTexture?.image) {
    drawReplacementPatternFromImage({
      canvas,
      image: replacementTexture.image as CanvasImageSource,
      scale: replaceTextureScale,
      scaleX: replaceTextureScaleX,
      scaleY: replaceTextureScaleY,
      rotationDeg: replaceTextureRotationDeg,
    });
  } else {
    context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  }

  for (const appliedUvTexture of appliedUvTextures) {
    const textureImage = await readFileAsImage(
      await fetch(appliedUvTexture.textureUrl).then((response) => response.blob())
    );
    drawReplacementPatternFromImage({
      canvas,
      image: textureImage,
      uvCenter: appliedUvTexture.uv,
      scale: appliedUvTexture.scale,
      scaleX: appliedUvTexture.scaleX,
      scaleY: appliedUvTexture.scaleY,
      rotationDeg: appliedUvTexture.rotationDeg,
      opacity: appliedUvTexture.opacity,
    });
  }

  for (const appliedUvDecal of appliedUvDecals) {
    const decalImage = await readFileAsImage(
      await fetch(appliedUvDecal.textureUrl).then((response) => response.blob())
    );
    const projected =
      mesh &&
      appliedUvDecal.projection &&
      drawProjectedUvDecalOverlayToCanvas({
        canvas,
        decalImage,
        mesh,
        projection: appliedUvDecal.projection,
        scale: appliedUvDecal.scale,
        scaleX: appliedUvDecal.scaleX,
        scaleY: appliedUvDecal.scaleY,
        rotationDeg: appliedUvDecal.rotationDeg,
        blendMode: appliedUvDecal.blendMode,
        opacity: appliedUvDecal.opacity,
      });

    if (!projected) {
      drawUvDecalOverlayToCanvas({
        canvas,
        decalImage,
        uv: appliedUvDecal.uv,
        scale: appliedUvDecal.scale,
        scaleX: appliedUvDecal.scaleX,
        scaleY: appliedUvDecal.scaleY,
        rotationDeg: appliedUvDecal.rotationDeg,
        blendMode: appliedUvDecal.blendMode,
        opacity: appliedUvDecal.opacity,
      });
    }
  }

  const bakedTexture = new CanvasTexture(canvas);
  bakedTexture.colorSpace = SRGBColorSpace;
  bakedTexture.flipY = false;
  bakedTexture.needsUpdate = true;
  return bakedTexture;
};
