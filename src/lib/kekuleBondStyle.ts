import type { KekuleNamespace } from './kekule';

/**
 * Bond line styling for the dark canvas.
 *
 * Kekule draws every bond with a fixed 1 px stroke and caps the multiple-bond
 * spacing at an absolute 5 px, so a double bond looks thin and cramped once the
 * canvas is zoomed in. These numbers are ratios of the rendered bond length, so
 * the drawing keeps the same proportions at every zoom level.
 */
const LINE_WIDTH_RATIO = 0.042;
const LINE_WIDTH_MIN_PX = 1.1;
const LINE_WIDTH_MAX_PX = 6;

const SPACING_RATIO = 0.125;
const SPACING_MIN_STROKE_FACTOR = 1.8;
const SPACING_MAX_RATIO = 0.32;

/** Inner line of a ring double bond is drawn shorter than the main line. */
const SECONDARY_LINE_RATIO = 0.72;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface Point {
  x: number;
  y: number;
}

function findBondBetweenNodes(startNode: any, endNode: any) {
  const connectors: any[] = startNode?.getLinkedConnectors?.() ?? [];
  for (const connector of connectors) {
    const objs: any[] = connector?.getConnectedObjs?.() ?? [];
    if (objs.indexOf(endNode) >= 0) return connector;
  }
  return null;
}

interface BondRingInfo {
  inRing: boolean;
  /** +1/-1 pointing at the ring interior, or 0 when it cannot be decided. */
  side: number;
}

const NOT_IN_RING: BondRingInfo = { inRing: false, side: 0 };

/**
 * Ring bonds are drawn like in a textbook structure (one line on the bond, one
 * shortened line inside the ring). Bonds outside a ring keep Kekule's default
 * look, where both lines are full length.
 */
function getBondRingInfo(
  self: any,
  context: any,
  startNode: any,
  endNode: any,
  startCoord: Point,
  endCoord: Point,
  normalX: number,
  normalY: number,
): BondRingInfo {
  const bond = findBondBetweenNodes(startNode, endNode);
  const fragment = bond?.getParentFragment?.();
  if (!fragment?.findSSSR) return NOT_IN_RING;

  let rings: any[] = [];
  try {
    rings = fragment.findSSSR() ?? [];
  } catch {
    return NOT_IN_RING;
  }

  const ring = rings.find((item) => (item?.connectors ?? []).indexOf(bond) >= 0);
  if (!ring) return NOT_IN_RING;

  let centerX = 0;
  let centerY = 0;
  let count = 0;
  for (const node of ring.nodes ?? []) {
    const coord = self.getTransformedCoord2D(context, node, true);
    if (coord) {
      centerX += coord.x;
      centerY += coord.y;
      count += 1;
    }
  }
  if (!count) return { inRing: true, side: 0 };

  centerX /= count;
  centerY /= count;

  const midX = (startCoord.x + endCoord.x) / 2;
  const midY = (startCoord.y + endCoord.y) / 2;
  const towardsRing = (centerX - midX) * -normalY + (centerY - midY) * normalX;
  return { inRing: true, side: towardsRing >= 0 ? 1 : -1 };
}

export function installBondLineStyle(K: KekuleNamespace) {
  const proto = K.Render?.ChemCtab2DRenderer?.prototype;
  if (!proto || proto.__zephyrleaBondStyle) return;

  const originalDraw = proto.doDrawSymmetryLineConnector;
  if (typeof originalDraw !== 'function') return;

  proto.__zephyrleaBondStyle = true;

  // Kekule ships 0.18 by default and caps the spacing at 5 px, which is what
  // makes multi-line bonds collapse into each other when zoomed in.
  const lengthConfigs = K.Render?.getRender2DConfigs?.()?.getLengthConfigs?.();
  lengthConfigs?.setMultipleBondSpacingRatio?.(SPACING_RATIO);
  lengthConfigs?.setMultipleBondMaxAbsSpacing?.(null);

  const createLineOptions = (options: any, strokeWidth: number) => {
    const lineOptions = Object.create(options);
    lineOptions.strokeWidth = strokeWidth;
    lineOptions.bondLineWidth = strokeWidth;
    return lineOptions;
  };

  const drawMultipleLines = (
    self: any,
    context: any,
    startNode: any,
    endNode: any,
    startCoord: Point,
    endCoord: Point,
    bondLengthPx: number,
    subLines: any[],
    scissors: boolean,
    options: any,
  ) => {
    const utils = K.CoordUtils;
    const count = subLines.length;
    const strokeWidth = options.strokeWidth as number;
    const unitLength = options.unitLength || 1;

    const spacingBase =
      options.multipleBondSpacingAbs !== null && options.multipleBondSpacingAbs !== undefined
        ? options.multipleBondSpacingAbs * unitLength
        : (options.multipleBondSpacingRatio ?? SPACING_RATIO) * bondLengthPx;
    const spacing = clamp(
      spacingBase,
      strokeWidth * SPACING_MIN_STROKE_FACTOR,
      Math.max(bondLengthPx * SPACING_MAX_RATIO, strokeWidth * SPACING_MIN_STROKE_FACTOR),
    );

    const deltaX = endCoord.x - startCoord.x;
    const deltaY = endCoord.y - startCoord.y;
    const distance = Math.max(Math.hypot(deltaX, deltaY), 0.0001);
    const normalX = deltaX / distance;
    const normalY = deltaY / distance;

    const ringInfo = getBondRingInfo(
      self,
      context,
      startNode,
      endNode,
      startCoord,
      endCoord,
      normalX,
      normalY,
    );

    const bondAlign = (subLines as any).bondAlign;
    let align = 0;
    if (count % 2 === 0) {
      align = scissors
        ? 0
        : K.ObjUtils.isUnset(bondAlign)
          ? self._decideEvenBondAlign(context, startNode, endNode)
          : bondAlign;

      // Kekule falls back to two symmetric lines when a bond is shared by two
      // rings (the fused bond of a fused system). Those lines drift away from
      // the vertices and merge with the neighbours, so keep a line on the bond
      // and move the second one into the ring instead.
      if (!align && ringInfo.side) {
        align = ringInfo.side;
      }
    }

    const offsets: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const subLine = subLines[i];
      if (K.ObjUtils.notUnset(subLine.offsetAdjust)) {
        offsets.push(subLine.offsetAdjust);
      } else if (i === 0 && align !== 0) {
        offsets.push(0);
      } else {
        const direction = i & 1 ? 1 : -1;
        offsets.push(align !== 0 ? align * direction * ((i + 1) >> 1) : ((i >> 1) + 0.5) * direction);
      }
    }

    const group = self.createDrawGroup(context);
    const segments: Array<{
      start: Point;
      end: Point;
      lineOptions: any;
      arrowParams: any;
    }> = [];

    let startSum: Point = { x: 0, y: 0 };
    let endSum: Point = { x: 0, y: 0 };
    let edgeWidthSum = 0;

    for (let i = 0; i < count; i += 1) {
      const subLine = subLines[i];
      const offset = offsets[i] * spacing;
      const shiftX = -normalY * offset;
      const shiftY = normalX * offset;

      let start: Point = { x: startCoord.x + shiftX, y: startCoord.y + shiftY };
      let end: Point = { x: endCoord.x + shiftX, y: endCoord.y + shiftY };

      // Only ring bonds use the textbook style: one full line plus a shortened
      // line inside the ring. Non-ring double bonds keep Kekule's original look
      // with two full-length lines.
      if (
        ringInfo.inRing &&
        count === 2 &&
        i !== 0 &&
        offsets[i] !== 0 &&
        offsets.includes(0)
      ) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        start = {
          x: midX + (start.x - midX) * SECONDARY_LINE_RATIO,
          y: midY + (start.y - midY) * SECONDARY_LINE_RATIO,
        };
        end = {
          x: midX + (end.x - midX) * SECONDARY_LINE_RATIO,
          y: midY + (end.y - midY) * SECONDARY_LINE_RATIO,
        };
      }

      const lineOptions = Object.create(options);
      lineOptions.strokeColor = options.color;
      lineOptions.strokeDash = subLine.isDash;
      lineOptions.strokeWidth = subLine.isBold
        ? strokeWidth * (options.boldBondLineWidthRatio || 2)
        : strokeWidth;
      lineOptions.lineCap = options.bondLineCap;
      lineOptions.lineJoin = options.bondLineJoin;

      const arrowParams = subLine.isArrow
        ? {
            width: (options.bondArrowWidth || 6) * unitLength,
            length: (options.bondArrowLength || 6) * unitLength,
          }
        : null;

      segments.push({ start, end, lineOptions, arrowParams });

      startSum = utils.add(startSum, start);
      endSum = utils.add(endSum, end);
      if (i === 0 || i === count - 1) {
        edgeWidthSum += lineOptions.strokeWidth / 2;
      }
    }

    for (let i = 0; i < count; i += 1) {
      const segment = segments[i];
      const from = segment.start;
      const to = scissors ? segments[count - i - 1].end : segment.end;
      const element = self.drawArrowLine(context, from, to, segment.arrowParams, segment.lineOptions);
      self.addToDrawGroup(element, group);
    }

    const boundStart = utils.divide(startSum, count);
    const boundEnd = utils.divide(endSum, count);
    const boundWidth = spacing * Math.abs(offsets[count - 1] - offsets[0]) + edgeWidthSum;

    return {
      element: group,
      boundInfo: self.createLineBoundInfo(boundStart, boundEnd, boundWidth),
    };
  };

  proto.doDrawSymmetryLineConnector = function (
    context: any,
    startNode: any,
    endNode: any,
    startCoord: Point,
    endCoord: Point,
    bondLengthPx: number,
    subLines: any[],
    scissors: boolean,
    options: any,
  ) {
    const strokeWidth = clamp(
      bondLengthPx * LINE_WIDTH_RATIO,
      LINE_WIDTH_MIN_PX,
      LINE_WIDTH_MAX_PX,
    );
    const lineOptions = createLineOptions(options, strokeWidth);

    if (!subLines || !subLines.length || subLines.length < 2) {
      return originalDraw.call(
        this,
        context,
        startNode,
        endNode,
        startCoord,
        endCoord,
        bondLengthPx,
        subLines,
        scissors,
        lineOptions,
      );
    }

    return drawMultipleLines(
      this,
      context,
      startNode,
      endNode,
      startCoord,
      endCoord,
      bondLengthPx,
      subLines,
      scissors,
      lineOptions,
    );
  };
}
