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
