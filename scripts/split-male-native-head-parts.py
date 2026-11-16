#!/usr/bin/env python3
"""Publish one selected native RAN male face and hair mesh as separate GLBs.

The source X files contain multiple interchangeable variants. The fitting room
starts with m2_face00 and m_hair00; all other variants remain in converted_glb
for later independent hairstyle/face options.
"""
from pathlib import Path
import json
import struct

OUT = Path("public/models")
SOURCES = {
    "converted_glb/s_m_face.glb": ("m2_face00", "ran-male-face.glb"),
    "converted_glb/s_m_hair00.glb": ("m_hair00", "ran-male-hair.glb"),
}

def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise SystemExit(f"Invalid GLB header: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise SystemExit(f"Invalid GLB version/length: {path}")
    chunks, offset, json_index = [], 12, None
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        payload = raw[offset:offset + length]
        offset += length
        if kind == b"JSON":
            json_index = len(chunks)
        chunks.append((kind, payload))
    if json_index is None:
        raise SystemExit(f"Missing JSON chunk: {path}")
    doc = json.loads(chunks[json_index][1].decode("utf-8").rstrip(" "))
    return doc, chunks, json_index

def write_glb(path, chunks):
    body = bytearray()
    for kind, payload in chunks:
        body += struct.pack("<I4s", len(payload), kind)
        body += payload
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for source_name, (selected_name, output_name) in SOURCES.items():
        source = Path(source_name)
        if not source.is_file():
            raise SystemExit(f"Missing converted native head source: {source}")
        doc, chunks, json_index = read_glb(source)
        nodes = doc.get("nodes", [])
        candidates = [(i, n) for i, n in enumerate(nodes) if "mesh" in n]
        matches = [(i, n) for i, n in candidates if n.get("name") == selected_name]
        if len(matches) != 1:
            raise SystemExit(f"{source}: expected exactly one {selected_name} mesh, found {len(matches)}")
        node_index, selected = matches[0]
        if "skin" not in selected:
            raise SystemExit(f"{source}: selected mesh {selected_name} is not skinned")
        if not doc.get("skins"):
            raise SystemExit(f"{source}: missing skin")
        skin = doc["skins"][selected["skin"]]
        joint_names = [nodes[j].get("name", "") for j in skin.get("joints", [])]
        if not {"Bip01_Head", "Bip01_Neck"}.issubset(set(joint_names)):
            raise SystemExit(f"{source}: expected head/neck joints, got {joint_names}")
        for index, node in candidates:
            if index != node_index:
                node.pop("mesh", None)
                node.pop("skin", None)
        meshes_left = [n for n in nodes if "mesh" in n]
        if len(meshes_left) != 1 or meshes_left[0].get("name") != selected_name:
            raise SystemExit(f"{source}: output mesh isolation failed")
        images = [x.get("uri", "") for x in doc.get("images", [])]
        if not images or any(uri.lower().endswith(".dds") for uri in images):
            raise SystemExit(f"{source}: missing images or unconverted DDS references: {images}")
        payload = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        chunks[json_index] = (b"JSON", payload)
        target = OUT / output_name
        write_glb(target, chunks)
        check, _, _ = read_glb(target)
        visible = [n.get("name") for n in check.get("nodes", []) if "mesh" in n]
        if visible != [selected_name]:
            raise SystemExit(f"{target}: final validation failed: {visible}")
        print(f"PASS {target}: selected {selected_name}, 1 skinned mesh, joints={joint_names}, images={images}")

if __name__ == "__main__":
    main()
