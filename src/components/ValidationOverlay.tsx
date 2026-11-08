import { useEffect, useRef } from 'react';
import type { MoleculeEditorBridge } from '../lib/editorBridge';

export interface ValidationMark {
  key: string;
  atom: unknown;
}

interface ValidationOverlayProps {
  bridge: MoleculeEditorBridge | null;
  marks: ValidationMark[];
}

/**
 * Red rings around the atoms RDKit complained about. Kekule keeps moving the
 * drawing (scroll, zoom, edits), so the rings follow the atoms on every frame
 * instead of being positioned once.
 */
export function ValidationOverlay({ bridge, marks }: ValidationOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!bridge || marks.length === 0) return;

    let frame = 0;

    const sync = () => {
      const svg = svgRef.current;

      if (svg) {
        const origin = svg.getBoundingClientRect();
        const rings = svg.querySelectorAll<SVGCircleElement>('circle[data-issue-mark]');

        for (let index = 0; index < marks.length; index += 1) {
          const circle = rings[index];
          if (!circle) continue;

          const ring = bridge.getAtomScreenRing(marks[index].atom);

          if (!ring) {
            circle.style.display = 'none';
            continue;
          }

          circle.style.display = '';
          circle.setAttribute('cx', String(ring.x - origin.left));
          circle.setAttribute('cy', String(ring.y - origin.top));
          circle.setAttribute('r', String(ring.radius));
          circle.setAttribute('stroke-width', String(Math.max(1.6, ring.radius * 0.13)));
        }
      }

      frame = window.requestAnimationFrame(sync);
    };

    frame = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(frame);
  }, [bridge, marks]);

  if (marks.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
    >
      {marks.map((mark) => (
        <circle
          key={mark.key}
          data-issue-mark={mark.key}
          cx={0}
          cy={0}
          r={0}
          fill="none"
          stroke="var(--shell-danger)"
          strokeLinecap="round"
          className="zephyrlea-issue-ring"
        />
      ))}
    </svg>
  );
}
