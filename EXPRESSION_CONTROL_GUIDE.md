# Apothecary Avatar Viewer — Expression Control Guide

## What Is It?

"Expression" in this project does **not** mean playing a GLB animation file. It is a completely
separate system. Expressions are **facial morph target overrides** applied in real time directly
to the 3D avatar mesh, using Three.js morph target influences.

The avatar GLB contains a face mesh with built-in blend shapes (also called morph targets or
shape keys). These are standard ARKit/ReadyPlayerMe style 52-blendshape keys. By setting numeric
weights (0.0 to 1.0) on these keys at runtime, the avatar's face changes shape — eyes squint,
mouth smiles, brows furrow, etc. — **without needing any animation file to load**.

This is instant, zero-network-cost, and always available once the avatar GLB is loaded.

---

## The 9 Built-in Expression Presets

Defined in `avatar-viewer-web/viewer.js` → `expressionPresets` object.
Each preset is a map of `{ blendShapeName: weight }`.

### `calm`
Slight downward eye look. Default resting face.
```js
{ eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 }
```

### `neutral`
Identical to calm — same slight downward gaze.
```js
{ eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 }
```

### `content`
Gentle smile + soft downward gaze.
```js
{ mouthSmileLeft: 0.16, mouthSmileRight: 0.16, eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 }
```

### `happy`
Moderate smile + soft downward gaze.
```js
{ mouthSmileLeft: 0.2, mouthSmileRight: 0.2, eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 }
```

### `joyful`
Wide smile + soft downward gaze.
```js
{ mouthSmileLeft: 0.32, mouthSmileRight: 0.32, eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 }
```

### `sad`
Full sad face. Multiple blend shapes simulate sadness.
```js
{
  eyeLookDownLeft: 0.2,   eyeLookDownRight: 0.2,
  browDownRight: 0.1,     browInnerUp: 0.6,       browOuterUpRight: 0.2,
  eyeSquintLeft: 0.7,     eyeSquintRight: 0.7,
  mouthFrownLeft: 0.8,    mouthFrownRight: 0.8,
  mouthLeft: 0.2,         mouthPucker: 0.5,
  mouthRollLower: 0.2,    mouthRollUpper: 0.2,
  mouthShrugLower: 0.2,   mouthShrugUpper: 0.2,
  mouthStretchLeft: 0.4
}
```

### `angry`
Furrowed brows, frown, jaw forward.
```js
{
  eyeLookDownLeft: 0.1,   eyeLookDownRight: 0.1,
  browDownLeft: 0.6,      browDownRight: 0.6,
  jawForward: 0.3,
  mouthFrownLeft: 0.7,    mouthFrownRight: 0.7,
  mouthRollLower: 0.2,    mouthShrugLower: 0.3
}
```

### `fear`
Wide eyes, raised inner brows, funnel mouth.
```js
{
  browInnerUp: 0.7,
  eyeSquintLeft: 0.5,     eyeSquintRight: 0.5,
  eyeWideLeft: 0.6,       eyeWideRight: 0.6,
  mouthClose: 0.1,        mouthFunnel: 0.3,
  mouthShrugLower: 0.5,   mouthShrugUpper: 0.5
}
```

### `disgust`
Asymmetric brow (left more furrowed), squinted eyes, sneer.
```js
{
  browDownLeft: 0.7,      browDownRight: 0.1,    browInnerUp: 0.3,
  eyeSquintLeft: 1,       eyeSquintRight: 1,
  eyeWideLeft: 0.5,       eyeWideRight: 0.5,
  mouthLeft: 0.4,         mouthPressLeft: 0.3,
  mouthRollLower: 0.3,    mouthShrugLower: 0.3,
  mouthShrugUpper: 0.8,   mouthUpperUpLeft: 0.3,
  noseSneerLeft: 1,       noseSneerRight: 0.7
}
```

### `love`
Soft eyes half-closed, gentle smile, raised brows.
```js
{
  browInnerUp: 0.4,       browOuterUpLeft: 0.2,  browOuterUpRight: 0.2,
  mouthSmileLeft: 0.2,    mouthSmileRight: 0.2,
  eyeBlinkLeft: 0.6,      eyeBlinkRight: 0.6,
  eyeWideLeft: 0.7,       eyeWideRight: 0.7,
  mouthDimpleLeft: 0.1,   mouthDimpleRight: 0.1,
  mouthPressLeft: 0.2,    mouthShrugUpper: 0.2,
  mouthUpperUpLeft: 0.1,  mouthUpperUpRight: 0.1
}
```

> **Fallback:** If an unknown expression name is sent, `neutral` is applied automatically.

---

## How `applyExpression()` Works Internally

File: `avatar-viewer-web/viewer.js` → function `applyExpression(name)`

```
1. Look up the preset by name in expressionPresets
   └── If not found → use expressionPresets.neutral as fallback

2. Iterate over every mesh in morphMeshes[]
   └── morphMeshes is pre-built at avatar load time
       (only meshes that have morphTargetDictionary AND morphTargetInfluences)

3. For each mesh:
   a. Reset ALL morph target influences to 0  ← clears any previous expression
   b. Loop through each { blendShapeName: weight } in the preset
   c. Look up the blendShape index in mesh.morphTargetDictionary[blendShapeName]
   d. If found → set mesh.morphTargetInfluences[index] = weight

4. Call setStatus() to display "Expression: {name}" in the UI
```

Key points:
- **All influences are zeroed before applying** — expressions never "stack"
- **Only matching blend shapes are set** — missing keys are silently skipped
- **Takes effect on the next render frame** — no async, no loading, instant

---

## How Expressions Are Triggered

### At Session Start (automatic)

In `main()` in `viewer.js`:
```js
applyExpression(session.initialState?.expression || 'calm');
```

The server always sends `initialState.expression = 'calm'` (set in `avatarViewer.service.ts`).
So the avatar always starts with the calm expression.

---

### Via WebSocket Command (real-time, from backend)

This is the primary real-time control path.

**Step 1 — Backend API call**

A Doctor/admin calls the REST API:
```
POST /api/v1/avatar-viewer/session/{sessionId}/command
Authorization: Bearer {JWT}
Content-Type: application/json
```

**Body — expression only:**
```json
{ "type": "expression", "name": "happy" }
```

**Body — animation only:**
```json
{ "type": "animation", "name": "m_dance_01" }
```

**Body — both together (atomic state change):**
```json
{ "type": "state", "expression": "sad", "animation": "m_idle_01" }
```

**Step 2 — Validation** (`src/validators/avatarViewer.validator.ts`)

The `avatarViewerCommandSchema` uses Zod discriminated union on `type`:
- `expression` → requires `name` (string, 1–80 chars)
- `animation` → requires `name` (string, 1–80 chars)
- `state` → requires both `expression` AND `animation` fields

Any other `type` or missing required field → **400 Bad Request**. No other shapes accepted.

**Step 3 — Authorization** (`src/modules/avatarViewer/avatarViewer.service.ts` → `sendCommand()`)

- Checks session exists in MongoDB, is `status: 'active'`, and `expires_at` has not passed
- If caller's role is `PATIENT` → also checks `session.user_id === actor.user_id`
  (patients can only command their own viewer)
- Doctors/admins can command any session

**Step 4 — WebSocket Broadcast** (`avatarViewerService.broadcast()`)

The command is wrapped in an envelope and sent to all active WebSocket connections for that session:
```json
{
  "type": "command",
  "commandId": "550e8400-e29b-41d4-a716-446655440000",
  "sentAt": "2026-05-16T01:00:00.000Z",
  "payload": { "type": "expression", "name": "happy" }
}
```

**Step 5 — Viewer Receives and Applies** (`viewer.js` → `handleSocketMessage()`)

```js
if (command.type === 'expression') {
    applyExpression(command.name);
}
if (command.type === 'animation') {
    void applyAnimation(command.name);
}
if (command.type === 'state') {
    applyExpression(command.expression);     // expression applied first (instant)
    void applyAnimation(command.animation);  // animation loaded async after
}
```

**Step 6 — Acknowledgement**

After processing any command, the viewer sends back:
```json
{ "type": "ack", "commandId": "550e8400-e29b-41d4-a716-446655440000" }
```

The server logs this: `"Avatar viewer acknowledged command {commandId} for {sessionId}"`.

---

## WebSocket Lifecycle

The WebSocket connection is established in `viewer.js` → `connectCommandSocket()`:

```
Viewer opens: wss://{host}/avatar-viewer/ws?session={encryptedJWT}
```

On connection:
1. Server validates the session JWT from the query param
2. Server sends `{ "type": "ready", "sessionId": "...", "data": { ...full session data... } }`
3. Viewer sends `{ "type": "viewer_ready" }` to confirm it is ready to receive commands

Auto-reconnect is built in:
- On `close` or `error` → `scheduleWsReconnect()` is called
- Uses exponential backoff: `delay = min(1000 * 2^retryCount, 30000ms)`
- Max 10 retries. After 10 failures → "Live channel unavailable. Reload to retry."
- A successful connection resets `wsRetryCount` to 0

Heartbeat (server-side):
- Server pings all sockets every 30 seconds
- If a socket doesn't respond to ping (`isAlive === false`), it is terminated and removed
- Prevents stale/zombie connections from accumulating

Cleanup on page navigation:
```js
window.addEventListener('pagehide', () => {
    renderer.dispose();         // releases WebGL resources
    clearTimeout(wsRetryTimer); // cancels any pending reconnect
});
```

---

## Complete Data Flow Diagram

```
Doctor/Admin
     │
     │  POST /api/v1/avatar-viewer/session/{sessionId}/command
     │  { "type": "expression", "name": "sad" }
     ▼
Express Route
 → verifyJWT middleware           (validates Doctor's auth token)
 → validate(viewerSessionIdParam) (validates sessionId param format)
 → validate(avatarViewerCommand)  (Zod: must be expression|animation|state)
 → avatarViewerController.sendCommand()
     │
     ▼
avatarViewerService.sendCommand()
 → Finds session in MongoDB (must be active + not expired)
 → Checks caller is authorized for this session
 → Wraps command in envelope with UUID + timestamp
 → Calls broadcast(sessionId, envelope)
     │
     ▼
WebSocketServer
 → Finds all sockets registered under sessionId
 → Sends JSON envelope to each OPEN socket
     │
     ▼
viewer.js (running in patient's browser/webview)
 → handleSocketMessage() receives the envelope
 → Dispatches to applyExpression('sad')
     │
     ▼
applyExpression('sad')
 → Looks up expressionPresets['sad']
 → For each face mesh in morphMeshes[]:
     - Zeros all morph influences
     - Sets influences for each sad blend shape key
 → setStatus("Expression: sad")
     │
     ▼
Three.js render loop (60fps)
 → Next frame renders avatar with updated morph influences
 → Patient sees sad face instantly
     │
     ▼
viewer.js sends ack back through WebSocket
 → { "type": "ack", "commandId": "..." }
 → Server logs acknowledgement
```

---

## Important Implementation Notes for AI

1. **Expressions and animations are completely independent systems.**
   - Expressions = morph targets (face deformation, instant, no file load)
   - Animations = GLB skeletal clips (whole-body movement, loaded from CDN)
   - They can be active simultaneously. Use `state` command type to set both at once.

2. **Expression names are free strings — no enum validation on the server.**
   The validator only checks `name` is a non-empty string up to 80 chars.
   Unknown names silently fall back to `neutral` on the viewer side.

3. **The `morphMeshes` array is built once at avatar load time.**
   If the avatar GLB is reloaded, `morphMeshes` is rebuilt automatically.

4. **Blend shape names are case-sensitive** and must match ARKit names exactly.
   Common ones: `mouthSmileLeft`, `mouthSmileRight`, `browDownLeft`, `eyeSquintLeft`,
   `mouthFrownLeft`, `jawForward`, `noseSneerLeft`, `eyeBlinkLeft`, `eyeWideLeft`.

5. **The `state` command type is the cleanest way to change both face and animation.**
   Expression is applied first (instant), then animation loads asynchronously.
   The face changes immediately while the animation file is still downloading.

6. **Session tokens are short-lived JWTs** (default 15 minutes, via env var
   `AVATAR_VIEWER_SESSION_TTL_SECONDS`). The WebSocket and REST API both use the same token.
   A viewer open past the expiry time will fail to reconnect after a disconnect.

7. **The `initialState` is hardcoded server-side** in `avatarViewer.service.ts`:
   ```ts
   initialState: {
       expression: 'calm',
       animation: avatar.avatar_gender?.toLowerCase() === 'female' ? 'f_idle_01' : 'm_idle_01'
   }
   ```
   Applied by the viewer on first load. Not persisted — each session starts fresh.
