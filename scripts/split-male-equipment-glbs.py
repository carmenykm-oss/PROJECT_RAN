#!/usr/bin/env python3
"""Extract male outfit components as separate skinned equipment candidates.

Only source meshes whose complete joint-name set is compatible with the selected
ran-male.glb skeleton are published. Original base and source GLBs are untouched.
"""
from pathlib import Path
import copy
import json
import struct

BASE = Path("public/models/ran-male.glb")
OUT = Path("public/models")
SOURCES = {
    "a": Path("converted_glb/s_m_a_zt.glb"),
    "f": Path("converted_glb/s_m_f_zt.glb"),
}
SLOT_BY_SUFFIX = {
    "body": "upper",
    "hand": "gloves",
    "leg": "lower",
    "foot": "shoes",
}

def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise ValueError(f"Invalid GLB: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise ValueError(f"Invalid GLB version/length: {path}")
    chunks, offset = [], 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        chunks.append((kind, raw[offset:offset + length]))
        offset += length
    ji = next((i for i, (kind, _) in enumerate(chunks) if kind == b"JSON"), None)
    if ji is None:
        raise ValueError(f"Missing JSON chunk: {path}")
    doc = json.loads(chunks[ji][1].decode("utf-8").rstrip(" "))
    return doc, chunks, ji

def write_glb(path, chunks):
    body = bytearray()
    for kind, payload in chunks:
        body += struct.pack("<I4s", len(payload), kind) + payload
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)

def all_joint_names(doc):
    names = set()
    for skin in doc.get("skins", []):
        for index in skin.get("joints", []):
            names.add(doc["nodes"][index].get("name", f"node_{index}"))
    return names

def extract(source, output, selected_names, base_joints):
    doc, chunks, json_index = read_glb(source)
    selected = []
    for node in doc.get("nodes", []):
        if "mesh" not in node:
            continue
        if node.get("name") in selected_names:
            if "skin" not in node:
                raise SystemExit(f"{source}: {node.get('name')} is not skinned")
            skin = doc["skins"][node["skin"]]
            used = {doc["nodes"][i].get("name", f"node_{i}") for i in skin.get("joints", [])}
            missing = sorted(used - base_joints)
            if missing:
                raise SystemExit(f"{source}:{node.get('name')} has joints absent from selected male base: {missing}")
            selected.append(node.get("name"))
        else:
            node.pop("mesh", None)
            node.pop("skin", None)
    if set(selected) != selected_names:
        raise SystemExit(f"{source}: requested {sorted(selected_names)}, found {sorted(selected)}")
    payload = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    chunks[json_index] = (b"JSON", payload)
    write_glb(output, chunks)
    check, _, _ = read_glb(output)
    visible = {n.get("name") for n in check.get("nodes", []) if "mesh" in n}
    if visible != selected_names:
        raise SystemExit(f"{output}: output contains unexpected meshes {sorted(visible)}")
    if not check.get("skins") or not check.get("materials") or not check.get("images"):
        raise SystemExit(f"{output}: missing skin/material/texture data")
    print(f"PASS {output}: isolated {', '.join(sorted(visible))}; joints map to selected male rig")

def main():
    base_doc, _, _ = read_glb(BASE)
    base_joints = all_joint_names(base_doc)
    for variant, source in SOURCES.items():
        if not source.is_file():
            raise SystemExit(f"Required male equipment source missing: {source}")
        doc, _, _ = read_glb(source)
        nodes = [n for n in doc.get("nodes", []) if "mesh" in n]
        found_slots = set()
        for node in nodes:
            name = node.get("name", "")
            suffix = name.rsplit("_", 1)[-1]
            slot = SLOT_BY_SUFFIX.get(suffix)
            if not slot:
                continue
            output = OUT / f"ran-male-outfit-{variant}-{slot}.glb"
            extract(source, output, {name}, base_joints)
            found_slots.add(slot)
        if found_slots != set(SLOT_BY_SUFFIX.values()):
            raise SystemExit(f"{source}: expected all four equipment parts, found {sorted(found_slots)}")

if __name__ == "__main__":
    main()
