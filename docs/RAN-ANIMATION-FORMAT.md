# RAN Online animation BIN format notes

## Verified from public RAN Online source

Reference implementation: `yexiuph/RANOnline-x64`

Relevant files:
- `[Lib]__Engine/Sources/Common/SerialFile.cpp`
- `[Lib]__Engine/Sources/Common/basestream.h`
- `[Lib]__Engine/Sources/DxMeshs/SAnimation.cpp`
- `[Lib]__Engine/Sources/DxMeshs/SAnimation.h`
- `[Lib]__Engine/Sources/DxMeshs/DxAniKeys.h`
- `[Lib]__Engine/Sources/DxMeshs/DxSkinAniManSaveLoad.cpp`

## File header

The source defines `FILETYPESIZE = 128`. `CSerialFile::ReadFileType()` reads:
1. 128 bytes file type string
2. one little-endian DWORD file version

Thus the normal serial-file payload starts at byte offset 132.

Observed animation container:
- File type: `AnimContainer`
- Container version in supplied samples: `0x0101`

Observed CFG:
- File type: `SANIMCONINFO`
- CFG version in supplied samples: `0x0107`

The source defines `SANIMCONINFO::VERSION = 0x0107` and `SAnimContainer::VERSION = 0x0102`. The container loader also supports `0x0100` and `0x0101`.

## Container record order

For container version `0x0101`:
1. DWORD lower-body animation record count
2. that many SAnimation records
3. DWORD upper-body animation record count
4. that many SAnimation records

For container version `0x0102`:
1. DWORD upper-body animation record count
2. upper-body records
3. DWORD lower-body animation record count
4. lower-body records

## SAnimation record layouts

Each record starts with a DWORD animation-record version.

Version `0x0101`:
1. DWORD position-key count; position keys
2. DWORD rotation-key count; rotation keys
3. DWORD scale-key count; scale keys
4. DWORD matrix-key count; matrix keys
5. DWORD quaternion-position-key count; quaternion-position keys
6. serialized bone-name string

Version `0x0102`:
1. serialized bone-name string
2. DWORD rotation-key count; rotation keys
3. DWORD position-key count; position keys
4. DWORD legacy/unused DWORD
5. DWORD quaternion-position-key count; quaternion-position keys
6. DWORD legacy/unused DWORD
7. DWORD matrix-key count; matrix keys
8. DWORD scale-key count; scale keys

The exact C++ structures are in `DxAniKeys.h`. In the source layout, `SQuatPosKey` contains:
- DWORD time
- float3 scale
- float3 position
- two DWORDs holding the compressed quaternion

That is 36 bytes under the source's expected 4-byte packing.

## Compressed quaternion

The source packs x/y into the first DWORD and z/w into the second DWORD, each as 16-bit values. Its decompression formula is:
- x = (high16(first) - 32767) / 32768
- y = (low16(first) - 32767) / 32768
- z = (high16(second) - 32767) / 32768
- w = (low16(second) - 32767) / 65535

The runtime associates each SAnimation record with a skeleton bone by exact bone name.

## Important unresolved issue with the supplied archive

The supplied `a_x01bs_lv1_wait.bin`, `walk.bin`, and `run.bin` have the expected visible 128-byte file-type header and `0x0101` marker, but the first DWORD after byte 132 is not a plausible animation count. The public source's plain `CSerialFile` path expects the count immediately after that header. The supplied files therefore appear to have an additional transformation or wrapper not explained by this source revision.

The public source also contains an optional `compbyte` byte-substitution codec, but applying the published inverse table to the supplied payload does not yield a valid container count. Do not treat that codec as the solution for these supplied files without a successful structural validation.

## Next implementation gate

Before building a full BIN-to-GLB exporter, identify the extra payload transform/wrapper and verify that decoding the first payload DWORD yields a plausible count, that every record stays within file bounds, and that bone names map to the female skeleton. Only then export animation clips.

## Additional source-path verification (2026-11-16)

The public source's actual ZIP-backed stream path is now confirmed:
- `GLOGIC::openfile_basestream()` constructs `CSerialMemory` when the ZIP flag is enabled.
- `CSerialMemory::OpenFile()` extracts the named entry from the RCC with `CUnzipper::UnzipToMemory()`.
- The animation CFG loader calls `openfile_basestream(...)` without an explicit encode argument, so the default `bENC=false` applies.
- `CSerialMemory::read()` invokes `compbyte::decode()` only when `m_bencode` is true. The default animation CFG path therefore does not apply this substitution codec.
- The BIN container loader shown in this source revision uses `CSerialFile` on the extracted `.bin` file and expects its first container count immediately after the 132-byte serial header.

This rules out the RCC ZIP decompression itself as an explanation for an extra 12-byte prefix: the RCC layer returns the entry's uncompressed bytes unchanged. The supplied BIN samples still show 12 varying bytes at offsets 132-143 before a repeated-looking payload pattern beginning at offset 144. That observation is verified from the uploaded samples, but the meaning of those 12 bytes is still unknown. It may indicate a different client/build format rather than a transform implemented by this public source revision.

The CFG's `0x0107` body is explicitly field-serialized by `SANIMCONINFO::LoadFile()` (name, skeleton, flags/timing/type, divisions, strikes, sound/effect data, and animation scale); it is not evidence of a shared BIN wrapper.

## Revised implementation gate

Do not blindly strip 12 bytes or apply `compbyte` to all data. First compare the 12-byte BIN prefix across many clips and inspect the exact producer/build format. The parser must then validate both container record counts and the per-record bounds against the full file before any GLB export.

### Archive-wide prefix survey

A fresh local pass over the uploaded outer archive found 3,676 `AnimContainer` BIN files. The 12-byte region at offsets 132-143 is not a shared constant: 3,667 distinct prefixes occur across those 3,676 files. In the three reference clips (`wait`, `walk`, `run`), the prefix is different for each clip, while the first 16 bytes from offset 144 share a highly similar pattern. This supports treating offsets 132-143 as a per-file field or prefix, but does not yet identify its semantics. The archive inspector now reports the top 20 values of this prefix distribution and records bytes 144-159 for each selected sample.


## Reproducible codec/prefix probe (2026-11-16)

Added `scripts/probe-ran-animation-prefix.py` (commit `d1114194112962e623d04ff7a9ccfc251295550e`). It probes the three representative clips at offsets 132 and 144, applies the exact public-source compbyte inverse table at both candidate starts, and tests several RC4 key derivations from the 12-byte prefix.

Results on the uploaded archive:
- All three clips have the same first DWORD at offset 144: `0x2A2A2A80`, despite different 12-byte values at offsets 132-143.
- Applying the public compbyte inverse at offset 132 produces different implausible DWORDs; applying it at offset 144 produces `0x4F4F4F87` for all three. Neither is a valid animation count.
- RC4 with the raw 12-byte prefix, MD5(prefix), SHA1(prefix), and MD5(file bytes 0-143) does not produce a plausible first DWORD.
- Therefore the 12-byte field is not yet identified as a usable RC4 key, and the repeated pattern at offset 144 is not explained by the public compbyte table.

The current reference source also shows that RCC entries marked with ZIP's encrypted flag are opened using password `tkqwlf`; however, the supplied outer ZIP's representative BIN entries are not ZIP-encrypted (their ZIP flag only indicates a data descriptor). This is a separate archive-layer behavior, not evidence that the BIN payload itself uses that password.

Run the probe with:
```bash
python scripts/probe-ran-animation-prefix.py /path/to/animation.zip
```

This is a diagnostic checkpoint only. No BIN-to-GLB animation export or original animation playback is claimed yet.


## XOR 0x2A hypothesis rejected by record-version validation (2026-11-16)

A quick visual clue suggested XORing bytes with `0x2A`: at offset 144, the first DWORD `0x2A2A2A80` becomes `0x000000AA` (170). This is only a plausible-looking count, not a valid decode. The next DWORD becomes `0x00006F6F`, whereas the first `SAnimation` record must begin with version `0x0100`, `0x0101`, or `0x0102`. The candidate therefore fails immediately and must not be used for conversion. The probe script now records this second-DWORD validation.

A fresh archive-wide pass over 3,676 BINs confirms:
- 3,667 distinct 12-byte values at offsets 132-143.
- At offsets 145-159, only nine patterns occur; the most common tails are ASCII-like `***EE**********` and `****E**********`.
- Byte 144 itself varies across 123 values.
- This low-entropy, highly patterned region is inconsistent with treating the whole payload as ordinary AES ciphertext. It appears to be a custom per-file wrapper/encoding or a protected representation, but the exact transform is still unknown.

The 12-byte field and the patterned region must be investigated together. No offset stripping, constant XOR, or guessed decryption is accepted unless the decoded container count, first animation-record version, all key-array bounds, and bone-name strings validate across multiple clips.


## Stream-path audit: codec applicability narrowed (2026-11-16)

A source-level audit of the ZIP-backed animation path adds an important constraint:

- `GLOGIC::openfile_basestream()` has `bENC=false` as its declaration default in `GLogic.h`.
- `SANIMCONINFO::LoadFile()` calls it with four arguments and does not override that default.
- `CSerialMemory::OpenFile()` obtains the uncompressed RCC entry via `CUnzipper::UnzipToMemory()`; the optional `compbyte::decode()` runs later, per read, only when `m_bencode` is true.
- Therefore the public source's normal CFG loading path does not use CompByte. The container BIN loader in this source revision also reads its serial payload directly; no automatic 12-byte removal is present in `CSerialFile` or `CSerialMemory`.

This is stronger than the earlier generic statement that CompByte merely failed a probe: for this particular public-source call path, CompByte is not enabled at all. The observed 12-byte per-file prefix is consequently not explained by the normal RCC decompression or this default animation-stream configuration. The likely next comparison is between the producer/build that generated the uploaded assets and the public EP7 source revision, rather than further blind trials of generic ciphers.

Source references:
- `[Lib]__Engine/Sources/G-Logic/GLogic.h` (`bENC=false` default)
- `[Lib]__Engine/Sources/G-Logic/GLogic.cpp` (`openfile_basestream` selects `CSerialMemory`)
- `[Lib]__Engine/Sources/Common/SerialMemory.cpp` (RCC extraction and conditional CompByte decode)
- `[Lib]__Engine/Sources/DxMeshs/DxSkinAniManSaveLoad.cpp` (CFG loader call)
- `[Lib]__Engine/Sources/Common/SerialFile.cpp` (plain serial-file read path)
