#!/usr/bin/env python3
"""Build selected male face and hair exactly like the confirmed female base flow.

The body remains ran-male-underwear-body.glb. This publishes one isolated,
independently skinned face and one independently skinned hairstyle. Unselected
mesh/material/texture variants are removed from each output GLB.
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
        body += struct.pack("<I4s", len(payload), kind) + payload
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)

def mesh_nodes(doc):
    return [(i, node) for i, node in enumerate(doc.get("nodes", [])) if "mesh" in node]

def texture_indices(value):
    found = set()
    if isinstance(value, dict):
        if isinstance(value.get("index"), int):
            found.add(value["index"])
        for child in value.values():
            found.update(texture_indices(child))
    elif isinstance(value, list):
        for child in value:
            found.update(texture_indices(child))
    return found

def compact_selected_materials(doc, selected):
    mesh = doc["meshes"][selected["mesh"]]
    material_indices = sorted({
        primitive["material"]
        for primitive in mesh.get("primitives", [])
        if isinstance(primitive.get("material"), int)
    })
    materials = doc.get("materials", [])
    if not material_indices:
        raise SystemExit(f"{selected.get('name')}: selected mesh has no material")
    material_map = {old: new for new, old in enumerate(material_indices)}
    kept_materials = [materials[index] for index in material_indices]
    for primitive in mesh.get("primitives", []):
        if isinstance(primitive.get("material"), int):
            primitive["material"] = material_map[primitive["material"]]

    used_textures = set()
    for material in kept_materials:
        used_textures.update(texture_indices(material))
    textures = doc.get("textures", [])
    texture_map = {old: new for new, old in enumerate(sorted(used_textures))}
    for material in kept_materials:
        def remap(value):
            if isinstance(value, dict):
                if isinstance(value.get("index"), int) and value["index"] in texture_map:
                    value["index"] = texture_map[value["index"]]
                for child in value.values():
                    remap(child)
            elif isinstance(value, list):
                for child in value:
                    remap(child)
        remap(material)
    kept_textures = [textures[index] for index in sorted(used_textures)]

    used_images = sorted({
        texture.get("source")
        for texture in kept_textures
        if isinstance(texture.get("source"), int)
    })
    images = doc.get("images", [])
    image_map = {old: new for new, old in enumerate(used_images)}
    for texture in kept_textures:
        if isinstance(texture.get("source"), int):
            texture["source"] = image_map[texture["source"]]

    used_samplers = sorted({
        texture.get("sampler")
        for texture in kept_textures
        if isinstance(texture.get("sampler"), int)
    })
    samplers = doc.get("samplers", [])
    sampler_map = {old: new for new, old in enumerate(used_samplers)}
    for texture in kept_textures:
        if isinstance(texture.get("sampler"), int):
            texture["sampler"] = sampler_map[texture["sampler"]]

    doc["materials"] = kept_materials
    doc["textures"] = kept_textures
    doc["images"] = [images[index] for index in used_images]
    if samplers:
        doc["samplers"] = [samplers[index] for index in used_samplers]
    return [image.get("uri", "") for image in doc["images"]]

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

        for index, node in candidates:
            if index != selected_index:
                node.pop("mesh", None)
                node.pop("skin", None)
        image_uris = compact_selected_materials(doc, selected)
        if not image_uris:
            raise SystemExit(f"{source}: selected {selected_name} has no texture image")
        for uri in image_uris:
            if uri.lower().endswith(".dds"):
                raise SystemExit(f"{source}: unconverted DDS image reference: {uri}")
            image_path = OUT / uri
            if not image_path.is_file():
                raise SystemExit(f"{source}: selected mesh texture is missing: {image_path}")

        payload = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        chunks[json_index] = (b"JSON", payload)
        write_glb(target, chunks)

        check, _, _ = read_glb(target)
        visible = mesh_nodes(check)
        if len(visible) != 1 or visible[0][1].get("name") != selected_name:
            raise SystemExit(f"{target}: output isolation check failed")
        if len(check.get("images", [])) != 1 or len(check.get("materials", [])) != 1:
            raise SystemExit(f"{target}: unused material/texture variants were not removed")
        check_skin = check["skins"][visible[0][1]["skin"]]
        check_joints = [check["nodes"][index].get("name", "") for index in check_skin["joints"]]
        if not set(check_joints).issubset(base_joint_names):
            raise SystemExit(f"{target}: output has joints outside the male base rig")
        print(f"PASS {target}: selected={selected_name}; skinnedMeshes=1; joints={len(check_joints)}; texture={image_uris[0]}")

if __name__ == "__main__":
    main()
