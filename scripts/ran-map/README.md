# RAN map geometry reader

This folder contains a portable reader for the RAN Online static-terrain sidecar format:
- `.wld0` static mesh container
- versioned material buckets and texture/effect names
- AABB binary tree nodes
- D3D9 FVF vertex layouts, positions, UVs, indices and baked colours
- minimal PNG output helper

The reader is based on the documented RAN engine format and the reference implementation in
[WitthayaPae/whatever](https://github.com/WitthayaPae/whatever/tree/514a3227057b7e3202cf9f097022df6e988c98bf/tools/rcc-extract).
The parser is intentionally strict: unknown container/geometry versions fail rather than invent
vertex strides or skip unknown un-sized data.

The loose-file preview script does not apply RCC decryption. It only applies the WLD body cipher
when the file type is exactly `Default_Crypt`, matching the reference loader dispatch.
