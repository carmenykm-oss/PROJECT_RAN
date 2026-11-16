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

## Selected character bases and independent equipment

Only the two selected base characters are active:
- **Female:** `public/models/ran-female-underwear-body.glb`
- **Male:** `public/models/ran-male.glb`, split for rendering into body, face and hair assets while preserving the original base file.

Both characters support six separate fitting categories:
1. Hair
2. Face
3. Upper clothing
4. Gloves
5. Lower clothing
6. Shoes

Every part stays a separate skinned GLB/mesh. It is not flattened into one full-outfit model. The browser rebinds each part to the selected character skeleton and validates bone references.

### Open the male/female fitting room

Use either link in a browser:
- Female fitting room: `https://carmenykm-oss.github.io/PROJECT_RAN/?preview=1&character=female&underwear=1&headCandidate=1&hairCandidate=1&skinning=1`
- Male fitting room: `https://carmenykm-oss.github.io/PROJECT_RAN/?preview=1&character=male&skinning=1`

The preview-only **角色換裝試衣間** panel lets you:
- Switch between male and female models.
- Independently show or remove the face and hair.
- Choose from nine female hairstyles.
- Independently equip or remove upper clothing, gloves, lower clothing and shoes.
- Choose outfit A or F for male slots; female outfit A is currently the validated set.

Changing a selection reloads the preview with that combination. It does not replace the other slots.

### Current asset coverage

**Male**
- Selected base body, face and hair are separate.
- Two outfit source variants have been split into independent upper, gloves, lower and shoes candidates.
- Both outfit variants passed browser attachment tests; the four slots can be loaded independently.

**Female**
- Selected underwear body remains the base.
- Face is a separate skinned asset.
- Nine hairstyles are separate skinned GLBs.
- Female outfit A has separate upper, gloves, lower and shoes assets. Its extra helper bones are retained and reparented to the selected female rig.
- The second female outfit source is not enabled yet because its texture references still need matching.

### Validation status

The latest GitHub Actions browser run passed:
- Male and female model loading.
- Male and female independent equipment-slot attachment.
- Zero equipment bone-binding mismatches in the tested combinations.
- Female hairstyle selection and face/hair removal.
- Male face/hair removal and restoration.
- Male idle/walk/run bone-pose checks.

The fitting room is currently a preview/testing workflow. The existing server inventory/economy equipment system has not yet been connected to these six 3D appearance slots, and the screenshots still show a T-pose validation stance. Do not treat the preview fitting panel as a completed persistent player inventory feature.

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

The static preview is deployed through GitHub Actions at `https://carmenykm-oss.github.io/PROJECT_RAN/?preview=1`.
