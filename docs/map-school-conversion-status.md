# map_school WLD validation

## Input
- `w_school_01.wld` + `w_school_01.wld0`
- `w_school_02.wld` + `w_school_02.wld0`
- `w_school_03.wld` + `w_school_03.wld0`
- `w_school_04.wld` + `w_school_04.wld0`

## Source-derived layout
- `CSerialFile` header: 128-byte file type followed by a 32-bit file ID.
- `DxLandMan` expects `LAND.MAN` and accepts map versions `0x0108` through `0x0114`.
- For map version `0x0110`, the payload begins with map ID, 128-byte map name, file marks, then the octree root.
- The paired static mesh file uses file type `default`; `DxStaticMesh::VERSION` is `0x0102`. Its payload begins with a version, a size-prefixed bounds block, then static mesh data.
- The original `DxLandMan` loader opens the map stream with the default `bencode=false`; the unrelated `compbyte` substitution table is not a valid assumed WLD decoder.

## Observed on the supplied archive
- All four `.wld` files have the `LAND.MAN` marker and map file ID/version `0x0110`.
- All four `.wld0` files have the `default` marker and file ID `0`.
- The first payload fields do not validate against the source layout:
  - `.wld` file marks resolve to repeated `0x2A2A2A2A`-like values, outside the file.
  - The octree root BOOL at the source-derived offset is not `0` or `1`.
  - `.wld0` static-mesh version at the source-derived offset is not `0x0102`; the following bounds are not plausible coordinates.
- Applying the public `compbyte` inverse substitution did not produce valid fields. The CBit rotation/XOR transform was also tested as a diagnostic candidate and did not validate.

## Result
**Decode validation: FAIL.** The archive container and outer type/version markers are intact, but the payload is not a valid plain `CSerialFile` stream for the inspected EP7 source layout. No GLB/Three.js geometry is emitted from these bytes, to avoid fabricating a scene from corrupt offsets.

## Required next input for a real conversion
A matching decoder/encoder implementation for the client build that produced these files, or one known-good unencrypted `.wld` + `.wld0` pair from that exact client build. Once payload fields validate, the converter can walk the octree and static-mesh structures and emit glTF/GLB plus the referenced textures.


## Additional source-code findings (2026-11-16)

The public EP7 source was checked beyond the raw WLD layout:

- The repository includes a native **LevelEditor** tool (not a finished standalone WorldEditor). Its CLevelEditorView::LoadGLLandMan() loads a .lev file through GLLandMan, obtains the referenced WLD filename, and then calls the native DxLandMan::LoadFile() renderer. This is a promising route for validating a map with the original engine, provided the editor build and data layout match the supplied client.
- GLLevelFile::FILE_EXT is glmap. Its SLEVEL_HEAD block stores the WLD filename, map name, brightness, and terrain division. The GLMap/level metadata is therefore a separate source of map identity and configuration, not merely the WLD payload.
- GLLevelFile::LoadFile() opens the level metadata through the GLogic stream layer and enables its encode mode based on the level-file version. This differs from the DxLandMan WLD path, which opens LAND.MAN with default bencode=false.
- DxStaticMesh::Load() derives the companion filename by appending 0 to a .wld name, then reads version 0x0102, a size-prefixed AABB block, and five static-mesh material buckets.
- SUBPATH.cpp confirms the conventional source folders: Data/Map, Data/GLMap, Data/Tiles, Data/StaticMesh, Data/Object, Textures/Tiles, and related resource roots.

### Revised interpretation

The public EP7 source does not prove that the supplied WLD payload is AES-GCM encrypted. In this source path, WLD is read as a plain serial stream; the AES-GCM and CryptoAPI strings found in the user's newer TW client may belong to another resource layer or build-specific wrapper. Therefore encryption remains a hypothesis, not a conclusion. The next best diagnostic is to inventory the installed client's .glmap/.lev, map, tile, static-mesh, object, and texture resources, then compare the matching metadata and file references before attempting further cryptographic guesses.

### New local inventory helper

Added scripts/scan-ran-map-assets.ps1. It lists candidate map/level files, extension counts, and conventional resource folders without modifying client files. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\Downloads\scan-ran-map-assets.ps1" -RootPath "C:\Program Files (x86)\XtraVision\Ran2Online"
```

Copy the script from the repository if it is not already in Downloads.

### Corrected WLD field offsets (source re-check, 2026-11-16)

A closer read of `DxLandMan::LoadFile_VER110`, `DxLandDef.h/.cpp`, and `DxOctree::LoadFile` exposed an offset bug in the first validator. The exact source layout after the 132-byte CSerialFile header is:

| File-relative offset | Field |
|---:|---|
| 132 | map ID (`SNATIVEID`, 4 bytes) |
| 136–263 | map name (128 bytes) |
| 264 | `SLAND_FILEMARK` version (DWORD; expected `0x0100`) |
| 268 | `SLAND_FILEMARK` payload size (DWORD; expected 16) |
| 272–287 | four file-mark DWORDs |
| 288 | octree root begins: subdivided BOOL, max/min vectors, data address/size, then children |

The first validator had treated offset 264 as the start of the four marks and started the octree at 280. That was incorrect. `scripts/inspect-ran-wld.py` has now been corrected; the update is committed as `8eafb8f8262343079a85946f608d7cbd2458d2d3`.

The corrected offsets were checked against the actual uploaded `map_school.zip` bytes. The four `.wld` files still fail at the true source-defined fields: offset 264 contains `0x2A2A2A2A` instead of file-mark version `0x0100`, and the bytes at offset 288 do not form a valid octree root. The paired `.wld0` files also still do not begin with static-mesh version `0x0102` at offset 132. So the earlier FAIL conclusion remains, but it is now based on corrected offsets rather than the first parser's mistaken mark/octree boundary.

### Installed-client inventory result

The local scan found the actual asset root at `General\\RData`, with 219 `.wld`, 178 `.wld0`, 18,328 `.dds`, 4,331 `.x`, 6,012 `.bin`, and 18 `.rcc` files. It also found parallel `Original\\RData\\map`, `object`, `piece`, and `textures` folders. `General\\RData\\GameData\\level.rcc` is 70,747,085 bytes.

This makes a direct comparison between `General\\RData` and `Original\\RData` the next highest-value test: compare same-named WLD/WLD0 files by size and SHA-256, then validate both copies at the corrected offsets. Also identify the school/campus map entries in both trees. Do not infer that the RCC files contain the map payload until their directory/index format is inspected.

### General vs Original comparison helper

Added `scripts/compare-ran-map-trees.ps1` (commit `754be0d3fa6172bd4d0bf24a384d0bbe6a225640`). It:
- compares same-named files in `General\\RData\\map` and `Original\\RData\\map`;
- reports size and SHA-256 equality;
- highlights filenames containing school/campus/academy/college;
- checks the corrected WLD and WLD0 source-layout marker offsets;
- does not modify client files.

Run from PowerShell 5.1:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\\Downloads\\compare-ran-map-trees.ps1" -InstallRoot "C:\\Program Files (x86)\\XtraVision\\Ran2Online"
```

### WLD cipher and RCC wrapper cross-check (2026-11-16)

A second RAN source tree documents a dedicated WLD codec, distinct from the 43 CompByte substitution tables:

- `.wld` encrypted type spelling: `Land.Man`; plaintext spelling: `LAND.MAN`.
- `.wld0` encrypted type spelling: `Default_Crypt`; plaintext spelling: `default`.
- When the encrypted spelling is present, bytes from offset 132 use:
  `decoded = ((byte - 0x10) & 0xFF) ^ 0x10`.
- The transform is byte-position independent and is used by both WLD and WLD0.
- The source explicitly warns not to decrypt by exclusion: only the exact encrypted type spellings activate this codec.

Reference implementation and format notes:
- https://github.com/WitthayaPae/whatever/blob/514a3227057b7e3202cf9f097022df6e988c98bf/tools/rcc-extract/wld.js
- https://github.com/WitthayaPae/whatever/blob/514a3227057b7e3202cf9f097022df6e988c98bf/tools/rcc-extract/CRYPT-MAP.md

The same source tree documents a separate RCC entry transform: after ZIP decompression, each entry receives one CCrypt pass:
`decoded = ((byte - 6) & 0xFF) ^ 0xDF`.
It also documents an AES-256-ECB layer for selected GLogic resources, not as a blanket WLD rule:
- https://github.com/WitthayaPae/whatever/blob/514a3227057b7e3202cf9f097022df6e988c98bf/tools/rcc-extract/rcc.js
- https://github.com/WitthayaPae/whatever/blob/514a3227057b7e3202cf9f097022df6e988c98bf/tools/rcc-extract/gamecrypt.js

#### Applicability to the supplied LDG02 files

The previously reported headers are `LAND.MAN` for `LDG02.wld` and `default` for `LDG02.wld0`. Under the reference source's exact dispatch rules, those are the plaintext spellings, so the dedicated WLD codec must not be applied to these two files as-is. The public reference also describes the RCC CCrypt transform as an archive-entry layer; it is not evidence that arbitrary loose files in `General\\RData\\map` should receive that transform.

Therefore these discoveries explain the WLD encryption mechanism in a related RAN source lineage, but they do not yet decode the user's LDG02 sample. The next discriminating check is to establish whether the loose map files are copied directly from an archive, have an additional client-build wrapper, or use a different file-type marker in the actual first 128 bytes. Keep the previous FAIL status until a candidate yields the expected WLD FileMark version `0x0100`, size `16`, valid section marks, and WLD0 mesh version `0x0102`.
### Loose WLD0 terrain geometry reader added (2026-11-16)

Added `scripts/ran-map/` as a first geometry-conversion layer:
- `fvf.js`: derives D3D9 vertex strides and component offsets from FVF flags.
- `octree.js`: reads the AABB binary tree and node-local vertex/index buffers; refuses unknown un-sized geometry versions.
- `staticmesh.js`: reads versioned WLD0 material buckets, texture names, effects and mesh octrees.
- `wld.js`: applies the dedicated WLD cipher only for the exact encrypted type markers.
- `png.js`: minimal PNG writer.
- `preview-wld0.js`: reads a loose `.wld0` file, validates triangle indices and finite vertex coordinates, and writes a shaded top-down PNG plus geometry statistics.

Run from the PROJECT_RAN repository root with Node.js:

```powershell
node .\\scripts\\ran-map\\preview-wld0.js "C:\\Program Files (x86)\\XtraVision\\Ran2Online\\General\\RData\\map\\LDG02.wld0" --out .\\preview\\LDG02-terrain.png
```

The reader does not apply an RCC transform to loose files. It only applies the WLD body cipher when the file type explicitly says `Default_Crypt`. If the local file still reports an unknown WLD0 container version or has no valid geometry nodes, this is a useful format mismatch result—not a generated placeholder. No claim of a successful LDG02 render is made until the user's actual local file passes this parser and produces a coherent preview.

### Live original terrain path connected to the game (2026-11-16)

The local Node server and Three.js client now have a first end-to-end WLD0 path:

- `server.js` exposes `GET /api/ran-map/catalog` to enumerate local map/WLD0 pairs and `GET /api/ran-map/terrain?map=NAME` to parse a selected WLD0 through the version-aware reader.
- The terrain response retains per-node positions, indices, UVs, authored normals, vertex colours, material bucket names, and map bounds.
- `public/game.js` builds real Three.js BufferGeometry from that response, recentres the source map into the current playable coordinate range, and hides the synthetic campus meshes only after at least one valid geometry mesh has mounted.
- If the local map file is absent or the reader rejects its format, the current placeholder remains visible and the browser console records the reason. This is deliberately fail-closed: no empty or fabricated geometry is presented as a successful restoration.

Default local source folder:
`C:\\Program Files (x86)\\XtraVision\\Ran2Online\\General\\RData\\map`

Optional environment overrides:
- `RAN_DATA_ROOT`: installed client's `RData` directory.
- `RAN_MAP_DIR`: direct directory containing loose `.wld` and `.wld0` files.

#### Scope boundary

This is a terrain-only integration milestone, not a complete map restoration. It does not yet decode/place the `.wld` scene's buildings and props, resolve `.pis/.pie` object pieces, or load the referenced DDS texture/effect maps. The actual installed LDG02 file has not yet been run through the new local endpoint in this environment, so no claim is made that it has rendered successfully. The next required validation is the endpoint response from the user's installed client; after that, continue with scene placement and texture resolution using the same map's referenced resources.


The terrain client also now binds referenced `.dds` files through a restricted local texture endpoint and uses separate Three.js materials per source texture. This is an attempted texture path only; texture success must be confirmed against the installed client's actual folder names and file references. TGA and other texture formats are not yet decoded in the browser.
