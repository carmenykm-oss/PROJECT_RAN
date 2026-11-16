#!/usr/bin/env python3
"""Split female source outfit meshes into separate wearable candidate GLBs.

The source outfits contain helper bones not present in the selected female base
rig. They are preserved in each candidate; the browser attachment test must
reparent/retarget those helpers before these assets are considered approved.
"""
from pathlib import Path
import json
import struct

SOURCES = {
    "a": Path("converted_glb/s_w_a_bs.glb"),
    "s": Path("converted_glb/s_w_s_bs.glb"),
}
OUT = Path("public/models")
SUFFIX_TO_SLOT = {"body": "upper", "hand": "gloves", "leg": "lower", "foot": "shoes"}

def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise ValueError(f"Invalid GLB: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise ValueError(f"Invalid GLB length/version: {path}")
    chunks, offset = [], 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        chunks.append((kind, raw[offset:offset + length]))
        offset += length
    json_index = next((i for i, (kind, _) in enumerate(chunks) if kind == b"JSON"), None)
    if json_index is None:
        raise ValueError(f"Missing GLB JSON: {path}")
    return json.loads(chunks[json_index][1].decode("utf-8").rstrip(" ")), chunks, json_index

def write_glb(path, chunks):
    body = bytearray()
    for kind, payload in chunks:
        body += struct.pack("<I4s", len(payload), kind) + payload
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)

def main():
    for variant, source in SOURCES.items():
        if not source.is_file():
            raise SystemExit(f"Missing female outfit source: {source}")
        doc, chunks, json_index = read_glb(source)
        found = set()
        for node in doc.get("nodes", []):
            if "mesh" not in node:
                continue
            name = node.get("name", "")
            slot = SUFFIX_TO_SLOT.get(name.rsplit("_", 1)[-1])
            if not slot:
                raise SystemExit(f"Unexpected female outfit mesh name: {name}")
            found.add(slot)
            selected_name = name
            output_doc = json.loads(json.dumps(doc))
            for other in output_doc.get("nodes", []):
                if "mesh" in other and other.get("name") != selected_name:
                    other.pop("mesh", None)
                    other.pop("skin", None)
            payload = json.dumps(output_doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            payload += b" " * ((4 - len(payload) % 4) % 4)
            output_chunks = list(chunks)
            output_chunks[json_index] = (b"JSON", payload)
            target = OUT / f"ran-female-outfit-{variant}-{slot}.glb"
            write_glb(target, output_chunks)
            check, _, _ = read_glb(target)
            visible = [n.get("name") for n in check.get("nodes", []) if "mesh" in n]
            if visible != [selected_name]:
                raise SystemExit(f"{target}: expected only {selected_name}, got {visible}")
            if "skin" not in next(n for n in check["nodes"] if n.get("name") == selected_name):
                raise SystemExit(f"{target}: isolated mesh is not skinned")
            print(f"PASS {target}: {selected_name}; original helper bones retained for rig mapping")
        if found != set(SUFFIX_TO_SLOT.values()):
            raise SystemExit(f"{source}: missing expected slots: {sorted(set(SUFFIX_TO_SLOT.values()) - found)}")

if __name__ == "__main__":
    main()
