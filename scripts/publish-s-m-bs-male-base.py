#!/usr/bin/env python3
"""Publish native s_m_bs.X as male underwear/base body; retain its full skeleton."""
from pathlib import Path
import json, shutil, struct
src=Path("converted_glb/s_m_bs.glb"); dst=Path("public/models/ran-male-underwear-body.glb")
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
for image in doc.get("images",[]):
 if image.get("uri","").lower().endswith(".dds"): raise SystemExit("Unpatched DDS URI: "+image["uri"])
dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
report={"source":"source_assets/s_m_bs.x","published":str(dst),"meshNodes":[n.get("name") for n in nodes],"meshNodeCount":len(nodes),"skinCount":len(skins),"jointCount":len(skins[0]["joints"]),"requiredJointsPresent":sorted(required),"bytes":dst.stat().st_size,"status":"PASS"}
Path("logs").mkdir(exist_ok=True); Path("logs/s-m-bs-male-base-validation.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
