#!/usr/bin/env python3
"""Split the selected male base GLB into independently loadable skinned parts.

The source GLB remains untouched. Each output retains the original node hierarchy,
skin definitions, materials, embedded textures and binary accessors, while only
the selected mesh nodes remain visible in that output.
"""
from pathlib import Path
import json
import struct

SOURCE = Path("public/models/ran-male.glb")
OUT = Path("public/models")

def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise SystemExit(f"Invalid GLB: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise SystemExit(f"Invalid GLB version/length: {path}")
    chunks = []
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        payload = raw[offset:offset + length]
        offset += length
        chunks.append((kind, payload))
    json_index = next((i for i, (kind, _) in enumerate(chunks) if kind == b"JSON"), None)
    if json_index is None:
        raise SystemExit("GLB has no JSON chunk")
    doc = json.loads(chunks[json_index][1].decode("utf-8").rstrip(" "))
    return doc, chunks, json_index

def write_glb(path, chunks):
    body = bytearray()
    for kind, payload in chunks:
        body += struct.pack("<I4s", len(payload), kind)
        body += payload
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)

def mesh_node_names(doc):
    meshes = doc.get("meshes", [])
    result = []
    for index, node in enumerate(doc.get("nodes", [])):
        if "mesh" not in node:
            continue
        mesh = meshes[node["mesh"]]
        result.append((index, node, mesh))
    return result

def main():
    if not SOURCE.is_file():
        raise SystemExit(f"Selected male base is missing: {SOURCE}")
    doc, chunks, json_index = read_glb(SOURCE)
    nodes = mesh_node_names(doc)
    if len(nodes) != 6:
        raise SystemExit(f"Expected 6 selected male mesh nodes, found {len(nodes)}")

    # These names were inspected in the selected ran-male.glb itself:
    # 0-3 are the four body sections; head part 0 is hair; head part 1 is face.
    groups = {
        "ran-male-body.glb": {n["name"] for _, n, _ in nodes if n.get("name", "").startswith("male_mesh_part_")},
        "ran-male-hair.glb": {"male_head_mesh_part_0"},
        "ran-male-face.glb": {"male_head_mesh_part_1"},
    }
    expected = {
        "ran-male-body.glb": 4,
        "ran-male-hair.glb": 1,
        "ran-male-face.glb": 1,
    }
    original_mesh_names = {n.get("name", "") for _, n, _ in nodes}
    if original_mesh_names != set().union(*groups.values()):
        raise SystemExit(f"Unexpected male mesh node names: {sorted(original_mesh_names)}")

    skin_nodes = {n.get("name"): n for _, n, _ in nodes}
    for filename, selected_names in groups.items():
        if len(selected_names) != expected[filename]:
            raise SystemExit(f"{filename}: expected {expected[filename]} nodes, got {len(selected_names)}")
        output_doc = json.loads(json.dumps(doc))
        selected_count = 0
        for node in output_doc.get("nodes", []):
            if "mesh" not in node:
                continue
            if node.get("name") in selected_names:
                if "skin" not in node:
                    raise SystemExit(f"Selected part is not skinned: {node.get('name')}")
                selected_count += 1
            else:
                node.pop("mesh", None)
                node.pop("skin", None)
        if selected_count != expected[filename]:
            raise SystemExit(f"{filename}: selected node count mismatch")
        if not output_doc.get("skins") or not output_doc.get("materials") or not output_doc.get("images"):
            raise SystemExit(f"{filename}: missing skeleton, materials or embedded textures")
        json_payload = json.dumps(output_doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
        output_chunks = list(chunks)
        output_chunks[json_index] = (b"JSON", json_payload)
        target = OUT / filename
        write_glb(target, output_chunks)
        # Re-open and confirm that only the intended skinned mesh nodes remain.
        check, _, _ = read_glb(target)
        visible = [n.get("name") for _, n, _ in mesh_node_names(check)]
        if set(visible) != selected_names or len(visible) != expected[filename]:
            raise SystemExit(f"{filename}: post-write validation failed: {visible}")
        print(f"PASS {target}: {len(visible)} skinned meshes; skeleton/materials/textures retained")

if __name__ == "__main__":
    main()
