#!/usr/bin/env python3
"""Synthetic structural tests for the RAN2 animation BIN decoder."""
import importlib.util
import struct
from pathlib import Path

SCRIPT = Path(__file__).with_name("decode-ran2-animation-bins.py")
spec = importlib.util.spec_from_file_location("ran_decoder", SCRIPT)
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)

def u32(value):
    return struct.pack("<I", value)

def make_track(version):
    out = bytearray(u32(version))
    if version == 0x0102:
        bone = b"Bip01 Pelvis" + bytes([0])
        out += u32(len(bone)) + bone
        out += u32(0)  # rotation
        out += u32(0)  # position
        out += u32(0)  # legacy
        out += u32(0)  # quat-position
        out += u32(0)  # legacy
        out += u32(1) + bytes(80)  # aligned matrix key
        out += u32(0)  # scale
    else:
        out += u32(0)  # position
        out += u32(0)  # rotation
        out += u32(0)  # scale
        out += u32(1) + bytes(80)  # aligned matrix key
        if version == 0x0101:
            out += u32(0)  # quat-position
        bone = b"Bip01 Pelvis\0"
        out += u32(len(bone)) + bone
    return bytes(out)

def make_container(version):
    header = b"AnimContainer" + bytes(128 - len(b"AnimContainer")) + u32(version)
    if version in (0x0100, 0x0101):
        body = u32(1) + make_track(0x0101 if version == 0x0101 else 0x0100)
        if version == 0x0101:
            body += u32(0)
    else:
        body = u32(1) + make_track(0x0102) + u32(0)
    return header + body

def main():
    extract_path = Path(__file__).with_name("extract-ran2-animation-clips.py")
    extract_spec = importlib.util.spec_from_file_location("ran_extract", extract_path)
    extract = importlib.util.module_from_spec(extract_spec)
    extract_spec.loader.exec_module(extract)

    # A version 0x0101 track with one key of each supported type.
    bone = b"Bip01 Pelvis" + bytes([0])
    track = bytearray(u32(0x0101))
    track += u32(1) + u32(1200) + struct.pack("<3f", 1.0, 2.0, 3.0)  # position
    track += u32(1) + u32(1200) + struct.pack("<4f", 0.0, 0.0, 0.0, 1.0)  # rotation
    track += u32(1) + u32(1200) + struct.pack("<3f", 1.0, 1.0, 1.0)  # scale
    matrix = [1.0,0.0,0.0,0.0, 0.0,1.0,0.0,0.0, 0.0,0.0,1.0,0.0, 0.0,0.0,0.0,1.0]
    track += u32(1) + u32(1200) + bytes(12) + struct.pack("<16f", *matrix)  # matrix
    track += u32(1) + u32(1200) + struct.pack("<6f", 1,1,1,4,5,6) + struct.pack("<2I", 0xBFFF7FFF, 0xBFFF7FFF)
    track += u32(len(bone)) + bone
    container = b"AnimContainer" + bytes(128-len(b"AnimContainer")) + u32(0x0101) + u32(1) + track + u32(0)
    prefix = b"RAN2PREFIX12"
    encrypted = container[:132] + (prefix + container[132:]).translate(decoder.ARRAY_RAN2)
    clip = extract.parse_clip(encrypted, "synthetic-walk.bin")
    assert len(clip["tracks"]) == 1
    result_track = clip["tracks"][0]
    assert result_track["bone"] == "Bip01 Pelvis"
    assert result_track["position"][0]["value"] == [1.0, 2.0, 3.0]
    assert result_track["rotation"][0]["value"] == [0.0, 0.0, 0.0, 1.0]
    assert result_track["scale"][0]["value"] == [1.0, 1.0, 1.0]
    assert result_track["matrix"][0]["matrix"] == matrix
    assert result_track["quat_position"][0]["position"] == [4.0, 5.0, 6.0]
    for version in (0x0100, 0x0101, 0x0102):
        parsed = decoder.parse_container(make_container(version))
        assert parsed["animation_records"] == 1, (version, parsed)
        assert parsed["tracks"][0]["bone"] == "Bip01 Pelvis"
        assert parsed["tracks"][0]["key_counts"]["matrix"] == 1

    plain = make_container(0x0101)
    prefix = b"RAN2PREFIX12"  # exactly 12 bytes
    serial_payload = prefix + plain[132:]
    raw = plain[:132] + serial_payload.translate(decoder.ARRAY_RAN2)
    decoded = decoder.decode_ran2(raw)
    assert decoded == plain, "RAN2 substitution inverse or 12-byte removal failed"
    print("PASS: container layouts, RAN2 transform, and full position/rotation/scale/matrix/quat-position key extraction")

if __name__ == "__main__":
    main()
