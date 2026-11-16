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

## Live Three.js terrain endpoint

The local game server now exposes the installed client's map inventory and a WLD0 geometry endpoint:

- `GET /api/ran-map/catalog` lists matching `.wld` / `.wld0` pairs in the local map folder.
- `GET /api/ran-map/terrain?map=LDG02` parses the selected `.wld0` and returns original mesh vertices, indices, UVs, vertex colours, normals and bounds.
- Add `&summary=1` to return only mesh/vertex/triangle counts, bounds and texture names for a quick diagnostic without transferring all vertex arrays.
- `GET /api/ran-map/texture?name=...` serves a referenced local texture from the known RData texture/map roots after rejecting absolute paths and traversal.
- `public/game.js` requests this endpoint on startup. Only after a non-empty geometry response is mounted does it hide the synthetic campus placeholder. If parsing fails, the existing fallback remains visible.

By default, the server looks in:

`C:\\Program Files (x86)\\XtraVision\\Ran2Online\\General\\RData\\map`

Override the source when launching the server:

```powershell
$env:RAN_DATA_ROOT = 'C:\\Path\\To\\Ran2Online\\General\\RData'
npm start
```

Or set `RAN_MAP_DIR` directly to the folder containing the loose map files. Use `?map=w_school_01` or `?map=LDG02` in the game URL to select a map name.

This first live path mounts WLD0 static terrain geometry only. It does not yet place the WLD scene's buildings/objects, resolve .pis/.pie pieces, or bind DDS textures. Those are separate follow-up stages; a successful API response is not by itself proof that the complete original scene has been restored.
