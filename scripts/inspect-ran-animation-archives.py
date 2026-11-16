#!/usr/bin/env python3
"""Inspect RAN Online animation BIN/CFG archive pairs without modifying source files.

This is a format-discovery tool, not a decoder. It records signatures, lengths,
header markers and pair coverage so future parser work can be tested reproducibly.
"""
from __future__ import annotations
import argparse, collections, hashlib, io, json, zipfile
from pathlib import Path

def read_archives(path: Path):
    with zipfile.ZipFile(path) as outer:
        files = {n: outer.read(n) for n in outer.namelist() if not n.endswith('/')}
    cfg = {}
    for name, data in list(files.items()):
        if name.lower().endswith('.rcc') and data[:2] == b'PK':
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as inner:
                    cfg.update({Path(n).name: inner.read(n) for n in inner.namelist()
                                if n.lower().endswith('.cfg') and not n.endswith('/')})
            except zipfile.BadZipFile:
                pass
    cfg.update({Path(n).name: d for n, d in files.items() if n.lower().endswith('.cfg')})
    bins = {Path(n).name: d for n, d in files.items() if n.lower().endswith('.bin')}
    return files, bins, cfg

def header(data: bytes):
    return {
        "length": len(data),
        "signature": data[:13].split(b'\\0', 1)[0].decode('ascii', 'replace'),
        "marker_u16_le_at_128": int.from_bytes(data[128:130], 'little') if len(data) >= 130 else None,
        "marker_u32_le_at_128": int.from_bytes(data[128:132], 'little') if len(data) >= 132 else None,
        "sha256": hashlib.sha256(data).hexdigest(),
        "byte_diversity_after_132": round(len(set(data[132:])) / max(1, len(data[132:])), 8),
        "top_bytes_after_132": [{"hex": f"{b:02x}", "count": n}
                                for b, n in collections.Counter(data[132:]).most_common(8)],
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive", type=Path)
    ap.add_argument("--out", type=Path, default=Path("logs/ran-animation-inspection.json"))
    args = ap.parse_args()
    files, bins, cfgs = read_archives(args.archive)
    pairs = sorted(set(Path(n).stem for n in bins) & set(Path(n).stem for n in cfgs))
    bin_stems, cfg_stems = {Path(n).stem for n in bins}, {Path(n).stem for n in cfgs}
    chosen = [s for s in pairs if s in {
        "a_x01bs_lv1_wait", "a_x01bs_lv1_walk", "a_x01bs_lv1_run",
        "a_x02bs_lv1_wait", "a_x02bs_lv1_walk", "a_x02bs_lv1_run",
        "a_2011_w_holin_wait", "a_ldg_apr_w_wait"}]
    report = {
        "tool": "inspect-ran-animation-archives",
        "classification": "metadata-only; no BIN/CFG decoding performed",
        "archive": args.archive.name,
        "outer_entry_count": len(files),
        "bin_count": len(bins),
        "cfg_count_including_nested_RCC": len(cfgs),
        "matched_basename_pairs": len(pairs),
        "bin_without_cfg": sorted(bin_stems - cfg_stems),
        "cfg_without_bin": sorted(cfg_stems - bin_stems),
        "samples": {s: {"bin": header(bins[s + ".bin"]), "cfg": header(cfgs[s + ".cfg"])}
                    for s in chosen if s + ".bin" in bins and s + ".cfg" in cfgs},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "samples"}, indent=2))
    for stem, sample in report["samples"].items():
        print(f'{stem}: BIN {sample["bin"]["length"]} bytes, CFG {sample["cfg"]["length"]} bytes; '
              f'BIN marker 0x{sample["bin"]["marker_u32_le_at_128"]:08x}, '
              f'CFG marker 0x{sample["cfg"]["marker_u32_le_at_128"]:08x}')

if __name__ == "__main__":
    main()
