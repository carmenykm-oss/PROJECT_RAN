#!/usr/bin/env python3
"""Publish native s_m_bs.X as male underwear/base body; retain its full skeleton."""
from pathlib import Path
import json, struct
src=Path("converted_glb/s_m_bs.glb"); dst=Path("public/models/ran-male-underwear-body.glb")
texture_dir=Path("public/models")
texture_map={"m2_bs_body.png":"m1_bs_body.png","m2_bs_hand.png":"m1_bs_arm.png","m2_bs_leg.png":"m1_bs_leg.png","m2_bs_foot.png":"m1_bs_foot.png"}
if not src.is_file() or src.stat().st_size < 100: raise SystemExit(f"Missing converted male base: {src}")
raw=src.read_bytes()
if raw[:4] != b"glTF": raise SystemExit("s_m_bs export is not GLB")
version,total=struct.unpack_from("<II",raw,4)
if version != 2 or total != len(raw): raise SystemExit("Invalid s_m_bs GLB header/length")
offset=12; doc=None
while offset < len(raw):
 length,kind=struct.unpack_from("<I4s",raw,offset); offset+=8
 payload=raw[offset:offset+length]; offset+=length
 if kind==b"JSON": doc=json.loads(payload.decode("utf-8").rstrip(" \\0"))
if doc is None: raise SystemExit("No GLB JSON chunk")
nodes=[n for n in doc.get("nodes",[]) if "mesh" in n]; skins=doc.get("skins",[])
if len(nodes)!=4: raise SystemExit(f"Expected 4 s_m_bs meshes, found {len(nodes)}")
if not skins or len(skins[0].get("joints",[]))<40: raise SystemExit("No usable Bip01 skin skeleton")
joint_names={doc["nodes"][i].get("name","") for i in skins[0].get("joints",[])}
required={"Bip01_Pelvis","Bip01_Spine","Bip01_Spine1","Bip01_Spine2","Bip01_Neck","Bip01_Head","Bip01_L_UpperArm","Bip01_R_UpperArm","Bip01_L_Thigh","Bip01_R_Thigh"}
missing=required-joint_names
if missing: raise SystemExit("Missing required body joints: "+", ".join(sorted(missing)))
for n in nodes:
 if "skin" not in n: raise SystemExit(f"Unskinned body mesh: {n.get('name')}")
 for p in doc["meshes"][n["mesh"]].get("primitives",[]):
  a=p.get("attributes",{})
  if "JOINTS_0" not in a or "WEIGHTS_0" not in a: raise SystemExit("Missing skin weights")
images=doc.get("images",[])
if len(images) != 4: raise SystemExit(f"Expected four male base texture images, found {len(images)}")
used={}
for image in images:
 old=Path(image.get("uri","")).name
 if old not in texture_map: raise SystemExit("Unexpected male base texture URI: "+old)
 new=texture_map[old]
 if not (texture_dir/new).is_file(): raise SystemExit(f"Missing converted NEW M1 DDS texture: {texture_dir/new}")
 image["uri"]=new
 used[old]=new
if used != texture_map: raise SystemExit(f"Incomplete M1 DDS texture mapping: {used}")
chunks=[]; offset=12
while offset < len(raw):
 length,kind=struct.unpack_from("<I4s",raw,offset); offset+=8
 payload=raw[offset:offset+length]; offset+=length
 if kind==b"JSON":
  payload=json.dumps(doc,separators=(",",":"),ensure_ascii=False).encode("utf-8")
  payload+=b" " * ((4-len(payload)%4)%4)
 chunks.append((kind,payload))
body=bytearray()
for kind,payload in chunks: body+=struct.pack("<I4s",len(payload),kind)+payload
patched=b"glTF"+struct.pack("<II",2,12+len(body))+body
dst.parent.mkdir(parents=True,exist_ok=True); dst.write_bytes(patched)
check_offset=12; check_doc=None
while check_offset < len(patched):
 length,kind=struct.unpack_from("<I4s",patched,check_offset); check_offset+=8
 payload=patched[check_offset:check_offset+length]; check_offset+=length
 if kind==b"JSON": check_doc=json.loads(payload.decode("utf-8").rstrip(" "))
actual={Path(i.get("uri","")).name for i in check_doc.get("images",[])}
if actual != set(texture_map.values()): raise SystemExit(f"Published GLB does not reference M1 DDS conversions: {sorted(actual)}")
report={"source":"source_assets/s_m_bs.x","published":str(dst),"meshNodes":[n.get("name") for n in nodes],"meshNodeCount":len(nodes),"skinCount":len(skins),"jointCount":len(skins[0]["joints"]),"requiredJointsPresent":sorted(required),"textureSource":"newly uploaded M1 DDS converted to PNG","textureFiles":sorted(texture_map.values()),"bytes":dst.stat().st_size,"status":"PASS"}
Path("logs").mkdir(exist_ok=True); Path("logs/s-m-bs-male-base-validation.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
