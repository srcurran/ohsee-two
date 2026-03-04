import sharp from "sharp";

export interface StripAlignment {
  type: "match" | "insert" | "delete" | "modify";
  prodIndex: number | null;
  devIndex: number | null;
  similarity: number;
}

export async function sliceIntoStrips(
  imagePath: string,
  stripHeight: number
): Promise<{ buffers: Buffer[]; width: number; totalHeight: number }> {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width!;
  const totalHeight = metadata.height!;
  const buffers: Buffer[] = [];

  const numStrips = Math.ceil(totalHeight / stripHeight);
  for (let i = 0; i < numStrips; i++) {
    const top = i * stripHeight;
    const height = Math.min(stripHeight, totalHeight - top);
    const strip = await sharp(imagePath)
      .extract({ left: 0, top, width, height })
      .raw()
      .toBuffer();
    buffers.push(strip);
  }

  return { buffers, width, totalHeight };
}

export function computeStripHash(stripBuffer: Buffer, width: number, height: number): Uint8Array {
  // Downsample to 32x8 grayscale via simple averaging
  const hashW = 32;
  const hashH = 8;
  const hash = new Uint8Array(hashW * hashH);

  const cellW = width / hashW;
  const cellH = height / hashH;

  for (let hy = 0; hy < hashH; hy++) {
    for (let hx = 0; hx < hashW; hx++) {
      let sum = 0;
      let count = 0;
      const startX = Math.floor(hx * cellW);
      const endX = Math.floor((hx + 1) * cellW);
      const startY = Math.floor(hy * cellH);
      const endY = Math.min(Math.floor((hy + 1) * cellH), height);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 3; // RGB raw
          if (idx + 2 < stripBuffer.length) {
            // Grayscale: 0.299R + 0.587G + 0.114B
            sum += stripBuffer[idx] * 0.299 + stripBuffer[idx + 1] * 0.587 + stripBuffer[idx + 2] * 0.114;
            count++;
          }
        }
      }
      hash[hy * hashW + hx] = count > 0 ? Math.round(sum / count) : 0;
    }
  }

  return hash;
}

export function hashSimilarity(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 0;
  let diffSum = 0;
  for (let i = 0; i < a.length; i++) {
    diffSum += Math.abs(a[i] - b[i]);
  }
  // Max possible diff is 255 * length
  return 1 - diffSum / (255 * a.length);
}

export function alignStrips(
  prodHashes: Uint8Array[],
  devHashes: Uint8Array[],
  threshold: number = 0.92
): StripAlignment[] {
  const m = prodHashes.length;
  const n = devHashes.length;

  // LCS-style DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sim = hashSimilarity(prodHashes[i - 1], devHashes[j - 1]);
      if (sim >= threshold) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build alignment
  const alignments: StripAlignment[] = [];
  let i = m;
  let j = n;

  const tempAlignments: StripAlignment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = hashSimilarity(prodHashes[i - 1], devHashes[j - 1]);
      if (sim >= threshold && dp[i][j] === dp[i - 1][j - 1] + 1) {
        tempAlignments.push({
          type: sim > 0.98 ? "match" : "modify",
          prodIndex: i - 1,
          devIndex: j - 1,
          similarity: sim,
        });
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        tempAlignments.push({
          type: "delete",
          prodIndex: i - 1,
          devIndex: null,
          similarity: 0,
        });
        i--;
      } else {
        tempAlignments.push({
          type: "insert",
          prodIndex: null,
          devIndex: j - 1,
          similarity: 0,
        });
        j--;
      }
    } else if (i > 0) {
      tempAlignments.push({
        type: "delete",
        prodIndex: i - 1,
        devIndex: null,
        similarity: 0,
      });
      i--;
    } else {
      tempAlignments.push({
        type: "insert",
        prodIndex: null,
        devIndex: j - 1,
        similarity: 0,
      });
      j--;
    }
  }

  // Reverse since we built it backwards
  return tempAlignments.reverse();
}
