"""RDKit-backed structure analysis.

The browser build computes the same numbers with RDKit's WebAssembly MinimalLib
(``apps/web/src/lib/rdkit.ts``). This module reproduces that behaviour with the
native RDKit build so both builds show identical values: the descriptor keys and
the atom parsing rules below intentionally mirror MinimalLib's
``get_descriptors()`` / ``get_json()`` output.
"""

from __future__ import annotations

import time

from rdkit import Chem, Geometry, RDLogger
from rdkit.Chem import AllChem, Crippen, Descriptors, rdDepictor, rdMolDescriptors

# Rejected structures are reported through the API, so drop RDKit's console
# warnings (they would land in the Electron log without telling the user more).
RDLogger.DisableLog("rdApp.*")

# 3D 构象的随机种子：固定后同一结构每次得到相同的构象
CONFORMER_SEED = 42

# 多个互不连接的结构并排摆放时的间距（埃）
FRAGMENT_GAP = 4.0


class ChemError(RuntimeError):
    """可直接展示给用户的化学计算失败。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

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


def _parse_for_layout(smiles: str, molfile: str | None) -> Chem.Mol | None:
    """优先用 molblock：它的原子顺序与编辑器节点一致，回填坐标时才能一一对应。"""
    if molfile:
        mol = Chem.MolFromMolBlock(molfile, sanitize=True, removeHs=False)
        if mol is not None:
            return mol

    if smiles:
        mol = Chem.MolFromSmiles(smiles)
        if mol is not None:
            return mol

    return None


def _drop_stale_coordinates(mol: Chem.Mol) -> None:
    """清掉输入自带的旧坐标。

    编辑器传来的 molblock 一定带着当前画面的 2D 坐标，RDKit 在已有坐标时
    可能沿用它们（甚至把立体化学一并继承），布局结果就会歪。这里逐个原子
    归零后删除全部构象，保证后续坐标计算从零开始。
    """
    for conformer in mol.GetConformers():
        for index in range(mol.GetNumAtoms()):
            conformer.SetAtomPosition(index, Geometry.Point3D(0.0, 0.0, 0.0))

    mol.RemoveAllConformers()


def generate_2d_molblock(smiles: str, molfile: str | None) -> str:
    """用 RDKit 重新生成标准 2D 坐标，返回 MOL block；失败时返回空字符串。"""
    try:
        mol = _parse_for_layout(smiles, molfile)
        if mol is None:
            return ""

        _drop_stale_coordinates(mol)
        rdDepictor.Compute2DCoords(mol)
        # 立体中心按楔形键画出，Kekule 载入 molblock 后即可正确显示手性
        Chem.WedgeMolBonds(mol, mol.GetConformer())

        return Chem.MolToMolBlock(mol)
    except Exception:
        # 不能让单个畸形结构把整个接口打挂，交给调用方决定是否降级
        return ""


def _optimize_with_force_field(mol: Chem.Mol) -> None:
    """力场优化，保证双键顺反与环构象合理；参数缺失时退回 UFF。"""
    try:
        if AllChem.MMFFHasAllMoleculeParams(mol):
            AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
            return
    except Exception:
        pass

    try:
        AllChem.UFFOptimizeMolecule(mol, maxIters=500)
    except Exception:
        # 极少数含金属的结构两套力场都没有参数，直接使用嵌入给出的坐标
        pass


def _separate_fragments(mol: Chem.Mol) -> None:
    """把互不连接的结构沿 x 轴依次排开。

    RDKit 会把每个片段都嵌到原点附近，直接渲染会彼此重叠；这里按前端原有
    逻辑（间距 4 Å、y/z 居中、整体居中）重新摆放。
    """
    fragments = Chem.GetMolFrags(mol)
    if len(fragments) <= 1:
        return

    conformer = mol.GetConformer()
    cursor = 0.0

    for fragment in fragments:
        xs = [conformer.GetAtomPosition(index).x for index in fragment]
        ys = [conformer.GetAtomPosition(index).y for index in fragment]
        zs = [conformer.GetAtomPosition(index).z for index in fragment]

        shift_x = cursor - min(xs)
        center_y = sum(ys) / len(ys)
        center_z = sum(zs) / len(zs)

        for index in fragment:
            position = conformer.GetAtomPosition(index)
            conformer.SetAtomPosition(
                index,
                Geometry.Point3D(
                    position.x + shift_x,
                    position.y - center_y,
                    position.z - center_z,
                ),
            )

        cursor += max(xs) - min(xs) + FRAGMENT_GAP

    total_width = cursor - FRAGMENT_GAP
    shift = -total_width / 2.0

    for index in range(mol.GetNumAtoms()):
        position = conformer.GetAtomPosition(index)
        conformer.SetAtomPosition(index, Geometry.Point3D(position.x + shift, position.y, position.z))


def _embed_3d(smiles: str, molfile: str | None) -> tuple[str, dict]:
    """生成 3D 构象，返回 (molblock, 统计信息)。"""
    started = time.perf_counter()

    mol = _parse_for_layout(smiles, molfile)
    if mol is None:
        raise ChemError("parse_failed", "无法解析该结构，请检查 SMILES 或文件内容后重试。")

    _drop_stale_coordinates(mol)
    mol = Chem.AddHs(mol)

    status = AllChem.EmbedMolecule(mol, randomSeed=CONFORMER_SEED)
    if status != 0:
        # 稠环 / 长链等难嵌入的结构，换成随机初始坐标再多试几次
        status = AllChem.EmbedMolecule(
            mol,
            randomSeed=CONFORMER_SEED,
            useRandomCoords=True,
            maxAttempts=50,
        )
    if status != 0:
        raise ChemError(
            "embed_failed",
            "3D 构象生成失败：RDKit 无法为该结构生成三维坐标，请简化结构后重试。",
        )

    _optimize_with_force_field(mol)
    # 显式氢只用于嵌入与优化，输出前移除，界面按重原子渲染
    mol = Chem.RemoveHs(mol)
    _separate_fragments(mol)

    fragment_count = len(Chem.GetMolFrags(mol))
    stats = {
        "atomCount": mol.GetNumAtoms(),
        "bondCount": mol.GetNumBonds(),
        "fragmentCount": fragment_count,
        "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
    }

    return Chem.MolToMolBlock(mol), stats


def generate_3d_sdf(smiles: str, molfile: str | None) -> str:
    """生成 3D 构象并以 MOL block（SDF 单分子）形式返回，失败抛 ChemError。"""
    molblock, _ = _embed_3d(smiles, molfile)
    return molblock


def embed_3d(smiles: str, molfile: str | None) -> dict:
    """3D 构象 + 渲染所需的计数，供 `/api/embed3d` 直接返回。"""
    molblock, stats = _embed_3d(smiles, molfile)
    return {"sdf": molblock, **stats}

