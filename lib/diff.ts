import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { promises as fs } from "fs";
import { sliceIntoStrips, computeStripHash, alignStrips } from "./diff-strips";

export interface DiffResult {
  diffImagePath: string;
  alignedProdImagePath: string;
  alignedDevImagePath: string;
  highlightImagePath: string;
  changeCount: number;
  totalPixels: number;
  changePercentage: number;
}

/** Highlight overlay colour — pinkish-red that stands out on any background. */
const HL_R = 255, HL_G = 50, HL_B = 100, HL_ALPHA = 0.45;

/**
 * Blend a highlight tint onto `prod` pixels wherever `diff` marks a change.
 * With the default pixelmatch options the diff buffer paints changed pixels
 * with `diffColor` at full alpha (255) and unchanged pixels at `alpha * 255`
 * (~25).  Thresholding at 128 cleanly separates the two.
 */
function blendHighlight(
  prod: Buffer,
  diff: Buffer,
  length: number,
): Buffer {
  const out = Buffer.from(prod);
  for (let i = 0; i < length; i += 4) {
    if (diff[i + 3] > 128) {
      out[i]     = Math.round(out[i]     * (1 - HL_ALPHA) + HL_R * HL_ALPHA);
      out[i + 1] = Math.round(out[i + 1] * (1 - HL_ALPHA) + HL_G * HL_ALPHA);
      out[i + 2] = Math.round(out[i + 2] * (1 - HL_ALPHA) + HL_B * HL_ALPHA);
    }
  }
  return out;
}

/**
 * Stitch an array of RGBA raw strips into a single PNG file.
 */
async function stitchStrips(
  strips: Buffer[],
  heights: number[],
  width: number,
  outputPath: string
): Promise<void> {
  if (strips.length === 0) {
    await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toFile(outputPath);
    return;
  }

  const totalHeight = heights.reduce((a, b) => a + b, 0);
  const composites: {
    input: Buffer;
    top: number;
    left: number;
    raw: { width: number; height: number; channels: 4 };
  }[] = [];
  let yOffset = 0;

  for (let i = 0; i < strips.length; i++) {
    composites.push({
      input: strips[i],
      top: yOffset,
      left: 0,
      raw: { width, height: heights[i], channels: 4 },
    });
    yOffset += heights[i];
  }

  await sharp({
    create: {
      width,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

export async function generateDiff(
  prodImagePath: string,
  devImagePath: string,
  outputPath: string,
  alignedProdPath: string,
  alignedDevPath: string,
  stripHeight?: number,
  highlightPath?: string,
): Promise<DiffResult> {
  const sh = stripHeight ?? 100;
  const prodMeta = await sharp(prodImagePath).metadata();
  const devMeta = await sharp(devImagePath).metadata();

  const width = Math.max(prodMeta.width!, devMeta.width!);

  // If images are very small, just do direct pixelmatch
  if (prodMeta.height! < sh * 3 && devMeta.height! < sh * 3) {
    return directDiff(prodImagePath, devImagePath, outputPath, alignedProdPath, alignedDevPath, width, highlightPath);
  }

  // Slice into strips
  const prodStrips = await sliceIntoStrips(prodImagePath, sh);
  const devStrips = await sliceIntoStrips(devImagePath, sh);

  // Compute hashes
  const prodHashes = prodStrips.buffers.map((buf, i) => {
    const h = Math.min(sh, prodStrips.totalHeight - i * sh);
    return computeStripHash(buf, prodStrips.width, h);
  });
  const devHashes = devStrips.buffers.map((buf, i) => {
    const h = Math.min(sh, devStrips.totalHeight - i * sh);
    return computeStripHash(buf, devStrips.width, h);
  });

  // Align strips
  const alignments = alignStrips(prodHashes, devHashes);

  // Process each alignment and build output strips — all normalized to `width` wide
  const outputStrips: Buffer[] = [];
  const outputStripHeights: number[] = [];
  // Aligned prod/dev strips for comparison viewer
  const alignedProdStrips: Buffer[] = [];
  const alignedDevStrips: Buffer[] = [];
  const alignedStripHeights: number[] = [];
  // Highlight strips — prod with changed pixels tinted
  const highlightStrips: Buffer[] = [];
  const highlightStripHeights: number[] = [];
  let changeCount = 0;
  let totalPixels = 0;

  for (const alignment of alignments) {
    if (alignment.type === "match" || alignment.type === "modify") {
      // Always run pixel-level comparison for aligned pairs —
      // perceptual hash can miss spacing and subtle layout changes
      const prodIdx = alignment.prodIndex!;
      const devIdx = alignment.devIndex!;
      const prodH = Math.min(sh, prodStrips.totalHeight - prodIdx * sh);
      const devH = Math.min(sh, devStrips.totalHeight - devIdx * sh);
      const h = Math.min(prodH, devH);

      const prodPng = await extractStrip(prodImagePath, prodIdx * sh, prodMeta.width!, prodH, width, h);
      const devPng = await extractStrip(devImagePath, devIdx * sh, devMeta.width!, devH, width, h);

      const diffBuf = Buffer.alloc(width * h * 4);
      const numDiff = pixelmatch(
        new Uint8Array(prodPng),
        new Uint8Array(devPng),
        new Uint8Array(diffBuf),
        width,
        h,
        { threshold: 0.1 }
      );

      outputStrips.push(devPng);
      outputStripHeights.push(h);

      // Aligned: both images get their strip at the same Y
      alignedProdStrips.push(prodPng);
      alignedDevStrips.push(devPng);
      alignedStripHeights.push(h);

      // Highlight: prod pixels with changed pixels tinted
      if (highlightPath) {
        highlightStrips.push(blendHighlight(prodPng, diffBuf, width * h * 4));
        highlightStripHeights.push(h);
      }

      changeCount += numDiff;
      totalPixels += width * h;
    } else if (alignment.type === "insert") {
      // Dev-only content
      const devIdx = alignment.devIndex!;
      const h = Math.min(sh, devStrips.totalHeight - devIdx * sh);
      const strip = await extractStrip(devImagePath, devIdx * sh, devMeta.width!, h, width, h);

      outputStrips.push(strip);
      outputStripHeights.push(h);

      // Aligned: blank in prod, real in dev
      const blankStrip = Buffer.alloc(width * h * 4, 0); // transparent
      alignedProdStrips.push(blankStrip);
      alignedDevStrips.push(strip);
      alignedStripHeights.push(h);

      // Highlight: inserted content is fully tinted (every pixel changed)
      if (highlightPath) {
        const allChanged = Buffer.alloc(width * h * 4, 255); // all alpha = 255 → all "changed"
        highlightStrips.push(blendHighlight(strip, allChanged, width * h * 4));
        highlightStripHeights.push(h);
      }

      changeCount += width * h;
      totalPixels += width * h;
    } else if (alignment.type === "delete") {
      // Prod-only content (removed in dev)
      const prodIdx = alignment.prodIndex!;
      const h = Math.min(sh, prodStrips.totalHeight - prodIdx * sh);
      const prodStrip = await extractStrip(prodImagePath, prodIdx * sh, prodMeta.width!, h, width, h);

      // Aligned: real in prod, blank in dev
      const blankStrip = Buffer.alloc(width * h * 4, 0); // transparent
      alignedProdStrips.push(prodStrip);
      alignedDevStrips.push(blankStrip);
      alignedStripHeights.push(h);

      // Highlight: deleted content is fully tinted
      if (highlightPath) {
        const allChanged = Buffer.alloc(width * h * 4, 255);
        highlightStrips.push(blendHighlight(prodStrip, allChanged, width * h * 4));
        highlightStripHeights.push(h);
      }

      totalPixels += prodStrips.width * h;
    }
  }

  // Stitch all output images
  if (outputStrips.length === 0) {
    const blank = sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
    await Promise.all([
      blank.clone().toFile(outputPath),
      blank.clone().toFile(alignedProdPath),
      blank.clone().toFile(alignedDevPath),
    ]);
    return {
      diffImagePath: outputPath,
      alignedProdImagePath: alignedProdPath,
      alignedDevImagePath: alignedDevPath,
      highlightImagePath: highlightPath ?? "",
      changeCount: 0,
      totalPixels: 0,
      changePercentage: 0,
    };
  }

  // Stitch in parallel: diff, aligned prod, aligned dev, and highlight
  const stitchJobs: Promise<void>[] = [
    stitchStrips(outputStrips, outputStripHeights, width, outputPath),
    stitchStrips(alignedProdStrips, alignedStripHeights, width, alignedProdPath),
    stitchStrips(alignedDevStrips, alignedStripHeights, width, alignedDevPath),
  ];
  if (highlightPath && highlightStrips.length > 0 && changeCount > 0) {
    stitchJobs.push(stitchStrips(highlightStrips, highlightStripHeights, width, highlightPath));
  }
  await Promise.all(stitchJobs);

  const changePercentage = totalPixels > 0 ? (changeCount / totalPixels) * 100 : 0;

  return {
    diffImagePath: outputPath,
    alignedProdImagePath: alignedProdPath,
    alignedDevImagePath: alignedDevPath,
    highlightImagePath: (highlightPath && changeCount > 0) ? highlightPath : "",
    changeCount,
    totalPixels,
    changePercentage,
  };
}

/**
 * Extract a strip from an image, clamping to actual bounds, and resize to target dimensions.
 * All output is RGBA raw buffer at exactly targetW x targetH.
 */
async function extractStrip(
  imagePath: string,
  top: number,
  srcWidth: number,
  srcHeight: number,
  targetW: number,
  targetH: number
): Promise<Buffer> {
  const meta = await sharp(imagePath).metadata();
  const clampedTop = Math.min(top, meta.height! - 1);
  const clampedH = Math.min(srcHeight, meta.height! - clampedTop);
  const clampedW = Math.min(srcWidth, meta.width!);

  return sharp(imagePath)
    .extract({ left: 0, top: clampedTop, width: clampedW, height: clampedH })
    .resize(targetW, targetH)
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/**
 * Direct diff for small images (no strip alignment needed).
 */
async function directDiff(
  prodImagePath: string,
  devImagePath: string,
  outputPath: string,
  alignedProdPath: string,
  alignedDevPath: string,
  targetWidth: number,
  highlightPath?: string,
): Promise<DiffResult> {
  const prodImg = await sharp(prodImagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const devImg = await sharp(devImagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const width = Math.max(prodImg.info.width, devImg.info.width);
  const height = Math.max(prodImg.info.height, devImg.info.height);

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

  // Save diff (dev image), and aligned versions (just resized originals for small images)
  const writes: Promise<void>[] = [
    sharp(devResized, { raw: { width, height, channels: 4 } }).png().toFile(outputPath).then(() => {}),
    sharp(prodResized, { raw: { width, height, channels: 4 } }).png().toFile(alignedProdPath).then(() => {}),
    sharp(devResized, { raw: { width, height, channels: 4 } }).png().toFile(alignedDevPath).then(() => {}),
  ];

  // Generate highlight image (prod with changed pixels tinted)
  if (highlightPath && numDiff > 0) {
    const hlBuf = blendHighlight(prodResized, diffBuf, width * height * 4);
    writes.push(
      sharp(hlBuf, { raw: { width, height, channels: 4 } }).png().toFile(highlightPath).then(() => {}),
    );
  }

  await Promise.all(writes);

  const totalPixels = width * height;
  return {
    diffImagePath: outputPath,
    alignedProdImagePath: alignedProdPath,
    alignedDevImagePath: alignedDevPath,
    highlightImagePath: (highlightPath && numDiff > 0) ? highlightPath : "",
    changeCount: numDiff,
    totalPixels,
    changePercentage: totalPixels > 0 ? (numDiff / totalPixels) * 100 : 0,
  };
}
