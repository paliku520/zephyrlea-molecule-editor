/** Columns of the standard (long form) periodic table. */
export const PERIODIC_COLUMNS = 18;
/** Highest atomic number Kekule knows about. */
export const PERIODIC_MAX_ATOMIC_NUMBER = 118;

/** Atomic symbols in atomic-number order, so index 0 is H (1). */
const SYMBOLS = [
  'H', 'He',
  'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
];

export function getElementSymbol(atomicNumber: number): string {
  return SYMBOLS[atomicNumber - 1] ?? '';
}

export interface PeriodicCell {
  atomicNumber: number;
  symbol: string;
  /** 1-based grid column. */
  column: number;
}

export interface PeriodicRow {
  /** Marker cells that stand in for an f-block row, e.g. "57-71". */
  markers: { column: number; label: string }[];
  cells: PeriodicCell[];
}

export interface FBlockRow {
  label: string;
  cells: PeriodicCell[];
}

/** Where an element sits in the main block, or null for the f-block rows. */
function mainPosition(atomicNumber: number): { row: number; column: number } | null {
  if (atomicNumber === 1) return { row: 1, column: 1 };
  if (atomicNumber === 2) return { row: 1, column: 18 };
  if (atomicNumber <= 10) return { row: 2, column: atomicNumber <= 4 ? atomicNumber - 2 : atomicNumber + 8 };
  if (atomicNumber <= 18) return { row: 3, column: atomicNumber <= 12 ? atomicNumber - 10 : atomicNumber };
  if (atomicNumber <= 36) return { row: 4, column: atomicNumber - 18 };
  if (atomicNumber <= 54) return { row: 5, column: atomicNumber - 36 };
  if (atomicNumber <= 56) return { row: 6, column: atomicNumber - 54 };
  if (atomicNumber <= 71) return null;
  if (atomicNumber <= 86) return { row: 6, column: atomicNumber - 68 };
  if (atomicNumber <= 88) return { row: 7, column: atomicNumber - 86 };
  if (atomicNumber <= 103) return null;
  return { row: 7, column: atomicNumber - 100 };
}

function buildTable(): { rows: PeriodicRow[]; fBlock: FBlockRow[] } {
  const rows: PeriodicRow[] = Array.from({ length: 7 }, () => ({ markers: [], cells: [] }));

  // Lanthanides and actinides live in their own two rows under the table.
  rows[5].markers.push({ column: 3, label: '57-71' });
  rows[6].markers.push({ column: 3, label: '89-103' });

  const lanthanides: PeriodicCell[] = [];
  const actinides: PeriodicCell[] = [];

  for (let atomicNumber = 1; atomicNumber <= PERIODIC_MAX_ATOMIC_NUMBER; atomicNumber += 1) {
    const symbol = getElementSymbol(atomicNumber);
    const cell = { atomicNumber, symbol, column: 0 };

    if (atomicNumber >= 57 && atomicNumber <= 71) {
      lanthanides.push({ ...cell, column: atomicNumber - 56 });
      continue;
    }
    if (atomicNumber >= 89 && atomicNumber <= 103) {
      actinides.push({ ...cell, column: atomicNumber - 88 });
      continue;
    }

    const position = mainPosition(atomicNumber);
    if (!position) continue;

    rows[position.row - 1].cells.push({ ...cell, column: position.column });
  }

  for (const row of rows) {
    row.cells.sort((a, b) => a.column - b.column);
  }

  return {
    rows,
    fBlock: [
      { label: '镧系', cells: lanthanides },
      { label: '锕系', cells: actinides },
    ],
  };
}

export const PERIODIC_TABLE = buildTable();
