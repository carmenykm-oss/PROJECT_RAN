# PROJECT RAN — Classic 1.3.1 + 3D Integration

The full integration test package is being prepared locally. The repository currently contains this project status document; source files and binary character assets have not yet been committed here.

## Local integration package

The package combines the original `PROJECT_RAN_CLASSIC_1.3.1` prototype with the reconstructed male and female GLB characters and a Three.js campus-scene integration. It retains the original login, character creation, HUD, inventory/equipment, shop, quests, chat, combat and WebSocket server code.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Verification

- JavaScript syntax checks passed for `public/game.js` and `server.js`.
- The browser import map includes both `three` and `three/addons/` for GLTFLoader.
- A live browser session, account login, GLB alignment and multiplayer session have not yet been verified.
- Character models are in bind pose; equipment attach/remove and animation testing remain outstanding.

This is an integration test build, not a completed 3D MMORPG release.