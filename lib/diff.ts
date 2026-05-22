import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { sliceIntoStrips, computeStripHash, alignStrips } from "./diff-strips";

export interface DiffResult {
  alignedProdImagePath: string;
  alignedDevImagePath: string;
  /** Prod screenshot with changed regions tinted. */
  highlightImagePath: string;
  /** Dev screenshot with changed regions tinted. */
  highlightDevImagePath: string;
  changeCount: number;
  totalPixels: number;
  changePercentage: number;
}

/** Highlight overlay colour — pinkish-red that stands out on any background. */
const HL_R = 255, HL_G = 75, HL_B = 105, HL_ALPHA = 0.55;
/** Dilation radius (px) — grows each changed pixel into a visible block so
 *  highlights are obvious even at thumbnail scale. */
const HL_DILATE = 20;

/**
 * Blend a highlight tint onto `prod` pixels wherever `diff` marks a change,
 * dilating the change mask first so individual changed pixels become visible
 * blocks at thumbnail scale.
 *
 * Uses separable box dilation: first expand horizontally, then vertically.
 * This is O(W×H) and creates solid rectangular highlight regions.
 */
function blendHighlight(
  prod: Buffer,
  diff: Buffer | Uint8Array,
  length: number,
  imgWidth: number,
): Buffer {
  const pixelCount = length / 4;
  const h = pixelCount / imgWidth;

  // Step 1: Extract binary mask from diff alpha channel.
  // pixelmatch paints changed pixels red (255,0,0) and anti-aliased
  // pixels yellow (255,255,0) — both with blue = 0.  Unchanged pixels
  // are grayscale (N,N,N) where blue ≈ 230+.  Checking blue < 100
  // cleanly separates changed/AA from unchanged.
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    mask[i] = diff[i * 4 + 2] < 100 ? 1 : 0;
  }

  // Step 2: Dilate horizontally — for each row, expand 1s outward by HL_DILATE.
  const hMask = new Uint8Array(pixelCount);
  for (let y = 0; y < h; y++) {
    const row = y * imgWidth;
    let last = -HL_DILATE - 1;
    for (let x = 0; x < imgWidth; x++) {
      if (mask[row + x]) last = x;
      if (x - last <= HL_DILATE) hMask[row + x] = 1;
    }
    last = imgWidth + HL_DILATE + 1;
    for (let x = imgWidth - 1; x >= 0; x--) {
      if (mask[row + x]) last = x;
      if (last - x <= HL_DILATE) hMask[row + x] = 1;
    }
  }

  // Step 3: Dilate vertically (using the horizontally-dilated mask).
  const finalMask = new Uint8Array(pixelCount);
  for (let x = 0; x < imgWidth; x++) {
    let last = -HL_DILATE - 1;
    for (let y = 0; y < h; y++) {
      if (hMask[y * imgWidth + x]) last = y;
      if (y - last <= HL_DILATE) finalMask[y * imgWidth + x] = 1;
    }
    last = h + HL_DILATE + 1;
    for (let y = h - 1; y >= 0; y--) {
      if (hMask[y * imgWidth + x]) last = y;
      if (last - y <= HL_DILATE) finalMask[y * imgWidth + x] = 1;
    }
  }

  // Step 4: Blend highlight colour onto prod wherever the dilated mask is set.
  const out = Buffer.from(prod);
  const invAlpha = 1 - HL_ALPHA;
  const tR = HL_R * HL_ALPHA, tG = HL_G * HL_ALPHA, tB = HL_B * HL_ALPHA;
  for (let i = 0; i < pixelCount; i++) {
    if (finalMask[i]) {
      const px = i * 4;
      out[px]     = Math.round(out[px]     * invAlpha + tR);
      out[px + 1] = Math.round(out[px + 1] * invAlpha + tG);
      out[px + 2] = Math.round(out[px + 2] * invAlpha + tB);
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

/**
 * Compare prod vs dev screenshots and produce: a pair of vertically-aligned
 * prod/dev images (matching content sits at the same Y, gaps filled blank)
 * for the comparison viewer, and a highlight image (prod with changed
 * regions tinted). The raw pixelmatch diff is consumed for the change count
 * and the highlight mask — it is not itself written to disk.
 */
export async function generateDiff(
  prodImagePath: string,
  devImagePath: string,
  alignedProdPath: string,
  alignedDevPath: string,
  stripHeight?: number,
  highlightPath?: string,
  highlightDevPath?: string,
): Promise<DiffResult> {
  const sh = stripHeight ?? 100;
  const prodMeta = await sharp(prodImagePath).metadata();
  const devMeta = await sharp(devImagePath).metadata();

  const width = Math.max(prodMeta.width!, devMeta.width!);

  // If images are very small, just do direct pixelmatch
  if (prodMeta.height! < sh * 3 && devMeta.height! < sh * 3) {
    return directDiff(prodImagePath, devImagePath, alignedProdPath, alignedDevPath, width, highlightPath, highlightDevPath);
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

  // Aligned prod/dev strips for the comparison viewer — all normalized to
  // `width` wide.
  const alignedProdStrips: Buffer[] = [];
  const alignedDevStrips: Buffer[] = [];
  const alignedStripHeights: number[] = [];
  // Highlight strips — prod / dev with changed pixels tinted
  const highlightStrips: Buffer[] = [];
  const highlightDevStrips: Buffer[] = [];
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

      const diffBuf = new Uint8Array(width * h * 4);
      const numDiff = pixelmatch(
        new Uint8Array(prodPng),
        new Uint8Array(devPng),
        diffBuf,
        width,
        h,
        { threshold: 0.1 }
      );

      // Aligned: both images get their strip at the same Y
      alignedProdStrips.push(prodPng);
      alignedDevStrips.push(devPng);
      alignedStripHeights.push(h);

      // Highlight: prod / dev pixels with changed pixels tinted
      if (highlightPath || highlightDevPath) {
        if (highlightPath) highlightStrips.push(blendHighlight(prodPng, diffBuf, width * h * 4, width));
        if (highlightDevPath) highlightDevStrips.push(blendHighlight(devPng, diffBuf, width * h * 4, width));
        highlightStripHeights.push(h);
      }

      changeCount += numDiff;
      totalPixels += width * h;
    } else if (alignment.type === "insert") {
      // Dev-only content
      const devIdx = alignment.devIndex!;
      const h = Math.min(sh, devStrips.totalHeight - devIdx * sh);
      const strip = await extractStrip(devImagePath, devIdx * sh, devMeta.width!, h, width, h);

      // Aligned: blank in prod, real in dev
      const blankStrip = Buffer.alloc(width * h * 4, 0); // transparent
      alignedProdStrips.push(blankStrip);
      alignedDevStrips.push(strip);
      alignedStripHeights.push(h);

      // Highlight: inserted content is fully tinted (every pixel changed).
      // Prod has nothing here, so both highlight images show the dev strip.
      if (highlightPath || highlightDevPath) {
        const allChanged = Buffer.alloc(width * h * 4, 255); // all alpha = 255 → all "changed"
        const tinted = blendHighlight(strip, allChanged, width * h * 4, width);
        if (highlightPath) highlightStrips.push(tinted);
        if (highlightDevPath) highlightDevStrips.push(tinted);
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

      // Highlight: deleted content is fully tinted on prod. Dev has nothing
      // here, so its highlight strip stays blank — matching the aligned dev.
      if (highlightPath || highlightDevPath) {
        const allChanged = Buffer.alloc(width * h * 4, 255);
        if (highlightPath) highlightStrips.push(blendHighlight(prodStrip, allChanged, width * h * 4, width));
        if (highlightDevPath) highlightDevStrips.push(blankStrip);
        highlightStripHeights.push(h);
      }

      totalPixels += prodStrips.width * h;
    }
  }

  // Nothing aligned at all — write blank placeholders and bail.
  if (alignedProdStrips.length === 0) {
    const blank = sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
    await Promise.all([
      blank.clone().toFile(alignedProdPath),
      blank.clone().toFile(alignedDevPath),
    ]);
    return {
      alignedProdImagePath: alignedProdPath,
      alignedDevImagePath: alignedDevPath,
      highlightImagePath: "",
      highlightDevImagePath: "",
      changeCount: 0,
      totalPixels: 0,
      changePercentage: 0,
    };
  }

  // Stitch in parallel: aligned prod, aligned dev, and the two highlights
  const stitchJobs: Promise<void>[] = [
    stitchStrips(alignedProdStrips, alignedStripHeights, width, alignedProdPath),
    stitchStrips(alignedDevStrips, alignedStripHeights, width, alignedDevPath),
  ];
  const wroteHighlight = !!highlightPath && highlightStrips.length > 0 && changeCount > 0;
  const wroteHighlightDev = !!highlightDevPath && highlightDevStrips.length > 0 && changeCount > 0;
  if (wroteHighlight) {
    stitchJobs.push(stitchStrips(highlightStrips, highlightStripHeights, width, highlightPath!));
  }
  if (wroteHighlightDev) {
    stitchJobs.push(stitchStrips(highlightDevStrips, highlightStripHeights, width, highlightDevPath!));
  }
  await Promise.all(stitchJobs);

  const changePercentage = totalPixels > 0 ? (changeCount / totalPixels) * 100 : 0;

  return {
    alignedProdImagePath: alignedProdPath,
    alignedDevImagePath: alignedDevPath,
    highlightImagePath: wroteHighlight ? highlightPath! : "",
    highlightDevImagePath: wroteHighlightDev ? highlightDevPath! : "",
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
  alignedProdPath: string,
  alignedDevPath: string,
  targetWidth: number,
  highlightPath?: string,
  highlightDevPath?: string,
): Promise<DiffResult> {
  const prodImg = await sharp(prodImagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const devImg = await sharp(devImagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const width = Math.max(prodImg.info.width, devImg.info.width);
  const height = Math.max(prodImg.info.height, devImg.info.height);

  const prodResized = await sharp(prodImagePath).resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).ensureAlpha().raw().toBuffer();
  const devResized = await sharp(devImagePath).resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).ensureAlpha().raw().toBuffer();

  const diffBuf = new Uint8Array(width * height * 4);
  const numDiff = pixelmatch(
    new Uint8Array(prodResized),
    new Uint8Array(devResized),
    diffBuf,
    width,
    height,
    { threshold: 0.1 }
  );

  // Aligned versions — for small images these are just the resized originals.
  const writes: Promise<void>[] = [
    sharp(prodResized, { raw: { width, height, channels: 4 } }).png().toFile(alignedProdPath).then(() => {}),
    sharp(devResized, { raw: { width, height, channels: 4 } }).png().toFile(alignedDevPath).then(() => {}),
  ];

  // Generate highlight images (prod / dev with changed pixels tinted)
  if (highlightPath && numDiff > 0) {
    const hlBuf = blendHighlight(prodResized, diffBuf, width * height * 4, width);
    writes.push(
      sharp(hlBuf, { raw: { width, height, channels: 4 } }).png().toFile(highlightPath).then(() => {}),
    );
  }
  if (highlightDevPath && numDiff > 0) {
    const hlDevBuf = blendHighlight(devResized, diffBuf, width * height * 4, width);
    writes.push(
      sharp(hlDevBuf, { raw: { width, height, channels: 4 } }).png().toFile(highlightDevPath).then(() => {}),
    );
  }

  await Promise.all(writes);

  const totalPixels = width * height;
  return {
    alignedProdImagePath: alignedProdPath,
    alignedDevImagePath: alignedDevPath,
    highlightImagePath: (highlightPath && numDiff > 0) ? highlightPath : "",
    highlightDevImagePath: (highlightDevPath && numDiff > 0) ? highlightDevPath : "",
    changeCount: numDiff,
    totalPixels,
    changePercentage: totalPixels > 0 ? (numDiff / totalPixels) * 100 : 0,
  };
}
