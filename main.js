import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

const SKYBOX_PATH = '/skyboxes/NightSkyHDRI007_2K_HDR.exr';
const FALLBACK_BG = 0x0b0b14;
const CUBE_ROTATION_SPEED = 0.01;
const SKYBOX_ROTATION_SPEED = 0.015;
const CONTROL_KEYS = new Set(['a', 'd']);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FALLBACK_BG);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

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
const pressedKeys = new Set();

function animate() {
  requestAnimationFrame(animate);

  if (pressedKeys.has('a')) {
    skyboxRotation -= SKYBOX_ROTATION_SPEED;
  }

  if (pressedKeys.has('d')) {
    skyboxRotation += SKYBOX_ROTATION_SPEED;
  }

  skybox.rotation.y = skyboxRotation;

  cube.rotation.x += CUBE_ROTATION_SPEED;
  cube.rotation.y += CUBE_ROTATION_SPEED;
  renderer.render(scene, camera);
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
