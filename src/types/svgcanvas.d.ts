declare module 'svgcanvas' {
  /** A fake `<canvas>` whose 2D context records SVG elements instead of pixels. */
  export interface SvgCanvasContext extends CanvasRenderingContext2D {
    getSerializedSvg(fixNamedEntities?: boolean): string;
  }

  export class Element {
    constructor(width: number, height: number);
    width: number;
    height: number;
    getContext(contextId: '2d'): SvgCanvasContext;
  }
}
