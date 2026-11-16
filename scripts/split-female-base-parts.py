#!/usr/bin/env python3
"""Publish one independently loadable GLB per selected female face/hair mesh."""
from pathlib import Path
import json
import struct

OUT = Path("public/models")
SOURCES = {
    "face": Path("converted_glb/s_w1_head.glb"),
    "hair": Path("converted_glb/s_w_hair00.glb"),
}
FACE_MESH = "w1_face00"

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
    ji = next((i for i, (kind, _) in enumerate(chunks) if kind == b"JSON"), None)
    if ji is None:
        raise ValueError(f"Missing JSON chunk: {path}")
    return json.loads(chunks[ji][1].decode("utf-8").rstrip(" ")), chunks, ji

def write_one(source, mesh_name, target):
    doc, chunks, ji = read_glb(source)
    matches = [n for n in doc.get("nodes", []) if n.get("name") == mesh_name and "mesh" in n]
    if len(matches) != 1:
        raise SystemExit(f"{source}: expected one mesh node named {mesh_name}, found {len(matches)}")
    if "skin" not in matches[0]:
        raise SystemExit(f"{source}: {mesh_name} is not skinned")
    output_doc = json.loads(json.dumps(doc))
    for node in output_doc.get("nodes", []):
        if "mesh" in node and node.get("name") != mesh_name:
            node.pop("mesh", None)
            node.pop("skin", None)
    payload = json.dumps(output_doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    chunks[ji] = (b"JSON", payload)
    body = bytearray()
    for kind, data in chunks:
        body += struct.pack("<I4s", len(data), kind) + data
    target.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)
    check, _, _ = read_glb(target)
    visible = [n.get("name") for n in check.get("nodes", []) if "mesh" in n]
    if visible != [mesh_name]:
        raise SystemExit(f"{target}: isolated node validation failed: {visible}")
    print(f"PASS {target}: isolated skinned mesh {mesh_name}")

def main():
    write_one(SOURCES["face"], FACE_MESH, OUT / "ran-female-face.glb")
    hair_doc, _, _ = read_glb(SOURCES["hair"])
    hair_names = [n.get("name") for n in hair_doc.get("nodes", []) if "mesh" in n]
    if len(hair_names) != 9:
        raise SystemExit(f"Expected 9 separate female hairstyle meshes, found {len(hair_names)}")
    for name in hair_names:
        write_one(SOURCES["hair"], name, OUT / f"ran-female-hair-{name}.glb")

if __name__ == "__main__":
    main()
