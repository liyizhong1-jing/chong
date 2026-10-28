import * as THREE from 'three';

/* ---------------------------------------------------------------
   参数：与 Python 版 (pyvista/numpy) 一一对应
   --------------------------------------------------------------- */
const P = {
  length: 120.0,
  widthFactor: 0.50,
  wave: 0.08,
  shapeP: 0.7,
  bowlFactor: 0.15,
  pointsPerPetal: 10000,
  numPetals: 28,
  yawDeg: 22.0,
};

// 花瓣卷曲角：n<=4 -> 75°，n<=11 -> 55°，n<=19 -> 35°，其余 5°
function curlDegree(n) {
  if (n <= 4) return 75.0;
  if (n <= 11) return 55.0;
  if (n <= 19) return 35.0;
  return 5.0;
}

// 酒红渐变色标（花心 -> 亮玫红）
const STOPS = [
  [0.18, 0.03, 0.12],
  [0.40, 0.06, 0.17],
  [0.68, 0.12, 0.24],
  [0.92, 0.22, 0.36],
  [1.00, 0.42, 0.60],
];

/* 可复现随机数（固定种子） */
let _s = 0x9e3779b9;
function rand() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---------------------------------------------------------------
   1. 生成单片花瓣的点云（NU x NV 网格，再随机抽样）
   --------------------------------------------------------------- */
const NU = 80;
const NV = 160;

function petalPoints(L, curlRad) {
  const ax = new Float32Array(NU * NV);
  const ay = new Float32Array(NU * NV);
  const az = new Float32Array(NU * NV);

  for (let j = 0; j < NV; j++) {
    const v = j / (NV - 1);
    const widthProfile = Math.sin(Math.PI * Math.pow(v, P.shapeP));
    const y0 = L - v * L;
    const bowl = P.bowlFactor * L * Math.pow(1 - v, 2);

    // 卷曲：只改 y、z，x 不动
    const theta = (1 - v) * curlRad;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    for (let i = 0; i < NU; i++) {
      const u = -1 + (2 * i) / (NU - 1);
      const x = u * P.widthFactor * L * widthProfile;
      const ripple = P.wave * L * Math.sin(4 * Math.PI * v) * u * u;
      const z = -ripple + bowl;

      const k = j * NU + i;
      ax[k] = x;
      ay[k] = y0 * ct;
      az[k] = y0 * st + z;
    }
  }
  return { ax, ay, az };
}

/* ---------------------------------------------------------------
   2. 组装整朵花：金角螺旋排布 + 两次绕 z 轴旋转 + 平移
   --------------------------------------------------------------- */
function buildFlower() {
  const total = P.numPetals * P.pointsPerPetal;
  const pos = new Float32Array(total * 3);

  const yaw = (P.yawDeg * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  let w = 0;
  const per = NU * NV;
  const idx = new Uint32Array(per);

  for (let n = 0; n < P.numPetals; n++) {
    const ang = n * 137.508;
    const angRad = (ang * Math.PI) / 180;
    const r = 1.0 + n * 1.2;
    const xTrans = Math.cos(angRad) * r;
    const yTrans = Math.sin(angRad) * r;
    const scale = 0.15 + n * 0.035;

    const { ax, ay, az } = petalPoints(P.length * scale, (curlDegree(n) * Math.PI) / 180);

    // 部分洗牌，取前 pointsPerPetal 个（等价 np.random.choice 无放回）
    for (let i = 0; i < per; i++) idx[i] = i;
    for (let i = 0; i < P.pointsPerPetal; i++) {
      const j = i + Math.floor(rand() * (per - i));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }

    const ca = Math.cos(angRad);
    const sa = Math.sin(angRad);

    for (let i = 0; i < P.pointsPerPetal; i++) {
      const k = idx[i];
      const x = ax[k];
      const y = ay[k];
      const z = az[k];

      // 绕 z 轴 yaw
      const x1 = x * cy - y * sy;
      const y1 = x * sy + y * cy;
      // 绕 z 轴 ang
      const x2 = x1 * ca - y1 * sa;
      const y2 = x1 * sa + y1 * ca;

      pos[w++] = x2 + xTrans;
      pos[w++] = y2 + yTrans;
      pos[w++] = z;
    }
  }
  return pos;
}

/* 颜色：按到中心轴的距离取酒红渐变，再乘随机亮度 */
function colorFor(t) {
  const s = t * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(s));
  const f = s - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/* ---------------------------------------------------------------
   3. 渲染
   --------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  statusEl.textContent = '这台设备不支持 WebGL，页面下方是一张静态渲染图。';
  throw e;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x050005, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050005, 0.0011);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 1, 8000);
camera.up.set(0, 0, 1);

const t0 = performance.now();
const positions = buildFlower();
const total = positions.length / 3;

/* 圆点贴图（软边），避免方块点 */
function dotTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sprite = dotTexture();

/* 3a. 主体：280k 粒子 */
const colors = new Float32Array(total * 3);
let rMin = Infinity, rMax = -Infinity;
const radial = new Float32Array(total);
for (let i = 0; i < total; i++) {
  const x = positions[i * 3];
  const y = positions[i * 3 + 1];
  const r = Math.sqrt(x * x + y * y);
  radial[i] = r;
  if (r < rMin) rMin = r;
  if (r > rMax) rMax = r;
}
const span = rMax - rMin + 1e-9;
for (let i = 0; i < total; i++) {
  const t = (radial[i] - rMin) / span;
  const c = colorFor(t);
  const b = 0.55 + rand() * 0.60; // 0.55 ~ 1.15
  colors[i * 3] = Math.min(1, c[0] * b);
  colors[i * 3 + 1] = Math.min(1, c[1] * b);
  colors[i * 3 + 2] = Math.min(1, c[2] * b);
}

const bodyGeom = new THREE.BufferGeometry();
bodyGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
bodyGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const bodyMat = new THREE.PointsMaterial({
  size: 0.60,
  map: sprite,
  vertexColors: true,
  transparent: true,
  opacity: 0.88,
  alphaTest: 0.02,
  depthWrite: false,
  blending: THREE.NormalBlending,
  sizeAttenuation: true,
});
const body = new THREE.Points(bodyGeom, bodyMat);

/* 3b. 高光：约 8% 的亮玫红大点 */
const hiPos = [];
for (let i = 0; i < total; i++) {
  if (rand() < 0.08) {
    hiPos.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  }
}
const hiGeom = new THREE.BufferGeometry();
hiGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hiPos), 3));
const hiMat = new THREE.PointsMaterial({
  size: 0.88,
  color: new THREE.Color(1.0, 0.30, 0.50),
  map: sprite,
  transparent: true,
  opacity: 0.40,
  alphaTest: 0.02,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});
const highlights = new THREE.Points(hiGeom, hiMat);

const flower = new THREE.Group();
flower.add(body, highlights);
scene.add(flower);

/* 让花处在画面中心，并按包围球取景 */
bodyGeom.computeBoundingSphere();
const sphere = bodyGeom.boundingSphere;
flower.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z);

const RADIUS = sphere.radius * 3.05;

/* ---------------------------------------------------------------
   4. 相机：绕 z 轴转台 + 拖拽/滚轮
   --------------------------------------------------------------- */
const view = { theta: -0.5, phi: 0.55, radius: RADIUS, auto: true };
const HOME = { ...view };

function applyCamera() {
  const cp = Math.cos(view.phi);
  camera.position.set(
    view.radius * cp * Math.cos(view.theta),
    view.radius * cp * Math.sin(view.theta),
    view.radius * Math.sin(view.phi)
  );
  camera.lookAt(0, 0, 0);
}
applyCamera();

let dragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  view.theta -= dx * 0.006;
  view.phi = Math.max(-1.30, Math.min(1.30, view.phi + dy * 0.004));
  applyCamera();
});

function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  if (e && e.pointerId !== undefined) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.radius = Math.max(RADIUS * 0.35, Math.min(RADIUS * 3.0, view.radius * Math.exp(e.deltaY * 0.0012)));
  applyCamera();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    view.auto = !view.auto;
    statusEl.textContent = view.auto ? '自转中' : '已暂停（空格继续）';
  } else if (e.key === 'r' || e.key === 'R') {
    Object.assign(view, HOME);
    applyCamera();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

/* ---------------------------------------------------------------
   5. 主循环
   --------------------------------------------------------------- */
const clock = new THREE.Clock();
const SPEED = 0.20; // rad/s ≈ 11.5°/s，接近原脚本的 Azimuth(0.4) 每 0.03s

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (view.auto && !dragging) {
    view.theta += SPEED * dt;
    applyCamera();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

countEl.textContent = total.toLocaleString('en-US');
statusEl.textContent = '自转中 · 生成耗时 ' + Math.round(performance.now() - t0) + ' ms';
tick();

/* 便于调试：window.__flower */
window.__flower = { view, applyCamera, camera, renderer, scene, total };
