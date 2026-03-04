import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { promises as fs } from "fs";
import { sliceIntoStrips, computeStripHash, alignStrips } from "./diff-strips";

export interface DiffResult {
  diffImagePath: string;
  changeCount: number;
  totalPixels: number;
  changePercentage: number;
}

export async function generateDiff(
  prodImagePath: string,
  devImagePath: string,
  outputPath: string,
  stripHeight: number = 50
): Promise<DiffResult> {
  const prodMeta = await sharp(prodImagePath).metadata();
  const devMeta = await sharp(devImagePath).metadata();

  const width = Math.max(prodMeta.width!, devMeta.width!);

  // If images are very small or similar size, just do direct pixelmatch
  if (prodMeta.height! < stripHeight * 3 && devMeta.height! < stripHeight * 3) {
    return directDiff(prodImagePath, devImagePath, outputPath, width);
  }

  // Slice into strips
  const prodStrips = await sliceIntoStrips(prodImagePath, stripHeight);
  const devStrips = await sliceIntoStrips(devImagePath, stripHeight);

  // Compute hashes
  const prodHashes = prodStrips.buffers.map((buf, i) => {
    const h = Math.min(stripHeight, prodStrips.totalHeight - i * stripHeight);
    return computeStripHash(buf, prodStrips.width, h);
  });
  const devHashes = devStrips.buffers.map((buf, i) => {
    const h = Math.min(stripHeight, devStrips.totalHeight - i * stripHeight);
    return computeStripHash(buf, devStrips.width, h);
  });

  // Align strips
  const alignments = alignStrips(prodHashes, devHashes);

  // Process each alignment and build output strips
  const outputStrips: Buffer[] = [];
  let changeCount = 0;
  let totalPixels = 0;

  for (const alignment of alignments) {
    if (alignment.type === "match") {
      // No changes - use dev strip as-is (converted to RGBA)
      const devIdx = alignment.devIndex!;
      const h = Math.min(stripHeight, devStrips.totalHeight - devIdx * stripHeight);
      const rgbaStrip = await sharp(devImagePath)
        .extract({ left: 0, top: devIdx * stripHeight, width: devStrips.width, height: h })
        .ensureAlpha()
        .raw()
        .toBuffer();
      outputStrips.push(rgbaStrip);
      totalPixels += devStrips.width * h;
    } else if (alignment.type === "modify") {
      // Diff the two strips
      const prodIdx = alignment.prodIndex!;
      const devIdx = alignment.devIndex!;
      const prodH = Math.min(stripHeight, prodStrips.totalHeight - prodIdx * stripHeight);
      const devH = Math.min(stripHeight, devStrips.totalHeight - devIdx * stripHeight);
      const h = Math.min(prodH, devH);

      const prodPng = await sharp(prodImagePath)
        .extract({ left: 0, top: prodIdx * stripHeight, width: prodStrips.width, height: h })
        .resize(width, h)
        .ensureAlpha()
        .raw()
        .toBuffer();

      const devPng = await sharp(devImagePath)
        .extract({ left: 0, top: devIdx * stripHeight, width: devStrips.width, height: h })
        .resize(width, h)
        .ensureAlpha()
        .raw()
        .toBuffer();

      const diffBuf = Buffer.alloc(width * h * 4);
      const numDiff = pixelmatch(
        new Uint8Array(prodPng),
        new Uint8Array(devPng),
        new Uint8Array(diffBuf),
        width,
        h,
        { threshold: 0.1 }
      );

      // Composite: show dev image with yellow overlay where changed
      const composited = await compositeHighlight(devImagePath, devIdx * stripHeight, width, h, diffBuf);
      outputStrips.push(composited);

      changeCount += numDiff;
      totalPixels += width * h;
    } else if (alignment.type === "insert") {
      // New content in dev - highlight entirely with blue tint
      const devIdx = alignment.devIndex!;
      const h = Math.min(stripHeight, devStrips.totalHeight - devIdx * stripHeight);
      const strip = await sharp(devImagePath)
        .extract({ left: 0, top: devIdx * stripHeight, width: devStrips.width, height: h })
        .ensureAlpha()
        .raw()
        .toBuffer();

      // Apply yellow overlay to entire strip
      const highlighted = applyFullOverlay(strip, devStrips.width, h, [225, 208, 52, 128]);
      outputStrips.push(highlighted);

      changeCount += devStrips.width * h;
      totalPixels += devStrips.width * h;
    } else if (alignment.type === "delete") {
      // Content removed from prod - skip (don't include in output)
      const prodIdx = alignment.prodIndex!;
      const h = Math.min(stripHeight, prodStrips.totalHeight - prodIdx * stripHeight);
      totalPixels += prodStrips.width * h;
    }
  }

  // Stitch output strips vertically
  if (outputStrips.length === 0) {
    // No output strips - create a 1x1 transparent image
    await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toFile(outputPath);
    return { diffImagePath: outputPath, changeCount: 0, totalPixels: 0, changePercentage: 0 };
  }

  // Calculate total output height
  let outputHeight = 0;
  const stripHeights: number[] = [];
  for (const alignment of alignments) {
    if (alignment.type === "delete") continue;
    const idx = alignment.devIndex!;
    const h = Math.min(stripHeight, devStrips.totalHeight - idx * stripHeight);
    stripHeights.push(h);
    outputHeight += h;
  }

  // Build composite image
  const composites: { input: Buffer; top: number; left: number; raw: { width: number; height: number; channels: 4 } }[] = [];
  let yOffset = 0;
  let stripIdx = 0;

  for (const alignment of alignments) {
    if (alignment.type === "delete") continue;
    const h = stripHeights[stripIdx];
    const stripWidth = alignment.type === "insert" ? devStrips.width : width;
    composites.push({
      input: outputStrips[stripIdx],
      top: yOffset,
      left: 0,
      raw: { width: stripWidth, height: h, channels: 4 },
    });
    yOffset += h;
    stripIdx++;
  }

  await sharp({
    create: {
      width,
      height: outputHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);

  const changePercentage = totalPixels > 0 ? (changeCount / totalPixels) * 100 : 0;

  return {
    diffImagePath: outputPath,
    changeCount,
    totalPixels,
    changePercentage,
  };
}

async function compositeHighlight(
  devImagePath: string,
  top: number,
  width: number,
  height: number,
  diffBuf: Buffer
): Promise<Buffer> {
  const devStrip = await sharp(devImagePath)
    .extract({ left: 0, top, width, height })
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const result = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const di = i * 4;
    // Check if pixelmatch marked this pixel as different (red channel)
    if (diffBuf[di] > 200 && diffBuf[di + 1] < 100) {
      // Blend yellow overlay at 50% opacity
      result[di] = Math.round(devStrip[di] * 0.5 + 225 * 0.5);     // R
      result[di + 1] = Math.round(devStrip[di + 1] * 0.5 + 208 * 0.5); // G
      result[di + 2] = Math.round(devStrip[di + 2] * 0.5 + 52 * 0.5);  // B
      result[di + 3] = 255;
    } else {
      result[di] = devStrip[di];
      result[di + 1] = devStrip[di + 1];
      result[di + 2] = devStrip[di + 2];
      result[di + 3] = devStrip[di + 3];
    }
  }

  return result;
}

function applyFullOverlay(
  strip: Buffer,
  width: number,
  height: number,
  color: [number, number, number, number]
): Buffer {
  const result = Buffer.alloc(width * height * 4);
  const alpha = color[3] / 255;

  for (let i = 0; i < width * height; i++) {
    const di = i * 4;
    result[di] = Math.round(strip[di] * (1 - alpha) + color[0] * alpha);
    result[di + 1] = Math.round(strip[di + 1] * (1 - alpha) + color[1] * alpha);
    result[di + 2] = Math.round(strip[di + 2] * (1 - alpha) + color[2] * alpha);
    result[di + 3] = 255;
  }

  return result;
}

async function directDiff(
  prodImagePath: string,
  devImagePath: string,
  outputPath: string,
  targetWidth: number
): Promise<DiffResult> {
  const prodImg = await sharp(prodImagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const devImg = await sharp(devImagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const width = Math.max(prodImg.info.width, devImg.info.width);
  const height = Math.max(prodImg.info.height, devImg.info.height);

  // Resize both to same dimensions
  const prodResized = await sharp(prodImagePath).resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).ensureAlpha().raw().toBuffer();
  const devResized = await sharp(devImagePath).resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).ensureAlpha().raw().toBuffer();

  const diffBuf = Buffer.alloc(width * height * 4);
  const numDiff = pixelmatch(
    new Uint8Array(prodResized),
    new Uint8Array(devResized),
    new Uint8Array(diffBuf),
    width,
    height,
    { threshold: 0.1 }
  );

  // Composite highlight onto dev image
  const highlighted = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const di = i * 4;
    if (diffBuf[di] > 200 && diffBuf[di + 1] < 100) {
      highlighted[di] = Math.round(devResized[di] * 0.5 + 225 * 0.5);
      highlighted[di + 1] = Math.round(devResized[di + 1] * 0.5 + 208 * 0.5);
      highlighted[di + 2] = Math.round(devResized[di + 2] * 0.5 + 52 * 0.5);
      highlighted[di + 3] = 255;
    } else {
      highlighted[di] = devResized[di];
      highlighted[di + 1] = devResized[di + 1];
      highlighted[di + 2] = devResized[di + 2];
      highlighted[di + 3] = devResized[di + 3];
    }
  }

  await sharp(highlighted, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);

  const totalPixels = width * height;
  return {
    diffImagePath: outputPath,
    changeCount: numDiff,
    totalPixels,
    changePercentage: totalPixels > 0 ? (numDiff / totalPixels) * 100 : 0,
  };
}
