import type { KekuleNamespace } from './kekule';

interface Point {
  x: number;
  y: number;
}

const IDEAL_BOND_LENGTH = 0.8;

/**
 * A small force-directed layout used when Kekule receives a structure without
 * coordinates (for example a pasted SMILES string). It also powers "Clean Up".
 * Kekule itself only ships a coordinate generator through optional OpenBabel
 * assets, so a pure JS layout keeps the first delivery self-contained.
 */
export function layoutMolecule(_kekule: KekuleNamespace, mol: any): number {
  const nodes: any[] = mol?.getNodes?.() ?? [];
  if (nodes.length === 0) return 0;

  if (nodes.length === 1) {
    nodes[0].setCoord2D?.({ x: 0, y: 0 });
    return 1;
  }

  const nodeIndex = new Map<any, number>();
  nodes.forEach((node, index) => nodeIndex.set(node, index));

  const edges: Array<[number, number]> = [];
  const adjacency: number[][] = nodes.map(() => []);

  for (const connector of mol.getConnectors?.() ?? []) {
    const connectedCount = connector.getConnectedObjCount?.() ?? 0;
    if (connectedCount < 2) continue;

    const start = nodeIndex.get(connector.getConnectedObjAt(0));
    const end = nodeIndex.get(connector.getConnectedObjAt(1));
    if (start === undefined || end === undefined || start === end) continue;

    edges.push([start, end]);
    adjacency[start].push(end);
    adjacency[end].push(start);
  }

  const visited = new Array<boolean>(nodes.length).fill(false);
  const components: number[][] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    if (visited[i]) continue;

    const component: number[] = [];
    const stack = [i];
    visited[i] = true;

    while (stack.length > 0) {
      const current = stack.pop() as number;
      component.push(current);
      for (const neighbor of adjacency[current]) {
        if (!visited[neighbor]) {
          visited[neighbor] = true;
          stack.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  const laidOutComponents = components.map((component) => layoutComponent(component, edges));
  const finalPoints = new Array<Point>(nodes.length);
  const componentGap = 1.6;
  let offsetX = 0;

  for (const component of laidOutComponents) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of component.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    const shiftX = offsetX - minX;
    const centerY = (minY + maxY) / 2;

    component.indices.forEach((nodeIndexValue, pointIndex) => {
      const point = component.points[pointIndex];
      finalPoints[nodeIndexValue] = {
        x: point.x + shiftX,
        y: point.y - centerY,
      };
    });

    offsetX += maxX - minX + componentGap;
  }

  const totalWidth = offsetX - componentGap;
  const xCenter = totalWidth / 2;

  nodes.forEach((node, index) => {
    const point = finalPoints[index];
    node.setCoord2D?.({ x: point.x - xCenter, y: point.y });
  });

  return nodes.length;
}

function layoutComponent(
  indices: number[],
  edges: Array<[number, number]>,
): { indices: number[]; points: Point[] } {
  const count = indices.length;
  if (count === 1) {
    return { indices, points: [{ x: 0, y: 0 }] };
  }

  const localIndex = new Map<number, number>();
  indices.forEach((globalIndex, index) => localIndex.set(globalIndex, index));

  const localEdges: Array<[number, number]> = [];
  for (const [start, end] of edges) {
    const localStart = localIndex.get(start);
    const localEnd = localIndex.get(end);
    if (localStart !== undefined && localEnd !== undefined) {
      localEdges.push([localStart, localEnd]);
    }
  }

  const radius = Math.sqrt(count);
  const points: Point[] = indices.map((_, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const idealDistance = 1.2;
  const iterations = count > 80 ? 180 : 320;
  let temperature = Math.max(0.8, Math.sqrt(count) * 0.5);
  const cooling = temperature / (iterations + 1);
  const displacementX = new Float64Array(count);
  const displacementY = new Float64Array(count);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    displacementX.fill(0);
    displacementY.fill(0);

    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let dx = points[i].x - points[j].x;
        let dy = points[i].y - points[j].y;
        let distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < 0.0001) {
          const angle = Math.random() * Math.PI * 2;
          dx = Math.cos(angle) * 0.1;
          dy = Math.sin(angle) * 0.1;
          distanceSquared = 0.01;
        }

        const distance = Math.sqrt(distanceSquared);
        const force = (idealDistance * idealDistance) / distance;
        const forceX = (dx / distance) * force;
        const forceY = (dy / distance) * force;

        displacementX[i] += forceX;
        displacementY[i] += forceY;
        displacementX[j] -= forceX;
        displacementY[j] -= forceY;
      }
    }

    for (const [start, end] of localEdges) {
      const dx = points[start].x - points[end].x;
      const dy = points[start].y - points[end].y;
      const distance = Math.max(Math.hypot(dx, dy), 0.0001);
      const force = (distance * distance) / idealDistance;
      const forceX = (dx / distance) * force;
      const forceY = (dy / distance) * force;

      displacementX[start] -= forceX;
      displacementY[start] -= forceY;
      displacementX[end] += forceX;
      displacementY[end] += forceY;
    }

    for (let i = 0; i < count; i += 1) {
      const distance = Math.hypot(displacementX[i], displacementY[i]);
      if (distance < 0.0001) continue;

      const limitedDistance = Math.min(distance, temperature);
      points[i].x += (displacementX[i] / distance) * limitedDistance;
      points[i].y += (displacementY[i] / distance) * limitedDistance;
    }

    temperature = Math.max(0.01, temperature - cooling);
  }

  let bondLengthSum = 0;
  for (const [start, end] of localEdges) {
    bondLengthSum += Math.hypot(points[start].x - points[end].x, points[start].y - points[end].y);
  }

  const averageBondLength = localEdges.length > 0 ? bondLengthSum / localEdges.length : IDEAL_BOND_LENGTH;
  const scale = IDEAL_BOND_LENGTH / (averageBondLength || IDEAL_BOND_LENGTH);

  for (const point of points) {
    point.x *= scale;
    point.y *= scale;
  }

  return { indices, points };
}
