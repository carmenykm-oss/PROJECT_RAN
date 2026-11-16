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

## Local geometry commands

Run these from the repository root (Node.js required):

```powershell
node .\scripts\ran-map\preview-wld0.js "C:\Program Files (x86)\XtraVision\Ran2Online\General\RData\map\LDG02.wld0" --out .\preview\LDG02-terrain.png
node .\scripts\ran-map\export-wld0-obj.js "C:\Program Files (x86)\XtraVision\Ran2Online\General\RData\map\LDG02.wld0" --out-dir .\preview\LDG02
```

The PNG is a shaded top-down geometry check. The OBJ/MTL pair is the editable terrain mesh export; copy the referenced DDS textures into the output folder and convert them if your viewer cannot read DDS. These commands operate on loose files and do not alter the client.

**Current scope:** terrain from `.wld0` only. Scene objects embedded in `.wld`, replacement pieces (`.pis`), lights/effects, and final Three.js integration are separate follow-on stages. Do not treat a successful terrain-only export as a complete map restoration.