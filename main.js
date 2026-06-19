import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/*
  High-level structure of this file:
  1) Configure constants for scene, input, and movement tuning.
  2) Create core Three.js objects (scene, camera, renderer).
  3) Load ship/enemy models and the HDR skybox texture.
  4) On every frame, apply input -> update camera/ship -> update enemies -> render.

  This project creates movement by rotating/tilting the sky and enemy coordinate math,
  rather than physically moving a player through world space.
*/

// --- Asset paths ---
const SKYBOX_PATH = '/skyboxes/NightSkyHDRI007_2K_HDR.exr';
const SHIP_MODEL_PATH = '/models/ship/blaschka_glass_model_of_moon_jellyfish.glb';
const ENEMY_MODEL_PATH = '/models/enemy/blaschka_glass_model_of_a_syllid_worm.glb';

// --- Scene tuning ---
const FALLBACK_BG = 0x0b0b14;
const SKYBOX_ROTATION_SPEED = 0.015;
const SKYBOX_PITCH_LIMIT = 1.2;
const CONTROL_KEYS = new Set(['a', 'd', 'w', 's']);

// --- Enemy behavior ---
const ENEMY_COUNT = 3;
const ENEMY_START_RADIUS = 48;
const ENEMY_END_RADIUS = 1.2;
const ENEMY_APPROACH_SPEED_MIN = 0.03;
const ENEMY_APPROACH_SPEED_MAX = 0.05;
const ENEMY_VISIBLE_ARC = Math.PI * 0.95;
const CUBE_PLAYER_Y = -2.2;

// Enemy model alignment offsets after lookAt().
const ENEMY_HEADING_OFFSET_X = 0;
const ENEMY_HEADING_OFFSET_Y = Math.PI;
const ENEMY_HEADING_OFFSET_Z = 0;

// --- Model scaling ---
const SHIP_MODEL_SCALE = 0.03;
const ENEMY_MODEL_SCALE = 0.1;

// --- Axis mini-view inset ---
const AXIS_VIEWPORT_SIZE = 120;
const AXIS_VIEWPORT_MARGIN = 16;

// --- Camera + ship tilt smoothing ---
const CAMERA_BASE_Y = 1.3;
const CAMERA_BASE_Z = 5;
const CAMERA_SWAY_DISTANCE = 0.22;
const CAMERA_SWAY_LERP = 0.08;
const CAMERA_ROLL_MAX = 0.03;
const CAMERA_ROLL_LERP = 0.1;
const SHIP_ROLL_MAX = 0.4;
const SHIP_PITCH_MAX = 0.25;
const SHIP_TILT_LERP = 0.08;
const SHIP_BASE_PITCH = -0.5;

// --- Core Three.js objects ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(FALLBACK_BG);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, CAMERA_BASE_Y, CAMERA_BASE_Z);
camera.lookAt(0, CUBE_PLAYER_Y, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// We disable autoClear so we can render the main scene and then render
// the axis mini-view on top in the same frame.
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

// Small inset axis view to show current world orientation.
const axisScene = new THREE.Scene();
const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
axisCamera.position.set(0, 0, 2.4);
axisCamera.lookAt(0, 0, 0);

const axisGroup = new THREE.Group();
const axisHelper = new THREE.AxesHelper(0.9);
axisGroup.add(axisHelper);
axisScene.add(axisGroup);

// Used when the ship model has not loaded yet.
const ENEMY_FALLBACK_TARGET = new THREE.Vector3(0, CUBE_PLAYER_Y, 0);

// --- Runtime state ---
let playerShip = null;
const enemies = [];
// Set of currently held movement keys; updated by keydown/keyup handlers.
const pressedKeys = new Set();
let skyboxRotation = 0;
let skyboxPitch = 0;

// Smoothed camera/ship motion values.
let cameraSwayX = 0;
let cameraRoll = 0;
let shipRoll = 0;
let shipPitch = 0;

// --- Loaders ---
const gltfLoader = new GLTFLoader();
const exrLoader = new EXRLoader();
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

function randomEnemyAngle() {
  // Center enemy spawn angles in front of the player (-PI/2 on this setup)
  // and spread them across the configured visible arc.
  return -Math.PI / 2 + THREE.MathUtils.randFloatSpread(ENEMY_VISIBLE_ARC);
}

function createEnemyFromTemplate(templateScene) {
  // Clone the loaded GLTF root so all enemies share source geometry/materials
  // but still maintain independent transform/userData state.
  const enemy = templateScene.clone();
  enemy.scale.setScalar(ENEMY_MODEL_SCALE);

  const angle = randomEnemyAngle();
  const startRadius = ENEMY_START_RADIUS - Math.random() * 3;

  enemy.userData.angle = angle;
  enemy.userData.currentRadius = startRadius;
  enemy.userData.approachSpeed = THREE.MathUtils.randFloat(
    ENEMY_APPROACH_SPEED_MIN,
    ENEMY_APPROACH_SPEED_MAX
  );
  enemy.userData.heightOffset = CUBE_PLAYER_Y;

  // Initial spawn position on a ring around the player.
  enemy.position.set(
    Math.cos(angle) * startRadius,
    enemy.userData.heightOffset,
    Math.sin(angle) * startRadius
  );
  // Make each one a different random color
  enemy.traverse((child) => {
    if (child.isMesh) {
      child.material = child.material.clone();
      child.material.color.setHSL(Math.random(), 0.5, 0.5);
    }
  });

  
  scene.add(enemy);
  enemies.push(enemy);
}

function loadPlayerShip() {
  // Load player ship once and keep a shared reference for per-frame tilt updates.
  gltfLoader.load(
    SHIP_MODEL_PATH,
    (gltf) => {
      playerShip = gltf.scene;
      playerShip.scale.setScalar(SHIP_MODEL_SCALE);
      playerShip.position.y = CUBE_PLAYER_Y;
      scene.add(playerShip);
    },
    undefined,
    (error) => { console.error('Failed to load ship model:', error); }
  );
}

function loadEnemies() {
  // Load one enemy asset and instantiate ENEMY_COUNT clones from it.
  gltfLoader.load(
    ENEMY_MODEL_PATH,
    (gltf) => {
      for (let i = 0; i < ENEMY_COUNT; i += 1) {
        createEnemyFromTemplate(gltf.scene);
      }
    },
    undefined,
    (error) => { console.error('Failed to load enemy model:', error); }
  );
}

const skyboxGeometry = new THREE.SphereGeometry(50, 64, 64);
const skyboxMaterial = new THREE.MeshBasicMaterial({
  side: THREE.BackSide,
});
const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
scene.add(skybox);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
directionalLight.position.set(4, 6, 8);
scene.add(directionalLight);

function loadSkybox() {
  // EXR provides HDR range; PMREM converts equirectangular data into a
  // prefiltered environment map that PBR materials can use for lighting.
  exrLoader.load(
    SKYBOX_PATH,
    (texture) => {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      // Also draw the original EXR on the inside of a giant sphere as background.
      skybox.material.map = texture;
      skybox.material.needsUpdate = true;
      // Original equirectangular texture can be disposed after PMREM conversion.
      texture.dispose();
    },
    undefined,
    (error) => {
      console.error('Failed to load HDRI skybox:', error);
    }
  );
}

loadPlayerShip();
loadEnemies();
loadSkybox();

function updateSkyboxFromInput() {
  // Horizontal/vertical input values are normalized to -1, 0, or 1 and reused
  // by camera/ship smoothing so both visuals react consistently to controls.
  let horizontalInput = 0;
  let verticalInput = 0;

  if (pressedKeys.has('a')) {
    skyboxRotation -= SKYBOX_ROTATION_SPEED;
    horizontalInput -= 1;
  }

  if (pressedKeys.has('d')) {
    skyboxRotation += SKYBOX_ROTATION_SPEED;
    horizontalInput += 1;
  }

  if (pressedKeys.has('w')) {
    skyboxPitch -= SKYBOX_ROTATION_SPEED;
    verticalInput -= 1;
  }

  if (pressedKeys.has('s')) {
    skyboxPitch += SKYBOX_ROTATION_SPEED;
    verticalInput += 1;
  }

  skyboxPitch = THREE.MathUtils.clamp(
    skyboxPitch,
    -SKYBOX_PITCH_LIMIT,
    SKYBOX_PITCH_LIMIT
  );

  return { horizontalInput, verticalInput };
}

function updateCameraAndShip(horizontalInput, verticalInput) {
  // Smooth lateral camera sway to avoid abrupt left/right snapping.
  const targetSwayX = horizontalInput * CAMERA_SWAY_DISTANCE;
  cameraSwayX = THREE.MathUtils.lerp(cameraSwayX, targetSwayX, CAMERA_SWAY_LERP);

  // Roll camera slightly during horizontal motion for speed/weight feel.
  const targetRoll = -horizontalInput * CAMERA_ROLL_MAX;
  cameraRoll = THREE.MathUtils.lerp(cameraRoll, targetRoll, CAMERA_ROLL_LERP);

  camera.position.x = cameraSwayX;
  camera.position.y = CAMERA_BASE_Y;
  camera.position.z = CAMERA_BASE_Z;
  camera.lookAt(0, CUBE_PLAYER_Y, 0);
  camera.rotation.z = cameraRoll;

  if (!playerShip) {
    // Ship may not exist on initial frames before GLTF load completes.
    return;
  }

  // Apply independent smoothing to ship roll/pitch for a floaty motion profile.
  shipRoll = THREE.MathUtils.lerp(shipRoll, -horizontalInput * SHIP_ROLL_MAX, SHIP_TILT_LERP);
  shipPitch = THREE.MathUtils.lerp(shipPitch, verticalInput * SHIP_PITCH_MAX, SHIP_TILT_LERP);
  playerShip.rotation.z = shipRoll;
  playerShip.rotation.x = SHIP_BASE_PITCH + shipPitch;
}

function resetEnemy(enemy) {
  // Recycle enemies instead of deleting/recreating meshes to keep frame work cheap.
  enemy.userData.currentRadius = ENEMY_START_RADIUS;
  enemy.userData.angle = randomEnemyAngle();
  enemy.userData.heightOffset = CUBE_PLAYER_Y;
}

function updateEnemyPosition(enemy) {
  // Move inward each frame along its current radial lane.
  enemy.userData.currentRadius -= enemy.userData.approachSpeed;

  if (enemy.userData.currentRadius <= ENEMY_END_RADIUS) {
    resetEnemy(enemy);
  }

  // Enemy angle is clamped to the visible front arc so new enemies stay in view.
  const unclampedAngle = enemy.userData.angle + skyboxRotation;
  const minVisibleAngle = -Math.PI / 2 - ENEMY_VISIBLE_ARC / 2;
  const maxVisibleAngle = -Math.PI / 2 + ENEMY_VISIBLE_ARC / 2;
  const relativeAngle = THREE.MathUtils.clamp(
    unclampedAngle,
    minVisibleAngle,
    maxVisibleAngle
  );

  // Build base position in horizontal ring around player.
  const baseX = Math.cos(relativeAngle) * enemy.userData.currentRadius;
  const baseZ = Math.sin(relativeAngle) * enemy.userData.currentRadius;
  const baseY = enemy.userData.heightOffset;

  // Apply pitch rotation so enemies move with the "tilted sky" illusion.
  const cosPitch = Math.cos(skyboxPitch);
  const sinPitch = Math.sin(skyboxPitch);
  enemy.position.x = baseX;
  enemy.position.y = baseY * cosPitch - baseZ * sinPitch;
  enemy.position.z = baseY * sinPitch + baseZ * cosPitch;

  // Face the ship (or fallback point before ship load) then fix model forward-axis
  // differences with static offsets.
  const shipTarget = playerShip ? playerShip.position : ENEMY_FALLBACK_TARGET;
  enemy.lookAt(shipTarget);
  enemy.rotateX(ENEMY_HEADING_OFFSET_X);
  enemy.rotateY(ENEMY_HEADING_OFFSET_Y);
  enemy.rotateZ(ENEMY_HEADING_OFFSET_Z);
}

function updateEnemies() {
  // Centralized enemy update pass makes animate() easier to scan.
  for (const enemy of enemies) {
    updateEnemyPosition(enemy);
  }
}

function renderAxisInset() {
  // Render a small orientation widget in the top-left corner.
  // Scissor confines drawing to the inset rectangle.
  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setViewport(
    AXIS_VIEWPORT_MARGIN,
    window.innerHeight - AXIS_VIEWPORT_SIZE - AXIS_VIEWPORT_MARGIN,
    AXIS_VIEWPORT_SIZE,
    AXIS_VIEWPORT_SIZE
  );
  renderer.setScissor(
    AXIS_VIEWPORT_MARGIN,
    window.innerHeight - AXIS_VIEWPORT_SIZE - AXIS_VIEWPORT_MARGIN,
    AXIS_VIEWPORT_SIZE,
    AXIS_VIEWPORT_SIZE
  );
  renderer.render(axisScene, axisCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}

function animate() {
  // Request next frame first to keep animation loop continuous.
  requestAnimationFrame(animate);

  // 1) Collect inputs and update camera/ship pose.
  const { horizontalInput, verticalInput } = updateSkyboxFromInput();
  updateCameraAndShip(horizontalInput, verticalInput);

  // 2) Apply world-orientation transforms.
  skybox.rotation.x = skyboxPitch;
  skybox.rotation.y = skyboxRotation;

  // Axis helper mirrors the skybox orientation in the inset view.
  axisGroup.quaternion.copy(skybox.quaternion);

  // 3) Advance enemy movement.
  updateEnemies();

  // 4) Render main scene, then overlay axis inset.
  renderer.clear();
  renderer.render(scene, camera);
  renderAxisInset();
}

function updateKeyState(event, isPressed) {
  const key = event.key.toLowerCase();

  if (!CONTROL_KEYS.has(key)) {
    return;
  }

  if (isPressed) {
    pressedKeys.add(key);
  } else {
    pressedKeys.delete(key);
  }

  // Prevent browser defaults like page scroll while using WASD.
  event.preventDefault();
}

window.addEventListener('keydown', (event) => {
  updateKeyState(event, true);
});

window.addEventListener('keyup', (event) => {
  updateKeyState(event, false);
});

animate();

window.addEventListener('resize', () => {
  // Keep camera projection and renderer size in sync with viewport changes.
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
