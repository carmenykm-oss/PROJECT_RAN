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
