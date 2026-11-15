// 화면: 상태·되돌리기, three.js 장면, 끌기, 패널, 내보내기, 저장. 계산은 model.js에 있다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as M from './model.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const fmt = v => Math.round(v).toLocaleString('ko-KR');
const size = b => `${fmt(b.W)} × ${fmt(b.D)} × ${fmt(b.H)}`;

/* ---------- 상태 ---------- */
const KEY = 'funmodel-v2'; // v2: 가구 목록(library)이 방 밖에 하나. v1(방마다 목록)은 읽어서 합치고 원본은 그대로 둔다
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem('funmodel-v1')), library = [];
    const projects = s.projects.map(p => M.sanitize({ library: s.library, ...p })).filter(Boolean).map(p => M.adopt(library, p));
    if (projects.length) return { cur: s.cur, library, projects };
  } catch { /* 저장본이 없거나 깨졌으면 예시로 시작 */ }
  const p = M.newProject('침실 예시', true);
  return { library: p.library, projects: [p] };
}
const store = load();
let proj = store.projects.find(p => p.id === store.cur) || store.projects[0];
const ui = { mode: 'room', view: '3d', tab: 'add', dtab: 'edit', sel: null, defId: null, partId: null };
const hist = { undo: [], redo: [] };
let bad = { items: new Map(), doors: new Set() };

const curDef = () => proj.library.find(d => d.id === ui.defId);
const selItem = () => (ui.sel?.type === 'item' ? proj.items.find(i => i.id === ui.sel.id) : null);
const selOpen = () => (ui.sel?.type === 'open' ? proj.openings.find(o => o.id === ui.sel.id) : null);
const selPart = () => { const d = curDef(); return d?.kind === 'custom' ? d.parts.find(p => p.id === ui.partId) : null; };

function setProj(p) { store.projects[store.projects.indexOf(proj)] = p; proj = p; store.cur = p.id; store.library = p.library; } // 지금 방의 library가 곧 공용 가구 목록
function snap() { hist.undo.push(JSON.stringify(proj)); if (hist.undo.length > 60) hist.undo.shift(); hist.redo = []; }
function commit(fn) { snap(); fn(); refresh(); }
function travel(from, to) { if (!from.length) return; to.push(JSON.stringify(proj)); setProj(JSON.parse(from.pop())); refresh(); }
function refresh() { // 모든 변경 뒤: 값 범위를 다시 맞추고(sanitize) 장면·패널·저장을 갱신
  setProj(M.sanitize(proj));
  if (ui.sel && !selItem() && !selOpen()) ui.sel = null;
  rebuild(); renderPanel(); save();
}

let saveT = 0, toastT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(flush, 400); }
function flush() {
  clearTimeout(saveT);
  try { localStorage.setItem(KEY, JSON.stringify({ v: 2, ...store, projects: store.projects.map(p => ({ ...p, library: undefined })) })); } catch { toast('저장하지 못했습니다. 브라우저 저장 공간을 확인하세요'); }
}
addEventListener('pagehide', flush);
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }

/* ---------- three.js 장면 (장면 단위 = mm) ---------- */
const stage = $('#stage'), canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(), world = new THREE.Group();
const persp = new THREE.PerspectiveCamera(40, 1, 50, 200000), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 50, 200000);
let camera = persp, orthoH = 3000;
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 8, 5);
scene.add(world, sun, new THREE.HemisphereLight(0xffffff, 0x8a8478, 2.2));

const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { zoomToCursor: true, minDistance: 300, maxDistance: 60000, minZoom: .3, maxZoom: 20 });
const gizmo = new TransformControls(camera, canvas); gizmo.setRotationSnap(5 * M.DEG); scene.add(gizmo);

const BOX = new THREE.BoxGeometry(1, 1, 1), EDGE = new THREE.EdgesGeometry(BOX), mats = {};
const mat = c => (mats[c] ||= new THREE.MeshLambertMaterial({ color: c, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
const GLASS = new THREE.MeshLambertMaterial({ color: 0x9fd0ea, transparent: true, opacity: .45 });
const line = (color, o) => new THREE.LineBasicMaterial({ color, ...o });
const L = { edge: line(0x1b222a, { transparent: true, opacity: .4 }), door: line(0x5d6976), sel: line(0x2f7df6, { depthTest: false }), dim: line(0xb86e00, { depthTest: false }), bad: line(0xc42f2f, { depthTest: false }) };

let pick = [], labels = [], dimPts = [], tmp = [];
function outline(b, m) { // b = {x,y,z,w,h,d} 최소 모서리 기준
  const l = new THREE.LineSegments(EDGE, m); l.scale.set(b.w, b.h, b.d); l.position.set(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2);
  if (m !== L.edge) l.renderOrder = 9; // 선택·경고 선은 맨 위에
  return l;
}
function box(b, color, edge = L.edge) {
  const m = new THREE.Mesh(BOX, color.isMaterial ? color : mat(color)), e = outline(b, edge);
  m.scale.copy(e.scale); m.position.copy(e.position); e.scale.setScalar(1); e.position.setScalar(0); m.add(e);
  m.rotation.set((b.rx || 0) * M.DEG, (b.ry || 0) * M.DEG, (b.rz || 0) * M.DEG); // 부품 회전(중심 기준, 오일러 XYZ = model.rotOf)
  return m;
}
function geom(flat) { const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(flat, 3)); tmp.push(g); return g; }
function dim(a, b) { // 치수선 + 길이 라벨
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (len < 1) return;
  dimPts.push(...a, ...b); labels.push({ v: new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), text: fmt(len), cls: '' });
}

function buildRoom() {
  const { room } = proj;
  bad = M.conflicts(proj);
  world.add(box({ x: -M.WT, y: -50, z: -M.WT, w: room.w + 2 * M.WT, h: 50, d: room.d + 2 * M.WT }, room.floor));
  for (const b of M.wallBoxes(room, proj.openings)) { const m = box(b, b.kind === 'glass' ? GLASS : room.wall); m.userData = { wall: b.wall, top: b.kind === 'top' }; world.add(m); }
  for (const o of proj.openings) {
    const on = ui.sel?.id === o.id;
    if (o.type === 'door') { // 바닥에 문 열림 궤적
      const l = new THREE.LineLoop(geom(M.doorZone(room, o).flatMap(([x, z]) => [x, 4, z])), bad.doors.has(o.id) ? L.bad : on ? L.sel : L.door);
      l.renderOrder = 9; world.add(l);
    }
    if (on) world.add(outline(M.spanBox(room, o.wall, o.pos, o.pos + o.w, -M.WT, 0, o.sill, o.sill + o.h), L.sel));
  }
  for (const it of proj.items) {
    const d = M.defOf(proj, it), parts = M.partsOf(d), b = M.bounds(parts), g = new THREE.Group(), on = ui.sel?.id === it.id, why = bad.items.get(it.id);
    g.position.set(it.x, 0, it.z); g.rotation.y = it.rot * M.DEG; g.userData.item = it.id;
    for (const p of parts) g.add(box({ ...p, x: p.x - b.cx, z: p.z - b.cz }, p.color));
    if (on || why) g.add(outline({ x: -b.W / 2 - 5, y: 0, z: -b.D / 2 - 5, w: b.W + 10, h: b.y1 + 5, d: b.D + 10 }, why ? L.bad : L.sel));
    world.add(g); pick.push(g);
    if (ui.view === 'plan') labels.push({ v: new THREE.Vector3(it.x, b.y1, it.z), text: d.name, cls: 'name' });
    if (on) { // 선택한 가구에서 네 벽까지 거리
      const s = M.shape(proj, it), y = 5;
      dim([0, y, it.z], [s.minx, y, it.z]); dim([s.maxx, y, it.z], [room.w, y, it.z]); dim([it.x, y, 0], [it.x, y, s.minz]); dim([it.x, y, s.maxz], [it.x, y, room.d]);
    }
  }
}
function buildDesign() {
  const d = curDef();
  if (!d) return;
  const parts = M.partsOf(d), b = M.bounds(parts), n = Math.ceil(Math.max(b.W, b.D) / 1000) + 1, grid = new THREE.GridHelper(n * 1000, n * 10, 0x8894a0, 0xb4bcc5);
  grid.position.set(b.cx, -1, b.cz); world.add(grid); tmp.push(grid.geometry, grid.material);
  for (const p of parts) {
    const on = p.id === ui.partId, m = box(p, p.color, on ? L.sel : L.edge);
    m.userData.part = p.id; world.add(m); pick.push(m);
    if (on && d.kind === 'custom') gizmo.attach(m);
  }
  dim([b.x0, 0, b.z1 + 100], [b.x1, 0, b.z1 + 100]); dim([b.x1 + 100, 0, b.z0], [b.x1 + 100, 0, b.z1]); dim([b.x0 - 100, 0, b.z1], [b.x0 - 100, b.y1, b.z1]);
}
function rebuild() {
  gizmo.detach(); tmp.forEach(g => g.dispose()); tmp = []; world.clear(); pick = []; labels = []; dimPts = [];
  if (ui.mode === 'room') buildRoom(); else buildDesign();
  if (dimPts.length) { const l = new THREE.LineSegments(geom(dimPts), L.dim); l.renderOrder = 9; world.add(l); }
  const box = $('#labels');
  while (box.children.length < labels.length) box.append(document.createElement('div'));
  [...box.children].forEach((el, i) => { el.hidden = !labels[i]; if (labels[i]) { el.textContent = labels[i].text; el.className = labels[i].cls; } });
  const n = ui.mode === 'room' ? bad.items.size : 0;
  $('#hud').innerHTML = n ? `<span class="chip bad">겹침·막힘 ${n}</span>`
    : gizmo.object ? `<div class="seg">${[['translate', '이동'], ['rotate', '회전']].map(([v, t]) => `<button data-a="gmode" data-v="${v}"${v === gizmo.mode ? ' class="on"' : ''}>${t}</button>`).join('')}</div>` : ''; // 고른 부품을 끌 때: 화살표(이동) / 고리(회전)
  world.updateMatrixWorld(true); // 다음 프레임을 그리기 전에 눌러도 새 물체가 잡히게
  invalidate();
}

let dirty = false;
const v3 = new THREE.Vector3();
function invalidate() { if (!dirty) { dirty = true; requestAnimationFrame(render); } }
function render() {
  dirty = false;
  const plan = ui.view === 'plan', r = proj.room, c = camera.position, w = stage.clientWidth, h = stage.clientHeight;
  const inside = { N: c.z > 0, S: c.z < r.d, W: c.x > 0, E: c.x < r.w }; // 카메라 쪽 벽은 숨겨 안이 보이게
  for (const m of world.children) if (m.userData.wall) m.visible = plan ? !m.userData.top : inside[m.userData.wall];
  renderer.render(scene, camera);
  labels.forEach((l, i) => {
    const el = $('#labels').children[i]; v3.copy(l.v).project(camera);
    el.hidden = Math.abs(v3.z) > 1; el.style.transform = `translate(-50%,-50%) translate(${(v3.x + 1) / 2 * w}px,${(1 - v3.y) / 2 * h}px)`;
  });
}
controls.addEventListener('change', invalidate); gizmo.addEventListener('change', invalidate);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  gizmo.setSize(Math.min(2, Math.max(.8, 600 / h))); // 화살표·고리는 화면 높이에 비례해 그려지므로, 낮은 화면(휴대폰)에서도 손가락으로 잡히게 약 70px로 맞춘다
  persp.aspect = w / h; persp.updateProjectionMatrix();
  Object.assign(ortho, { left: -orthoH * w / h, right: orthoH * w / h, top: orthoH, bottom: -orthoH }); ortho.updateProjectionMatrix();
  invalidate();
}
function fit() {
  const d = curDef(), b = ui.mode === 'room' ? { x0: 0, x1: proj.room.w, z0: 0, z1: proj.room.d, y1: proj.room.h } : M.bounds(d ? M.partsOf(d) : []);
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0, D = b.z1 - b.z0, a = stage.clientWidth / stage.clientHeight || 1;
  if (ui.view === 'plan') {
    orthoH = Math.max(D / 2, W / 2 / a) * 1.15 + 250; ortho.zoom = 1;
    controls.target.set(cx, 0, cz); ortho.position.set(cx, 50000, cz);
  } else {
    const half = Math.atan(Math.tan(persp.fov * M.DEG / 2) * Math.min(1, a)), dist = Math.hypot(W, D, b.y1) / 2 / Math.sin(half) * 1.25;
    controls.target.set(cx, b.y1 / 3, cz); persp.position.set(cx + dist * .45, b.y1 / 3 + dist * .6, cz + dist * .66);
  }
  resize(); controls.update();
}
function setView() { // 평면 = 바로 위에서 보는 정사영(회전 잠금, 한 손가락 이동)
  const plan = ui.view === 'plan';
  camera = plan ? ortho : persp; controls.object = camera; gizmo.camera = camera;
  controls.enableRotate = !plan; controls.maxPolarAngle = plan ? 0 : Math.PI / 2 - .02;
  controls.touches.ONE = plan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE; controls.mouseButtons.LEFT = plan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  fit(); rebuild();
}
function go(mode, defId) { // defId: 생략 = 지금 것 유지, null = 새 가구 고르기 화면
  Object.assign(ui, { mode, sel: null, partId: null, defId: defId !== undefined ? defId : curDef() ? ui.defId : proj.library[0]?.id ?? null });
  setView(); renderPanel();
}
const scheme = matchMedia('(prefers-color-scheme: dark)');
function paint() { renderer.setClearColor(getComputedStyle(document.documentElement).getPropertyValue('--scene').trim()); invalidate(); }
scheme.addEventListener('change', paint); paint();
new ResizeObserver(resize).observe(stage);

/* ---------- 누르기·끌기 ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0)), pt = new THREE.Vector3();
function cast(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2); ray.setFromCamera(ndc, camera); }
function hitTest(e) {
  cast(e);
  const h = ray.intersectObjects(pick, true).find(h => h.object.isMesh);
  if (!h) return null;
  let o = h.object; while (o.parent !== world) o = o.parent;
  return { data: o.userData, point: h.point };
}
function place(it, x, z) { // 벽·다른 가구 가장자리가 40mm 안이면 거기에 붙이고, 아니면 격자에 맞춘다
  const s = M.shape(proj, it), g = proj.room.snap || 1;
  const others = proj.items.filter(o => o !== it).map(o => M.shape(proj, o));
  const fix = (c, lo, hi, edges) => { // lo·hi: 중심에서 양쪽 가장자리까지. 비스듬히 놓은 가구는 둘이 다를 수 있다
    let best = 40, out = Math.round((c - lo) / g) * g + lo; // 붙을 데가 없으면 왼쪽·위쪽 끝을 격자에
    for (const e of edges) for (const v of [e + lo, e - hi]) if (Math.abs(v - c) < best) { best = Math.abs(v - c); out = v; } // 자석이 격자보다 먼저: 격자에 걸려 오른쪽·아래쪽 벽을 놓치지 않게
    return out;
  };
  return [fix(x, it.x - s.minx, s.maxx - it.x, [0, proj.room.w, ...others.flatMap(o => [o.minx, o.maxx])]), fix(z, it.z - s.minz, s.maxz - it.z, [0, proj.room.d, ...others.flatMap(o => [o.minz, o.maxz])])];
}

// 터치는 "고른 가구만 끌린다"(화면 돌리기와 헷갈리지 않게), 마우스는 바로 끈다. capture라 OrbitControls보다 먼저 판단한다
let down = null, drag = null, gz = 0;
canvas.addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  down = { x: e.clientX, y: e.clientY };
  if (ui.mode !== 'room') return;
  const h = hitTest(e), id = h?.data.item;
  if (!id || !(e.pointerType === 'mouse' ? e.button === 0 : ui.sel?.id === id)) return;
  const it = proj.items.find(i => i.id === id);
  plane.constant = -h.point.y; // 잡은 높이의 수평면 위에서 끌어야 손가락을 그대로 따라온다
  drag = { it, dx: it.x - h.point.x, dz: it.z - h.point.z, moved: false };
  controls.enabled = false; canvas.setPointerCapture(e.pointerId);
}, true);
canvas.addEventListener('pointermove', e => {
  if (!drag || !e.isPrimary) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) return;
    drag.moved = true; snap(); ui.sel = { type: 'item', id: drag.it.id };
  }
  cast(e);
  if (!ray.ray.intersectPlane(plane, pt)) return;
  [drag.it.x, drag.it.z] = place(drag.it, pt.x + drag.dx, pt.z + drag.dz);
  rebuild();
});
function up(e) {
  if (!down || !e.isPrimary) return;
  const tap = e.type === 'pointerup' && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5, was = drag;
  down = drag = null;
  if (was) { controls.enabled = true; if (was.moved) return refresh(); }
  if (gz) { gz = 0; return; } // 방금 화살표(gizmo)를 눌렀다
  if (!tap) return;
  const h = hitTest(e);
  if (ui.mode === 'room') ui.sel = h ? { type: 'item', id: h.data.item } : null; else ui.partId = h?.data.part ?? null;
  rebuild(); renderPanel();
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
// iOS: 캔버스를 길게 누르면 사파리가 자체 제스처로 받아 그다음 첫 탭을 삼킨다. 기본 처리를 꺼도 포인터 이벤트는 그대로 온다
canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

// 설계 화면: 고른 부품을 축 화살표로 끌기. 다른 부품의 면이 8mm 안이면 붙는다
gizmo.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
gizmo.addEventListener('mouseDown', () => { gz = 1; });
gizmo.addEventListener('objectChange', () => {
  const p = selPart(), m = gizmo.object, e = M.ext(p).e, others = curDef().parts.filter(q => q !== p).map(M.ext); // 돌린 부품은 감싸는 상자의 면으로 붙인다
  if (gz === 1) { gz = 2; snap(); }
  if (gizmo.mode === 'rotate') { for (const k of 'xyz') p['r' + k] = Math.round(m.rotation[k] / M.DEG); return; } // mesh.rotation도 오일러 XYZ라 그대로 읽는다
  ['x', 'y', 'z'].forEach((k, i) => {
    const half = [p.w, p.h, p.d][i] / 2;
    let c = m.position[k];
    if (Math.round(c - half) !== p[k]) for (const q of others) for (const face of [q.c[i] - q.e[i], q.c[i] + q.e[i]]) for (const t of [face + e[i], face - e[i]]) if (Math.abs(t - c) <= 8) c = t;
    p[k] = Math.round(c - half); if (k === 'y') p.y = Math.max(0, p.y);
    m.position[k] = p[k] + half;
  });
});
gizmo.addEventListener('mouseUp', () => { if (gz === 2) refresh(); });

/* ---------- 패널 ---------- */
const WALLS = [['N', '위쪽 벽'], ['S', '아래쪽 벽'], ['W', '왼쪽 벽'], ['E', '오른쪽 벽']];
const fld = (label, f, v, unit = 'mm', min = 0) => `<label class="fld"><span>${label}</span><input type="number" inputmode="numeric" data-f="${f}" value="${v}" min="${min}"><em>${unit}</em></label>`;
const text = (label, f, v) => `<label class="fld"><span>${label}</span><input type="text" data-f="${f}" value="${esc(v)}" maxlength="60"></label>`;
const sel = (label, f, v, opts) => `<label class="fld"><span>${label}</span><select data-f="${f}">${opts.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const colorFld = (label, f, v) => `<div class="fld wide"><span>${label}</span><div class="sw">${M.COLORS.map(([n, c]) => `<button title="${n}" aria-label="${n}" style="background:${c}" data-a="set" data-f="${f}" data-v="${c}"${c === v ? ' class="on"' : ''}></button>`).join('')}<input type="color" data-f="${f}" value="${v}" aria-label="${label} 색 직접 고르기"></div></div>`;
const btn = (label, a, attrs = '', cls = '') => `<button class="btn ${cls}" data-a="${a}" ${attrs}>${label}</button>`;
const tabs = (k, list) => `<nav class="tabs">${list.map(([v, t]) => `<button data-a="tab" data-k="${k}" data-v="${v}"${v === ui[k] ? ' class="on"' : ''}>${t}</button>`).join('')}</nav>`;
const head = (title, sub, why) => `<div class="head"><h2>${esc(title)}</h2><small>${sub}</small>${why ? `<span class="pill bad">${why}</span>` : ''}<button class="x" data-a="desel" aria-label="선택 해제">✕</button></div>`;

function roomPanel() {
  const it = selItem(), o = selOpen(), { room } = proj;
  if (it) {
    const d = M.defOf(proj, it), s = M.shape(proj, it);
    return `${head(d.name, size(s.b) + ' mm', bad.items.get(it.id))}
      <div class="row">${[[90, '↺ 90°'], [15, '↺ 15°'], [-15, '↻ 15°'], [-90, '↻ 90°']].map(([v, t]) => btn(t, 'rot', `data-v="${v}"`)).join('')}</div>
      <div class="grid">${fld('왼쪽 벽에서', 'item.left', Math.round(s.minx), 'mm', '')}${fld('위쪽 벽에서', 'item.top', Math.round(s.minz), 'mm', '')}${fld('회전', 'item.rot', it.rot, '°', -360)}</div>
      <div class="row">${btn('복제', 'dup')}${btn('설계 수정', 'mode', `data-v="design" data-id="${esc(d.id)}"`)}${btn('삭제', 'del', '', 'danger')}</div>`;
  }
  if (o) {
    const door = o.type === 'door', horiz = 'NS'.includes(o.wall), ends = horiz ? ['왼쪽', '오른쪽'] : ['위쪽', '아래쪽'];
    return `${head(door ? '문' : '창문', `${fmt(o.w)} × ${fmt(o.h)} mm`, bad.doors.has(o.id) && '가구에 막힘')}
      <div class="grid">${sel('벽 (평면도 기준)', 'open.wall', o.wall, WALLS)}${fld(`${ends[0]} 모서리에서`, 'open.pos', o.pos)}${fld('폭', 'open.w', o.w)}${fld('높이', 'open.h', o.h)}
      ${door ? sel('경첩', 'open.hinge', o.hinge, [['a', ends[0]], ['b', ends[1]]]) + sel('열림', 'open.swing', o.swing, [['in', '방 안쪽으로'], ['out', '바깥쪽·미닫이']]) : fld('바닥에서', 'open.sill', o.sill)}</div>
      <div class="row">${btn('삭제', 'del', '', 'danger')}</div>`;
  }
  return tabs('tab', [['add', '가구'], ['room', '방'], ['open', '문·창문']]) + {
    add: () => `<div class="cards">${proj.library.map(d => `<div class="card"><button data-a="add" data-id="${esc(d.id)}"><b>${esc(d.name)}</b><small>${size(M.bounds(M.partsOf(d)))}</small></button><button class="mini" data-a="mode" data-v="design" data-id="${esc(d.id)}">설계</button></div>`).join('')}
      <div class="card new"><button data-a="newDefUI">＋ 새 가구</button></div></div>
      <p class="hint">가구 목록은 모든 방이 함께 씁니다(설계를 고치면 다른 방에 놓인 것도 바뀝니다). 가구를 누르면 방의 빈자리에 놓입니다. 놓인 가구는 눌러서 고른 뒤 끌어 옮깁니다(마우스는 바로 끌기).</p>`,
    room: () => `<div class="grid">${text('방 이름', 'proj.name', proj.name)}${fld('가로', 'room.w', room.w)}${fld('세로', 'room.d', room.d)}${fld('천장 높이', 'room.h', room.h)}
      ${sel('끌기 격자', 'room.snap', String(room.snap), [['0', '없음'], ['10', '10 mm'], ['50', '50 mm'], ['100', '100 mm']])}${colorFld('벽', 'room.wall', room.wall)}${colorFld('바닥', 'room.floor', room.floor)}</div>`,
    open: () => `${proj.openings.length ? `<div class="list">${proj.openings.map(o => `<button data-a="pick" data-id="${esc(o.id)}"><span>${o.type === 'door' ? '문' : '창문'} · ${WALLS.find(w => w[0] === o.wall)[1]}</span><small>${fmt(o.w)} × ${fmt(o.h)}</small></button>`).join('')}</div>` : '<p class="hint">아직 문이나 창문이 없습니다.</p>'}
      <div class="row">${btn('＋ 문', 'addOpen', 'data-v="door"')}${btn('＋ 창문', 'addOpen', 'data-v="window"')}</div>
      <p class="hint">안쪽으로 열리는 문은 열림 궤적 안에 가구가 있으면 경고합니다.</p>`,
  }[ui.tab]();
}
function designPanel() {
  const d = curDef();
  if (!d) return `<h2>새 가구</h2><div class="cards">${Object.entries(M.KINDS).map(([k, v]) => `<div class="card"><button data-a="newDef" data-v="${k}"><b>${v.label}</b><small>치수로 만들기</small></button></div>`).join('')}
    <div class="card"><button data-a="newDef" data-v="custom"><b>직접 만들기</b><small>부품을 하나씩</small></button></div></div>${proj.library.length ? `<div class="row">${btn('취소', 'mode', 'data-v="design"')}</div>` : ''}`;
  const parts = M.partsOf(d), custom = d.kind === 'custom', used = store.projects.reduce((n, r) => n + r.items.filter(i => i.def === d.id).length, 0), p = selPart();
  const partList = `<div class="list">${parts.map(q => `<button data-a="pickPart" data-id="${esc(q.id)}"${q.id === ui.partId ? ' class="on"' : ''}><i class="dot" style="background:${q.color}"></i><span>${esc(q.name)}</span><small>${q.w} × ${q.d} × ${q.h}</small></button>`).join('')}</div>`;
  const edit = custom
    ? `${partList}<div class="row">${btn('＋ 부품', 'addPart')}${p ? btn('복제', 'dupPart') + btn('삭제', 'delPart', '', 'danger') : ''}</div>
      ${p ? `<div class="grid">${text('부품 이름', 'part.name', p.name)}${fld('가로', 'part.w', p.w, 'mm', 1)}${fld('깊이', 'part.d', p.d, 'mm', 1)}${fld('높이', 'part.h', p.h, 'mm', 1)}
        ${fld('왼쪽에서 x', 'part.x', p.x, 'mm', '')}${fld('바닥에서 y', 'part.y', p.y)}${fld('뒤에서 z', 'part.z', p.z, 'mm', '')}
        ${fld('앞뒤 기울기', 'part.rx', p.rx, '°', -180)}${fld('수평 회전', 'part.ry', p.ry, '°', -180)}${fld('좌우 기울기', 'part.rz', p.rz, '°', -180)}${colorFld('재료', 'part.color', p.color)}</div>
        <div class="row"><span class="hint">90° 돌리기</span>${[['wd', '가로↔깊이'], ['wh', '가로↔높이'], ['dh', '깊이↔높이']].map(([v, t]) => btn(t, 'turnPart', `data-v="${v}"`)).join('')}</div>
        <p class="hint">화면의 화살표를 끌어도 옮겨집니다. 다른 부품의 면 가까이 가면 붙습니다. 화면 왼쪽 위에서 '회전'으로 바꾸면 고리를 끌어 5° 단위로 돌립니다(부품 중심 기준).</p>` : '<p class="hint">부품을 누르면 치수와 위치를 고칠 수 있습니다.</p>'}`
    : `<div class="grid">${(pv => M.KINDS[d.kind].fields.map(f => (f.color ? colorFld(f.label, 'param.' + f.k, pv[f.k]) : fld(f.label, 'param.' + f.k, pv[f.k], f.unit, f.min))).join(''))(M.paramsOf(d))}</div>
      <p class="hint">부품 ${parts.length}개가 치수에서 자동으로 만들어집니다. 부품을 하나씩 고치려면 직접 편집으로 바꾸세요. 바꾼 뒤에는 치수 폼을 쓸 수 없습니다(되돌리기는 가능).</p>
      <div class="row">${btn('부품 직접 편집으로 전환', 'toCustom')}</div>`;
  const cut = () => { const { rows, area } = M.cutList(parts); return `<table class="cut"><tr><th>부품</th><th>길이</th><th>폭</th><th>두께</th><th>수량</th></tr>
    ${rows.map(r => `<tr><td><i class="dot" style="background:${r.color}"></i>${esc(r.name)}</td><td>${r.L}</td><td>${r.W}</td><td>${r.T}</td><td>${r.n}</td></tr>`).join('')}</table>
    <p class="hint">두께 40mm 이하 판재 면적 ${area.toFixed(2)} m². 톱날 두께·여유분은 넣지 않았고, 손잡이·매트리스·방석은 뺐습니다.</p><div class="row">${btn('CSV로 저장', 'csv')}</div>`; };
  return `<div class="grid">${sel('가구', 'ui.defId', d.id, proj.library.map(x => [x.id, x.name]))}${text('이름', 'def.name', d.name)}</div>
    <div class="row">${btn('방에 놓기', 'place', '', 'pri')}${btn('＋ 새 가구', 'newDefUI')}${btn('복제', 'dupDef')}${btn(used ? `삭제 (모든 방에 놓인 ${used}개도)` : '삭제', 'delDef', '', 'danger')}</div>
    ${tabs('dtab', [['edit', custom ? '부품' : '치수'], ['cut', '재단 목록']])}${ui.dtab === 'cut' ? cut() : edit}`;
}
let panelRaf = 0;
function renderPanel() { // 다음 프레임에 그린다: Tab으로 옮겨 간 포커스를 잃지 않게
  cancelAnimationFrame(panelRaf);
  panelRaf = requestAnimationFrame(() => {
    const body = $('#pbody'), a = document.activeElement, f = body.contains(a) && a.matches('input,select') && a.dataset.f, top = body.scrollTop;
    body.innerHTML = ui.mode === 'room' ? roomPanel() : designPanel();
    body.scrollTop = top;
    if (f) body.querySelector(`:is(input,select)[data-f="${f}"]`)?.focus();
    document.querySelectorAll('header [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === ui[b.dataset.a]));
    $('[data-a=undo]').disabled = !hist.undo.length; $('[data-a=redo]').disabled = !hist.redo.length;
    document.title = `${proj.name} — FunModel`;
  });
}

/* ---------- 동작 ---------- */
const SET = { // data-f="범위.키" 입력이 바뀌면 호출 (v: 숫자로 읽히면 숫자, raw: 원문)
  proj: (k, v, raw) => { proj.name = raw; },
  room: (k, v) => { proj.room[k] = v; },
  open: (k, v) => { selOpen()[k] = v; },
  item: (k, v) => { const it = selItem(), s = M.shape(proj, it); if (k === 'rot') it.rot = v; else if (k === 'left') it.x += v - s.minx; else it.z += v - s.minz; },
  def: (k, v, raw) => { curDef().name = raw; },
  param: (k, v) => { const d = curDef(); d.params = { ...d.params, [k]: v }; },
  part: (k, v, raw) => { selPart()[k] = k === 'name' ? raw : v; },
};
function apply(f, raw) {
  const [s, k] = f.split('.');
  if (s === 'ui') { ui[k] = raw; ui.partId = null; fit(); rebuild(); return renderPanel(); }
  commit(() => SET[s](k, raw.trim() !== '' && isFinite(raw) ? +raw : raw, raw));
}
function freeSpot(it) { // 방 가운데에서 가까운 순으로 100mm 격자를 훑어 처음 나오는 빈자리
  const s = M.shape(proj, it), { w, d } = proj.room, chk = M.checker(proj), c = [];
  for (let x = it.x - s.minx; x <= w - (s.maxx - it.x); x += 100) for (let z = it.z - s.minz; z <= d - (s.maxz - it.z); z += 100) c.push([x, z]);
  c.sort((a, b) => Math.hypot(a[0] - w / 2, a[1] - d / 2) - Math.hypot(b[0] - w / 2, b[1] - d / 2));
  const spot = c.find(([x, z]) => !chk({ ...it, x, z }).why);
  if (!spot) toast('빈자리가 없어 가운데에 놓았습니다');
  return spot || [w / 2, d / 2];
}
function addItem(base) {
  commit(() => { const it = { ...base, id: M.uid() }; [it.x, it.z] = freeSpot(it); proj.items.push(it); ui.sel = { type: 'item', id: it.id }; });
}
function openProject(p) {
  flush(); proj = p; hist.undo = []; hist.redo = [];
  setProj(M.sanitize({ ...p, library: store.library })); // 공용 가구 목록을 붙인다. 그 사이 지워진 가구는 이 방에서도 빠진다
  go('room', null); save();
}
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name.replace(/[\\/:*?"<>|\s]+/g, '_'); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function planPNG() { // 평면도는 장면을 찍지 않고 모델에서 바로 2D로 그린다
  const { room } = proj, k = 1600 / (room.w + 2 * M.WT), pad = 110, cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.width = 1600 + 2 * pad; cv.height = Math.round((room.d + 2 * M.WT) * k) + 2 * pad;
  const X = x => pad + (x + M.WT) * k, Z = z => pad + (z + M.WT) * k;
  const path = pts => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); };
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = room.floor; g.fillRect(X(0), Z(0), room.w * k, room.d * k);
  for (const b of M.wallBoxes(room, proj.openings)) {
    if (b.kind === 'top' || (b.kind === 'wall' && b.h < room.h)) continue; // 개구부 위·아래 조각은 뺀다
    g.fillStyle = b.kind === 'glass' ? '#7db7d8' : '#3a424b'; g.fillRect(X(b.x), Z(b.z), b.w * k, b.d * k);
  }
  g.lineWidth = 2; g.strokeStyle = '#3a424b'; g.setLineDash([8, 6]);
  for (const o of proj.openings) if (o.type === 'door') { path(M.doorZone(room, o)); g.stroke(); }
  g.setLineDash([]); g.textAlign = 'center'; g.textBaseline = 'middle';
  const shapes = proj.items.map(it => [M.defOf(proj, it), M.shape(proj, it), it]).sort((a, b) => a[1].y1 - b[1].y1); // 낮은 것(러그)부터
  for (const [d, s] of shapes) { path(s.poly); g.fillStyle = M.partsOf(d)[0]?.color || '#ccc'; g.fill(); g.stroke(); }
  g.lineJoin = 'round';
  for (const [d, s, it] of shapes) for (const [t, dy, font] of [[d.name, -12, '600 22px system-ui, sans-serif'], [`${fmt(s.b.W)} × ${fmt(s.b.D)}`, 14, '18px system-ui, sans-serif']]) {
    g.font = font; g.lineWidth = 5; g.strokeStyle = '#fff'; g.fillStyle = '#111';
    g.strokeText(t, X(it.x), Z(it.z) + dy); g.fillText(t, X(it.x), Z(it.z) + dy);
  }
  g.font = '24px system-ui, sans-serif'; g.fillText(fmt(room.w), X(room.w / 2), pad / 2);
  g.save(); g.translate(pad / 2, Z(room.d / 2)); g.rotate(-Math.PI / 2); g.fillText(fmt(room.d), 0, 0); g.restore();
  g.textAlign = 'left'; g.fillText(`${proj.name} · 단위 mm`, pad, cv.height - pad / 2);
  cv.toBlob(b => download(proj.name + '.png', b));
}

const menu = $('#menu'), designDef = () => (ui.mode === 'design' ? curDef() : undefined);
const ACT = {
  mode: d => go(d.v, d.id),
  view: d => { ui.view = d.v; setView(); renderPanel(); },
  tab: d => { ui[d.k] = d.v; renderPanel(); },
  fit, undo: () => travel(hist.undo, hist.redo), redo: () => travel(hist.redo, hist.undo),
  fold: () => document.body.classList.toggle('folded'),
  set: d => apply(d.f, d.v),
  desel: () => { ui.sel = null; ui.partId = null; rebuild(); renderPanel(); },
  pick: d => { ui.sel = { type: 'open', id: d.id }; rebuild(); renderPanel(); },
  // 방
  add: d => addItem({ def: d.id, x: 0, z: 0, rot: 0 }),
  dup: () => addItem(selItem()),
  rot: d => commit(() => { selItem().rot += +d.v; }),
  del: () => commit(() => { proj.items = proj.items.filter(i => i.id !== ui.sel.id); proj.openings = proj.openings.filter(o => o.id !== ui.sel.id); }),
  addOpen: d => commit(() => { const o = M.fixOpening(proj.room, { type: d.v, wall: 'N', pos: (proj.room.w - 900) / 2 }); proj.openings.push(o); ui.sel = { type: 'open', id: o.id }; }),
  // 가구 설계
  newDefUI: () => go('design', null),
  newDef: d => { commit(() => {
    const def = d.v === 'custom' ? { id: M.uid(), name: '새 가구', kind: 'custom', parts: [M.part({ name: '판재', w: 600, d: 300, h: 18 })] } : { id: M.uid(), name: M.KINDS[d.v].label, kind: d.v, params: {} };
    proj.library.push(def); ui.defId = def.id; ui.dtab = 'edit';
  }); fit(); },
  dupDef: () => commit(() => { const d = JSON.parse(JSON.stringify(curDef())); d.id = M.uid(); d.name += ' 복사'; proj.library.push(d); ui.defId = d.id; }),
  delDef: () => { commit(() => { const id = ui.defId; proj.items = proj.items.filter(i => i.def !== id); proj.library = proj.library.filter(d => d.id !== id); ui.defId = proj.library[0]?.id ?? null; ui.partId = null; }); fit(); },
  toCustom: () => commit(() => { const d = curDef(); d.parts = M.partsOf(d).map(p => M.part({ ...p, id: M.uid() })); d.kind = 'custom'; delete d.params; }),
  place: () => { const def = ui.defId; go('room'); addItem({ def, x: 0, z: 0, rot: 0 }); },
  pickPart: d => { ui.partId = d.id; rebuild(); renderPanel(); },
  gmode: d => { gizmo.setMode(d.v); rebuild(); },
  addPart: () => commit(() => { const d = curDef(), p = M.part({ name: '판재', w: 600, d: 300, h: 18, y: d.parts.length ? M.bounds(d.parts).y1 : 0 }); d.parts.push(p); ui.partId = p.id; }),
  dupPart: () => commit(() => { const p = M.part({ ...selPart(), id: M.uid(), x: selPart().x + 50 }); curDef().parts.push(p); ui.partId = p.id; }),
  turnPart: d => commit(() => { const p = selPart(), [a, b] = d.v; [p[a], p[b]] = [p[b], p[a]]; }), // 90° 회전 = 두 치수 맞바꾸기. 최소 모서리는 그대로
  delPart: () => commit(() => { const d = curDef(); d.parts = d.parts.filter(p => p.id !== ui.partId); ui.partId = null; }),
  // 메뉴: 방 목록, 내보내기
  menu: () => {
    const d = designDef();
    menu.innerHTML = `<div><h3>방</h3><div class="list">${store.projects.map(p => `<button data-a="proj" data-id="${esc(p.id)}"${p === proj ? ' class="on"' : ''}><span>${esc(p.name)}</span><small>${fmt(p.room.w)} × ${fmt(p.room.d)}</small></button>`).join('')}</div>
      <div class="row">${btn('＋ 새 방', 'newProj')}${btn('이 방 복제', 'dupProj')}${btn('이 방 삭제', 'delProj', '', 'danger')}</div>
      <h3>내보내기 — ${d ? esc(d.name) : '방 전체'}</h3><div class="row">${btn('SketchUp용 3D (.dae)', 'dae')}${d ? btn('재단 목록 (.csv)', 'csv') : btn('평면도 (.png)', 'png')}</div>
      <h3>백업 — 이 방과 가구 목록</h3><div class="row">${btn('파일로 저장 (.json)', 'json')}${btn('파일에서 불러오기', 'import')}</div></div>`;
    menu.showModal();
  },
  proj: d => openProject(store.projects.find(p => p.id === d.id)),
  newProj: () => { const p = M.newProject(`방 ${store.projects.length + 1}`, false, store.library); store.projects.push(p); openProject(p); },
  dupProj: () => { const p = M.sanitize({ ...JSON.parse(JSON.stringify(proj)), id: M.uid(), name: proj.name + ' 복사' }); store.projects.push(p); openProject(p); },
  delProj: () => {
    if (!confirm(`"${proj.name}" 방을 지울까요? 되돌릴 수 없습니다.`)) return;
    store.projects.splice(store.projects.indexOf(proj), 1);
    if (!store.projects.length) store.projects.push(M.newProject('방 1', false, store.library));
    openProject(store.projects[0]);
  },
  dae: () => { const d = designDef(); download((d || proj).name + '.dae', M.toDAE(M.exportNodes(proj, d)), 'model/vnd.collada+xml'); },
  csv: () => { const d = curDef(); download(d.name + ' 재단목록.csv', '﻿' + M.cutCSV(M.cutList(M.partsOf(d)).rows), 'text/csv'); }, // BOM: 엑셀 한글
  png: planPNG,
  json: () => download(proj.name + '.json', JSON.stringify(proj, null, 1), 'application/json'),
  import: () => $('#file').click(),
};
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el) ACT[el.dataset.a]?.(el.dataset); });
menu.addEventListener('click', e => { if (e.target === menu || e.target.closest('[data-a]')) menu.close(); }); // 바깥을 누르거나 항목을 고르면 닫힘
$('#pbody').addEventListener('change', e => {
  const el = e.target, f = el.dataset.f;
  if (!f) return;
  if (el.type === 'number' && !Number.isFinite(el.valueAsNumber)) return renderPanel(); // 빈 칸은 원래 값으로
  apply(f, el.value);
});
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let p = null;
  try { if (f.size < 2e6) p = M.sanitize(JSON.parse(await f.text())); } catch { /* 아래에서 알림 */ }
  if (!p) return toast('읽을 수 없는 파일입니다');
  M.adopt(store.library, p); p.id = M.uid(); store.projects.push(p); openProject(p); toast(`"${p.name}" 방을 불러왔습니다`);
});
addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea') || menu.open) return;
  const k = e.key.toLowerCase(), it = selItem();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? ACT.redo() : ACT.undo(); }
  if (k === 'escape') return ACT.desel();
  if (k === 'delete' || k === 'backspace') return ui.sel ? ACT.del() : selPart() && ACT.delPart();
  if (!it) return;
  if (k === 'r') ACT.rot({ v: e.shiftKey ? -90 : 90 });
  const step = e.shiftKey ? 100 : 10, move = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
  if (move) { e.preventDefault(); commit(() => { it.x += move[0]; it.z += move[1]; }); }
});

setView(); renderPanel();
window.app = { M, ui, store, get proj() { return proj; }, get camera() { return camera; } }; // 콘솔 디버깅용
