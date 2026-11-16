#!/usr/bin/env python3
"""Inventory RAN character GLBs and report whether each equipment slot has a source asset.

This deliberately reports evidence instead of guessing a mesh's semantic slot from
an opaque filename. The report is consumed by the character-part workflow artifact.
"""
from pathlib import Path
import json
import struct

ROOT = Path(".")
SOURCE = ROOT / "source_assets"
CONVERTED = ROOT / "converted_glb"
OUTPUT = ROOT / "logs" / "character-part-inventory.json"

SLOTS = ["hair", "face", "upper", "gloves", "lower", "shoes"]
SOURCE_HINTS = {
    "female": {
        "hair": ["s_w_hair00.x"],
        "face": ["s_w1_head.x", "s_w_face.x"],
        "upper": ["s_w_a_bs.x"],
        "gloves": [],
        "lower": ["s_w_s_bs.x"],
        "shoes": [],
    },
    "male": {
        "hair": [],
        "face": [],
        "upper": [],
        "gloves": [],
        "lower": [],
        "shoes": [],
    },
}

def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise ValueError(f"Invalid GLB header: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise ValueError(f"Invalid GLB header/length: {path}")
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        chunk = raw[offset:offset + length]
        offset += length
        if kind == b"JSON":
            return json.loads(chunk.decode("utf-8").rstrip(" \\0"))
    raise ValueError(f"Missing JSON chunk: {path}")

def describe(path):
    doc = read_glb(path)
    nodes = doc.get("nodes", [])
    meshes = doc.get("meshes", [])
    skins = doc.get("skins", [])
    materials = doc.get("materials", [])
    mesh_nodes = []
    for node in nodes:
        if "mesh" in node:
            mesh_index = node["mesh"]
            mesh = meshes[mesh_index]
            mesh_nodes.append({
                "node": node.get("name", f"node_{len(mesh_nodes)}"),
                "mesh": mesh.get("name", f"mesh_{mesh_index}"),
                "primitives": len(mesh.get("primitives", [])),
                "skinIndex": node.get("skin"),
            })
    joints = []
    if skins:
        joint_indices = set(skins[0].get("joints", []))
        joints = [nodes[i].get("name", f"node_{i}") for i in sorted(joint_indices)]
    return {
        "file": str(path),
        "bytes": path.stat().st_size,
        "meshCount": len(meshes),
        "meshNodes": mesh_nodes,
        "skinCount": len(skins),
        "jointCount": len(joints),
        "joints": joints,
        "materialNames": [m.get("name", "") for m in materials],
        "textureCount": len(doc.get("images", [])),
    }

def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    source_files = sorted(p for p in SOURCE.rglob("*") if p.is_file() and p.suffix.lower() == ".x")
    converted_files = sorted(CONVERTED.glob("*.glb"))
    report = {
        "purpose": "Evidence-based inventory for the six independently replaceable character slots.",
        "requiredSlots": SLOTS,
        "sourceXFiles": [str(p) for p in source_files],
        "convertedModels": [describe(p) for p in converted_files],
        "characters": {},
    }
    for character in ("female", "male"):
        slots = {}
        for slot in SLOTS:
            names = SOURCE_HINTS[character][slot]
            found = [name for name in names if (SOURCE / name).is_file()]
            slots[slot] = {
                "status": "source-present-needs-mesh-and-rig-validation" if found else "source-not-identified",
                "sourceFiles": found,
                "note": "A source filename is not proof that the model contains only this slot; inspect mesh names and geometry before publishing an equipment GLB."
            }
        report["characters"][character] = slots
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT),
        "sourceXCount": len(source_files),
        "convertedGlbCount": len(converted_files),
        "maleSlotsWithIdentifiedSources": sum(bool(SOURCE_HINTS["male"][s]) for s in SLOTS),
        "femaleSlotsWithIdentifiedSources": sum(bool(SOURCE_HINTS["female"][s]) for s in SLOTS),
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
