import './style.css';
import * as THREE from 'three';

// Last Circle - mobile-first browser battle royale prototype
const app = document.querySelector('#app');
app.innerHTML = `
  <canvas id="game"></canvas>
  <div id="hud">
    <div class="top"><div id="status">ALIVE</div><div id="zone">15</div></div>
    <div id="bottom"><div id="health"><i></i></div><div id="ammo">AMMO 12</div></div>
  </div>
  <div id="move" class="stick"><div></div></div>
  <div id="aim" class="stick"><div></div></div>
  <div id="menu">
    <h1>LAST CIRCLE</h1>
    <p id="message">Eliminate all rivals</p>
    <button id="play">PLAY AGAIN</button>
  </div>
`;

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8dd);
scene.fog = new THREE.Fog(0x87c8dd, 45, 95);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, 28, 28);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4c6b3a, 2));
const sun = new THREE.DirectionalLight(0xfff1c7, 2.2);
sun.position.set(-20, 35, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const arenaRadius = 28;
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(arenaRadius, 64),
  new THREE.MeshStandardMaterial({ color: 0x76a64d, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const zone = new THREE.Mesh(
  new THREE.RingGeometry(arenaRadius - 0.12, arenaRadius + 0.12, 96),
  new THREE.MeshBasicMaterial({ color: 0x63efff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
);
zone.rotation.x = -Math.PI / 2;
zone.position.y = 0.04;
scene.add(zone);

const barriers = [];
const coverGeo = new THREE.BoxGeometry(3.5, 2, 1);
const coverMat = new THREE.MeshStandardMaterial({ color: 0x80664f, roughness: 1 });
for (let i = 0; i < 14; i++) {
  const a = i / 14 * Math.PI * 2;
  const r = 7 + (i % 5) * 3;
  const block = new THREE.Mesh(coverGeo, coverMat);
  block.position.set(Math.cos(a) * r, 1, Math.sin(a) * r);
  block.rotation.y = -a + Math.PI / 2;
  block.castShadow = block.receiveShadow = true;
  scene.add(block);
  barriers.push(block);
}

const botGroup = new THREE.Group();
scene.add(botGroup);
const actors = [];
const keys = {};
let ammo = 12;
let health = 100;
let shoot = false;
let gameOver = false;
let elapsed = 0;
let currentZoneRadius = arenaRadius;

function actor(x, z, isPlayer = false) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: isPlayer ? 0x1677ff : 0xe74d40 })
  );
  body.position.y = 1;
  body.castShadow = true;
  group.add(body);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x202020 })
  );
  gun.position.set(0, 1.15, -0.72);
  group.add(gun);
  group.position.set(x, 0, z);
  scene.add(group);
  actors.push({ group, hp: 100, player: isPlayer, cooldown: Math.random() * 1, dead: false, angle: 0, wander: Math.random() * 10 });
  return actors.at(-1);
}

const player = actor(0, 0, true);
for (let i = 0; i < 15; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 8 + Math.random() * 18;
  actor(Math.cos(a) * r, Math.sin(a) * r);
}

const movePad = document.querySelector('#move');
const aimPad = document.querySelector('#aim');
const pads = new Map();

function padLoop(element, onMove) {
  element.addEventListener('pointerdown', e => {
    element.setPointerCapture(e.pointerId);
    pads.set(e.pointerId, { element, onMove, cx: e.clientX, cy: e.clientY, dx: 0, dy: 0 });
  });
  element.addEventListener('pointermove', e => {
    const p = pads.get(e.pointerId);
    if (!p) return;
    p.dx = e.clientX - p.cx;
    p.dy = e.clientY - p.cy;
    const len = Math.hypot(p.dx, p.dy);
    if (len > 42) { p.dx *= 42 / len; p.dy *= 42 / len; }
  });
  const end = e => {
    const p = pads.get(e.pointerId);
    if (p) p.dx = p.dy = 0;
    pads.delete(e.pointerId);
  };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
}

padLoop(movePad, null);
padLoop(aimPad, null);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') shoot = true; });
addEventListener('pointerup', () => shoot = false);

function blocked(pos) {
  if (Math.hypot(pos.x, pos.z) > currentZoneRadius - 0.8) return true;
  for (const b of barriers) {
    if (Math.abs(pos.x - b.position.x) < 2 && Math.abs(pos.z - b.position.z) < 1.1) return true;
  }
  return false;
}

function fire(source, target) {
  const origin = source.group.position;
  const dir = new THREE.Vector3(target.group.position.x - origin.x, 0, target.group.position.z - origin.z).normalize();
  const dist = origin.distanceTo(target.group.position);
  if (dist > 16) return;
  const ray = new THREE.Raycaster(origin.clone().add(new THREE.Vector3(0, 1.1, 0)), dir, 0, dist);
  for (const b of barriers) {
    if (ray.intersectObject(b).length) return;
  }
  target.hp -= source.player ? 34 : 9;
  if (target.hp <= 0) {
    target.dead = true;
    target.group.visible = false;
  }
}

function getAlive() { return actors.filter(a => !a.dead).length; }

function finish(won) {
  if (gameOver) return;
  gameOver = true;
  shoot = false;
  document.querySelector('#menu').classList.add('show');
  document.querySelector('#message').textContent = won ? 'Victory' : 'Eliminated';
}

function update(dt) {
  if (gameOver) return;
  elapsed += dt;
  if (elapsed > 15) {
    const t = Math.min((elapsed - 15) / 165, 1);
    currentZoneRadius = THREE.MathUtils.lerp(arenaRadius, 2, t);
  }
  zone.scale.setScalar(currentZoneRadius / arenaRadius);
  document.querySelector('#zone').textContent = Math.ceil((Math.max(15 - elapsed, 0)));

  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  let ax = 0, az = 0;
  for (const p of pads.values()) {
    if (p.element === movePad) { mx += p.dx / 42; mz += p.dy / 42; }
    if (p.element === aimPad) { ax += p.dx / 42; az += p.dy / 42; }
  }
  mx = THREE.MathUtils.clamp(mx, -1, 1);
  mz = THREE.MathUtils.clamp(mz, -1, 1);
  const move = new THREE.Vector3(mx, 0, mz);
  if (move.lengthSq()) {
    move.normalize().multiplyScalar(dt * 6);
    const next = player.group.position.clone().add(move);
    if (!blocked(next)) player.group.position.copy(next);
  }

  if (keys.KeyR) ammo = 12;
  if (ax || az) {
    player.angle = Math.atan2(ax, az);
    player.group.rotation.y = player.angle;
  } else {
    const ndc = new THREE.Vector3((pointer.x || 0) * 2 - 1, -(pointer.y || 0) * 2 + 1, 0.5);
    ndc.unproject(camera);
    const plane = new THREE.Raycaster(camera.position, ndc.sub(camera.position).normalize()).ray;
    const yDist = (0 - plane.origin.y) / plane.direction.y;
    const target = plane.at(yDist, new THREE.Vector3());
    const a = Math.atan2(target.x - player.group.position.x, target.z - player.group.position.z);
    player.group.rotation.y = a;
  }

  if (shoot && ammo > 0) {
    let best = null;
    let bestDist = 16;
    for (const b of actors) {
      if (b.dead || b.player) continue;
      const d = player.group.position.distanceTo(b.group.position);
      if (d < bestDist) { best = b; bestDist = d; }
    }
    if (best) {
      player.cooldown -= dt;
      if (player.cooldown <= 0) { fire(player, best); ammo--; player.cooldown = 0.22; }
    }
  } else if (ammo === 0) ammo = 12;

  for (const b of actors) {
    if (b.dead || b.player) continue;
    b.cooldown -= dt;
    b.wander -= dt;
    const d = b.group.position.distanceTo(player.group.position);
    if (d < 14) {
      b.group.rotation.y = Math.atan2(player.group.position.x - b.group.position.x, player.group.position.z - b.group.position.z);
      if (d > 5) {
        const dir = player.group.position.clone().sub(b.group.position).setY(0).normalize().multiplyScalar(dt * 2.2);
        const next = b.group.position.clone().add(dir);
        if (!blocked(next)) b.group.position.copy(next);
      } else if (b.cooldown <= 0) {
        fire(b, player); b.cooldown = 0.7 + Math.random();
      }
    } else if (b.wander <= 0) {
      b.angle += (Math.random() - 0.5) * 2;
      b.wander = 2 + Math.random() * 3;
    }
    const distWall = b.group.position.length();
    if (distWall > currentZoneRadius) b.hp -= dt * 3;
    if (b.hp <= 0) { b.dead = true; b.group.visible = false; }
  }

  if (Math.hypot(player.group.position.x, player.group.position.z) > currentZoneRadius) {
    health -= dt * (8 + (arenaRadius - currentZoneRadius) * 0.15);
  }
  health = THREE.MathUtils.clamp(health, 0, 100);
  document.querySelector('#health i').style.width = `${health}%`;
  document.querySelector('#ammo').textContent = `AMMO ${ammo}`;
  document.querySelector('#status').textContent = `${getAlive()} ALIVE`;
  if (health <= 0) { player.dead = true; player.group.visible = false; finish(false); }
  else if (getAlive() === 1) finish(true);
}

const pointer = { x: 0.5, y: 0.5 };
canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX / innerWidth;
  pointer.y = e.clientY / innerHeight;
});

document.querySelector('#play').addEventListener('click', () => location.reload());

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  const target = player.group.position;
  camera.position.lerp(new THREE.Vector3(target.x, 22, target.z + 22), 0.08);
  camera.lookAt(target);
  renderer.render(scene, camera);
}
animate();
