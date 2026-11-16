#!/usr/bin/env python3
"""Build the selected male base face and hair exactly like the confirmed female flow.

The body stays in ran-male-underwear-body.glb. This script publishes one isolated,
independently skinned face mesh and one independently skinned hair mesh. Both are
required to bind only to the selected male base rig; no alternate variants are
published into the active character assembly.
"""
from pathlib import Path
import json
import struct

OUT = Path("public/models")
BASE = OUT / "ran-male-underwear-body.glb"
PARTS = (
    (Path("converted_glb/s_m_face.glb"), "m2_face00", OUT / "ran-male-face.glb"),
    (Path("converted_glb/s_m_hair00.glb"), "m_hair00", OUT / "ran-male-hair.glb"),
)

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
    doc = json.loads(chunks[json_index][1].decode("utf-8").rstrip(" \\0"))
    return doc, chunks, json_index

def write_glb(path, chunks):
    body = bytearray()
    for kind, payload in chunks:
        body += struct.pack("<I4s", len(payload), kind)
        body += payload
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)

def mesh_nodes(doc):
    return [(i, node) for i, node in enumerate(doc.get("nodes", [])) if "mesh" in node]

def main():
    if not BASE.is_file():
        raise SystemExit(f"Male base body must be published first: {BASE}")
    base_doc, _, _ = read_glb(BASE)
    base_nodes = base_doc.get("nodes", [])
    base_joint_names = {
        base_nodes[index].get("name", "")
        for skin in base_doc.get("skins", [])
        for index in skin.get("joints", [])
    }
    if len(base_joint_names) < 40 or not {"Bip01_Head", "Bip01_Neck"}.issubset(base_joint_names):
        raise SystemExit(f"Selected male body has no complete head/neck rig: {sorted(base_joint_names)}")

    OUT.mkdir(parents=True, exist_ok=True)
    for source, selected_name, target in PARTS:
        if not source.is_file():
            raise SystemExit(f"Missing converted male source: {source}")
        doc, chunks, json_index = read_glb(source)
        nodes = doc.get("nodes", [])
        candidates = mesh_nodes(doc)
        matches = [(index, node) for index, node in candidates if node.get("name") == selected_name]
        if len(matches) != 1:
            raise SystemExit(f"{source}: expected exactly one selected mesh {selected_name}, found {len(matches)}")
        selected_index, selected = matches[0]
        skin_index = selected.get("skin")
        if skin_index is None or skin_index >= len(doc.get("skins", [])):
            raise SystemExit(f"{source}: selected mesh {selected_name} has no valid skin")
        skin = doc["skins"][skin_index]
        joint_names = [nodes[index].get("name", "") for index in skin.get("joints", [])]
        if not {"Bip01_Head", "Bip01_Neck"}.issubset(set(joint_names)):
            raise SystemExit(f"{source}: expected male head/neck joints, got {joint_names}")
        missing = sorted(set(joint_names) - base_joint_names)
        if missing:
            raise SystemExit(f"{source}: selected male base rig is missing source joints: {missing}")

        for primitive in doc["meshes"][selected["mesh"]].get("primitives", []):
            attrs = primitive.get("attributes", {})
            required = {"POSITION", "JOINTS_0", "WEIGHTS_0", "TEXCOORD_0"}
            absent = sorted(required - set(attrs))
            if absent:
                raise SystemExit(f"{source}: {selected_name} missing skin/UV attributes: {absent}")

        image_uris = [item.get("uri", "") for item in doc.get("images", [])]
        if not image_uris:
            raise SystemExit(f"{source}: selected {selected_name} has no texture image")
        for uri in image_uris:
            if uri.lower().endswith(".dds"):
                raise SystemExit(f"{source}: unconverted DDS image reference: {uri}")
            image_path = OUT / uri
            if not image_path.is_file():
                raise SystemExit(f"{source}: required texture is missing: {image_path}")

        # Same isolation strategy as split-female-base-parts.py:
        # keep one selected skinned node; preserve its skin, material and texture.
        for index, node in candidates:
            if index != selected_index:
                node.pop("mesh", None)
                node.pop("skin", None)
        remaining = mesh_nodes(doc)
        if len(remaining) != 1 or remaining[0][1].get("name") != selected_name:
            raise SystemExit(f"{source}: could not isolate {selected_name}")

        payload = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        chunks[json_index] = (b"JSON", payload)
        write_glb(target, chunks)

        check, _, _ = read_glb(target)
        visible = mesh_nodes(check)
        if len(visible) != 1 or visible[0][1].get("name") != selected_name:
            raise SystemExit(f"{target}: output isolation check failed")
        check_skin = check["skins"][visible[0][1]["skin"]]
        check_joints = [check["nodes"][index].get("name", "") for index in check_skin["joints"]]
        if not set(check_joints).issubset(base_joint_names):
            raise SystemExit(f"{target}: output has joints outside the male base rig")
        print(f"PASS {target}: selected={selected_name}; skinnedMeshes=1; joints={len(check_joints)}; textures={image_uris}")

if __name__ == "__main__":
    main()
