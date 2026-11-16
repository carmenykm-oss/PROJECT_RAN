#!/usr/bin/env python3
"""Extract decoded RAN2 animation tracks to portable JSON clips.

The JSON is intentionally intermediate data: browser-side code can bind it to
the matching female skeleton after bone-name and coordinate checks.
"""
from __future__ import annotations
import argparse
import importlib.util
import io
import json
import math
import struct
import zipfile
from pathlib import Path

DECODER_PATH = Path(__file__).with_name("decode-ran2-animation-bins.py")
spec = importlib.util.spec_from_file_location("ran_decoder", DECODER_PATH)
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)

def read_u32(data, offset):
    if offset + 4 > len(data): raise ValueError("truncated DWORD")
    return struct.unpack_from("<I", data, offset)[0], offset + 4

def read_string(data, offset):
    size, offset = read_u32(data, offset)
    if size < 1 or size > 4096 or offset + size > len(data): raise ValueError("invalid bone string")
    raw = data[offset:offset+size]
    if raw[-1] != 0: raise ValueError("bone string is not NUL terminated")
    return raw[:-1].decode("ascii"), offset + size

def read_vec_keys(data, offset, count, fields):
    out=[]
    for _ in range(count):
        if offset + 4 + fields*4 > len(data): raise ValueError("truncated vector key")
        t=struct.unpack_from("<I",data,offset)[0]
        vals=struct.unpack_from("<"+"f"*fields,data,offset+4)
        out.append({"time":t,"value":list(vals)})
        offset += 4 + fields*4
    return out,offset

def read_quat_keys(data, offset, count):
    out=[]
    for _ in range(count):
        if offset+20>len(data): raise ValueError("truncated rotation key")
        t=struct.unpack_from("<I",data,offset)[0]
        x,y,z,w=struct.unpack_from("<4f",data,offset+4)
        out.append({"time":t,"value":[x,y,z,w]})
        offset+=20
    return out,offset

def read_matrix_keys(data, offset, count):
    out=[]
    for _ in range(count):
        if offset+80>len(data): raise ValueError("truncated matrix key")
        t=struct.unpack_from("<I",data,offset)[0]
        m=list(struct.unpack_from("<16f",data,offset+16))
        out.append({"time":t,"matrix":m})
        offset+=80
    return out,offset

def decode_quat(first, second):
    x=(((first>>16)&0xffff)-32767)/32768.0
    y=((first&0xffff)-32767)/32768.0
    z=(((second>>16)&0xffff)-32767)/32768.0
    w=((second&0xffff)-32767)/65535.0
    n=math.sqrt(x*x+y*y+z*z+w*w) or 1.0
    return [x/n,y/n,z/n,w/n]

def read_quatpos_keys(data, offset, count):
    out=[]
    for _ in range(count):
        if offset+36>len(data): raise ValueError("truncated quaternion-position key")
        t=struct.unpack_from("<I",data,offset)[0]
        scale=struct.unpack_from("<3f",data,offset+4)
        pos=struct.unpack_from("<3f",data,offset+16)
        a,b=struct.unpack_from("<2I",data,offset+28)
        out.append({"time":t,"scale":list(scale),"position":list(pos),"rotation":decode_quat(a,b)})
        offset+=36
    return out,offset

def parse_track(data, offset):
    version,offset=read_u32(data,offset)
    if version not in (0x0100,0x0101,0x0102): raise ValueError(f"unknown animation record version {version:#x}")
    track={"version":hex(version),"position":[],"rotation":[],"scale":[],"matrix":[],"quat_position":[]}
    if version==0x0102:
        track["bone"],offset=read_string(data,offset)
        n,offset=read_u32(data,offset); track["rotation"],offset=read_quat_keys(data,offset,n)
        n,offset=read_u32(data,offset); track["position"],offset=read_vec_keys(data,offset,n,3)
        _,offset=read_u32(data,offset)
        n,offset=read_u32(data,offset); track["quat_position"],offset=read_quatpos_keys(data,offset,n)
        _,offset=read_u32(data,offset)
        n,offset=read_u32(data,offset); track["matrix"],offset=read_matrix_keys(data,offset,n)
        n,offset=read_u32(data,offset); track["scale"],offset=read_vec_keys(data,offset,n,3)
    else:
        n,offset=read_u32(data,offset); track["position"],offset=read_vec_keys(data,offset,n,3)
        n,offset=read_u32(data,offset); track["rotation"],offset=read_quat_keys(data,offset,n)
        n,offset=read_u32(data,offset); track["scale"],offset=read_vec_keys(data,offset,n,3)
        n,offset=read_u32(data,offset); track["matrix"],offset=read_matrix_keys(data,offset,n)
        if version==0x0101:
            n,offset=read_u32(data,offset); track["quat_position"],offset=read_quatpos_keys(data,offset,n)
        track["bone"],offset=read_string(data,offset)
    if not track["bone"]: raise ValueError("empty bone name")
    return track,offset

def parse_clip(raw, name):
    decoded=decoder.decode_ran2(raw)
    data=decoded
    if not data.startswith(b"AnimContainer"): raise ValueError("bad container marker")
    version=struct.unpack_from("<I",data,128)[0]
    if version not in (0x0100,0x0101,0x0102): raise ValueError(f"bad container version {version:#x}")
    offset=132
    def group(label):
        nonlocal offset
        count,offset=read_u32(data,offset)
        if count>10000: raise ValueError("implausible animation track count")
        tracks=[]
        for _ in range(count):
            track,offset=parse_track(data,offset); track["body"]=label; tracks.append(track)
        return tracks
    if version in (0x0100,0x0101):
        tracks=group("lower")
        if version==0x0101: tracks+=group("upper")
    else:
        tracks=group("upper")+group("lower")
    if offset>len(data): raise ValueError("container overrun")
    return {"name":name,"container_version":hex(version),"timebase":4800,
            "tracks":tracks,"bytes_consumed":offset,"trailing_bytes":len(data)-offset}

def walk_zip(data, prefix="", depth=0):
    if depth>3:return
    try:z=zipfile.ZipFile(io.BytesIO(data))
    except Exception:return
    for info in z.infolist():
        if info.is_dir():continue
        payload=z.read(info); name=prefix+info.filename
        if info.filename.lower().endswith(".bin") and payload.startswith(b"AnimContainer"):
            yield name,payload
        elif payload[:4]==b"PK\x03\x04":
            yield from walk_zip(payload,name+"!/",depth+1)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("archive",type=Path)
    ap.add_argument("--output-dir",type=Path,required=True)
    ap.add_argument("--match",action="append",default=[])
    args=ap.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    selected=[]
    for name,raw in walk_zip(args.archive.read_bytes()):
        base=name.rsplit("/",1)[-1].lower()
        if args.match and not any(m.lower() in base for m in args.match):continue
        try:
            clip=parse_clip(raw,base)
            safe=base.rsplit(".",1)[0]+".json"
            (args.output_dir/safe).write_text(json.dumps(clip,separators=(",",":"))+"\n",encoding="utf-8")
            selected.append({"name":name,"tracks":len(clip["tracks"]),"file":safe,
                             "bones":sorted({t["bone"] for t in clip["tracks"]})})
        except Exception as exc:
            selected.append({"name":name,"error":str(exc)})
    print(json.dumps({"selected":len(selected),"results":selected},indent=2))
    if not selected or any("error" in x for x in selected):raise SystemExit(1)

if __name__=="__main__":main()
