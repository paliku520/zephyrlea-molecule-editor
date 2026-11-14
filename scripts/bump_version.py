#!/usr/bin/env python3
"""保持整个仓库中的应用版本号同步。

UI 从 ``apps/web/src/lib/version.ts`` 读取版本号，而打包则读取
``apps/desktop/package.json``；此脚本会一次性写入所有位置，
这样发布时的版本号升级就不会导致它们不同步。

用法::

    python scripts/bump_version.py                 # 显示当前版本号
    python scripts/bump_version.py 0.2.0           # 设置一个明确的版本号
    python scripts/bump_version.py --bump minor    # 0.1.0 -> 0.2.0
    python scripts/bump_version.py --check         # 当版本号不同步时以退出码 1 退出
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEMVER = re.compile(r"^(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)$")
# Only the top-level `"version"` (two-space indent) of a package.json.
PACKAGE_VERSION = re.compile(r'^(?P<head>  "version": ")(?P<version>[^"]*)(?P<tail>")', re.MULTILINE)
TS_VERSION = re.compile(r"(?P<head>export const APP_VERSION = ')(?P<version>[^']*)(?P<tail>')")


@dataclass(frozen=True)
class Target:
    label: str
    path: Path
    pattern: re.Pattern[str]


TARGETS = (
    Target(
        "apps/desktop/package.json",
        ROOT / "apps/desktop/package.json",
        PACKAGE_VERSION,
    ),
    Target(
        "apps/web/package.json",
        ROOT / "apps/web/package.json",
        PACKAGE_VERSION,
    ),
    Target(
        "apps/web/src/lib/version.ts",
        ROOT / "apps/web/src/lib/version.ts",
        TS_VERSION,
    ),
)


def read_text(path: Path) -> str:
    # newline="" keeps the original CRLF / LF endings on write.
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def write_text(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def current_version(target: Target) -> str:
    match = target.pattern.search(read_text(target.path))
    if not match:
        raise SystemExit(f"no version field found in {target.label}")
    return match.group("version")


def bumped(version: str, part: str) -> str:
    match = SEMVER.match(version)
    if not match:
        raise SystemExit(f"current version {version} is not X.Y.Z, cannot bump automatically")

    major, minor, patch = (int(match.group(name)) for name in ("major", "minor", "patch"))
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def apply(target: Target, version: str) -> bool:
    """Write `version` into `target`; returns True when the file changed."""
    text = read_text(target.path)
    updated = target.pattern.sub(
        lambda match: f"{match.group('head')}{version}{match.group('tail')}",
        text,
        count=1,
    )
    if updated == text:
        return False
    write_text(target.path, updated)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync the Zephyrlea version across the repo")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("version", nargs="?", help="explicit version to write, e.g. 0.2.0")
    group.add_argument(
        "--bump",
        choices=("major", "minor", "patch"),
        help="derive the next version from apps/desktop",
    )
    parser.add_argument("--check", action="store_true", help="exit 1 when the versions disagree")
    args = parser.parse_args()

    versions = {target.label: current_version(target) for target in TARGETS}
    width = max(len(label) for label in versions)

    if args.check:
        expected = versions[TARGETS[0].label]
        mismatched = {label: value for label, value in versions.items() if value != expected}
        for label, value in versions.items():
            marker = "" if value == expected else "  <- out of sync"
            print(f"{label.ljust(width)}  {value}{marker}")
        if mismatched:
            print(f"\nVersions disagree (expected {expected}); run `python scripts/bump_version.py {expected}` to fix.")
            return 1
        print(f"\nAll versions match: {expected}")
        return 0

    if args.version is None and args.bump is None:
        print(f"Current version: {versions[TARGETS[0].label]}\n")
        for label, value in versions.items():
            print(f"{label.ljust(width)}  {value}")
        return 0

    if args.version is not None:
        if not SEMVER.match(args.version):
            parser.error(f"version must be X.Y.Z: {args.version}")
        target_version = args.version
    else:
        target_version = bumped(versions[TARGETS[0].label], args.bump)

    for target in TARGETS:
        before = versions[target.label]
        changed = apply(target, target_version)
        state = f"{before} -> {target_version}" if changed else f"{before} (already set)"
        print(f"{target.label.ljust(width)}  {state}")

    print(f"\nVersion set to {target_version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
