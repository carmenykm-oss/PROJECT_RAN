#!/usr/bin/env python3
"""Probe RAN animation BIN payload starts without assuming a codec."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, struct, zipfile

ARRAY = bytes.fromhex('''cd f0 a2 e2 ed 88 e3 98 bc 66 c1 7c f4 db 47 96 f6 6c 5e 11 af 2f 40 42 41 07 de 4c 8a 63 4d 51 c0 9b 38 27 19 03 97 65 3d 44 ac a7 18 a0 61 13 b3 b4 c6 21 15 e0 c5 0f 78 c4 ef 2c 53 26 2e 67 54 5f d5 c8 aa 17 46 95 a3 94 fb ba d3 bd 64 2a bf 34 48 35 43 d7 f5 cf 90 92 2d b5 5d 93 99 50 74 72 31 04 58 10 5a 7f ff ca 55 37 b2 dd e5 0a 0d 69 b1 3a 00 3c ea 22 32 8d f2 9c 86 1c b0 76 30 01 d2 06 bb 77 f3 80 e8 a6 05 ec 89 49 fd d9 d6 d4 45 6f 4f b8 33 57 d8 87 a8 9e f9 5c 23 b6 6b eb 7e 1f 02 fe 85 e9 12 c9 ae 08 9f 52 25 71 09 3f 29 68 3b 1a e7 91 59 7a 6e 8e 56 a4 1d 1e a9 9a df 70 8c 4e 4b dc ee 36 8f c3 83 82 e4 8b 79 6d 0c a1 7d 39 4a be fa ab d1 c7 28 7b cc f7 b7 ad 62 b9 d0 f8 f1 0e 1b cb da e6 2b 60 16 c2 81 0b 73 a5 20 84 5b 24 9d 75 e1 ce 14 6a 3e fc''')
INV = bytearray(256)
for i, value in enumerate(ARRAY): INV[value] = i

def rc4(key: bytes, data: bytes) -> bytes:
    s=list(range(256)); j=0
    for i in range(256):
        j=(j+s[i]+key[i%len(key)])&255; s[i],s[j]=s[j],s[i]
    i=j=0; out=bytearray()
    for value in data:
        i=(i+1)&255; j=(j+s[i])&255; s[i],s[j]=s[j],s[i]
        out.append(value ^ s[(s[i]+s[j])&255])
    return bytes(out)

def u32(data: bytes): return struct.unpack('<I',data[:4])[0] if len(data)>=4 else None

def probe(name: str, data: bytes):
    prefix=data[132:144]; body=data[144:]
    result={'file':name,'size':len(data),'header_version':u32(data[128:132]),
      'prefix_132_143_hex':prefix.hex(),'raw_132_first_dword':u32(data[132:]),
      'raw_144_first_dword':u32(body),'raw_144_first_16_hex':body[:16].hex(),
      'compbyte_decode_132_first_dword':u32(bytes(INV[x] for x in data[132:136])),
      'compbyte_decode_144_first_dword':u32(bytes(INV[x] for x in body[:4])),'rc4_candidates':{}}
    keys={'prefix12':prefix,'md5_prefix12':hashlib.md5(prefix).digest(),
      'sha1_prefix12':hashlib.sha1(prefix).digest(),'md5_header144':hashlib.md5(data[:144]).digest()}
    for label,key in keys.items():
        decoded=rc4(key,body)
        result['rc4_candidates'][label]={'first_dword':u32(decoded),'first_16_hex':decoded[:16].hex()}
    return result

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('archive',type=pathlib.Path)
    ap.add_argument('--names',nargs='*',default=['a_x01bs_lv1_wait.bin','a_x01bs_lv1_walk.bin','a_x01bs_lv1_run.bin'])
    ap.add_argument('--output',type=pathlib.Path); args=ap.parse_args(); rows=[]
    with zipfile.ZipFile(args.archive) as zf:
        for wanted in args.names:
            for name in zf.namelist():
                if name.lower().endswith(wanted.lower()): rows.append(probe(name,zf.read(name)))
    output=json.dumps(rows,indent=2)
    if args.output: args.output.write_text(output+'\n',encoding='utf-8')
    print(output)
if __name__=='__main__': main()
