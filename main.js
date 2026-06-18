import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

const SKYBOX_PATH = '/skyboxes/NightSkyHDRI007_2K_HDR.exr';
const FALLBACK_BG = 0x0b0b14;
const CUBE_ROTATION_SPEED = 0.01;
const SKYBOX_ROTATION_SPEED = 0.015;
const SKYBOX_PITCH_LIMIT = 1.2;
const CONTROL_KEYS = new Set(['a', 'd', 'w', 's']);
const ENEMY_COUNT = 3;
const ENEMY_MINI_SCALE = 0.9;
const ENEMY_START_RADIUS = 48;
const ENEMY_END_RADIUS = 1.2;
const ENEMY_APPROACH_SPEED_MIN = 0.03;
const ENEMY_APPROACH_SPEED_MAX = 0.05;
const ENEMY_VISIBLE_ARC = Math.PI * 0.95;
const ENEMY_HEIGHT_MIN = 0.8;
const ENEMY_HEIGHT_MAX = 2.3;
const CUBE_PLAYER_Y = -2.2;
const AXIS_VIEWPORT_SIZE = 120;
const AXIS_VIEWPORT_MARGIN = 16;
// BEGIN OPTIONAL CAMERA SMOOTHING
const CAMERA_BASE_Y = 1.3;
const CAMERA_BASE_Z = 5;
const CAMERA_SWAY_DISTANCE = 0.22;
const CAMERA_SWAY_LERP = 0.08;
const CAMERA_ROLL_MAX = 0.03;
const CAMERA_ROLL_LERP = 0.1;
// END OPTIONAL CAMERA SMOOTHING

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
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const axisScene = new THREE.Scene();
const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
axisCamera.position.set(0, 0, 2.4);
axisCamera.lookAt(0, 0, 0);

const axisGroup = new THREE.Group();
const axisHelper = new THREE.AxesHelper(0.9);
axisGroup.add(axisHelper);
axisScene.add(axisGroup);

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
const cube = new THREE.Mesh(geometry, material);
cube.position.y = CUBE_PLAYER_Y;
scene.add(cube);

const enemies = [];
const enemyGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff4d6d });

function randomEnemyAngle() {
  return -Math.PI / 2 + THREE.MathUtils.randFloatSpread(ENEMY_VISIBLE_ARC);
}

function randomEnemyHeight() {
  return THREE.MathUtils.randFloat(ENEMY_HEIGHT_MIN, ENEMY_HEIGHT_MAX);
}

for (let i = 0; i < ENEMY_COUNT; i += 1) {
  const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
  enemy.scale.set(ENEMY_MINI_SCALE, ENEMY_MINI_SCALE, ENEMY_MINI_SCALE);

  const angle = randomEnemyAngle();
  const startRadius = ENEMY_START_RADIUS - Math.random() * 3;

  enemy.userData.angle = angle;
  enemy.userData.currentRadius = startRadius;
  enemy.userData.approachSpeed = THREE.MathUtils.randFloat(
    ENEMY_APPROACH_SPEED_MIN,
    ENEMY_APPROACH_SPEED_MAX
  );
  enemy.userData.heightOffset = randomEnemyHeight();

  enemy.position.set(
    Math.cos(angle) * startRadius,
    enemy.userData.heightOffset,
    Math.sin(angle) * startRadius
  );

  scene.add(enemy);
  enemies.push(enemy);
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

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

const loader = new EXRLoader();
loader.load(
  SKYBOX_PATH,
  (texture) => {
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    skybox.material.map = texture;
    skybox.material.needsUpdate = true;
    texture.dispose();
  },
  undefined,
  (error) => {
    console.error('Failed to load HDRI skybox:', error);
  }
);

let skyboxRotation = 0;
let skyboxPitch = 0;
const pressedKeys = new Set();
// BEGIN OPTIONAL CAMERA SMOOTHING
let cameraSwayX = 0;
let cameraRoll = 0;
// END OPTIONAL CAMERA SMOOTHING

function animate() {
  requestAnimationFrame(animate);

  // BEGIN OPTIONAL CAMERA SMOOTHING
  let horizontalInput = 0;
  // END OPTIONAL CAMERA SMOOTHING

  if (pressedKeys.has('a')) {
    skyboxRotation -= SKYBOX_ROTATION_SPEED;
    // BEGIN OPTIONAL CAMERA SMOOTHING
    horizontalInput -= 1;
    // END OPTIONAL CAMERA SMOOTHING
  }

  if (pressedKeys.has('d')) {
    skyboxRotation += SKYBOX_ROTATION_SPEED;
    // BEGIN OPTIONAL CAMERA SMOOTHING
    horizontalInput += 1;
    // END OPTIONAL CAMERA SMOOTHING
  }

  if (pressedKeys.has('w')) {
    skyboxPitch -= SKYBOX_ROTATION_SPEED;
  }

  if (pressedKeys.has('s')) {
    skyboxPitch += SKYBOX_ROTATION_SPEED;
  }

  skyboxPitch = THREE.MathUtils.clamp(
    skyboxPitch,
    -SKYBOX_PITCH_LIMIT,
    SKYBOX_PITCH_LIMIT
  );

  // BEGIN OPTIONAL CAMERA SMOOTHING
  const targetSwayX = horizontalInput * CAMERA_SWAY_DISTANCE;
  cameraSwayX = THREE.MathUtils.lerp(cameraSwayX, targetSwayX, CAMERA_SWAY_LERP);

  const targetRoll = -horizontalInput * CAMERA_ROLL_MAX;
  cameraRoll = THREE.MathUtils.lerp(cameraRoll, targetRoll, CAMERA_ROLL_LERP);

  camera.position.x = cameraSwayX;
  camera.position.y = CAMERA_BASE_Y;
  camera.position.z = CAMERA_BASE_Z;
  camera.lookAt(0, CUBE_PLAYER_Y, 0);
  camera.rotation.z = cameraRoll;
  // END OPTIONAL CAMERA SMOOTHING

  skybox.rotation.x = skyboxPitch;
  skybox.rotation.y = skyboxRotation;
  axisGroup.quaternion.copy(skybox.quaternion);

  cube.rotation.x += CUBE_ROTATION_SPEED;
  cube.rotation.y += CUBE_ROTATION_SPEED;

  for (const enemy of enemies) {
    enemy.userData.currentRadius -= enemy.userData.approachSpeed;

    if (enemy.userData.currentRadius <= ENEMY_END_RADIUS) {
      enemy.userData.currentRadius = ENEMY_START_RADIUS;
      enemy.userData.angle = randomEnemyAngle();
      enemy.userData.heightOffset = randomEnemyHeight();
    }

    const unclampedAngle = enemy.userData.angle + skyboxRotation;
    const minVisibleAngle = -Math.PI / 2 - ENEMY_VISIBLE_ARC / 2;
    const maxVisibleAngle = -Math.PI / 2 + ENEMY_VISIBLE_ARC / 2;
    const relativeAngle = THREE.MathUtils.clamp(
      unclampedAngle,
      minVisibleAngle,
      maxVisibleAngle
    );
    const baseX = Math.cos(relativeAngle) * enemy.userData.currentRadius;
    const baseZ = Math.sin(relativeAngle) * enemy.userData.currentRadius;
    const baseY = enemy.userData.heightOffset;
    const cosPitch = Math.cos(skyboxPitch);
    const sinPitch = Math.sin(skyboxPitch);

    enemy.position.x = baseX;
    enemy.position.y = baseY * cosPitch - baseZ * sinPitch;
    enemy.position.z = baseY * sinPitch + baseZ * cosPitch;
  }

  renderer.clear();
  renderer.render(scene, camera);

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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
