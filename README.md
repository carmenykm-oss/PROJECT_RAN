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

## Female character integration

- `public/models/ran-female.glb`: loaded as the player character.
- The female GLB contains the native `Bip01` skeleton and is mapped to 16 main locomotion / upper-body bones.
- The browser controller currently supplies procedural idle, walk, run, attack and skill poses.
- `public/models/ran-male.glb` is retained as a source asset but is not yet integrated as the active player model.
- Equipment remains a separate future integration task; the current female model is not yet connected to individual wearable equipment slots.

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
