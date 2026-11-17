// 화면: 상태·되돌리기, three.js 장면, 끌기, 패널, 내보내기, 저장. 계산은 model.js에 있다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as M from './model.js';
import { CATALOG, CATS } from './catalog.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const fmt = v => Math.round(v).toLocaleString('ko-KR');
const size = b => `${fmt(b.W)} × ${fmt(b.D)} × ${fmt(b.H)}`;

/* ---------- 상태 ---------- */
const KEY = 'funmodel-v2'; // v2: 가구 목록(library)이 방 밖에 하나. v1(방마다 목록)은 읽어서 합치고 원본은 그대로 둔다
let locked = false; // 더 새 앱이 쓴 저장본: 예시로 시작하되 덮어쓰지 않게 저장을 막는다
let fresh = false; // 저장본이 전혀 없음: 첫 화면(#start)에서 고르기 전까지 저장하지 않는다
function load() {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('funmodel-v1');
    fresh = raw === null;
    const r = M.readStore(JSON.parse(raw));
    if (r?.newer) locked = true; else if (r) return r;
  } catch { /* 저장본이 없거나 깨졌으면 예시로 시작 */ }
  if (!locked) try { const raw = localStorage.getItem(KEY); if (raw) localStorage.setItem(KEY + '-bad', raw); } catch { /* 못 옮겨도 시작은 한다 */ } // 예시로 덮어쓰기 전에 원문을 남긴다
  const p = M.newProject('침실 예시', true);
  return { library: p.library, projects: [p], cut: M.cutOpts() };
}
const store = load();
if (locked) window.fmBar?.('지금은 저장되지 않습니다', '이 저장본은 더 새 버전에서 만들었습니다. 새로 고침하세요(예전 화면이 캐시에 남았을 수 있습니다).', true); // index.html의 오류 안내 막대
// 공유 링크(#room=)로 열면 받은 방을 읽기 전용으로 보여 준다(viewing). store에는 넣지 않고 저장도 하지 않는다.
// 최상위 await: 풀기가 끝난 뒤에 화면을 처음 만드니 내 방이 먼저 그려지거나 그 사이 편집이 끼어들 일이 없다
const shareHash = location.hash.startsWith('#room='), shared = shareHash ? await M.decodeShare(location.hash.slice(6)) : null;
let viewing = shared?.room ? shared : null;
let proj = viewing || store.projects.find(p => p.id === store.cur) || store.projects[0];
const ui = { mode: 'room', view: '3d', tab: 'add', dtab: 'edit', sel: null, defId: null, partId: null, q: '', cat: '전체', pick: null }; // q: 가구 검색어, cat: 가구 탭의 분류, pick: 밑그림 점 찍기 { kind: 'scale' | 'origin', pts }
const hist = { undo: [], redo: [] };
let bad = { items: new Map(), doors: new Set() };

const curDef = () => proj.library.find(d => d.id === ui.defId);
const selItem = () => (ui.sel?.type === 'item' ? proj.items.find(i => i.id === ui.sel.id) : null);
const selOpen = () => (ui.sel?.type === 'open' ? proj.openings.find(o => o.id === ui.sel.id) : null);
const selBlock = () => (ui.sel?.type === 'block' ? proj.blocks.find(b => b.id === ui.sel.id) : null);
const selPiece = () => (ui.sel?.type === 'part' && proj.room.parts.length > 1 ? proj.room.parts.find(p => p.id === ui.sel.id) : null); // 방 조각. 하나뿐이면 늘 (0,0)·방 치수라 고를 것이 없다
const selPart = () => { const d = curDef(); return d?.kind === 'custom' ? d.parts.find(p => p.id === ui.partId) : null; };

function setProj(p) { if (!viewing) { store.projects[store.projects.indexOf(proj)] = p; store.cur = p.id; store.library = p.library; } proj = p; } // 지금 방의 library가 곧 공용 가구 목록(보기 방의 library는 그 방 것)
// shortcut: 스냅숏마다 밑그림(data URL, 수백 KB)까지 복사된다(최대 60개), 메모리가 문제 되면 bg를 되돌리기 기록 밖에 둔다
function snap() { hist.undo.push(JSON.stringify(proj)); if (hist.undo.length > 60) hist.undo.shift(); hist.redo = []; }
function commit(fn) { if (viewing) return; snap(); fn(); refresh(); }
function travel(from, to) { if (!from.length || viewing) return; to.push(JSON.stringify(proj)); setProj(JSON.parse(from.pop())); refresh(); }
function refresh() { // 모든 변경 뒤: 값 범위를 다시 맞추고(sanitize) 장면·패널·저장을 갱신
  setProj(M.sanitize(proj));
  if (ui.sel && !selItem() && !selOpen() && !selBlock() && !selPiece()) ui.sel = null;
  if (!proj.bg) ui.pick = null;
  rebuild(); renderPanel(); save();
}

let saveT = 0, toastT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(flush, 400); }
function flush() {
  clearTimeout(saveT);
  if (locked || fresh || viewing) return;
  try { localStorage.setItem(KEY, M.dumpStore(store)); } catch { toast('저장하지 못했습니다. 브라우저 저장 공간을 확인하세요'); }
}
addEventListener('pagehide', flush);
function toast(msg, undo) { // undo: 주면 [되돌리기] 버튼을 달고 8초 보여 준다. 사라지면 잊는다
  const el = $('#toast'), b = undo && document.createElement('button');
  el.textContent = msg;
  if (b) { b.textContent = '되돌리기'; b.onclick = () => { el.classList.remove('show'); b.onclick = null; undo(); }; el.append(b); }
  el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => { el.classList.remove('show'); if (b) b.onclick = null; }, b ? 8000 : 2600);
}

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
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // 밑그림 판: 그림 위쪽이 −z(평면도 위)
let bgTex = null, bgSrc = ''; // 밑그림 텍스처는 src 하나만 캐시(장면을 다시 만들 때마다 디코드하지 않게)
const L = { edge: line(0x1b222a, { transparent: true, opacity: .4 }), door: line(0x5d6976), sel: line(0x2f7df6, { depthTest: false }), dim: line(0xb86e00, { depthTest: false }), bad: line(0xc42f2f, { depthTest: false }), none: line(0, { visible: false }) };

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
  for (const c of M.cells(room).inn) world.add(box({ x: c.x - M.WT, y: -50, z: c.z - M.WT, w: c.w + 2 * M.WT, h: 50, d: c.d + 2 * M.WT }, room.floor, room.parts.length > 1 ? L.none : L.edge)); // 벽 밑까지. 조각이 여럿이면 겹치는 판의 테두리가 바닥에 보이지 않게
  if (selPiece()) world.add(outline({ ...selPiece(), y: 0, h: room.h }, L.sel));
  if (proj.bg) { // 바닥 바로 위, 가구·러그 아래
    const g = proj.bg, h = g.w * g.ar;
    if (bgSrc !== g.src) { bgTex?.dispose(); bgSrc = g.src; bgTex = new THREE.TextureLoader().load(g.src, invalidate); bgTex.colorSpace = THREE.SRGBColorSpace; }
    const m = new THREE.Mesh(FLAT, new THREE.MeshBasicMaterial({ map: bgTex, transparent: true, opacity: g.op, depthWrite: false }));
    m.scale.set(g.w, 1, h); m.position.set(g.x + g.w / 2, 2, g.z + h / 2); tmp.push(m.material); world.add(m);
  }
  if (ui.pick?.pts.length) { const [x, z] = ui.pick.pts[0]; dimPts.push(x - 150, 5, z, x + 150, 5, z, x, 5, z - 150, x, 5, z + 150); } // 찍은 첫째 점
  for (const b of M.wallBoxes(room, proj.openings, proj.blocks)) { const m = box(b, b.kind === 'glass' ? GLASS : room.wall); m.userData = { wall: b.wall, top: b.kind === 'top' }; world.add(m); if (b.kind === 'block' && b.id === selBlock()?.id) world.add(outline(b, L.sel)); } // 기둥(block)은 wall이 없어 늘 보인다
  for (const o of proj.openings) {
    const on = ui.sel?.id === o.id;
    if (o.type === 'door') { // 바닥에 문 열림 궤적
      const l = new THREE.LineLoop(geom(M.doorZone(o).flatMap(([x, z]) => [x, 4, z])), bad.doors.has(o.id) ? L.bad : on ? L.sel : L.door);
      l.renderOrder = 9; world.add(l);
    }
    if (on) world.add(outline(M.spanBox(o, o.pos, o.pos + o.w, -M.WT, 0, o.sill, o.sill + o.h), L.sel));
  }
  for (const it of proj.items) {
    const d = M.defOf(proj, it), parts = M.partsOf(d), b = M.bounds(parts), g = new THREE.Group(), on = ui.sel?.id === it.id, why = bad.items.get(it.id);
    g.position.set(it.x, it.y, it.z); g.rotation.y = it.rot * M.DEG; g.userData.item = it.id;
    for (const p of parts) g.add(box({ ...p, x: p.x - b.cx, z: p.z - b.cz }, p.color));
    if (on || why) g.add(outline({ x: -b.W / 2 - 5, y: 0, z: -b.D / 2 - 5, w: b.W + 10, h: b.y1 + 5, d: b.D + 10 }, why ? L.bad : L.sel));
    world.add(g); pick.push(g);
    if (ui.view === 'plan') labels.push({ v: new THREE.Vector3(it.x, it.y + b.y1, it.z), text: d.name, cls: 'name' });
    if (on) { // 선택한 가구에서 네 벽까지 거리, 문·서랍을 여는 데 드는 바닥(막히면 빨강)
      for (const z of M.openZones(proj, it)) { const l = new THREE.LineLoop(geom(z.poly.flatMap(([x, v]) => [x, 4, v])), z.blocked ? L.bad : L.door); l.renderOrder = 9; world.add(l); }
      const s = M.shape(proj, it), y = 5, r = M.reach(room, it.x, it.z); // 가구 중심을 지나는 가로·세로 선이 닿는 벽까지
      dim([r.x0, y, it.z], [s.minx, y, it.z]); dim([s.maxx, y, it.z], [r.x1, y, it.z]); dim([it.x, y, r.z0], [it.x, y, s.minz]); dim([it.x, y, s.maxz], [it.x, y, r.z1]);
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
  const pk = ui.pick && (ui.pick.kind === 'origin' ? '그림 속 방의 왼쪽 위 모서리를 찍으세요' : ui.pick.pts.length ? '둘째 점을 찍으세요' : '첫째 점을 찍으세요');
  $('#hud').innerHTML = pk ? `<span class="chip pick">${pk}</span> <button class="btn" data-a="desel">취소</button>` : n ? `<span class="chip bad">겹침·막힘 ${n}</span>`
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
  Object.assign(ui, { mode, sel: null, partId: null, pick: null, defId: defId !== undefined ? defId : curDef() ? ui.defId : proj.library[0]?.id ?? null });
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
function place(it, x, z) { // 벽·다른 가구·기둥 가장자리가 40mm 안이면 거기에 붙이고, 아니면 격자에 맞춘다
  const s = M.shape(proj, it), g = proj.room.snap || 1;
  const others = proj.items.filter(o => o !== it).map(o => M.shape(proj, o)), sg = M.segs(proj.room), wx = sg.filter(s => 'WE'.includes(s.wall)).map(s => s.at), wz = sg.filter(s => 'NS'.includes(s.wall)).map(s => s.at); // 모든 벽 선
  const fix = (c, lo, hi, edges) => { // lo·hi: 중심에서 양쪽 가장자리까지. 비스듬히 놓은 가구는 둘이 다를 수 있다
    let best = 40, out = Math.round((c - lo) / g) * g + lo; // 붙을 데가 없으면 왼쪽·위쪽 끝을 격자에
    for (const e of edges) for (const v of [e + lo, e - hi]) if (Math.abs(v - c) < best) { best = Math.abs(v - c); out = v; } // 자석이 격자보다 먼저: 격자에 걸려 오른쪽·아래쪽 벽을 놓치지 않게
    return out;
  };
  return [fix(x, it.x - s.minx, s.maxx - it.x, [...wx, ...others.flatMap(o => [o.minx, o.maxx]), ...proj.blocks.flatMap(b => [b.x, b.x + b.w])]), fix(z, it.z - s.minz, s.maxz - it.z, [...wz, ...others.flatMap(o => [o.minz, o.maxz]), ...proj.blocks.flatMap(b => [b.z, b.z + b.d])])];
}

// 터치는 "고른 가구만 끌린다"(화면 돌리기와 헷갈리지 않게), 마우스는 바로 끈다. capture라 OrbitControls보다 먼저 판단한다
let down = null, drag = null, gz = 0;
canvas.addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  down = { x: e.clientX, y: e.clientY };
  if (ui.mode !== 'room' || viewing || ui.pick) return; // 점 찍기 중에는 가구를 끌지 않는다(화면 이동·확대는 된다)
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
  if (!tap || viewing) return;
  if (ui.pick) return pickAt(e);
  const h = hitTest(e);
  if (ui.mode === 'room') ui.sel = h ? { type: 'item', id: h.data.item } : null; else if (ui.mode === 'design') ui.partId = h?.data.part ?? null; // 가구 관리 화면은 미리보기만
  rebuild(); renderPanel();
}
function pickAt(e) { // 밑그림 점 찍기: 누른 곳과 바닥(y = 0)의 교점
  cast(e); plane.constant = 0;
  if (!ray.ray.intersectPlane(plane, pt)) return;
  const p = [pt.x, pt.z], k = ui.pick;
  if (k.kind === 'scale' && !k.pts.length) { k.pts.push(p); return rebuild(); }
  ui.pick = null;
  if (k.kind === 'origin') return commit(() => { proj.bg = M.bgMove(proj.bg, p); });
  const dist = +String(prompt('두 점 사이의 실제 거리(mm)') ?? '').replace(/,/g, '');
  if (dist > 0) commit(() => { proj.bg = M.bgScale(proj.bg, k.pts[0], p, dist); }); else rebuild();
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
const WALLS = { N: '위쪽 벽', S: '아래쪽 벽', W: '왼쪽 벽', E: '오른쪽 벽' };
const wallName = (sg, s) => WALLS[s.wall] + (sg.filter(x => x.wall === s.wall).length > 1 ? ` · ${fmt(s.s0)}~${fmt(s.s1)}` : ''); // 같은 방향 벽이 여럿이면 구간을 붙인다
const segOf = o => { const sg = M.segs(proj.room); return [sg, sg.findIndex(s => M.onSeg(s, o))]; };
const fld = (label, f, v, unit = 'mm', min = 0) => `<label class="fld"><span>${label}</span><input type="number" inputmode="numeric" data-f="${f}" value="${v}" min="${min}"><em>${unit}</em></label>`;
const text = (label, f, v) => `<label class="fld"><span>${label}</span><input type="text" data-f="${f}" value="${esc(v)}" maxlength="60"></label>`;
const sel = (label, f, v, opts) => `<label class="fld"><span>${label}</span><select data-f="${f}">${opts.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const colorFld = (label, f, v) => `<div class="fld wide"><span>${label}</span><div class="sw">${M.COLORS.map(([n, c]) => `<button title="${n}" aria-label="${n}" style="background:${c}" data-a="set" data-f="${f}" data-v="${c}"${c === v ? ' class="on"' : ''}></button>`).join('')}<input type="color" data-f="${f}" value="${v}" aria-label="${label} 색 직접 고르기"></div></div>`;
const btn = (label, a, attrs = '', cls = '') => `<button class="btn ${cls}" data-a="${a}" ${attrs}>${label}</button>`;
const tabs = (k, list, cls = 'tabs') => `<nav class="${cls}">${list.map(([v, t]) => `<button data-a="tab" data-k="${k}" data-v="${v}"${v === ui[k] ? ' class="on"' : ''}>${t}</button>`).join('')}</nav>`;
const head = (title, sub, why) => `<div class="head"><h2>${esc(title)}</h2><small>${sub}</small>${why ? `<span class="pill bad">${why}</span>` : ''}<button class="x" data-a="desel" aria-label="선택 해제">✕</button></div>`;

// 가구 검색: 글자마다 [data-n](소문자 이름)을 숨기기만 하고 패널은 다시 그리지 않는다(입력 포커스·한글 조합이 끊기지 않게). 다시 그린 뒤에도 같은 필터를 건다
const search = '<input type="search" class="q" placeholder="가구 이름 검색" aria-label="가구 이름 검색" maxlength="60">';
function filterQ() {
  const q = ui.q.trim().toLowerCase(), body = $('#pbody'), box = body.querySelector('.q');
  if (box && box.value !== ui.q) box.value = ui.q; // 다시 그린 입력에만(입력 중 값을 건드리면 한글 조합이 끊긴다)
  body.querySelectorAll('[data-n]').forEach(el => { el.hidden = !el.dataset.n.includes(q); });
  body.querySelectorAll('.grp').forEach(g => { g.hidden = !g.querySelector('[data-n]:not([hidden])'); }); // 비게 된 분류 소제목도 숨긴다
}
function roomPanel() {
  const it = selItem(), o = selOpen(), bl = selBlock(), pc = selPiece(), { room } = proj;
  if (it) {
    const d = M.defOf(proj, it), s = M.shape(proj, it);
    return `${head(d.name, size(s.b) + ' mm', bad.items.get(it.id) || (M.openZones(proj, it).some(z => z.blocked) && '열림 막힘'))}
      <div class="row">${[[90, '↺ 90°'], [15, '↺ 15°'], [-15, '↻ 15°'], [-90, '↻ 90°']].map(([v, t]) => btn(t, 'rot', `data-v="${v}"`)).join('')}</div>
      <div class="grid">${fld('왼쪽 벽에서', 'item.left', Math.round(s.minx), 'mm', '')}${fld('위쪽 벽에서', 'item.top', Math.round(s.minz), 'mm', '')}${fld('회전', 'item.rot', it.rot, '°', -360)}${fld('바닥에서', 'item.y', it.y)}</div>
      <div class="row">${btn('아래 가구 위에 올리기', 'onTop')}${btn('복제', 'dup')}${btn('설계 수정', 'mode', `data-v="design" data-id="${esc(d.id)}"`)}${btn('삭제', 'del', '', 'danger')}</div>`;
  }
  if (o) {
    const door = o.type === 'door', horiz = 'NS'.includes(o.wall), ends = horiz ? ['왼쪽', '오른쪽'] : ['위쪽', '아래쪽'];
    return `${head(door ? '문' : '창문', `${fmt(o.w)} × ${fmt(o.h)} mm`, bad.doors.has(o.id) && '가구에 막힘')}
      <div class="grid">${(([sg, i]) => sel('벽 (평면도 기준)', 'open.wall', String(i), sg.map((s, j) => [String(j), wallName(sg, s)])))(segOf(o))}${fld(`${ends[0]} 모서리에서`, 'open.pos', o.pos)}${fld('폭', 'open.w', o.w)}${fld('높이', 'open.h', o.h)}
      ${door ? sel('경첩', 'open.hinge', o.hinge, [['a', ends[0]], ['b', ends[1]]]) + sel('열림', 'open.swing', o.swing, [['in', '방 안쪽으로'], ['out', '바깥쪽·미닫이']]) : fld('바닥에서', 'open.sill', o.sill)}</div>
      <div class="row">${btn('삭제', 'del', '', 'danger')}</div>`;
  }
  if (pc) return `${head(`조각 ${room.parts.indexOf(pc) + 1}`, `${fmt(pc.w)} × ${fmt(pc.d)} mm`)}
      <div class="grid">${fld('왼쪽에서', 'piece.x', pc.x)}${fld('위에서', 'piece.z', pc.z)}${fld('가로', 'piece.w', pc.w, 'mm', 500)}${fld('세로', 'piece.d', pc.d, 'mm', 500)}</div>
      <div class="row">${btn('삭제', 'del', '', 'danger')}</div><p class="hint">조각을 옮겨도 가구는 따라가지 않습니다.</p>`;
  if (bl) return `${head('기둥·붙박이', `${fmt(bl.w)} × ${fmt(bl.d)} × ${fmt(bl.h)} mm`)}
      <div class="grid">${fld('왼쪽 벽에서', 'block.x', bl.x)}${fld('위쪽 벽에서', 'block.z', bl.z)}${fld('가로', 'block.w', bl.w, 'mm', 50)}${fld('세로', 'block.d', bl.d, 'mm', 50)}${fld('높이', 'block.h', bl.h, 'mm', 50)}</div>
      <div class="row">${btn('삭제', 'del', '', 'danger')}</div>`;
  return tabs('tab', [['add', '가구'], ['room', '방'], ['open', '문·창문·기둥']]) + {
    add: () => `${search}${tabs('cat', ['전체', '내 가구', ...CATS].map(c => [c, c]), 'chips')}
      ${['전체', '내 가구'].includes(ui.cat) ? `<div class="grp"><h3>내 가구</h3><div class="cards">${proj.library.map(d => `<div class="card" data-n="${esc(d.name.toLowerCase())}"><button data-a="add" data-id="${esc(d.id)}"><b>${esc(d.name)}</b><small>${size(M.bounds(M.partsOf(d)))}</small></button><button class="mini" data-a="mode" data-v="design" data-id="${esc(d.id)}">설계</button></div>`).join('')}
      <div class="card new" data-n=""><button data-a="newDefUI">＋ 새 가구</button></div></div></div>` : ''}
      ${CATS.filter(c => ui.cat === '전체' || ui.cat === c).map(c => `<div class="grp"><h3>${c}</h3><div class="cards">${CATALOG.map((e, i) => e.cat === c && !M.findDef(proj.library, e) ? `<div class="card" data-n="${esc(e.name.toLowerCase())}"><button data-a="addCat" data-i="${i}"><b>${esc(e.name)}</b><small>${size(M.bounds(M.partsOf(e)))}</small></button></div>` : '').join('')}</div></div>`).join('')}
      <p class="hint">가구 목록은 모든 방이 함께 씁니다(설계를 고치면 다른 방에 놓인 것도 바뀝니다). 가구를 누르면 방의 빈자리에 놓입니다. 놓인 가구는 눌러서 고른 뒤 끌어 옮깁니다(마우스는 바로 끌기).</p>
      <p class="hint">규격 가구는 대표 치수입니다. 놓은 뒤 '설계 수정'에서 실제 제품 치수로 고치세요.</p>`,
    room: () => `<div class="grid">${text('방 이름', 'proj.name', proj.name)}${room.parts.length > 1 ? '' : fld('가로', 'room.w', room.w) + fld('세로', 'room.d', room.d)}${fld('천장 높이', 'room.h', room.h)}
      ${sel('끌기 격자', 'room.snap', String(room.snap), [['0', '없음'], ['10', '10 mm'], ['50', '50 mm'], ['100', '100 mm']])}${colorFld('벽', 'room.wall', room.wall)}${colorFld('바닥', 'room.floor', room.floor)}</div>
      ${room.parts.length > 1 ? `<h3>방 조각</h3><div class="list">${room.parts.map((p, i) => `<button data-a="pick" data-t="part" data-id="${esc(p.id)}"><span>조각 ${i + 1}</span><small>${fmt(p.w)} × ${fmt(p.d)}</small></button>`).join('')}</div>` : ''}
      <div class="row">${btn('＋ 방 조각 더하기 (ㄱ자·ㄷ자 방)', 'addPiece')}</div>
      <p class="hint">조각을 겹치거나 맞붙이면 한 방으로 이어지고, 벽은 바깥 둘레에만 생깁니다. 조각을 옮겨도 가구는 따라가지 않습니다.</p>
      <h3>밑그림</h3>${(g => g ? `<div class="grid">${fld('그림 가로(실제)', 'bg.w', Math.round(g.w), 'mm', 100)}${fld('왼쪽에서', 'bg.x', Math.round(g.x), 'mm', '')}${fld('위에서', 'bg.z', Math.round(g.z), 'mm', '')}${sel('진하기', 'bg.op', String(g.op), [.2, .4, .6, .8, 1].map(v => [String(v), v * 100 + '%']))}</div>
      <div class="row">${btn('두 점으로 축척 맞추기', 'pickBg', 'data-v="scale"')}${btn('방 모서리 맞추기', 'pickBg', 'data-v="origin"')}${btn('밑그림 지우기', 'bgDel', '', 'danger')}</div>
      <p class="hint">그림에서 길이를 아는 벽의 양 끝을 찍고 실제 길이를 넣으면 축척이 맞습니다. 그다음 그림 속 이 방의 왼쪽 위 안쪽 모서리를 찍으면 위치가 맞습니다. 방 치수는 '방' 탭의 가로·세로로 그림에 맞추세요.</p>` : '')(proj.bg)}
      <div class="row">${btn('평면도 그림 불러오기', 'bgLoad')}</div>`,
    open: () => `${proj.openings.length || proj.blocks.length ? `<div class="list">${proj.openings.map(o => `<button data-a="pick" data-t="open" data-id="${esc(o.id)}"><span>${o.type === 'door' ? '문' : '창문'} · ${(([sg, i]) => wallName(sg, sg[i]))(segOf(o))}</span><small>${fmt(o.w)} × ${fmt(o.h)}</small></button>`).join('')}${proj.blocks.map(b => `<button data-a="pick" data-t="block" data-id="${esc(b.id)}"><span>기둥·붙박이</span><small>${fmt(b.w)} × ${fmt(b.d)}</small></button>`).join('')}</div>` : '<p class="hint">아직 문·창문·기둥이 없습니다.</p>'}
      <div class="row">${btn('＋ 문', 'addOpen', 'data-v="door"')}${btn('＋ 창문', 'addOpen', 'data-v="window"')}${btn('＋ 기둥·붙박이', 'addBlock')}</div>
      <p class="hint">안쪽으로 열리는 문은 열림 궤적 안에 가구가 있으면 경고합니다.</p>
      <p class="hint">가구는 기둥과 겹치면 경고합니다. ㄱ자·ㄷ자 방은 '방' 탭에서 방 조각을 더하세요.</p>`,
  }[ui.tab]();
}
const usedN = id => store.projects.reduce((n, r) => n + r.items.filter(i => i.def === id).length, 0); // 모든 방에 놓인 개수
function libPanel() { // 가구 관리: 방과 상관없이 공용 가구 목록만 다룬다. 고른 가구는 화면에 미리보기로 뜬다
  const d = curDef(), n = d && usedN(d.id);
  return `<div class="head"><h2>가구 관리</h2><small>${proj.library.length}개 · 모든 방이 함께 씁니다</small></div>
    ${d ? `<div class="grid">${text('이름', 'def.name', d.name)}</div>
    <div class="row">${btn('설계 수정', 'mode', 'data-v="design"', 'pri')}${btn('방에 놓기', 'place')}${btn('복제', 'dupDef')}${btn(n ? `삭제 (모든 방에 놓인 ${n}개도)` : '삭제', 'delDef', '', 'danger')}</div>` : ''}
    ${search}<div class="list">${proj.library.map(x => { const u = usedN(x.id); return `<button data-n="${esc(x.name.toLowerCase())}" data-a="set" data-f="ui.defId" data-v="${esc(x.id)}"${x === d ? ' class="on"' : ''}><i class="dot" style="background:${M.partsOf(x)[0]?.color || '#ccc'}"></i><span>${esc(x.name)}</span><small>${size(M.bounds(M.partsOf(x)))}${u ? ` · ${u}개 놓임` : ''}</small></button>`; }).join('')}</div>
    <div class="row">${btn('＋ 새 가구', 'newDefUI')}${btn('가구만 내보내기 (.json)', 'lib')}${btn('가구 파일 불러오기', 'import')}</div>
    <p class="hint">가구만 내보낸 파일에는 방이 들어가지 않습니다. 불러오면 목록에 없는 가구만 더해집니다.</p>`;
}
function designPanel() {
  const d = curDef();
  if (!d) return `<h2>새 가구</h2><div class="cards">${Object.entries(M.KINDS).map(([k, v]) => `<div class="card"><button data-a="newDef" data-v="${k}"><b>${v.label}</b><small>치수로 만들기</small></button></div>`).join('')}
    <div class="card"><button data-a="newDef" data-v="custom"><b>직접 만들기</b><small>부품을 하나씩</small></button></div></div>${proj.library.length ? `<div class="row">${btn('취소', 'mode', 'data-v="design"')}</div>` : ''}`;
  const parts = M.partsOf(d), custom = d.kind === 'custom', used = usedN(d.id), p = selPart();
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
  const cut = () => { const { rows, area } = M.cutList(parts), buy = M.buyList(parts), groups = M.nest(rows, store.cut); return `<table class="cut"><tr><th>부품</th><th>길이</th><th>폭</th><th>두께</th><th>수량</th></tr>
    ${rows.map(r => `<tr><td><i class="dot" style="background:${r.color}"></i>${esc(r.name)}</td><td>${r.L}</td><td>${r.W}</td><td>${r.T}</td><td>${r.n}</td></tr>`).join('')}</table>
    ${buy.length ? `<table class="cut"><tr><th>구매품</th><th>규격</th><th>수량</th></tr>${buy.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.spec)}</td><td>${r.n}</td></tr>`).join('')}</table>` : ''}
    <p class="hint">두께 40mm 이하 판재 면적 ${area.toFixed(2)} m². 원판 가장자리 다듬는 여유는 넣지 않았고, 손잡이·매트리스·방석은 구매 목록으로 뺐습니다. 경첩 수는 문 높이 기준 어림입니다.</p><div class="row">${btn('CSV로 저장', 'csv')}</div>
    <div class="grid">${fld('원판 길이', 'cut.L', store.cut.L, 'mm', 300)}${fld('원판 폭', 'cut.W', store.cut.W, 'mm', 300)}${fld('톱날 두께', 'cut.kerf', store.cut.kerf)}</div>
    ${groups.map(g => `<p class="hint">${g.T}mm ${esc(M.colorName(g.color))} — 원판 ${g.sheets.length}장${g.over.length ? ` · 원판보다 큰 조각 ${g.over.length}개는 뺌` : ''}</p>`).join('')}
    ${groups.some(g => g.sheets.length) ? `<div class="nest">${M.nestSVG(groups, store.cut)}</div><div class="row">${btn('배치도 저장 (.svg)', 'nestSvg')}</div>` : ''}`; };
  return `<div class="grid">${sel('가구', 'ui.defId', d.id, proj.library.map(x => [x.id, x.name]))}${text('이름', 'def.name', d.name)}</div>
    <div class="row">${btn('방에 놓기', 'place', '', 'pri')}${btn('＋ 새 가구', 'newDefUI')}${btn('복제', 'dupDef')}${btn(used ? `삭제 (모든 방에 놓인 ${used}개도)` : '삭제', 'delDef', '', 'danger')}</div>
    ${tabs('dtab', [['edit', custom ? '부품' : '치수'], ['cut', '재단 목록']])}${ui.dtab === 'cut' ? cut() : edit}`;
}
let panelRaf = 0;
function renderPanel() { // 다음 프레임에 그린다: Tab으로 옮겨 간 포커스를 잃지 않게
  cancelAnimationFrame(panelRaf);
  panelRaf = requestAnimationFrame(() => {
    const body = $('#pbody'), a = document.activeElement, f = body.contains(a) && a.matches('input,select') && a.dataset.f, top = body.scrollTop;
    body.innerHTML = { room: roomPanel, lib: libPanel, design: designPanel }[ui.mode]();
    filterQ(); body.scrollTop = top;
    if (f) body.querySelector(`:is(input,select)[data-f="${f}"]`)?.focus();
    document.querySelectorAll('header [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === ui[b.dataset.a]));
    $('[data-a=undo]').disabled = !hist.undo.length; $('[data-a=redo]').disabled = !hist.redo.length;
    document.title = `${proj.name} — FunModel`; $('#pname').textContent = proj.name;
  });
}

/* ---------- 동작 ---------- */
const SET = { // data-f="범위.키" 입력이 바뀌면 호출 (v: 숫자로 읽히면 숫자, raw: 원문)
  proj: (k, v, raw) => { proj.name = raw; },
  room: (k, v) => { proj.room[k] = v; },
  open: (k, v) => { const o = selOpen(), s = k === 'wall' && M.segs(proj.room)[v]; if (s) Object.assign(o, { wall: s.wall, at: s.at, pos: Math.max(s.s0, Math.min(o.pos, s.s1 - o.w)) }); else o[k] = v; }, // 벽: segs 순번. pos를 그 구간으로 옮겨야 같은 줄의 다른 구간으로 돌아가지 않는다
  block: (k, v) => { selBlock()[k] = v; },
  piece: (k, v) => { selPiece()[k] = v; },
  bg: (k, v) => { proj.bg[k] = v; },
  item: (k, v) => { const it = selItem(), s = M.shape(proj, it); if (k === 'rot' || k === 'y') it[k] = v; else if (k === 'left') it.x += v - s.minx; else it.z += v - s.minz; },
  def: (k, v, raw) => { curDef().name = raw; },
  param: (k, v) => { const d = curDef(); d.params = { ...d.params, [k]: v }; },
  part: (k, v, raw) => { selPart()[k] = k === 'name' ? raw : v; },
};
function apply(f, raw) {
  const [s, k] = f.split('.');
  if (s === 'ui') { ui[k] = raw; ui.partId = null; fit(); rebuild(); return renderPanel(); }
  if (s === 'cut') { store.cut = M.cutOpts({ ...store.cut, [k]: raw }); save(); return renderPanel(); } // 공구 설정: 되돌리기 대상이 아니다
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
function addItem(base) { // base가 함수면 commit 안에서 부른다(규격 가구를 목록에 넣는 것까지 되돌리기 한 번에)
  commit(() => { const it = { ...(typeof base === 'function' ? base() : base), id: M.uid() }; [it.x, it.z] = freeSpot(it); proj.items.push(it); ui.sel = { type: 'item', id: it.id }; });
}
function openProject(p) {
  flush(); proj = p; hist.undo = []; hist.redo = [];
  setProj(M.sanitize({ ...p, library: store.library })); // 공용 가구 목록을 붙인다. 그 사이 지워진 가구는 이 방에서도 빠진다
  go('room', null); save();
}
function addProject(p) { M.adopt(store.library, p); p.id = M.uid(); store.projects.push(p); openProject(p); } // 받은 방 하나(파일·공유 링크)를 내 방으로
function endView() { viewing = null; document.body.classList.remove('viewing'); history.replaceState(null, '', location.pathname + location.search); } // 해시를 지운다(location.hash를 바꾸면 hashchange로 새로 고침된다)
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name.replace(/[\\/:*?"<>|\s]+/g, '_'); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function planPNG() { // 평면도 SVG(인쇄와 같은 그림)를 가로 1600px 그림으로. width·height가 없는 SVG는 Firefox가 캔버스에 그리지 않는다
  const s = M.planSVG(proj), W = 1600, [, , w, h] = s.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), H = Math.round(W * h / w), img = new Image();
  img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H); cv.toBlob(b => download(proj.name + '.png', b)); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.replace('<svg ', `<svg width="${W}" height="${H}" `));
}
function shot() { // 지금 화면(3D·평면)을 PNG 파일로. 선택 표시를 빼고 그린 직후 같은 작업 안에서 읽는다(preserveDrawingBuffer 꺼짐). #labels(DOM 이름표)는 안 찍힌다
  const was = ui.sel; ui.sel = null; rebuild(); render();
  const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
  ui.sel = was; rebuild();
  return new File([Uint8Array.from(bin, ch => ch.charCodeAt(0))], 'FunModel.png', { type: 'image/png' });
}
let link; // 공유 링크: 내보내기 대화상자를 열 때 미리 만든다(압축이 비동기라. 클립보드는 누른 그 자리에서 써야 Safari가 받는다). undefined = 만드는 중, null = 못 만듦

const menu = $('#menu'), designDef = () => (ui.mode !== 'room' ? curDef() : undefined);
const ACT = {
  mode: d => go(d.v, d.id),
  view: d => { ui.view = d.v; setView(); renderPanel(); },
  tab: d => { ui[d.k] = d.v; renderPanel(); },
  fit, undo: () => travel(hist.undo, hist.redo), redo: () => travel(hist.redo, hist.undo),
  fold: () => document.body.classList.toggle('folded'),
  set: d => apply(d.f, d.v),
  desel: () => { ui.sel = null; ui.partId = null; ui.pick = null; rebuild(); renderPanel(); }, // 밑그림 점 찍기 [취소]·Esc도 여기
  pick: d => { ui.sel = { type: d.t, id: d.id }; rebuild(); renderPanel(); }, // t: open | block | part(방 조각)
  // 방
  add: d => addItem({ def: d.id, x: 0, z: 0, rot: 0 }),
  addCat: d => addItem(() => ({ def: M.useDef(proj.library, CATALOG[d.i]).id, x: 0, z: 0, rot: 0 })), // 규격 가구: 공용 목록에 넣고(있으면 그것) 놓는다
  dup: () => addItem(selItem()),
  rot: d => commit(() => { selItem().rot += +d.v; }),
  onTop: () => commit(() => { const it = selItem(), s = M.shape(proj, it); it.y = Math.max(0, ...proj.items.filter(o => o !== it).map(o => M.shape(proj, o)).filter(t => M.overlap(s.poly, t.poly)).map(t => t.y1)); }), // 발자국이 겹치는 가구 중 가장 높은 윗면으로
  del: () => commit(() => {
    const id = ui.sel.id, r = proj.room, pc = selPiece();
    proj.items = proj.items.filter(i => i.id !== id); proj.openings = proj.openings.filter(o => o.id !== id); proj.blocks = proj.blocks.filter(b => b.id !== id);
    if (pc) { r.parts = r.parts.filter(p => p !== pc); if (r.parts.length === 1) Object.assign(r, { w: r.parts[0].w, d: r.parts[0].d }); } // 하나만 남으면 그 치수가 방 치수(조각은 (0,0)으로)
  }),
  addOpen: d => commit(() => { const s = M.segs(proj.room).find(s => s.wall === 'N'), o = M.fixOpening(proj.room, { type: d.v, wall: 'N', at: s.at, pos: (s.s0 + s.s1 - 900) / 2 }); proj.openings.push(o); ui.sel = { type: 'open', id: o.id }; }), // 첫 위쪽 벽 가운데
  addPiece: () => commit(() => { const r = proj.room, f = r.parts[0], p = { id: M.uid(), x: f.x + f.w, z: 0, w: 2000, d: 2000 }; r.parts.push(p); ui.sel = { type: 'part', id: p.id }; }), // 첫 조각 오른쪽에 맞붙여
  addBlock: () => commit(() => { const b = M.fixBlock(proj.room, { x: 200, z: 200 }); proj.blocks.push(b); ui.sel = { type: 'block', id: b.id }; }), // 400 × 400 × 방 높이
  bgLoad: () => $('#img').click(),
  pickBg: d => { Object.assign(ui, { pick: { kind: d.v, pts: [] }, sel: null }); if (ui.view === 'plan') rebuild(); else { ui.view = 'plan'; setView(); } renderPanel(); },
  bgDel: () => commit(() => { delete proj.bg; }),
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
  // 헤더의 두 대화상자(#menu 하나를 내용만 바꿔 쓴다): 방 목록, 내보내기·백업
  rooms: () => {
    menu.innerHTML = `<div><h3>방</h3><div class="list">${store.projects.map(p => `<button data-a="proj" data-id="${esc(p.id)}"${p === proj ? ' class="on"' : ''}><span>${esc(p.name)}</span><small>${fmt(p.room.w)} × ${fmt(p.room.d)}</small></button>`).join('')}</div>
      <div class="row">${btn('＋ 새 방', 'newProj')}${btn('이 방 복제', 'dupProj')}${btn('이 방 삭제', 'delProj', '', 'danger')}</div></div>`;
    menu.showModal();
  },
  exports: () => {
    const d = designDef();
    if (!d) { link = undefined; M.encodeShare(proj).then(s => { link = s && `${location.origin}${location.pathname}#room=${s}`; }); }
    menu.innerHTML = `<div><h3>내보내기 — ${d ? esc(d.name) : '방 전체'}</h3><div class="row">${btn('SketchUp용 3D (.dae)', 'dae')}${d ? btn('재단 목록 (.csv)', 'csv') + btn('도면 (.svg)', 'svg')
      : btn('평면도 (.png)', 'png') + btn('평면도 인쇄·PDF', 'print') + btn('화면 이미지 (.png)', 'shot') + (navigator.canShare?.({ files: [new File([''], 'a.png', { type: 'image/png' })] }) ? btn('화면 이미지 공유', 'shotShare') : '')}</div>
      ${d ? '' : `<p class="hint">PDF는 인쇄 대화상자에서 'PDF로 저장'을 고르세요.</p>
      <h3>공유</h3><div class="row">${btn('공유 링크 복사', 'share', '', 'pri')}</div><p class="hint">링크에 방 내용이 그대로 들어 있습니다(서버에 올라가지 않음). 고친 뒤에는 링크를 다시 만드세요.</p>`}
      <h3>백업</h3><div class="row">${btn('이 방만 저장 (.json)', 'json')}${btn('전체 백업 (.json)', 'backup')}${btn('파일에서 불러오기', 'import')}</div>
      <p class="hint">이 방만 저장하면 그 방과 가구 목록이, 전체 백업에는 모든 방이 들어갑니다. 전체 백업을 불러오면 지우지 않고 없는 방만 더합니다.</p>
      <a class="hint" href="https://github.com/nangchang/FunModel/issues" target="_blank" rel="noopener">의견·오류 알리기</a></div>`;
    menu.showModal();
  },
  proj: d => openProject(store.projects.find(p => p.id === d.id)),
  newProj: () => { const p = M.newProject(`방 ${store.projects.length + 1}`, false, store.library); store.projects.push(p); openProject(p); },
  dupProj: () => { const p = M.sanitize({ ...JSON.parse(JSON.stringify(proj)), id: M.uid(), name: proj.name + ' 복사' }); store.projects.push(p); openProject(p); },
  delProj: () => { // 바로 지우고 알림에서 되돌린다. 지운 방은 알림이 떠 있는 동안 메모리에만 있다
    const gone = proj, i = store.projects.indexOf(gone), auto = store.projects.length === 1 && M.newProject('방 1', false, store.library);
    store.projects.splice(i, 1);
    if (auto) store.projects.push(auto);
    openProject(store.projects[0]);
    toast(`"${gone.name}" 방을 지웠습니다`, () => {
      const a = auto && store.projects.find(p => p.id === auto.id); // 방은 바뀔 때마다 새 객체(sanitize)라 id로 찾는다
      if (a && !a.items.length && !a.openings.length) store.projects.splice(store.projects.indexOf(a), 1); // 저절로 생긴 빈 '방 1'은 같이 없앤다
      store.projects.splice(Math.min(i, store.projects.length), 0, gone); openProject(gone);
    });
  },
  start: () => { // 첫 화면 "이 치수로 시작": 예시 방을 빼고 그 치수의 빈 방으로(공용 가구 목록은 그대로). 값 범위는 sanitize가 맞춘다
    const v = k => { const el = $(`#start [name=${k}]`); return el.value || el.defaultValue; }, p = M.newProject('내 방', false, store.library); // 빈 칸은 보이던 기본값으로
    Object.assign(p.room, { w: v('w'), d: v('d'), h: v('h') }); store.projects = [p]; openProject(p); fresh = false;
    toast('문·창문·기둥 탭에서 문과 창을 넣어 보세요');
  },
  dae: () => { const d = designDef(); download((d || proj).name + '.dae', M.toDAE(M.exportNodes(proj, d)), 'model/vnd.collada+xml'); },
  csv: () => { const d = curDef(); download(d.name + ' 재단목록.csv', '﻿' + M.cutCSV(M.cutList(M.partsOf(d)).rows, M.buyList(M.partsOf(d))), 'text/csv'); }, // BOM: 엑셀 한글
  nestSvg: () => { const d = curDef(); download(d.name + ' 판재배치.svg', M.nestSVG(M.nest(M.cutList(M.partsOf(d)).rows, store.cut), store.cut), 'image/svg+xml'); },
  svg: () => { const d = curDef(); download(d.name + ' 도면.svg', M.drawingSVG(d), 'image/svg+xml'); },
  png: planPNG,
  print: () => { $('#print').innerHTML = M.planSVG(proj); window.print(); }, // 인쇄 화면에는 #print만 보인다(style.css). 끝나면 afterprint에서 비운다
  shot: () => download(proj.name + ' 화면.png', shot()),
  shotShare: () => navigator.share({ files: [shot()], title: proj.name }).catch(e => { if (e.name !== 'AbortError') toast('공유하지 못했습니다'); }), // 취소는 조용히
  share: () => {
    if (link === undefined) return toast('링크를 만드는 중입니다. 다시 눌러 주세요');
    if (!link) return toast('이 브라우저에서는 공유 링크를 만들 수 없습니다');
    const long = link.length > 8000 ? '. 링크가 길어 일부 메신저에서 잘릴 수 있습니다' : '', url = link, ask = () => prompt('링크를 복사하세요', url);
    if (!navigator.clipboard) return ask();
    navigator.clipboard.writeText(url).then(() => toast('링크를 복사했습니다. 받은 사람은 설치·가입 없이 봅니다' + long), ask);
  },
  // 공유받은 방(읽기 전용) 막대
  copyShared: () => { const p = viewing; endView(); if (fresh) { store.projects = []; fresh = false; } addProject(p); toast(`"${p.name}" 방을 내 방으로 복사했습니다`); }, // 저장본이 없던 사람은 예시 방 대신 받은 방만
  closeShared: () => { endView(); openProject(store.projects.find(p => p.id === store.cur) || store.projects[0]); if (fresh) $('#start').showModal(); },
  json: () => download(proj.name + '.json', JSON.stringify(proj, null, 1), 'application/json'),
  backup: () => download(`FunModel 전체 백업 ${new Date().toLocaleDateString('sv')}.json`, locked ? localStorage.getItem(KEY) : M.dumpStore(store), 'application/json'), // sv = 지역 날짜 YYYY-MM-DD. 저장본과 같은 내용(잠겼으면 화면의 예시가 아니라 저장본 원문)
  lib: () => download('가구 목록.json', JSON.stringify({ library: proj.library }, null, 1), 'application/json'), // 방 없이 가구만
  import: () => $('#file').click(),
};
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el) ACT[el.dataset.a]?.(el.dataset); });
menu.addEventListener('click', e => { if (e.target === menu || e.target.closest('[data-a]')) menu.close(); }); // 바깥을 누르거나 항목을 고르면 닫힘
$('#pbody').addEventListener('input', e => { if (e.target.matches('.q')) { ui.q = e.target.value; filterQ(); } }); // 검색은 data-f·apply를 타지 않는다
$('#start').addEventListener('close', () => { fresh = false; save(); }); // 첫 화면: 어느 쪽으로 닫든 고른 것이니 그때부터 저장한다
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
  let p = null, lib = false, all = null;
  try {
    if (f.size < 2e7) {
      const raw = JSON.parse(await f.text());
      if (raw.v > M.VER) return toast('더 새 버전에서 만든 파일입니다');
      if (Array.isArray(raw.projects)) all = M.readStore(raw); // 전체 백업
      else { lib = !raw.room && Array.isArray(raw.library); p = M.sanitize(lib ? { room: {}, library: raw.library } : raw); }
    }
  } catch { /* 아래에서 알림 */ }
  if (all) { // 지우지 않고 더한다. 되돌리기 기록은 비운다(지난 기록으로 돌아가면 새로 합친 가구가 공용 목록에서 빠진다)
    const n = M.mergeStore(store, all);
    openProject(proj);
    return toast(n ? `방 ${n}개를 불러왔습니다` : '새로 더할 방이 없습니다');
  }
  if (!p) return toast('읽을 수 없는 파일입니다');
  if (lib) { // 가구만 든 파일: 방은 만들지 않고 공용 목록에 없는 가구만 더한다(되돌리기 가능)
    const n = proj.library.length;
    commit(() => M.adopt(proj.library, p));
    return toast(proj.library.length > n ? `가구 ${proj.library.length - n}개를 불러왔습니다` : '새로 더할 가구가 없습니다');
  }
  addProject(p); toast(`"${p.name}" 방을 불러왔습니다`);
});
$('#img').addEventListener('change', e => { // 평면도 그림 → 긴 변 1600px 이하 JPEG(투명은 흰 바탕). 그래도 크면 더 줄인다
  const f = e.target.files[0], img = new Image();
  e.target.value = '';
  if (!f || viewing) return;
  img.onerror = () => { URL.revokeObjectURL(img.src); toast('읽을 수 없는 그림입니다'); };
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) return toast('읽을 수 없는 그림입니다');
    const shrink = px => { const k = Math.min(1, px / Math.max(W, H)), cv = document.createElement('canvas'), c = cv.getContext('2d'); cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k)); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', .8); };
    let px = 1600, src = shrink(px);
    while (src.length > M.BGMAX && (px = Math.round(px * .7)) >= 400) src = shrink(px);
    if (src.length > M.BGMAX) return toast('그림이 너무 큽니다');
    commit(() => { proj.bg = { src, ar: H / W, x: 0, z: 0, w: proj.room.w, op: .6 }; });
  };
  img.src = URL.createObjectURL(f);
});
addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea') || menu.open || viewing) return;
  const k = e.key.toLowerCase(), it = selItem();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? ACT.redo() : ACT.undo(); }
  if (k === 'escape') return ACT.desel();
  if (k === 'delete' || k === 'backspace') return ui.sel ? ACT.del() : selPart() && ACT.delPart();
  if (!it) return;
  if (k === 'r') ACT.rot({ v: e.shiftKey ? -90 : 90 });
  const step = e.shiftKey ? 100 : 10, move = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
  if (move) { e.preventDefault(); commit(() => { it.x += move[0]; it.z += move[1]; }); }
});

addEventListener('afterprint', () => { $('#print').innerHTML = ''; });
addEventListener('hashchange', () => location.reload()); // 열린 채로 주소창에 공유 링크를 붙여 넣었을 때
if (viewing) { document.body.classList.add('viewing'); $('#shared span').textContent = `공유받은 방 "${viewing.name}" · 읽기 전용`; } // 패널을 숨긴 뒤에 화면을 맞춘다(setView → fit)
setView(); renderPanel();
if (shareHash && !viewing) toast(shared?.newer ? '더 새 버전에서 만든 링크입니다. 새로 고침해 보세요' : '읽을 수 없는 공유 링크입니다');
if (fresh && !viewing) $('#start').showModal(); // 예시 방을 뒤에 그려 두고 그 위에 띄운다
window.app = { M, ui, store, get proj() { return proj; }, get camera() { return camera; } }; // 콘솔 디버깅용
