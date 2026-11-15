# Original RAN model conversion input

Place the original DirectX .X files in `source_assets/x/` and their referenced DDS files in `source_assets/textures/`.

For the first male-warrior test, include:
- `m_ss_war.x`
- `s_m_a_zt.x`
- `s_m_f_zt.X`

Keep original filenames and relative texture paths where possible. Do not merge meshes before conversion.

Then open **Actions → Convert original RAN X models to GLB → Run workflow**. The resulting GLB files and Assimp logs are published as the `ran-x-to-glb-test` workflow artifact.

Important: successful Assimp export only proves that a file was written. It does not prove that the skeleton, skin weights, animation clips, UVs, or texture assignments are correct. Those must be checked before the model is accepted into the game.
