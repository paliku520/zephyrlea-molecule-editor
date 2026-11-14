"""RDKit-backed structure analysis.

The browser build computes the same numbers with RDKit's WebAssembly MinimalLib
(``apps/web/src/lib/rdkit.ts``). This module reproduces that behaviour with the
native RDKit build so both builds show identical values: the descriptor keys and
the atom parsing rules below intentionally mirror MinimalLib's
``get_descriptors()`` / ``get_json()`` output.
"""

from __future__ import annotations

from rdkit import Chem, RDLogger
from rdkit.Chem import Crippen, Descriptors, rdMolDescriptors

# Rejected structures are reported through the API, so drop RDKit's console
# warnings (they would land in the Electron log without telling the user more).
RDLogger.DisableLog("rdApp.*")

ELEMENT_SYMBOLS = (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co "
    "Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb "
    "Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os "
    "Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md "
    "No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split()


def _element_symbol(atomic_number: int) -> str:
    if atomic_number <= 0:
        return "*"
    if atomic_number <= len(ELEMENT_SYMBOLS):
        return ELEMENT_SYMBOLS[atomic_number - 1]
    return f"X{atomic_number}"


def _hill_formula(counts: dict[str, int]) -> str:
    """C, H, then the rest alphabetically; without carbon everything is alphabetical."""
    if "C" in counts:
        ordered = ["C", *(["H"] if "H" in counts else []), *sorted(s for s in counts if s not in ("C", "H"))]
    else:
        ordered = sorted(counts)

    parts = []
    for symbol in ordered:
        count = counts[symbol]
        parts.append(symbol if count == 1 else f"{symbol}{count}")
    return "".join(parts)


def parse_molecule(smiles: str, molfile: str | None, *, sanitize: bool) -> Chem.Mol | None:
    """Parse SMILES first and fall back to a molblock, like MinimalLib `get_mol()`."""
    if smiles:
        params = Chem.SmilesParserParams()
        params.sanitize = sanitize
        mol = Chem.MolFromSmiles(smiles, params)
        if mol is not None:
            return mol

    if molfile:
        # `removeHs=False` keeps the atom order aligned with the editor's nodes,
        # which is what makes reported atom indexes usable in the UI.
        return Chem.MolFromMolBlock(molfile, sanitize=sanitize, removeHs=False)

    return None


def _parse_for_problems(smiles: str, molfile: str | None) -> Chem.Mol | None:
    """Problems must be reported against the editor's atom order, so molblock first."""
    if molfile:
        mol = Chem.MolFromMolBlock(molfile, sanitize=False, removeHs=False)
        if mol is not None:
            return mol

    if smiles:
        params = Chem.SmilesParserParams()
        params.sanitize = False
        return Chem.MolFromSmiles(smiles, params)

    return None


def find_problems(smiles: str, molfile: str | None) -> list[dict]:
    """Valence / chemistry problems of one structure, mirroring `RDKitProblem`."""
    mol = _parse_for_problems(smiles, molfile)
    if mol is None:
        return [
            {
                "type": "ParseException",
                "message": "RDKit 无法解析该结构",
                "atomIndex": None,
            }
        ]

    problems: list[dict] = []
    for problem in Chem.DetectChemistryProblems(mol):
        entry: dict = {
            "type": problem.GetType(),
            "message": problem.Message(),
            "atomIndex": None,
        }

        if problem.GetType() == "AtomValenceException":
            index = problem.GetAtomIdx()
            atom = mol.GetAtomWithIdx(index)
            entry["atomIndex"] = index
            entry["atomSymbol"] = atom.GetSymbol()
            entry["valence"] = atom.GetExplicitValence()
        elif problem.GetType() == "AtomKekulizeException":
            entry["atomIndex"] = problem.GetAtomIdx()

        problems.append(entry)

    return problems


def describe_molecule(smiles: str, molfile: str | None) -> dict | None:
    """Formula, mass and descriptors of one structure, mirroring `MoleculeInfo`."""
    mol = parse_molecule(smiles, molfile, sanitize=True)
    if mol is None:
        return None

    counts: dict[str, int] = {}
    charge = 0

    for atom in mol.GetAtoms():
        symbol = atom.GetSymbol()
        counts[symbol] = counts.get(symbol, 0) + 1
        implicit = atom.GetNumImplicitHs()
        if implicit:
            counts["H"] = counts.get("H", 0) + implicit
        charge += atom.GetFormalCharge()

    return {
        "formula": _hill_formula(counts),
        "charge": charge,
        "mass": Descriptors.MolWt(mol),
        "exactMass": Descriptors.ExactMolWt(mol),
        "heavyAtoms": rdMolDescriptors.CalcNumHeavyAtoms(mol),
        # MinimalLib's `NumAtoms` counts implicit hydrogens as well.
        "totalAtoms": mol.GetNumAtoms(onlyExplicit=False),
        "bonds": mol.GetNumBonds(),
        "rings": rdMolDescriptors.CalcNumRings(mol),
        "aromaticRings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "rotatableBonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "hydrogenDonors": rdMolDescriptors.CalcNumHBD(mol),
        "hydrogenAcceptors": rdMolDescriptors.CalcNumHBA(mol),
        "polarSurfaceArea": rdMolDescriptors.CalcTPSA(mol),
        "logP": Crippen.MolLogP(mol),
        "smiles": Chem.MolToSmiles(mol),
    }


def inspect_structure(smiles: str, molfile: str | None) -> dict:
    """Chemistry problems plus the analysis summary for one structure."""
    return {
        "problems": find_problems(smiles, molfile),
        "info": describe_molecule(smiles, molfile),
    }
