import * as THREE from "https://esm.sh/three@0.184.0";
import { GLTFLoader } from "https://esm.sh/three@0.184.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://esm.sh/three@0.184.0/examples/jsm/loaders/DRACOLoader.js";

const config = window.Apothecary_AVATAR_VIEWER || {};
const currentOrigin = window.location.origin;
const apiBaseUrl = (new URLSearchParams(window.location.search).get("apiBaseUrl") || config.apiBaseUrl || `${currentOrigin}/api/v1`).replace(/\/+$/, "");
const webSocketBaseUrl = (new URLSearchParams(window.location.search).get("webSocketBaseUrl") || config.webSocketBaseUrl || currentOrigin).replace(/\/+$/, "");
const sessionToken = new URLSearchParams(window.location.search).get("session") || "";
const stage = document.getElementById("stage");
const status = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");

// ─── Status auto-hide ──────────────────────────────────────────────────────
let statusHideTimer = null;

function setStatus(message, persist = false) {
  status.textContent = message;
  status.style.opacity = "1";
  status.style.transform = "translateY(0)";

  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }

  if (!persist) {
    statusHideTimer = setTimeout(() => {
      status.style.opacity = "0";
      status.style.transform = "translateY(8px)";
    }, 3500);
  }
}

function setProgress(fraction) {
  if (!progressBar) return;
  const pct = Math.round(fraction * 100);
  progressBar.style.width = `${pct}%`;
  progressBar.style.opacity = pct > 0 && pct < 100 ? "1" : "0";
}

// ─── Expression presets ───────────────────────────────────────────────────
const expressionPresets = {
  calm: { eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 },
  content: {
    mouthSmileLeft: 0.16,
    mouthSmileRight: 0.16,
    eyeLookDownLeft: 0.1,
    eyeLookDownRight: 0.1
  },
  joyful: {
    mouthSmileLeft: 0.32,
    mouthSmileRight: 0.32,
    eyeLookDownLeft: 0.1,
    eyeLookDownRight: 0.1
  },
  neutral: { eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 },
  happy: {
    mouthSmileLeft: 0.2,
    mouthSmileRight: 0.2,
    eyeLookDownLeft: 0.1,
    eyeLookDownRight: 0.1
  },
  sad: {
    eyeLookDownLeft: 0.2,
    eyeLookDownRight: 0.2,
    browDownRight: 0.1,
    browInnerUp: 0.6,
    browOuterUpRight: 0.2,
    eyeSquintLeft: 0.7,
    eyeSquintRight: 0.7,
    mouthFrownLeft: 0.8,
    mouthFrownRight: 0.8,
    mouthLeft: 0.2,
    mouthPucker: 0.5,
    mouthRollLower: 0.2,
    mouthRollUpper: 0.2,
    mouthShrugLower: 0.2,
    mouthShrugUpper: 0.2,
    mouthStretchLeft: 0.4
  },
  angry: {
    eyeLookDownLeft: 0.1,
    eyeLookDownRight: 0.1,
    browDownLeft: 0.6,
    browDownRight: 0.6,
    jawForward: 0.3,
    mouthFrownLeft: 0.7,
    mouthFrownRight: 0.7,
    mouthRollLower: 0.2,
    mouthShrugLower: 0.3
  },
  fear: {
    browInnerUp: 0.7,
    eyeSquintLeft: 0.5,
    eyeSquintRight: 0.5,
    eyeWideLeft: 0.6,
    eyeWideRight: 0.6,
    mouthClose: 0.1,
    mouthFunnel: 0.3,
    mouthShrugLower: 0.5,
    mouthShrugUpper: 0.5
  },
  disgust: {
    browDownLeft: 0.7,
    browDownRight: 0.1,
    browInnerUp: 0.3,
    eyeSquintLeft: 1,
    eyeSquintRight: 1,
    eyeWideLeft: 0.5,
    eyeWideRight: 0.5,
    mouthLeft: 0.4,
    mouthPressLeft: 0.3,
    mouthRollLower: 0.3,
    mouthShrugLower: 0.3,
    mouthShrugUpper: 0.8,
    mouthUpperUpLeft: 0.3,
    noseSneerLeft: 1,
    noseSneerRight: 0.7
  },
  love: {
    browInnerUp: 0.4,
    browOuterUpLeft: 0.2,
    browOuterUpRight: 0.2,
    mouthSmileLeft: 0.2,
    mouthSmileRight: 0.2,
    eyeBlinkLeft: 0.6,
    eyeBlinkRight: 0.6,
    eyeWideLeft: 0.7,
    eyeWideRight: 0.7,
    mouthDimpleLeft: 0.1,
    mouthDimpleRight: 0.1,
    mouthPressLeft: 0.2,
    mouthShrugUpper: 0.2,
    mouthUpperUpLeft: 0.1,
    mouthUpperUpRight: 0.1
  }
};

let scene;
let camera;
let renderer;
let avatar;
let mixer;           // one persistent AnimationMixer for the lifetime of the avatar
let activeAction;
let morphMeshes = [];
let animationManifest = [];
let clipCache = new Map(); // animationId → retargeted THREE.AnimationClip

// ─── Smooth expression state ──────────────────────────────────────────────
// Instead of snapping morph targets instantly, we lerp from current to target
// each render frame. EXPRESSION_SPEED controls how fast (higher = faster).
const EXPRESSION_SPEED = 4.0; // reaches ~98% in 1 s at 60 fps
const _exprCurrent = {};      // { blendShapeName: currentWeight } live values
const _exprTarget  = {};      // { blendShapeName: targetWeight  } desired values

// ─── DRACO loader (shared) ────────────────────────────────────────────────
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

function makeGLTFLoader() {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function resolveAssetUrl(url) {
  return new URL(url, `${apiBaseUrl}/`).toString();
}

// ─── API with retry ───────────────────────────────────────────────────────
async function apiGet(path, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`
        }
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `Request failed with HTTP ${response.status}`);
      }

      return payload.data;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// ─── Scene setup ─────────────────────────────────────────────────────────
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f4ef);

  // Tighter FOV + closer Z → avatar fills more of the frame
  camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  camera.position.set(0, 0.55, 3.1);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x766457, 1.2));

  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(2.5, 4, 3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-3, 2, 2);
  scene.add(fill);

  const resize = () => {
    const width = stage.clientWidth || window.innerWidth || 360;
    const height = stage.clientHeight || window.innerHeight || 640;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  resize();
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixer?.update(delta);
    updateExpressions(delta);  // smooth morph-target lerp
    renderer.render(scene, camera);
  };
  animate();
}

// ─── Texture anisotropy clamp ─────────────────────────────────────────────
function clampTextureAnisotropy(object) {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  object.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of materials) {
      for (const key of Object.keys(mat)) {
        const val = mat[key];
        if (val && val.isTexture) {
          val.anisotropy = Math.min(val.anisotropy || 1, maxAnisotropy);
        }
      }
    }
  });
}

function normalizeAvatar(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.9 / (size.y || 1);

  object.scale.setScalar(scale);
  // Shift avatar slightly upward so more of the body is visible
  object.position.set(-center.x * scale, -center.y * scale + 0.18, -center.z * scale);
}

// ─── GLB loader with retry + progress + timeout ───────────────────────────
const GLB_LOAD_TIMEOUT_MS = 45_000;
const GLB_MAX_RETRIES = 3;

async function loadGltf(url, onProgress) {
  for (let attempt = 1; attempt <= GLB_MAX_RETRIES; attempt++) {
    try {
      const gltf = await new Promise((resolve, reject) => {
        const loader = makeGLTFLoader();

        const timeoutId = setTimeout(() => {
          reject(new Error(`GLB load timed out after ${GLB_LOAD_TIMEOUT_MS / 1000}s (attempt ${attempt})`));
        }, GLB_LOAD_TIMEOUT_MS);

        loader.load(
          url,
          (gltf) => {
            clearTimeout(timeoutId);
            resolve(gltf);
          },
          (event) => {
            if (event.total > 0 && onProgress) {
              onProgress(event.loaded / event.total);
            }
          },
          (error) => {
            clearTimeout(timeoutId);
            reject(error);
          }
        );
      });
      return gltf;
    } catch (err) {
      const isLastAttempt = attempt === GLB_MAX_RETRIES;
      if (isLastAttempt) throw err;
      const delay = 1000 * Math.pow(2, attempt - 1); // exponential backoff: 1s, 2s, 4s
      setStatus(`GLB load failed (attempt ${attempt}), retrying in ${delay / 1000}s…`, true);
      setProgress(0);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function loadAvatar(url) {
  setStatus("Loading avatar…", true);
  setProgress(0);

  const gltf = await loadGltf(url, (fraction) => {
    setProgress(fraction);
    setStatus(`Loading avatar… ${Math.round(fraction * 100)}%`, true);
  });

  setProgress(1);
  avatar = gltf.scene;
  normalizeAvatar(avatar);
  clampTextureAnisotropy(avatar);
  scene.add(avatar);

  // Create the mixer once — it lives as long as this avatar is in the scene.
  // Recreating it on every animation change caused the idle-restart glitch.
  mixer = new THREE.AnimationMixer(avatar);
  clipCache.clear();

  morphMeshes = [];
  avatar.traverse((object) => {
    if (object.isMesh && object.morphTargetDictionary && object.morphTargetInfluences) {
      morphMeshes.push(object);
    }
  });

  setStatus("Avatar session loaded.");
}

// ─── Smooth expression lerp (runs every render frame) ────────────────────
function updateExpressions(delta) {
  if (!morphMeshes.length) return;

  const step = EXPRESSION_SPEED * delta;
  let anyDirty = false;

  // Collect all keys across current + target
  const keys = new Set([...Object.keys(_exprCurrent), ...Object.keys(_exprTarget)]);

  for (const key of keys) {
    const target  = _exprTarget[key]  ?? 0;
    const current = _exprCurrent[key] ?? 0;
    const diff = target - current;

    if (Math.abs(diff) < 0.001) {
      _exprCurrent[key] = target;
    } else {
      _exprCurrent[key] = current + diff * Math.min(1, step);
      anyDirty = true;
    }
  }

  if (!anyDirty && Object.keys(_exprTarget).every(k => Math.abs((_exprCurrent[k] ?? 0) - (_exprTarget[k] ?? 0)) < 0.001)) {
    // All settled — no need to push to GPU
  }

  // Push live values to every morph mesh
  for (const mesh of morphMeshes) {
    const dict = mesh.morphTargetDictionary;
    const inf  = mesh.morphTargetInfluences;
    for (let i = 0; i < inf.length; i++) inf[i] = 0;
    for (const [key, value] of Object.entries(_exprCurrent)) {
      if (typeof dict[key] === "number") inf[dict[key]] = value;
    }
  }
}

// ─── Expressions ──────────────────────────────────────────────────────────
// Sets the desired target values; updateExpressions() lerps to them each frame.
function applyExpression(name) {
  const preset = expressionPresets[name] || expressionPresets.neutral;

  // Mark all currently-active keys as targeting 0 (they will lerp out)
  for (const key of Object.keys(_exprTarget)) _exprTarget[key] = 0;

  // Set new targets from the preset
  for (const [key, value] of Object.entries(preset)) _exprTarget[key] = value;
}

// ─── Animations (non-fatal, single mixer, clip cache, crossfade) ──────────
// playOnce: plays the clip once, then crossfades back to `returnTo`.
const ANIM_FADE_SECS = 0.4;

async function applyAnimation(name, { playOnce = false, returnTo = null } = {}) {
  const animation = animationManifest.find((item) => item.id === name || item.name === name) || animationManifest[0];
  if (!avatar || !animation?.url) {
    setStatus(`Animation unavailable: ${name}`);
    return;
  }

  try {
    // Use cached retargeted clip to avoid re-fetching (prevents idle restart glitch)
    let clip = clipCache.get(name);
    if (!clip) {
      const gltf = await loadGltf(resolveAssetUrl(animation.url));
      if (!gltf.animations[0]) { setStatus(`Animation has no clip: ${name}`); return; }
      clip = retargetClip(gltf.animations[0], avatar);
      clipCache.set(name, clip);
    }

    const prevAction = activeAction;
    activeAction = mixer.clipAction(clip);

    if (prevAction && prevAction !== activeAction) {
      // Crossfade: new action fades in while old fades out — no hard cut
      activeAction.reset();
      activeAction.fadeIn(ANIM_FADE_SECS);
      prevAction.fadeOut(ANIM_FADE_SECS);
    } else {
      activeAction.reset();
      activeAction.fadeIn(ANIM_FADE_SECS);
    }

    if (playOnce) {
      activeAction.setLoop(THREE.LoopOnce, 1);
      activeAction.clampWhenFinished = true;
      const targetAction = activeAction; // capture ref for the listener
      const onFinished = (event) => {
        if (event.action !== targetAction) return; // guard: only react to this clip
        mixer.removeEventListener("finished", onFinished);
        if (returnTo) void applyAnimation(returnTo);
      };
      mixer.addEventListener("finished", onFinished);
    }

    activeAction.play();
    setStatus(`Animation: ${name}`);
  } catch (err) {
    // Non-fatal — avatar stays visible
    console.warn("Animation load failed (non-fatal):", err);
    setStatus(`Animation load failed: ${name}`);
  }
}

function retargetClip(clip, targetAvatar) {
  const objectNames = new Map();
  targetAvatar.traverse((object) => {
    if (object.name) {
      objectNames.set(normalizeTrackTargetName(object.name), object.name);
    }
  });

  const tracks = clip.tracks.map((track) => {
    const cloned = track.clone();
    const dotIndex = cloned.name.indexOf(".");
    if (dotIndex <= 0) {
      return cloned;
    }

    const target = cloned.name.slice(0, dotIndex);
    const property = cloned.name.slice(dotIndex + 1);
    const candidates = [
      target,
      target.split("|").pop() || target,
      target.split("/").pop() || target,
      target.replace(/^mixamorig/i, ""),
      target.replace(/^Armature[_./|]*/i, "")
    ];
    const match = candidates.map((candidate) => objectNames.get(normalizeTrackTargetName(candidate))).find(Boolean);

    if (match) {
      cloned.name = `${match}.${property}`;
    }

    return cloned;
  });

  return new THREE.AnimationClip(`${clip.name || "animation"}-retargeted`, clip.duration, tracks, clip.blendMode);
}

function normalizeTrackTargetName(name) {
  return name.replace(/^mixamorig/i, "").replace(/^Armature/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

// ─── WebSocket with auto-reconnect ───────────────────────────────────────
const WS_MAX_RETRIES = 10;
const WS_MAX_DELAY_MS = 30_000;

let wsRetryCount = 0;
let wsRetryTimer = null;

function connectCommandSocket() {
  const url = new URL(webSocketBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/avatar-viewer/ws";
  url.search = `session=${encodeURIComponent(sessionToken)}`;

  const socket = new WebSocket(url.toString());

  socket.addEventListener("open", () => {
    wsRetryCount = 0; // reset on successful connection
    setStatus("Live avatar channel connected.");
    socket.send(JSON.stringify({ type: "viewer_ready" }));
  });

  socket.addEventListener("message", (event) => {
    handleSocketMessage(socket, event.data);
  });

  socket.addEventListener("close", () => {
    setStatus("Live avatar channel disconnected.", true);
    scheduleWsReconnect(url.toString());
  });

  socket.addEventListener("error", () => {
    setStatus("Live avatar channel error.", true);
    // close event fires after error, reconnect handled there
  });

  return socket;
}

function scheduleWsReconnect(urlStr) {
  if (wsRetryCount >= WS_MAX_RETRIES) {
    setStatus("Live channel unavailable. Reload to retry.", true);
    return;
  }

  if (wsRetryTimer) return; // already scheduled

  const delay = Math.min(1000 * Math.pow(2, wsRetryCount), WS_MAX_DELAY_MS);
  wsRetryCount++;

  wsRetryTimer = setTimeout(() => {
    wsRetryTimer = null;
    setStatus(`Reconnecting live channel… (attempt ${wsRetryCount})`, true);
    connectCommandSocket();
  }, delay);
}

function handleSocketMessage(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch (e) {
    // Malformed frame — log and ignore. Do NOT rethrow; rethrowing kills the
    // message event listener and makes the avatar permanently unresponsive.
    console.warn("Avatar viewer: received non-JSON WebSocket frame, ignoring.", e?.message);
    return;
  }

  if (message.type === "ready") {
    setStatus("Live avatar channel ready.");
    return;
  }

  if (message.type !== "command") {
    return;
  }

  try {
    const command = message.payload;
    if (!command) return;

    if (command.type === "expression") {
      applyExpression(command.name);
    }
    if (command.type === "animation") {
      void applyAnimation(command.name);
    }
    if (command.type === "state") {
      applyExpression(command.expression);
      void applyAnimation(command.animation);
    }

    socket.send(JSON.stringify({ type: "ack", commandId: message.commandId }));
  } catch (e) {
    console.warn("Avatar viewer: error dispatching command, ignoring.", e?.message);
  }
}

// ─── EXPRESSION CONTROL DEMO ────────────────────────────────────────────────
//
// ⚠️  DEMO CODE — Replace with real WebSocket-driven logic in production.
//
// In production, expressions are applied remotely by a Doctor via:
//   POST /api/v1/avatar-viewer/session/{sessionId}/command
//   { "type": "expression", "name": "happy" }
// The backend validates the command, broadcasts it over the WebSocket, and
// viewer.js → handleSocketMessage() dispatches it to applyExpression().
//
// This demo simply cycles through every built-in preset locally so you can
// verify the morph-target system is working before the backend is wired up.
// Remove the runExpressionDemo() call in main() once real commands are flowing.
// ─────────────────────────────────────────────────────────────────────────────
function runExpressionDemo() {
  // All 9 presets in a pleasant emotional arc: positive → neutral → negative → reset
  const sequence = [
    { name: "content",  label: "Content 😊" },
    { name: "happy",    label: "Happy 😄" },
    { name: "joyful",   label: "Joyful 😁" },
    { name: "love",     label: "Love 🥰" },
    { name: "neutral",  label: "Neutral 😐" },
    { name: "sad",      label: "Sad 😢" },
    { name: "fear",     label: "Fear 😨" },
    { name: "angry",    label: "Angry 😠" },
    { name: "disgust",  label: "Disgust 🤢" },
    { name: "calm",     label: "Calm 😌" },   // return to resting state
  ];

  // Each step = 1 s transition (lerp) + 2.5 s hold at full expression.
  // Status fires immediately at the start of each transition so the label
  // is visible during the blend-in, not after it.
  const TRANSITION_MS = 1000; // must match EXPRESSION_SPEED ≈ 4/s → ~98% done in 1 s
  const HOLD_MS       = 2500; // time at full expression before next step
  const STEP_MS       = TRANSITION_MS + HOLD_MS; // 3 500 ms per expression
  let index = 0;

  function step() {
    if (index >= sequence.length) return; // demo finished
    const { name, label } = sequence[index];
    applyExpression(name);
    setStatus(`Expression: ${label}`); // show label at start of lerp
    index++;
    setTimeout(step, STEP_MS);
  }

  step();
}

// ─── Cleanup on page hide ─────────────────────────────────────────────────
window.addEventListener("pagehide", () => {
  if (renderer) renderer.dispose();
  if (wsRetryTimer) clearTimeout(wsRetryTimer);
});

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  if (!apiBaseUrl) {
    setStatus("Missing API base URL.", true);
    return;
  }

  if (!sessionToken) {
    setStatus("Missing viewer session token.", true);
    return;
  }

  setupScene();
  const session = await apiGet("/avatar-viewer/session/me");
  animationManifest = session.animations || [];
  await loadAvatar(resolveAssetUrl(session.avatar.avatarGlbUrl));

  const idleAnimation = session.initialState?.animation || "m_idle_01";
  applyExpression(session.initialState?.expression || "calm");
  void applyAnimation(idleAnimation);
  connectCommandSocket();

  // After a short delay, play the Friendly Wave expression once, then return to idle.
  setTimeout(() => {
    const waveAnim = idleAnimation.startsWith("f_") ? "f_expr_01" : "m_expr_01";
    void applyAnimation(waveAnim, { playOnce: true, returnTo: idleAnimation });
  }, 2000);

  // ── EXPRESSION DEMO — DEV ONLY ─────────────────────────────────────────
  // runExpressionDemo() cycles through every built-in expression preset so you
  // can visually verify the morph-target system. It must NOT run in production
  // because it overrides real AI-driven avatar commands from the WebSocket.
  //
  // To enable locally, open the browser console and type:
  //   runExpressionDemo()
  // or add ?dev_demo=1 to the URL when testing outside production.
  //
  const isDev = new URLSearchParams(window.location.search).get("dev_demo") === "1";
  if (isDev) {
    setTimeout(runExpressionDemo, 9000);
  }
  // ─────────────────────────────────────────────────────────────────────────
}

main().catch((error) => setStatus(error.message || "Viewer failed to load.", true));
