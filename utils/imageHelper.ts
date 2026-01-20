import { RGB } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';

// --- Image Processing ---

export const getCroppedImg = async (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<string> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => { image.onload = resolve; });

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('No 2d context');

  // Draw the cropped area onto the fixed size canvas (resizing it)
  // Use high quality
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT
  );

  return canvas.toDataURL('image/png');
};

const getDistanceSq = (c1: RGB, c2: RGB) => {
  return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

const getSaturation = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max === 0) return 0;
  return d / max;
};

// Returns 1 if close to black or white (common filaments), 0 otherwise
const getExtremesBonus = (r: number, g: number, b: number) => {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.10 || lum > 0.90) return 0.5; // Tightened threshold slightly
  return 0;
};

const despeckleIndices = (indices: Uint8Array, width: number, height: number, iterations: number = 1): Uint8Array => {
    let current = new Uint8Array(indices);
    const len = current.length;

    for (let it = 0; it < iterations; it++) {
        const next = new Uint8Array(current);
        for (let i = 0; i < len; i++) {
            const x = i % width;
            const y = Math.floor(i / width);
            const myColor = current[i];

            // Count neighbors
            const neighbors: Record<number, number> = {};
            let count = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        const nColor = current[nIdx];
                        neighbors[nColor] = (neighbors[nColor] || 0) + 1;
                        count++;
                    }
                }
            }

            // Check if island (no neighbors of same color)
            // Or if dominated by another color
            const mySupport = neighbors[myColor] || 0;
            
            // If less than 2 neighbors share my color, switch to strongest neighbor
            if (mySupport < 2) {
                let maxC = myColor;
                let maxCount = -1;
                for (const cStr in neighbors) {
                    const c = parseInt(cStr);
                    if (neighbors[c] > maxCount) {
                        maxCount = neighbors[c];
                        maxC = c;
                    }
                }
                if (maxCount >= 3) { // Require quorum
                    next[i] = maxC;
                }
            }
        }
        current = next;
    }
    return current;
};

export const quantizeImage = (
  ctx: CanvasRenderingContext2D,
  k: number = 4
): { palette: RGB[]; indices: Uint8Array } => {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const pixelCount = width * height;

  // 1. K-Means++ Initialization
  let centroids: RGB[] = [];
  
  const firstIdx = Math.floor(Math.random() * pixelCount);
  centroids.push({
    r: data[firstIdx * 4],
    g: data[firstIdx * 4 + 1],
    b: data[firstIdx * 4 + 2],
  });

  for (let c = 1; c < k; c++) {
    const dists = new Float32Array(pixelCount);
    let sumDistSq = 0;

    for (let i = 0; i < pixelCount; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const p = { r, g, b };

      let minDistSq = Infinity;
      for (const centroid of centroids) {
        const d = getDistanceSq(p, centroid);
        if (d < minDistSq) minDistSq = d;
      }
      
      dists[i] = minDistSq;
      sumDistSq += minDistSq;
    }

    let target = Math.random() * sumDistSq;
    let nextCentroidIdx = -1;

    for (let i = 0; i < pixelCount; i++) {
      target -= dists[i];
      if (target <= 0) {
        nextCentroidIdx = i;
        break;
      }
    }
    if (nextCentroidIdx === -1) nextCentroidIdx = pixelCount - 1;

    centroids.push({
      r: data[nextCentroidIdx * 4],
      g: data[nextCentroidIdx * 4 + 1],
      b: data[nextCentroidIdx * 4 + 2],
    });
  }

  let assignments = new Uint8Array(pixelCount);
  const iterations = 10;
  
  // 2. Standard K-Means Iterations
  for (let iter = 0; iter < iterations; iter++) {
    const sums = Array(k).fill(0).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

    for (let i = 0; i < pixelCount; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const p = { r, g, b };
      
      let minDist = Infinity;
      let bestCluster = 0;

      for (let j = 0; j < k; j++) {
        const dist = getDistanceSq(p, centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = j;
        }
      }

      assignments[i] = bestCluster;
      sums[bestCluster].r += r;
      sums[bestCluster].g += g;
      sums[bestCluster].b += b;
      sums[bestCluster].count++;
    }

    let changed = false;
    for (let j = 0; j < k; j++) {
      if (sums[j].count > 0) {
        const newR = Math.round(sums[j].r / sums[j].count);
        const newG = Math.round(sums[j].g / sums[j].count);
        const newB = Math.round(sums[j].b / sums[j].count);
        
        if (newR !== centroids[j].r || newG !== centroids[j].g || newB !== centroids[j].b) {
            centroids[j] = { r: newR, g: newG, b: newB };
            changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // 3. Smart Medoid Selection
  const medoids: RGB[] = centroids.map(c => ({...c})); 
  const minMedoidScores = new Array(k).fill(Infinity);
  // Increased weight to prioritize saturated colors even more (was 4000)
  const SATURATION_WEIGHT = 5000; 
  const EXTREME_WEIGHT = 2000;

  for (let i = 0; i < pixelCount; i++) {
    const clusterIdx = assignments[i];
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const p = { r, g, b };
    
    const distSq = getDistanceSq(p, centroids[clusterIdx]);
    const saturation = getSaturation(r, g, b);
    const extremeBonus = getExtremesBonus(r, g, b); 
    
    // Score minimizes distance to centroid BUT heavily subtracts for high saturation
    const score = distSq - (saturation * SATURATION_WEIGHT) - (extremeBonus * EXTREME_WEIGHT);

    if (score < minMedoidScores[clusterIdx]) {
      minMedoidScores[clusterIdx] = score;
      medoids[clusterIdx] = { r, g, b };
    }
  }
  
  const finalPalette = medoids;

  // 4. Frequency Sorting
  const clusterCounts = new Array(k).fill(0).map((_, i) => ({ index: i, count: 0 }));
  for(let i=0; i<pixelCount; i++) {
    clusterCounts[assignments[i]].count++;
  }
  clusterCounts.sort((a, b) => b.count - a.count);

  const oldToNew = new Array(k).fill(0);
  const sortedPalette = new Array(k);
  
  clusterCounts.forEach((item, newIndex) => {
    oldToNew[item.index] = newIndex;
    sortedPalette[newIndex] = finalPalette[item.index];
  });

  const finalIndices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    finalIndices[i] = oldToNew[assignments[i]];
  }

  // 5. Despeckle Step (Clean up single-pixel noise)
  const cleanedIndices = despeckleIndices(finalIndices, width, height, 2);

  return { palette: sortedPalette, indices: cleanedIndices };
};

export const drawQuantizedPreview = (
  canvas: HTMLCanvasElement,
  indices: Uint8Array,
  palette: RGB[]
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let i = 0; i < indices.length; i++) {
    const color = palette[indices[i]];
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }
  
  ctx.putImageData(imgData, 0, 0);
};

export const resizeImageToCanvas = (img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if(ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Apply Filters to boost vibrancy BEFORE processing
        // Increased to 150/120 to really force colors to pop
        ctx.filter = 'saturate(150%) contrast(120%)';
        
        ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    return canvas;
}