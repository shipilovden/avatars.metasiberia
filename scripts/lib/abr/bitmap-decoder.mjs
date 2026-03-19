import { encode } from "fast-png";

export function decodePackedBitmap(data, depthBits, width, height) {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const unpackedBytes = new Uint8Array((width * height * depthBits) / 8);

  let offset = 0;
  const lineSizes = [];

  for (let lineNo = 0; lineNo < height; lineNo += 1) {
    lineSizes[lineNo] = dataView.getUint16(offset);
    offset += 2;
  }

  let outOffset = 0;

  for (let lineNo = 0; lineNo < height; lineNo += 1) {
    const endOfLine = offset + lineSizes[lineNo];

    while (offset < endOfLine) {
      const headerByte = dataView.getInt8(offset);
      offset += 1;

      if (headerByte >= 0) {
        const copyCount = headerByte + 1;
        unpackedBytes.set(data.subarray(offset, offset + copyCount), outOffset);
        offset += copyCount;
        outOffset += copyCount;
      } else if (headerByte > -128) {
        const copyCount = 1 - headerByte;
        const repeatedByte = dataView.getUint8(offset);
        unpackedBytes.fill(repeatedByte, outOffset, outOffset + copyCount);
        offset += 1;
        outOffset += copyCount;
      }
    }
  }

  return unpackedBytes;
}

function normalizeTo8Bit(decoded, depthBits, width, height) {
  const expectedSize = (width * height * depthBits) / 8;
  let bitmap = decoded;

  if (bitmap.byteLength > expectedSize) {
    bitmap = new Uint8Array(bitmap.buffer, bitmap.byteOffset, expectedSize);
  }

  if (depthBits === 8) {
    return new Uint8Array(bitmap.buffer, bitmap.byteOffset, width * height);
  }

  if (depthBits === 16) {
    const source = new Uint16Array(bitmap.buffer, bitmap.byteOffset, width * height);
    const normalized = new Uint8Array(source.length);

    for (let index = 0; index < source.length; index += 1) {
      normalized[index] = source[index] >> 8;
    }

    return normalized;
  }

  throw new Error(`Unsupported ABR bitmap depth: ${depthBits}`);
}

export function decodeBrushBitmap({ data, isCompressed, depthBits, width, height }) {
  const decoded = isCompressed ? decodePackedBitmap(data, depthBits, width, height) : data;

  return {
    width,
    height,
    data: normalizeTo8Bit(decoded, depthBits, width, height),
  };
}

function grayscaleToAlphaMask({ width, height, data }, threshold = 8) {
  let sum = 0;

  for (let index = 0; index < data.length; index += 1) {
    sum += data[index];
  }

  const mean = sum / Math.max(1, data.length);
  const invert = mean > 127;
  const alpha = new Uint8Array(data.length);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < data.length; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const value = invert ? 255 - data[index] : data[index];
    const normalized = value < threshold ? 0 : value;

    alpha[index] = normalized;

    if (normalized > 0) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const padding = 2;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const croppedAlpha = new Uint8Array(croppedWidth * croppedHeight);

  for (let y = 0; y < croppedHeight; y += 1) {
    const sourceOffset = (minY + y) * width + minX;
    const targetOffset = y * croppedWidth;
    croppedAlpha.set(alpha.subarray(sourceOffset, sourceOffset + croppedWidth), targetOffset);
  }

  return {
    width: croppedWidth,
    height: croppedHeight,
    alpha: croppedAlpha,
  };
}

function resizeAlphaMask(mask, maxSize) {
  if (Math.max(mask.width, mask.height) <= maxSize) {
    return mask;
  }

  const scale = maxSize / Math.max(mask.width, mask.height);
  const width = Math.max(1, Math.round(mask.width * scale));
  const height = Math.max(1, Math.round(mask.height * scale));
  const resizedAlpha = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(mask.height - 1, Math.floor(((y + 0.5) / scale) - 0.5));

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.floor(((x + 0.5) / scale) - 0.5));
      resizedAlpha[y * width + x] = mask.alpha[sourceY * mask.width + sourceX];
    }
  }

  return {
    width,
    height,
    alpha: resizedAlpha,
  };
}

function encodeAlphaMask(mask) {
  const rgba = new Uint8Array(mask.width * mask.height * 4);

  for (let index = 0; index < mask.alpha.length; index += 1) {
    const offset = index * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = mask.alpha[index];
  }

  return encode({
    width: mask.width,
    height: mask.height,
    data: rgba,
    channels: 4,
    depth: 8,
  });
}

export function grayscaleBitmapToMaskPng(bitmap, { maxSize = 512, threshold = 8 } = {}) {
  const mask = grayscaleToAlphaMask(bitmap, threshold);

  if (!mask) {
    return null;
  }

  const resizedMask = resizeAlphaMask(mask, maxSize);

  return {
    width: resizedMask.width,
    height: resizedMask.height,
    png: encodeAlphaMask(resizedMask),
  };
}

export function decodeBrushMaskAsPng(options, { maxSize = 512, threshold = 8 } = {}) {
  const bitmap = decodeBrushBitmap(options);
  return grayscaleBitmapToMaskPng(bitmap, { maxSize, threshold });
}
