#!/usr/bin/env python3
"""Decode and structurally probe RAN2 animation BIN entries.

The reference FileCrypt StreamDecryptR2 routine performs:
  BYTECRYPT::byte_decode(buffer + 132, size - 132, EMBYTECRYPT_RAN2)
  remove bytes [132:144]
This script reproduces that transform without modifying source archives.
"""
from __future__ import annotations
import argparse
import collections
import json
import struct
import zipfile
from pathlib import Path

# Exact ARRAY_RAN2[256] from Lib -- Engine/Common/ByteCryptDef.h
ARRAY_RAN2 = bytes([
0x2A,0x45,0x55,0xE7,0xED,0x36,0xD7,0xB6,0x81,0x16,0x75,0x64,0x93,0x19,0xD5,0x6D,
0x1D,0x15,0x49,0x9D,0x6A,0xF0,0xCC,0xA3,0xC0,0x72,0x0E,0xFF,0x88,0x4F,0x77,0xF8,
0x73,0x01,0xA0,0x50,0x2C,0xBF,0x28,0xEC,0xCF,0x10,0xD1,0xD3,0xFD,0xDB,0x6F,0x59,
0x1A,0x70,0x26,0x6E,0x20,0x94,0x76,0x1F,0x46,0x32,0xB3,0x1C,0xE4,0xBE,0x31,0x99,
0xA7,0x85,0xDC,0xA9,0xEF,0xC9,0x8D,0x25,0x08,0xF3,0x00,0x74,0x95,0x84,0x7B,0xE1,
0xCD,0x3C,0xA1,0x80,0x8F,0x79,0xB7,0x68,0xF1,0x2F,0x0A,0xFA,0x56,0xEE,0xBB,0x27,
0xC1,0x3D,0x3A,0x4C,0x63,0xD6,0x3E,0xA4,0xD9,0x43,0x4D,0x0D,0x7E,0x5E,0x9C,0xFB,
0x83,0xAB,0xEB,0x12,0xB2,0x92,0x8B,0xAD,0x39,0x09,0xD0,0x21,0x35,0x14,0x0F,0xB4,
0x29,0x11,0xCB,0x78,0x34,0x52,0xC3,0x65,0x51,0xBA,0xDA,0xA2,0x87,0x96,0xF5,0x17,
0x86,0x47,0x2B,0x89,0x2E,0xAF,0x33,0x9E,0xA5,0xC6,0xD2,0xF7,0xC8,0x54,0x66,0x23,
0x4A,0x37,0xBD,0x9F,0xF6,0x58,0x57,0xE9,0x7F,0xAC,0x02,0x3F,0x41,0x61,0x13,0x2D,
0x7C,0xE5,0x6B,0x5B,0x62,0x7A,0x8A,0x90,0x04,0xC5,0xBC,0x30,0x0B,0x98,0x97,0xA6,
0xD8,0x40,0x24,0x48,0xE2,0x07,0x5F,0x5D,0xDE,0x82,0xF2,0x06,0xF4,0x7D,0xF9,0xE8,
0x44,0xD4,0xB9,0x03,0x5C,0x69,0xC7,0x6C,0x67,0xB5,0x53,0x71,0x8E,0xCA,0xE6,0x42,
0xE0,0x0C,0x05,0xFE,0xEA,0x60,0xDF,0x5A,0x1E,0xAE,0x1B,0xC4,0x4B,0xAA,0xB8,0x38,
0x91,0xDD,0xA8,0x3B,0x4E,0xE3,0xCE,0xC2,0xB1,0xFC,0x9B,0x18,0x8C,0xB0,0x9A,0x22
])
DECODE = bytes(ARRAY_RAN2.index(i) for i in range(256))
VALID_ANIM_VERSIONS = {0x0100, 0x0101, 0x0102}

def decode_ran2(raw: bytes) -> bytes:
    if len(raw) < 144:
        raise ValueError("file shorter than 144-byte RAN2 header")
    decoded = raw[:132] + raw[132:].translate(DECODE)
    return decoded[:132] + decoded[144:]

def parse_container(data: bytes) -> dict:
    if not data.startswith(b"AnimContainer"):
        raise ValueError("unexpected animation container type")
    container_version = struct.unpack_from("<I", data, 128)[0]
    if container_version not in (0x0100, 0x0101, 0x0102):
        raise ValueError(f"unsupported container version {container_version:#x}")
    offset = 132
    parsed = {"container_version": hex(container_version), "animation_records": 0,
              "lower_body_count": 0, "upper_body_count": 0, "tracks": []}

    def read_u32():
        nonlocal offset
        if offset + 4 > len(data):
            raise ValueError("truncated DWORD")
        value = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        return value

    def skip_bytes(size, label):
        nonlocal offset
        if size < 0 or offset + size > len(data):
            raise ValueError(f"truncated {label}: need {size} bytes at {offset}, file={len(data)}")
        offset += size

    def read_string():
        nonlocal offset
        size = read_u32()
        if size < 1 or size > 4096:
            raise ValueError(f"invalid bone-name string length {size}")
        if offset + size > len(data):
            raise ValueError("truncated bone-name string")
        raw = data[offset:offset+size]
        offset += size
        if raw[-1] != 0:
            raise ValueError("bone-name string is not NUL terminated")
        return raw[:-1].decode("ascii", errors="strict")

    def read_track():
        version = read_u32()
        if version not in (0x0100, 0x0101, 0x0102):
            raise ValueError(f"invalid SAnimation version {version:#x} at {offset-4}")
        counts = {}
        if version == 0x0102:
            bone = read_string()
            counts["rotation"] = read_u32(); skip_bytes(counts["rotation"] * 20, "rotation keys")
            counts["position"] = read_u32(); skip_bytes(counts["position"] * 16, "position keys")
            read_u32()  # legacy unused DWORD
            counts["quat_position"] = read_u32(); skip_bytes(counts["quat_position"] * 36, "quat-position keys")
            read_u32()  # legacy unused DWORD
            counts["matrix"] = read_u32(); skip_bytes(counts["matrix"] * 68, "matrix keys")
            counts["scale"] = read_u32(); skip_bytes(counts["scale"] * 16, "scale keys")
        else:
            counts["position"] = read_u32(); skip_bytes(counts["position"] * 16, "position keys")
            counts["rotation"] = read_u32(); skip_bytes(counts["rotation"] * 20, "rotation keys")
            counts["scale"] = read_u32(); skip_bytes(counts["scale"] * 16, "scale keys")
            counts["matrix"] = read_u32(); skip_bytes(counts["matrix"] * 68, "matrix keys")
            if version == 0x0101:
                counts["quat_position"] = read_u32(); skip_bytes(counts["quat_position"] * 36, "quat-position keys")
            bone = read_string()
        if not bone:
            raise ValueError("empty bone name")
        return {"version": hex(version), "bone": bone, "key_counts": counts}

    def read_group(group):
        count = read_u32()
        if count > 10000:
            raise ValueError(f"implausible {group} animation count {count}")
        parsed[group + "_count"] = count
        for _ in range(count):
            parsed["tracks"].append(read_track())
        parsed["animation_records"] += count

    if container_version in (0x0100, 0x0101):
        read_group("lower_body")
        if container_version == 0x0101:
            read_group("upper_body")
    else:
        read_group("upper_body")
        read_group("lower_body")
    parsed["bytes_consumed"] = offset
    parsed["trailing_bytes"] = len(data) - offset
    if parsed["animation_records"] == 0:
        raise ValueError("container has no animation records")
    return parsed


def probe(name: str, raw: bytes) -> dict:
    try:
        out = decode_ran2(raw)
        parsed = parse_container(out)
        tracks = parsed.pop("tracks")
        parsed["sample_tracks"] = tracks[:12]
        parsed["input_bytes"] = len(raw)
        parsed["decoded_bytes"] = len(out)
        parsed["structural_gate_pass"] = True
        parsed["decoded_sha256"] = __import__("hashlib").sha256(out).hexdigest()
        parsed["name"] = name
        return parsed
    except Exception as exc:
        return {"name": name, "structural_gate_pass": False, "error": str(exc)}

def walk_zip(data: bytes, prefix: str = "", depth: int = 0):
    if depth > 3:
        return
    try:
        zf = zipfile.ZipFile(__import__("io").BytesIO(data))
    except Exception:
        return
    for info in zf.infolist():
        if info.is_dir():
            continue
        payload = zf.read(info)
        name = f"{prefix}{info.filename}"
        if info.filename.lower().endswith(".bin") and payload.startswith(b"AnimContainer"):
            yield name, payload
        elif payload[:4] == b"PK\x03\x04":
            yield from walk_zip(payload, name + "!/", depth + 1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive", type=Path)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    rows = [probe(n, b) for n, b in walk_zip(args.archive.read_bytes())]
    passed = [r for r in rows if r.get("structural_gate_pass")]
    report = {
        "algorithm": "RAN2 substitution decode from offset 132, then remove decoded bytes 132-143",
        "files_scanned": len(rows), "structural_gate_pass_count": len(passed),
        "sample_passes": passed[:30], "sample_failures": [r for r in rows if not r.get("structural_gate_pass")][:20],
        "all_results": rows
    }
    encoded = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k != "all_results"}, indent=2))
    if not passed:
        raise SystemExit("No BIN passed the first structural gate")

if __name__ == "__main__":
    main()
