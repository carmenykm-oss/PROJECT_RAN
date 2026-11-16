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
