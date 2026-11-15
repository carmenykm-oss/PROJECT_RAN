# PROJECT RAN — Classic 1.3.1 + 3D Character Integration

This package combines the original PROJECT_RAN_CLASSIC_1.3.1 browser game (login/account flow, character creation, HUD, stats, inventory/equipment, shop, quests, chat, combat and WebSocket server) with the reconstructed male and female RAN GLB models in its campus scene.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Browser module loading

The page uses an import map for both `three` and `three/addons/`, so `GLTFLoader` can resolve correctly from the CDN in a browser environment with network access.

## Character integration

- `public/models/ran-male.glb`: loaded onto the player character.
- `public/models/ran-female.glb`: loaded as an in-scene second character.
- Both are normalized to a shared display height and grounded using their model bounds.
- Primitive avatars remain as a fallback if a GLB fails to load.

## Verification status

- `node --check public/game.js`: passed.
- `node --check server.js`: passed.
- Browser runtime / WebSocket login / visual alignment: not yet verified in a live browser.
- `npm install` could not complete in this execution environment because the package install timed out.
- Models are currently bind-pose previews; independent equipment attach/remove and animation testing remain outstanding.

This is an integration test build, not a claim that all 3D character or equipment work is complete.
