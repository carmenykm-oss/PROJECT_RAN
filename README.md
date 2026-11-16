# PROJECT RAN — Classic 1.3.1 + 3D Character Integration

This project combines the PROJECT RAN Classic browser game with the reconstructed RAN female character in the campus scene.

## Run the game

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Open the character preview without an account

After starting the server, open:

`http://localhost:3000/?preview=1`

The preview enters the actual campus scene directly, uses a local test player and training slime, and does not require login or a WebSocket server.

Controls:
- `WASD`: move
- `Shift`: run
- `Space` or the attack button: trigger attack
- `1` / `2`: trigger sample skill poses
- Mouse drag: rotate the camera

## Character base-model testing

- **Female base model:** `public/models/ran-female-underwear-body.glb` is the only active female body base for integration and browser smoke tests.
- **Male base model:** `public/models/ran-male.glb` is the male base-model target for integration and browser smoke tests.
- The former original female character model and its dedicated smoke test are retired from the active workflow. Its source files may remain in the repository as archived reference material, but they are not part of current development or acceptance checks.
- Current acceptance priority for both base models: a stable upright idle stance, then visibly natural walking and running without body folding, curling, or broken limb deformation.
- Head, hair, face and wearable equipment are subsequent attachment tasks. Equipment must remain separate replaceable parts rather than being merged into one inseparable character mesh.

## Shared male/female equipment-part standard

Both selected base characters must support the same six independently equippable slots:
1. Hair
2. Face
3. Upper clothing
4. Gloves (left/right attachment points where the source supports them)
5. Lower clothing
6. Shoes (left/right attachment points where the source supports them)

The body/rig remains the character base. Each equipment item must remain a separate skinned GLB (or a separately addressable mesh asset) with its own materials/textures and a validated mapping to the selected character skeleton. Removing or replacing one slot must not replace or merge the other slots.

**Male split assets generated from the selected `ran-male.glb`:**
- `ran-male-body.glb`: the four original body meshes (hand, leg, torso, foot).
- `ran-male-face.glb`: the original `m2_face00` mesh.
- `ran-male-hair.glb`: the original `m_hair00` mesh.

The original `ran-male.glb` remains unchanged as the selected base. The conversion workflow also extracts separate upper/hand/lower/foot equipment candidates from the two male source outfit models, but these are equipment candidates only, not alternate playable base characters. Their bone names are checked against the selected male rig; in-game visual fit still needs validation.

Female head and hair candidates are already separate. Female outfit source models have been found, but include extra helper bones not present in the selected female base rig; these need deliberate remapping before they can be approved as wearable parts.

Do not manufacture a head, hairstyle, glove, or shoe asset by renaming a full-body/outfit GLB. The source inventory workflow records original X files and inspects converted mesh nodes, skins, joints, and materials. A slot remains pending until a genuine source mesh is isolated, converted, aligned, and validated in the browser.

Run `python3 scripts/inspect-character-parts.py` after X-to-GLB conversion to generate `logs/character-part-inventory.json`.

## Original animation conversion

The source archive contains female `AnimContainer` files for stay, walk, run and attack. Their 128-byte file-type header and `0x0100` version are identifiable, but the payload does not match the raw count/key layout in the public engine source examined so far. The original animation BIN conversion is therefore still pending; the procedural controller must not be mistaken for recovered original animation data.

## Checks

Run the rig smoke test with:

```bash
npm run test:animation
```

The test checks the female GLB bone names and finite normalized quaternion output for idle, walk, run, attack and skill controller states.

JavaScript syntax has been checked. Browser rendering, live WebSocket login, and visual pose quality still require an actual browser session before they can be marked verified.

## Publish the preview online

The repository's GitHub Pages site has not been enabled yet. To publish the static preview once:
1. Open repository **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Open **Actions → Deploy PROJECT RAN character preview → Run workflow**.

The deployed URL will be `https://carmenykm-oss.github.io/PROJECT_RAN/?preview=1`.
