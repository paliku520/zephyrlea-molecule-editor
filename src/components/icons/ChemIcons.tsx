import type { ReactNode, SVGProps } from 'react';

type ChemIconProps = SVGProps<SVGSVGElement>;

function ChemSvg({ children, ...props }: ChemIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SingleBondIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M5.2 18.8 18.8 5.2" />
    </ChemSvg>
  );
}

export function DoubleBondIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M3.9 17.4 17.4 3.9" />
      <path d="M7.7 20.1 20.1 7.7" />
    </ChemSvg>
  );
}

export function TripleBondIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M3 16.6 16.6 3" />
      <path d="M6.8 19.6 19.6 6.8" />
      <path d="M10.5 21.9 21.9 10.5" />
    </ChemSvg>
  );
}

export function WedgeBondIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M4.6 19.8 9.9 20.7 20.4 4.6Z" fill="currentColor" stroke="none" />
    </ChemSvg>
  );
}

export function DativeBondIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M4.6 19.4 19.4 4.6" />
      <path d="M12.4 4.6h7v7" />
    </ChemSvg>
  );
}

export function WavyBondIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M3.2 16.9c2-3.3 4.5-3.3 6.5 0s4.5 3.3 6.5 0 4.5-3.3 6.5 0" transform="rotate(-45 12 12)" />
    </ChemSvg>
  );
}

export function BenzeneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M12 3.1 19.7 7.6v8.8L12 20.9 4.3 16.4V7.6Z" />
      <circle cx="12" cy="12" r="3.5" />
    </ChemSvg>
  );
}

export function CyclopropaneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M12 4.2 20 19.3H4Z" />
    </ChemSvg>
  );
}

export function CyclobutaneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M12 3.1 20.9 12 12 20.9 3.1 12Z" />
    </ChemSvg>
  );
}

export function CyclopentaneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M12 3.2 20.8 9.6l-3.4 10.2H6.6L3.2 9.6Z" />
    </ChemSvg>
  );
}

export function CyclohexaneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <path d="M12 3.1 19.7 7.6v8.8L12 20.9 4.3 16.4V7.6Z" />
    </ChemSvg>
  );
}

export function CycloheptaneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <circle cx="12" cy="12" r="8.2" />
    </ChemSvg>
  );
}

export function CyclooctaneIcon(props: ChemIconProps) {
  return (
    <ChemSvg {...props}>
      <circle cx="12" cy="12" r="8.2" />
    </ChemSvg>
  );
}
