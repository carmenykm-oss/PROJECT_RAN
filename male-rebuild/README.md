# Male Character Rebuild — Clean Pipeline

This directory is the isolated clean-room development area for the native RAN male character.

## Ground rules

- The confirmed female character and its assets/pipeline are out of scope and must not be modified.
- Reuse the *workflow approach* proven on the female character (inspect source → convert → validate → preview → accept), never female meshes, textures, UVs, skeletons, weights, or character-specific values.
- The authoritative inputs are the original male files in `source_assets/`. Do not use previously generated male GLBs or previously patched texture assignments as source data.
- Keep body, face, hair, and each equipment slot as independent parts.
- No asset is accepted based only on successful conversion or file existence.

## Confirmed issue in the previous pipeline

The previous `scripts/publish-s-m-bs-male-base.py` remapped the native `m2_bs_*` image references to `m1_bs_*` images. Its checks verified filenames and structural skin attributes, but did not compare UV coordinates against the actual native male texture atlas. Therefore its published output is not a trustworthy texture/UV reference and must not be carried into this rebuild.

## Clean rebuild stages

1. **Source inventory** — identify every native male X model, DDS atlas, material reference, and relative path. Record dimensions and hashes.
2. **UV/atlas audit** — extract UV0 from each native mesh; render UV wireframes over every candidate native DDS atlas; verify islands, orientation, scale, and material-to-image references. Do not guess a texture by similar filename.
3. **Native conversion** — convert original male X files without substituting female or M1 assets. Preserve mesh splits, node transforms, UVs, materials, skeleton, JOINTS, WEIGHTS, and inverse bind matrices.
4. **Skin validation** — verify vertex influence sums, joint indices, bind pose, bone hierarchy, and mesh-to-rig transforms. Preserve native weights unless evidence proves they are corrupt.
5. **Independent part previews** — body, face, hair, upper, gloves, lower, shoes each rendered separately with UV checker and native texture.
6. **Integration** — only after all audits pass, integrate male-only assets into the game and test idle/walk/run. The female route must remain unchanged.

## Acceptance gates

- UV layout visibly matches the correct native atlas.
- No cross-gender or M1 texture fallback.
- No unexplained texture-coordinate transforms or material substitutions.
- Male rig and native weights are preserved or any deliberate changes are documented.
- Each part is independently wearable/removable.
- Actual rendered previews pass before publishing.

## Current status

- Clean branch: `male-rebuild-clean`
- Raw male source files remain in `source_assets/` and are the only authoritative inputs.
- Previous generated male outputs are quarantined conceptually: not to be used as inputs or as correctness references.
- Next implementation task: build the source/UV audit and atlas preview before generating any new male GLB.
