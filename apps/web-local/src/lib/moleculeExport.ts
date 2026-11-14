import { exportFileName } from './download';
import type { KekuleNamespace } from './kekule';
import type { Box2D } from './kekuleSpace';

export type MoleculeImageFormat = 'png' | 'svg';

export interface MoleculeImage {
  blob: Blob;
  /** Pixel size of the PNG, or the logical size of the SVG. */
  width: number;
  height: number;
  fileName: string;
}

/** The board has nothing to render, so no file should be produced. */
export class EmptyStructureError extends Error {
  constructor() {
    super('The board is empty');
    this.name = 'EmptyStructureError';
  }
}

interface ExportOptions {
  /**
   * Content bounds in object coordinates. Kekule cannot compute a container box
   * for a chem space root, so the caller passes the union of its molecules;
   * bounds only size the measuring surface, the ink is measured afterwards.
   */
  bounds?: Box2D | null;
  /** PNG pixels per logical pixel; the SVG is resolution independent. */
  scale?: number;
  /** Blank margin around the drawing, in logical pixels. */
  padding?: number;
}

interface ImageLayout {
  width: number;
  height: number;
  drawX: number;
  drawY: number;
}

const DEFAULT_PADDING = 24;
const DEFAULT_PNG_SCALE = 2;
const MAX_PNG_SCALE = 4;
/**
 * Kekule draws a bond at roughly 15–20 px, so 44 px per object unit keeps a
 * generous margin around the molecule while the real ink bounds are measured.
 */
const MEASURE_PX_PER_UNIT = 44;
/** getImageData on a bigger buffer starts to cost more than the crop is worth. */
const MEASURE_MAX_SIDE = 3000;

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Draw the whole board with Kekule's own 2D renderer, into any Canvas2D target. */
function drawChemObj(K: KekuleNamespace, chemObj: any, context: any, coord: { x: number; y: number }) {
  const bridge = new K.Render.CanvasRendererBridge();
  const painter = new K.Render.ChemObjPainter2D(chemObj, bridge);
  painter.draw(context, coord, {});
}

/** Bounding box of everything the renderer actually painted (transparent canvas). */
function findInkBounds(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[rowOffset + x * 4 + 3] <= 8) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < minX ? null : { minX, minY, maxX, maxY };
}

/**
 * Render once at measuring scale to learn exactly where the ink lands. Kekule
 * positions the drawing by its centre, so replaying the same offset on a
 * cropped surface gives an evenly padded image at any resolution.
 */
function measureLayout(
  K: KekuleNamespace,
  chemObj: any,
  bounds: Box2D | null | undefined,
  padding: number,
): ImageLayout {
  const box =
    bounds ?? K.Render.ObjUtils.getContainerBox?.(chemObj, K.CoordMode?.COORD2D, true);
  if (!box) throw new EmptyStructureError();

  const objWidth = Math.max(box.x2 - box.x1, 0.5);
  const objHeight = Math.max(box.y2 - box.y1, 0.5);
  if (!Number.isFinite(objWidth) || !Number.isFinite(objHeight) || objWidth <= 0 || objHeight <= 0) {
    throw new EmptyStructureError();
  }

  let logicalWidth = objWidth * MEASURE_PX_PER_UNIT + padding * 2;
  let logicalHeight = objHeight * MEASURE_PX_PER_UNIT + padding * 2;

  // Huge structures are measured on a smaller surface; one retry covers labels
  // that reach past the generous estimate.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fit = Math.min(1, MEASURE_MAX_SIDE / Math.max(logicalWidth, logicalHeight));
    const deviceWidth = Math.max(1, Math.round(logicalWidth * fit));
    const deviceHeight = Math.max(1, Math.round(logicalHeight * fit));

    const surface = createCanvas(deviceWidth, deviceHeight);
    const context = surface.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');

    context.scale(fit, fit);
    drawChemObj(K, chemObj, context, { x: logicalWidth / 2, y: logicalHeight / 2 });

    const ink = findInkBounds(context, deviceWidth, deviceHeight);
    if (!ink) throw new EmptyStructureError();

    const clipped =
      ink.minX <= 1 ||
      ink.minY <= 1 ||
      ink.maxX >= deviceWidth - 2 ||
      ink.maxY >= deviceHeight - 2;

    if (!clipped) {
      const minX = ink.minX / fit;
      const maxX = (ink.maxX + 1) / fit;
      const minY = ink.minY / fit;
      const maxY = (ink.maxY + 1) / fit;

      const width = Math.ceil(maxX - minX) + padding * 2;
      const height = Math.ceil(maxY - minY) + padding * 2;

      return {
        width,
        height,
        // Move the drawing so the measured ink centre sits in the padded middle.
        drawX: width / 2 - ((minX + maxX) / 2 - logicalWidth / 2),
        drawY: height / 2 - ((minY + maxY) / 2 - logicalHeight / 2),
      };
    }

    logicalWidth *= 1.6;
    logicalHeight *= 1.6;
  }

  throw new Error('Could not fit the structure into the export surface');
}

function finalizeSvg(raw: string, width: number, height: number) {
  const root = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  return raw
    .replace(/^<svg[^>]*>/, root)
    .replace(/ text-decoration="undefined"/g, '');
}

async function buildSvg(
  K: KekuleNamespace,
  chemObj: any,
  layout: ImageLayout,
  width: number,
  height: number,
) {
  // Only loaded when an image is actually exported; it never runs at startup.
  const { Element } = await import('svgcanvas');
  const surface = new Element(width, height);
  const context = surface.getContext('2d');

  drawChemObj(K, chemObj, context, { x: layout.drawX, y: layout.drawY });

  return finalizeSvg(context.getSerializedSvg(true), width, height);
}

/** The PNG is rasterised from the SVG so both formats share one drawing pass. */
async function rasterizeSvg(svg: string, width: number, height: number, scale: number) {
  const surface = createCanvas(width * scale, height * scale);
  const context = surface.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG rasterisation failed'));
      image.src = url;
    });
    context.drawImage(image, 0, 0, surface.width, surface.height);
  } finally {
    URL.revokeObjectURL(url);
  }

  return surface;
}

/**
 * Render the board — every structure, at the board's own theme colours — into a
 * transparent PNG or SVG, independent of the current zoom and scroll position.
 * The PNG is rasterised from that SVG with a crisp 2× scale.
 */
export async function exportMoleculeImage(
  K: KekuleNamespace,
  chemObj: any,
  format: MoleculeImageFormat,
  options: ExportOptions,
): Promise<MoleculeImage> {
  const padding = options.padding ?? DEFAULT_PADDING;
  const layout = measureLayout(K, chemObj, options.bounds, padding);
  const width = Math.max(1, Math.round(layout.width));
  const height = Math.max(1, Math.round(layout.height));
  const svg = await buildSvg(K, chemObj, layout, width, height);

  if (format === 'svg') {
    return {
      blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      width,
      height,
      fileName: exportFileName('svg'),
    };
  }

  const scale = Math.min(Math.max(options.scale ?? DEFAULT_PNG_SCALE, 1), MAX_PNG_SCALE);
  const surface = await rasterizeSvg(svg, width, height, scale);
  const blob = await new Promise<Blob>((resolve, reject) => {
    surface.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });

  return {
    blob,
    width: surface.width,
    height: surface.height,
    fileName: exportFileName('png'),
  };
}
