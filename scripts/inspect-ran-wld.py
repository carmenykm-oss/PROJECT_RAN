#!/usr/bin/env python3
"""Validate RAN Online LAND.MAN / StaticMesh WLD headers without guessing codecs.

Usage:
  python scripts/inspect-ran-wld.py path/to/map_school.zip

The checks mirror the CSerialFile / DxLandMan / DxStaticMesh layout:
  128-byte file type + 4-byte file ID, then payload.
This script intentionally refuses to emit geometry if payload validation fails.
"""
from __future__ import annotations

import argparse
import math
import struct
import sys
import zipfile
from pathlib import PurePosixPath

FILE_TYPE_SIZE = 128
HEADER_SIZE = FILE_TYPE_SIZE + 4
LAND_VERSIONS = range(0x0108, 0x0115)
STATIC_MESH_VERSION = 0x0102


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def floats(data: bytes, offset: int, count: int) -> tuple[float, ...]:
    return struct.unpack_from("<" + "f" * count, data, offset)


def printable_ratio(data: bytes) -> float:
    if not data:
        return 0.0
    return sum(32 <= b < 127 or b == 0 for b in data) / len(data)


def inspect_land(name: str, data: bytes) -> list[str]:
    out = [f"[LAND] {name} ({len(data):,} bytes)"]
    if len(data) < 324:
        return out + ["  FAIL: truncated before map header and octree root header"]
    magic = data[:FILE_TYPE_SIZE].split(b"\0", 1)[0]
    version = u32(data, FILE_TYPE_SIZE)
    map_id = u32(data, HEADER_SIZE)
    map_name = data[HEADER_SIZE + 4:HEADER_SIZE + 4 + 128]
    marks_offset = HEADER_SIZE + 4 + 128
    marks_version, marks_size = struct.unpack_from("<II", data, marks_offset)
    marks = struct.unpack_from("<4I", data, marks_offset + 8)
    octree_offset = marks_offset + 8 + 16
    subdivided = u32(data, octree_offset)
    max_v = floats(data, octree_offset + 4, 3)
    min_v = floats(data, octree_offset + 16, 3)
    data_address = u32(data, octree_offset + 28)
    data_size = u32(data, octree_offset + 32)
    out.append(f"  fileType={magic!r}, version=0x{version:04X}, mapID=0x{map_id:08X}")
    out.append(f"  mapName={map_name.split(bytes([0]), 1)[0][:48]!r}, printable={printable_ratio(map_name):.2f}")
    out.append(f"  fileMarks.version=0x{marks_version:04X}, size={marks_size}, values={[hex(v) for v in marks]}")
    out.append(f"  octreeOffset={octree_offset}, subdivided={subdivided}, max={max_v}, min={min_v}, dataAddress={data_address}, dataSize={data_size}")
    errors = []
    if magic != b"LAND.MAN":
        errors.append("wrong LAND.MAN file type")
    if version not in LAND_VERSIONS:
        errors.append("unsupported LAND.MAN version")
    if marks_version != 0x0100 or marks_size != 16:
        errors.append("SLAND_FILEMARK header is not version 0x0100 / size 16")
    if any(v >= len(data) for v in marks if v != 0):
        errors.append("file mark points outside file")
    if subdivided not in (0, 1):
        errors.append("octree BOOL is not 0/1")
    if not all(math.isfinite(v) for v in (*max_v, *min_v)):
        errors.append("octree bounds contain non-finite values")
    if data_address > len(data) or data_size > len(data) or data_address + data_size > len(data):
        errors.append("octree data block points outside file")
    out.extend(f"  FAIL: {e}" for e in errors)
    if not errors:
        out.append("  PASS: base LAND.MAN structure")
    return out


def inspect_static(name: str, data: bytes) -> list[str]:
    out = [f"[STATIC MESH] {name} ({len(data):,} bytes)"]
    if len(data) < 160:
        return out + ["  FAIL: truncated before static mesh header"]
    magic = data[:FILE_TYPE_SIZE].split(b"\0", 1)[0]
    file_id = u32(data, FILE_TYPE_SIZE)
    version = u32(data, HEADER_SIZE)
    block_size = u32(data, HEADER_SIZE + 4)
    bounds = floats(data, HEADER_SIZE + 8, 6)
    out.append(f"  fileType={magic!r}, fileID=0x{file_id:08X}, staticMeshVersion=0x{version:08X}, boundsBlockSize={block_size}")
    out.append(f"  bounds={bounds}")
    errors = []
    if magic != b"default":
        errors.append("wrong static mesh file type")
    if version != STATIC_MESH_VERSION:
        errors.append(f"expected static mesh version 0x{STATIC_MESH_VERSION:04X}")
    if not all(math.isfinite(v) and abs(v) < 1e8 for v in bounds):
        errors.append("static mesh bounds are not plausible finite coordinates")
    out.extend(f"  FAIL: {e}" for e in errors)
    if not errors:
        out.append("  PASS: base static mesh structure")
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", help="map_school.zip")
    args = parser.parse_args()
    failures = 0
    with zipfile.ZipFile(args.archive) as archive:
        names = [n for n in archive.namelist() if not n.endswith("/")]
        for name in sorted(names):
            suffix = PurePosixPath(name).suffix.lower()
            data = archive.read(name)
            if suffix == ".wld":
                lines = inspect_land(name, data)
            elif suffix == ".wld0":
                lines = inspect_static(name, data)
            else:
                continue
            print("\n".join(lines))
            failures += sum(line.startswith("  FAIL:") for line in lines)
    print(f"\nValidation failures: {failures}")
    return 2 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
