#!/usr/bin/env python3
"""Compare selected male base, face/hair and outfit GLB bind-pose metadata.

This is diagnostic only: it never rewrites source or published models. It reports
mesh-node transforms, local vertex bounds, skin joint sets, inverse-bind matrices,
and world-space joint transforms so matching bone names cannot be mistaken for
matching bind poses.
"""
from pathlib import Path
import json, math, struct

FILES = [
    "public/models/ran-male.glb",
    "public/models/ran-male-body.glb",
    "public/models/ran-male-face.glb",
    "public/models/ran-male-hair.glb",
] + [f"public/models/ran-male-outfit-{v}-{s}.glb"
     for v in ("a", "f") for s in ("upper", "gloves", "lower", "shoes")]

def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF": raise ValueError(f"Invalid GLB: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw): raise ValueError(f"Invalid GLB length: {path}")
    chunks, offset = {}, 12
    while offset < len(raw):
        size, kind = struct.unpack_from("<I4s", raw, offset); offset += 8
        chunks[kind.decode("ascii")] = raw[offset:offset+size]; offset += size
    return json.loads(chunks["JSON"].decode("utf-8").rstrip(" \0")), chunks.get("BIN\0", b"")

def mat_mul(a,b):
    # Column-major 4x4 matrices.
    return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]

def trs(node):
    if "matrix" in node: return node["matrix"]
    t=node.get("translation",[0,0,0]); q=node.get("rotation",[0,0,0,1]); s=node.get("scale",[1,1,1])
    x,y,z,w=q
    return [
      (1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
      (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
      (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
      *t, 1
    ]

def determinant3(m):
    # Determinant of the upper-left 3x3 in a column-major 4x4 matrix.
    a,b,c=m[0],m[4],m[8]; d,e,f=m[1],m[5],m[9]; g,h,i=m[2],m[6],m[10]
    return a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g)

def accessor_bounds(doc, accessor_index):
    acc=doc.get("accessors",[])[accessor_index]
    return {"min":acc.get("min"),"max":acc.get("max"),"count":acc.get("count"),"type":acc.get("type")}

def inspect(path):
    doc, binary=read_glb(path); nodes=doc.get("nodes",[]); skins=doc.get("skins",[])
    parents={}
    for i,n in enumerate(nodes):
        for c in n.get("children",[]): parents[c]=i
    worlds={}
    def world(i):
        if i in worlds: return worlds[i]
        local=trs(nodes[i]); p=parents.get(i)
        worlds[i]=mat_mul(world(p),local) if p is not None else local
        return worlds[i]
    joint_rows=[]
    for si,skin in enumerate(skins):
        names=[]
        for ji in skin.get("joints",[]):
            n=nodes[ji]; m=world(ji)
            names.append(n.get("name",str(ji)))
            joint_rows.append({"skin":si,"name":n.get("name",str(ji)),
                "parent":nodes[parents[ji]].get("name") if ji in parents else None,
                "worldTranslation":[round(m[12],5),round(m[13],5),round(m[14],5)],
                "worldBasisDeterminant":round(determinant3(m),6)})
    mesh_rows=[]
    for ni,n in enumerate(nodes):
        if "mesh" not in n: continue
        mesh=doc["meshes"][n["mesh"]]
        prims=[]
        for p in mesh.get("primitives",[]):
            pos=p.get("attributes",{}).get("POSITION")
            prims.append(accessor_bounds(doc,pos) if pos is not None else None)
        mesh_rows.append({"node":n.get("name"),"mesh":mesh.get("name"),
          "skin":n.get("skin"),"nodeTranslation":n.get("translation",[0,0,0]),
          "nodeRotation":n.get("rotation",[0,0,0,1]),"nodeScale":n.get("scale",[1,1,1]),
          "worldTranslation":[round(world(ni)[12],5),round(world(ni)[13],5),round(world(ni)[14],5)],
          "worldBasisDeterminant":round(determinant3(world(ni)),6),
          "parent":nodes[parents[ni]].get("name") if ni in parents else None,
          "primitives":prims})
    return {"file":str(path),"bytes":path.stat().st_size,"skins":[
      {"name":s.get("name"),"jointCount":len(s.get("joints",[])),
       "skeleton":nodes[s["skeleton"]].get("name") if "skeleton" in s else None,
       "inverseBindMatricesAccessor":s.get("inverseBindMatrices")} for s in skins],
      "sceneRoots":doc.get("scenes",[{}])[doc.get("scene",0)].get("nodes",[]),
      "meshNodes":mesh_rows,"jointTransforms":joint_rows}

def main():
    missing=[f for f in FILES if not Path(f).is_file()]
    if missing: raise SystemExit("Missing required models: "+", ".join(missing))
    report=[inspect(Path(f)) for f in FILES]
    Path("logs").mkdir(exist_ok=True)
    Path("logs/male-bind-pose-diagnostics.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    for item in report:
        print("\n### "+item["file"])
        for mesh in item["meshNodes"]:
            print(json.dumps(mesh,ensure_ascii=False))
        print("SKINS",json.dumps(item["skins"],ensure_ascii=False))
        print("ROOTS",json.dumps(item["sceneRoots"],ensure_ascii=False))
        print("JOINTS",json.dumps(item["jointTransforms"],ensure_ascii=False))
    print("\nWrote logs/male-bind-pose-diagnostics.json")

if __name__=="__main__": main()
