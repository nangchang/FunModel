// 순수 모델: 가구 생성기, 간섭 판정, 재단 목록, DAE. DOM·three.js에 기대지 않는다(node로 테스트).
// 단위 mm. 방: x→오른쪽, z→평면도 아래, y↑. 가구 로컬: 부품 x,y,z = 최소 모서리, z는 뒤(0)→앞(+).
// 배치: item.x,z = 발자국 중심, rot(도)는 y축 회전(0° = 앞면이 +z, 90° = 앞면이 +x).

export const DEG = Math.PI / 180, WT = 100; // WT: 벽 두께(방 치수 바깥쪽으로 붙는다)
export const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const num = (v, d, a, b) => clamp(v !== null && v !== '' && Number.isFinite(+v) ? Math.round(+v) : d, a, b);
const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
const str = (v, d) => String(v ?? d).slice(0, 60) || d;

const c = { ply: '#d8b98b', oak: '#b88a5b', walnut: '#6b4a34', white: '#f0eee8', gray: '#9aa1a8', black: '#2d3035', fabric: '#7f909e', linen: '#ece8de', metal: '#c8cdd2', rug: '#c5b59f' };
export const COLORS = [['자작합판', c.ply], ['오크', c.oak], ['월넛', c.walnut], ['화이트', c.white], ['그레이', c.gray], ['블랙', c.black], ['패브릭', c.fabric], ['린넨', c.linen], ['금속', c.metal], ['러그', c.rug]];

/* ---------- 가구 생성기: 치수 → 직육면체 부품 목록. hw = 재단 목록에서 빼는 부품(손잡이·쿠션), role = 문(경첩 쪽 L·R)·서랍 앞판 ---------- */
const ROLES = ['doorL', 'doorR', 'drawer'];
const P = (name, w, d, h, x, y, z, color, hw, role) => ({ name, w: Math.max(1, Math.round(w)), d: Math.max(1, Math.round(d)), h: Math.max(1, Math.round(h)), x: Math.round(x), y: Math.round(y), z: Math.round(z), color, hw, role });
const BACK = 6; // 뒷판·서랍 바닥판 두께

function carcass(p, out) { // 옆판 2 + 상·하판 + 뒷판 + 걸레받이
  const { W, D, H, C } = p, T = Math.min(p.T, Math.floor(Math.min(W, H) / 4)), pl = clamp(p.plinth, 0, H - 2 * T - 20), iw = W - 2 * T;
  out.push(P('옆판 1', T, D, H, 0, 0, 0, C), P('옆판 2', T, D, H, W - T, 0, 0, C), P('상판', iw, D, T, T, H - T, 0, C), P('하판', iw, D, T, T, pl, 0, C),
    P('뒷판', iw, BACK, H - pl - 2 * T, T, pl + T, 0, C));
  if (pl > 0) out.push(P('걸레받이', iw, T, pl, T, 0, D - T - 20, C));
  return { T, pl, iw, y0: pl + T, y1: H - T };
}
function cabinet(p) {
  const out = [], { W, D, H } = p, { T, pl, iw, y0, y1 } = carcass(p, out), g = 3;
  const gap = (y1 - y0 - p.shelves * T) / (p.shelves + 1);
  if (gap > 0) for (let i = 0; i < p.shelves; i++) out.push(P(`선반 ${i + 1}`, iw, D - BACK - 10, T, T, y0 + gap * (i + 1) + T * i, BACK, p.C));
  const n = p.doors, dw = (W - g * (n + 1)) / n, dh = H - pl - 2 * g, hh = Math.min(160, dh / 3);
  const hy = Math.min(Math.max(1000 - hh / 2, pl + g + 40), pl + g + dh - hh - 40); // 손잡이는 바닥 1m 근처, 낮은 장은 문 위쪽
  for (let i = 0; i < n; i++) {
    const x = g + i * (dw + g);
    out.push(P(`문 ${i + 1}`, dw, T, dh, x, pl + g, D, p.C2, false, i % 2 ? 'doorR' : 'doorL' /* 손잡이 반대쪽이 경첩 */), P(`손잡이 ${i + 1}`, 12, 22, hh, i % 2 ? x + 28 : x + dw - 40, hy, D + T, c.black, true));
  }
  return out;
}
function drawers(p) {
  const out = [], { W, D, H, C, C2 } = p, { T, pl, iw } = carcass(p, out), n = p.rows, g = 3, bt = 15;
  const fh = (H - pl - g * (n + 1)) / n, bw = iw - 26 /* 레일 13mm×2 */, bd = D - BACK - 20, bh = fh - 40, x = T + 13, z = D - bd;
  for (let i = 0; i < n; i++) {
    const y = pl + g + i * (fh + g), k = n - i, by = Math.max(y + 20, pl + T + 2), hw = Math.min(160, W * .3);
    out.push(P(`서랍 앞판 ${k}`, W - 2 * g, T, fh, g, y, D, C2, false, 'drawer'), P(`손잡이 ${k}`, hw, 22, 12, (W - hw) / 2, y + fh * .6, D + T, c.black, true));
    if (bw > 60 && bd > 60 && bh > 30) out.push(
      P(`서랍 옆판 ${k}`, bt, bd, bh, x, by, z, C), P(`서랍 옆판 ${k}`, bt, bd, bh, x + bw - bt, by, z, C),
      P(`서랍 앞뒤판 ${k}`, bw - 2 * bt, bt, bh, x + bt, by, z, C), P(`서랍 앞뒤판 ${k}`, bw - 2 * bt, bt, bh, x + bt, by, D - bt, C),
      P(`서랍 바닥판 ${k}`, bw - 2 * bt, bd - 2 * bt, BACK, x + bt, by, z + bt, C));
  }
  return out;
}
function table(p) {
  const { W, D, H, C, C2 } = p, t = Math.min(p.top, H - 50), L = Math.min(p.leg, W / 3, D / 3), ins = clamp(p.inset, 0, Math.min(W, D) / 2 - L);
  const a = clamp(p.apron, 0, H - t - 50), lh = H - t, x1 = W - ins - L, z1 = D - ins - L, out = [P('상판', W, D, t, 0, lh, 0, C)];
  [[ins, ins], [x1, ins], [ins, z1], [x1, z1]].forEach(([x, z], i) => out.push(P(`다리 ${i + 1}`, L, L, lh, x, 0, z, C2)));
  if (a > 0) {
    const at = Math.min(20, L), o = (L - at) / 2, y = lh - a, fw = x1 - ins - L, sd = z1 - ins - L;
    out.push(P('에이프런 1', fw, at, a, ins + L, y, ins + o, C2), P('에이프런 2', fw, at, a, ins + L, y, z1 + o, C2),
      P('옆 에이프런 1', at, sd, a, ins + o, y, ins + L, C2), P('옆 에이프런 2', at, sd, a, x1 + o, y, ins + L, C2));
  }
  return out;
}
const bed = ({ W, D, frame, mat, head, C, C2 }) => [P('헤드보드', W, 50, Math.max(head, frame + mat), 0, 0, 0, C), P('프레임', W, D - 50, frame, 0, 0, 50, C), P('매트리스', W - 40, D - 90, mat, 20, frame, 70, C2, true)];
function sofa(p) {
  const { W, D, H, C } = p, a = Math.min(p.arm, W / 4), s = clamp(p.seat, 200, H - 100), bd = Math.min(220, D / 3);
  return [P('팔걸이 1', a, D, Math.min(H - 100, s + 200), 0, 0, 0, C), P('팔걸이 2', a, D, Math.min(H - 100, s + 200), W - a, 0, 0, C), P('등받이', W - 2 * a, bd, H, a, 0, 0, C),
    P('좌판 받침', W - 2 * a, D - bd, s - 150, a, 0, bd, C), P('방석', W - 2 * a, D - bd, 150, a, s - 150, bd, p.C2, true)];
}
function chair(p) {
  const { W, D, H, C } = p, s = clamp(p.seat, 100, H - 100), L = 35, st = 25, out = [];
  [[0, 0], [W - L, 0], [0, D - L], [W - L, D - L]].forEach(([x, z], i) => out.push(P(`다리 ${i + 1}`, L, L, s - st, x, 0, z, C)));
  return [...out, P('좌판', W, D, st, 0, s - st, 0, C), P('등받이', W, 22, H - s, 0, s, 0, p.C2)];
}

const n = (k, label, v, min = 0, unit = 'mm', max = 20000) => ({ k, label, v, min, unit, max });
const col = (k, label, v) => ({ k, label, v, color: true });
const WDH = (W, D, H, m = 100) => [n('W', '가로', W, 100), n('D', '깊이', D, 100), n('H', '높이', H, m)];
export const KINDS = {
  cabinet: { label: '수납장·책장', build: cabinet, fields: [...WDH(800, 350, 1800), n('T', '판재 두께', 18, 3, 'mm', 50), n('shelves', '선반', 4, 0, '개', 30), n('doors', '문', 0, 0, '개', 8), n('plinth', '걸레받이', 60), col('C', '몸통', c.ply), col('C2', '문', c.white)] },
  drawers: { label: '서랍장', build: drawers, fields: [...WDH(900, 450, 800), n('T', '판재 두께', 18, 3, 'mm', 50), n('rows', '서랍 단수', 4, 1, '단', 12), n('plinth', '걸레받이', 60), col('C', '몸통', c.ply), col('C2', '앞판', c.white)] },
  table: { label: '테이블·책상', build: table, fields: [...WDH(1400, 700, 730), n('top', '상판 두께', 25, 5, 'mm', 200), n('leg', '다리 굵기', 50, 10, 'mm', 300), n('inset', '다리 들임', 20), n('apron', '에이프런 높이', 0), col('C', '상판', c.oak), col('C2', '다리', c.black)] },
  bed: { label: '침대', build: bed, fields: [n('W', '가로', 1600, 600), n('D', '길이', 2100, 1000), n('frame', '프레임 높이', 300, 50, 'mm', 1000), n('mat', '매트리스 두께', 220, 50, 'mm', 600), n('head', '헤드보드 높이', 950, 0, 'mm', 2500), col('C', '프레임', c.oak), col('C2', '매트리스', c.linen)] },
  sofa: { label: '소파', build: sofa, fields: [...WDH(2100, 900, 800, 400), n('arm', '팔걸이 폭', 180, 20, 'mm', 600), n('seat', '좌면 높이', 420, 200, 'mm', 800), col('C', '몸체', c.fabric), col('C2', '방석', c.linen)] },
  chair: { label: '의자', build: chair, fields: [...WDH(450, 480, 850, 300), n('seat', '좌면 높이', 450, 100, 'mm', 1200), col('C', '몸체', c.oak), col('C2', '등받이', c.oak)] },
  box: { label: '단순 상자', build: p => [P('본체', p.W, p.D, p.H, 0, 0, 0, p.C)], fields: [...WDH(600, 600, 600, 1), col('C', '재료', c.gray)] },
};

export const paramsOf = d => Object.fromEntries(KINDS[d.kind].fields.map(f => [f.k, f.color ? hex(d.params?.[f.k]) || f.v : num(d.params?.[f.k], f.v, f.min, f.max)]));
const cache = new WeakMap(); // def.params 객체 기준. 치수를 바꿀 때는 params를 새 객체로 갈아 끼운다
export function partsOf(def) {
  if (def.kind === 'custom') return def.parts;
  let r = cache.get(def.params);
  if (!r) cache.set(def.params, r = KINDS[def.kind].build(paramsOf(def)).map((p, i) => ({ id: 'g' + i, ...p })));
  return r;
}
export const part = p => ({ id: str(p.id, uid()), name: str(p.name, '부품'), w: num(p.w, 100, 1, 20000), d: num(p.d, 100, 1, 20000), h: num(p.h, 100, 1, 20000),
  x: num(p.x, 0, -20000, 20000), y: num(p.y, 0, 0, 20000), z: num(p.z, 0, -20000, 20000), rx: num(p.rx, 0, -180, 180), ry: num(p.ry, 0, -180, 180), rz: num(p.rz, 0, -180, 180),
  color: hex(p.color) || c.ply, ...(p.hw && { hw: true }), ...(ROLES.includes(p.role) && { role: p.role }) });

// 부품 회전: rx·ry·rz(도)를 부품 중심 기준으로 적용. x,y,z는 돌리기 전 상자의 최소 모서리 그대로다
export function rotOf(p) { // 오일러 XYZ 회전 행렬(행 우선). three.js 기본 순서와 같아 mesh.rotation에 그대로 넣으면 일치한다
  const [a, b, c, d, e, f] = [p.rx, p.ry, p.rz].flatMap(v => [Math.cos((v || 0) * DEG), Math.sin((v || 0) * DEG)]);
  return [[c * e, -c * f, d], [a * f + b * e * d, a * e - b * f * d, -b * c], [b * f - a * e * d, b * e + a * f * d, a * c]];
}
export function ext(p) { // 돌린 부품을 감싸는 축 정렬 상자: 중심 c, 반치수 e (순서 x, y, z)
  const h = [p.w / 2, p.h / 2, p.d / 2];
  return { c: [p.x + h[0], p.y + h[1], p.z + h[2]], e: rotOf(p).map(r => Math.abs(r[0]) * h[0] + Math.abs(r[1]) * h[1] + Math.abs(r[2]) * h[2]) };
}

export function bounds(parts) {
  if (!parts.length) return { x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 100, W: 100, D: 100, H: 100, cx: 50, cz: 50 };
  const E = parts.map(ext), lo = i => Math.min(...E.map(q => q.c[i] - q.e[i])), hi = i => Math.max(...E.map(q => q.c[i] + q.e[i]));
  const x0 = lo(0), y0 = lo(1), z0 = lo(2), x1 = hi(0), y1 = hi(1), z1 = hi(2);
  return { x0, y0, z0, x1, y1, z1, W: x1 - x0, D: z1 - z0, H: y1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/* ---------- 방·벽·문 ---------- */
// 벽 좌표계: o = 시작 모서리, u = 벽을 따라가는 방향, n = 방 안쪽. 위치는 평면도 기준 왼쪽/위쪽 모서리에서 잰다
const FRAMES = { N: r => ({ o: [0, 0], u: [1, 0], n: [0, 1], len: r.w }), S: r => ({ o: [0, r.d], u: [1, 0], n: [0, -1], len: r.w }), W: r => ({ o: [0, 0], u: [0, 1], n: [1, 0], len: r.d }), E: r => ({ o: [r.w, 0], u: [0, 1], n: [-1, 0], len: r.d }) };
const at = (f, s, t) => [f.o[0] + f.u[0] * s + f.n[0] * t, f.o[1] + f.u[1] * s + f.n[1] * t];
export function spanBox(room, wall, s0, s1, t0, t1, y0, y1) { // 벽 좌표 구간 → 상자
  const f = FRAMES[wall](room), a = at(f, s0, t0), b = at(f, s1, t1);
  return { x: Math.min(a[0], b[0]), z: Math.min(a[1], b[1]), y: y0, w: Math.abs(a[0] - b[0]), d: Math.abs(a[1] - b[1]), h: y1 - y0 };
}
export function fixOpening(room, o) {
  const door = o.type !== 'window', wall = ['N', 'S', 'W', 'E'].includes(o.wall) ? o.wall : 'S', len = FRAMES[wall](room).len;
  const w = num(o.w, 900, 300, len), h = num(o.h, door ? 2100 : 1200, 300, room.h);
  return { id: str(o.id, uid()), type: door ? 'door' : 'window', wall, pos: num(o.pos, 0, 0, len - w), w, h, sill: door ? 0 : num(o.sill, 900, 0, room.h - h), hinge: o.hinge === 'b' ? 'b' : 'a', swing: o.swing === 'out' ? 'out' : 'in' };
}
export function doorZone(room, o) { // 비워 둬야 하는 바닥 영역(볼록 다각형): 안쪽 열림은 문이 쓸고 가는 부채꼴, 아니면 문 앞 100mm
  const f = FRAMES[o.wall](room);
  if (o.swing !== 'in') return [at(f, o.pos, 0), at(f, o.pos + o.w, 0), at(f, o.pos + o.w, 100), at(f, o.pos, 100)];
  const h = o.hinge === 'b' ? o.pos + o.w : o.pos, dir = o.hinge === 'b' ? -1 : 1, pts = [at(f, h, 0)];
  for (let i = 0; i <= 6; i++) pts.push(at(f, h + dir * o.w * Math.cos(i * Math.PI / 12), o.w * Math.sin(i * Math.PI / 12)));
  return pts;
}
export function wallBoxes(room, openings) { // kind: wall | top(개구부 위, 평면에서는 숨김) | glass
  const out = [];
  for (const wall of 'NSWE') {
    const len = FRAMES[wall](room).len, ext = 'NS'.includes(wall) ? WT : 0; // 위·아래 벽이 모서리를 채운다
    const add = (kind, s0, s1, y0, y1, t0 = -WT, t1 = 0) => { if (s1 - s0 >= 1 && y1 - y0 >= 1) out.push({ wall, kind, ...spanBox(room, wall, s0, s1, t0, t1, y0, y1) }); };
    let s = -ext;
    for (const o of openings.filter(o => o.wall === wall).sort((a, b) => a.pos - b.pos)) {
      add('wall', s, o.pos, 0, room.h); add('wall', o.pos, o.pos + o.w, 0, o.sill); add('top', o.pos, o.pos + o.w, o.sill + o.h, room.h);
      if (o.type === 'window') add('glass', o.pos, o.pos + o.w, o.sill, o.sill + o.h, -WT / 2 - 10, -WT / 2 + 10);
      s = Math.max(s, o.pos + o.w);
    }
    add('wall', s, len + ext, 0, room.h);
  }
  return out;
}

/* ---------- 간섭 판정 ---------- */
export const defOf = (proj, it) => proj.library.find(d => d.id === it.def);
const spot = (it, x, z) => { const co = Math.cos(it.rot * DEG), si = Math.sin(it.rot * DEG); return [it.x + x * co + z * si, it.z - x * si + z * co]; }; // 가구 로컬(중심 기준) 점 → 방 좌표
const rect = (it, x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => spot(it, x, z));
export function shape(proj, it) { // 방에 놓인 모양: 가구 전체의 발자국·높이 구간(바닥에서 it.y만큼 띄운 값)과 부품별 기운 상자
  const b = bounds(partsOf(defOf(proj, it))), y = it.y || 0, poly = rect(it, -b.W / 2, -b.D / 2, b.W / 2, b.D / 2), parts = partsOf(defOf(proj, it)).map(p => solid(it, p, b));
  // minx~maxz: 방 안에서 실제로 차지하는 범위(부품 기준). 비스듬히 놓은 가구는 감싸는 사각형 poly보다 좁고, 중심에 대칭이 아닐 수 있다
  const span = i => (parts.length ? parts.flatMap(p => [p.c[i] - p.e[i], p.c[i] + p.e[i]]) : poly.map(p => p[i / 2])), xs = span(0), zs = span(2);
  return { b, poly, y0: b.y0 + y, y1: b.y1 + y, low: b.y1 + y <= 30 /* 러그 등은 겹쳐도 된다. 높이 건 얇은 선반은 아니다 */, minx: Math.min(...xs), maxx: Math.max(...xs), minz: Math.min(...zs), maxz: Math.max(...zs), parts };
}
function solid(it, p, b) { // 부품 하나를 방 좌표의 기운 상자로: 중심 c, 단위 축 u[3], 반치수 h, 감싸는 축 정렬 상자의 반치수 e
  const co = Math.cos(it.rot * DEG), si = Math.sin(it.rot * DEG), R = rotOf(p), h = [p.w / 2, p.h / 2, p.d / 2], lx = p.x + h[0] - b.cx, lz = p.z + h[2] - b.cz, cy = (it.y || 0) + p.y + h[1];
  const u = [0, 1, 2].map(j => [R[0][j] * co + R[2][j] * si, R[1][j], R[2][j] * co - R[0][j] * si]); // 가구 회전 · 부품 회전
  const e = [0, 1, 2].map(i => Math.abs(u[0][i]) * h[0] + Math.abs(u[1][i]) * h[1] + Math.abs(u[2][i]) * h[2]);
  return { c: [it.x + lx * co + lz * si, cy, it.z - lx * si + lz * co], u, h, e, y0: cy - e[1] };
}
function hull(pts) { // 볼록 껍질(단조 사슬)
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const p of list) { while (h.length > 1 && turn(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  return [...half(pts), ...half(pts.reverse())];
}
// 기운 상자의 여덟 꼭짓점을 축 두 개(ax)의 평면에 내린 볼록 껍질
const flat = (p, ax) => hull([0, 1, 2, 3, 4, 5, 6, 7].map(i => ax.map(k => p.c[k] + [0, 1, 2].reduce((s, j) => s + (i >> j & 1 ? 1 : -1) * p.h[j] * p.u[j][k], 0))));
// 부품이 바닥에 드리우는 그림자(문 열림 영역과 견줄 때만 쓰므로 필요할 때 계산)
const foot = p => (p.poly ||= flat(p, [0, 2]));
function obbHit(a, b, tol = 1) { // 기운 상자끼리 분리축 판정: 면 법선 3+3, 모서리 쌍 9. 모든 축에서 tol(mm)보다 깊이 파고들어야 겹침
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2], T = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]], axes = [...a.u, ...b.u];
  for (const p of a.u) for (const q of b.u) axes.push([p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]);
  const reach = (o, L) => Math.abs(dot(o.u[0], L)) * o.h[0] + Math.abs(dot(o.u[1], L)) * o.h[1] + Math.abs(dot(o.u[2], L)) * o.h[2];
  return axes.every(L => { const n = Math.hypot(L[0], L[1], L[2]); return n < 1e-9 /* 나란한 모서리 */ || Math.abs(dot(T, L)) < reach(a, L) + reach(b, L) - tol * n; });
}
export function overlap(A, B, tol = 1) { // 볼록 다각형 분리축 판정. tol(mm)보다 깊이 겹쳐야 겹침
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], nx = b[1] - a[1], nz = a[0] - b[0], len = Math.hypot(nx, nz);
    if (!len) continue;
    const span = pts => { const t = pts.map(q => (q[0] * nx + q[1] * nz) / len); return [Math.min(...t), Math.max(...t)]; };
    const [a0, a1] = span(A), [b0, b1] = span(B);
    if (a1 - b0 <= tol || b1 - a0 <= tol) return false;
  }
  return true;
}
const tall = (a, b) => a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1; // 높이 구간이 겹치는가
const apart = (p, q) => [0, 1, 2].some(i => Math.abs(p.c[i] - q.c[i]) > p.e[i] + q.e[i] - 1); // 감싸는 상자부터 떨어져 있으면 볼 것 없다
const hit = (a, b) => tall(a, b) && overlap(a.poly, b.poly) && a.parts.some(p => b.parts.some(q => !apart(p, q) && obbHit(p, q))); // 부품 단위라 책상 밑 의자는 통과
export function checker(proj) { // 가구 하나(놓아 볼 후보 포함)의 문제를 돌려주는 함수
  const { room } = proj, shapes = proj.items.map(it => [it.id, shape(proj, it)]);
  const zones = proj.openings.filter(o => o.type === 'door').map(o => [o, doorZone(room, o)]);
  return it => {
    const s = shape(proj, it), doors = s.low ? [] : zones.filter(([o, z]) => s.parts.some(p => p.y0 < o.h && overlap(foot(p), z))).map(([o]) => o.id);
    const why = s.minx < -1 || s.minz < -1 || s.maxx > room.w + 1 || s.maxz > room.d + 1 ? '벽 밖' : s.y1 > room.h + 1 ? '천장 넘음' : doors.length ? '문 막음'
      : !s.low && shapes.some(([id, t]) => id !== it.id && !t.low && hit(s, t)) ? '겹침' : null;
    return { why, doors };
  };
}
export function conflicts(proj) {
  const chk = checker(proj), items = new Map(), doors = new Set();
  for (const it of proj.items) { const r = chk(it); if (r.why) items.set(it.id, r.why); r.doors.forEach(d => doors.add(d)); }
  return { items, doors };
}
// 가구의 문·서랍을 여는 데 드는 바닥 영역 → [{ poly, y0, y1, blocked }] (방 좌표). role이 붙은 부품만 본다(생성기 가구)
// 막힘: 영역이 방 밖으로 나가거나, 다른 가구 부품의 바닥 그림자와 겹치면서 높이 구간도 겹칠 때. 러그는 뺀다
export function openZones(proj, it) {
  const { room } = proj, parts = partsOf(defOf(proj, it)), b = bounds(parts), at = (x, z) => spot(it, x - b.cx, z - b.cz);
  const others = proj.items.filter(o => o.id !== it.id).map(o => shape(proj, o)).filter(s => !s.low);
  return parts.filter(p => p.role).map(p => {
    const f = p.z + p.d, y0 = (it.y || 0) + p.y, y1 = y0 + p.h, L = p.role === 'doorL', hx = L ? p.x : p.x + p.w, len = p.z - BACK - 20; // len: 서랍이 나오는 길이(buyList의 레일과 같은 기준)
    const poly = p.role === 'drawer' ? [at(p.x, f), at(p.x + p.w, f), at(p.x + p.w, f + len), at(p.x, f + len)] // 서랍: 앞판 폭 × 나오는 길이
      : [at(hx, f), ...[0, 1, 2, 3, 4, 5, 6].map(i => at(hx + (L ? 1 : -1) * p.w * Math.cos(i * Math.PI / 12), f + p.w * Math.sin(i * Math.PI / 12)))]; // 문: 경첩 모서리 중심의 부채꼴
    const blocked = poly.some(([x, z]) => x < -1 || z < -1 || x > room.w + 1 || z > room.d + 1)
      || others.some(s => s.parts.some(q => q.y0 < y1 - 1 && q.c[1] + q.e[1] > y0 + 1 && overlap(foot(q), poly)));
    return { poly, y0, y1, blocked };
  });
}

/* ---------- 재단 목록 ---------- */
export function cutList(parts) { // 세 치수를 큰 순으로 길이·폭·두께로 보고, 같은 것끼리 묶는다
  const m = new Map();
  for (const p of parts) {
    if (p.hw) continue;
    const [L, W, T] = [p.w, p.d, p.h].sort((a, b) => b - a), key = [L, W, T, p.color].join(), r = m.get(key) || { L, W, T, color: p.color, names: new Set(), n: 0 };
    r.n++; r.names.add(p.name.replace(/\s*\d+$/, '')); m.set(key, r);
  }
  const rows = [...m.values()].map(r => ({ ...r, name: [...r.names].join(', ') })).sort((a, b) => b.T - a.T || b.L - a.L || b.W - a.W);
  return { rows, area: rows.reduce((s, r) => s + (r.T <= 40 ? r.L * r.W * r.n / 1e6 : 0), 0) };
}
export const colorName = v => COLORS.find(x => x[1] === v)?.[0] || v;
export function buyList(parts) { // 사서 쓰는 것 → [{ name, spec, n }]: hw 부품, 경첩, 서랍 레일
  const m = new Map(), add = (name, spec, n = 1) => { const k = name + '|' + spec, r = m.get(k) || { name, spec, n: 0 }; r.n += n; m.set(k, r); };
  for (const p of parts) if (p.hw) add(p.name.replace(/\s*\d+$/, ''), [p.w, p.d, p.h].sort((a, b) => b - a).join('×')); // 큰 치수부터: 세운 손잡이와 눕힌 손잡이가 한 줄
  for (const p of parts) if (p.role === 'doorL' || p.role === 'doorR') add('경첩', '', p.h <= 900 ? 2 : p.h <= 1600 ? 3 : p.h <= 2000 ? 4 : 5); // 문 높이 기준 어림
  for (const p of parts) { // 레일 길이: 250~600(50 간격) 중 몸통 깊이(p.z) − 26(뒷판 6 + 여유 20, drawers의 bd) 이하 최댓값
    const len = Math.min(600, Math.floor((p.z - BACK - 20) / 50) * 50);
    if (p.role === 'drawer' && len >= 250) add('서랍 레일(쌍)', len + 'mm');
  }
  return [...m.values()];
}
const q = s => `"${String(s).replace(/"/g, '""')}"`;
export const cutCSV = (rows, buy = []) => ['부품,길이(mm),폭(mm),두께(mm),수량,재료', ...rows.map(r => [q(r.name), r.L, r.W, r.T, r.n, colorName(r.color)].join(',')),
  ...(buy.length ? ['', '구매품,규격,수량', ...buy.map(b => [q(b.name), q(b.spec), b.n].join(','))] : [])].join('\r\n');

/* ---------- 판재 배치 ---------- */
export function cutOpts(raw) { // 원판 길이·폭과 톱날 두께(공구 설정이라 방이 아니라 저장본 최상위에 둔다)
  const L = num(raw?.L, 2440, 300, 5000), W = num(raw?.W, 1220, 300, 3000);
  return { L: Math.max(L, W), W: Math.min(L, W), kerf: num(raw?.kerf, 3, 0, 10) };
}
// cutList 줄 → 두께·색이 같은 묶음마다 [{ T, color, sheets: [[{ name, l, w, x, y }]], over: [{ name, l, w }] }]. 두께 40mm 이하만(면적 계산과 같은 기준)
// 조각의 긴 쪽은 늘 원판 길이 방향(결 유지, 돌리지 않음). 띠 단위라 길게 켠 뒤 토막 내는 순서와 같다
// shortcut: 띠 채우기라 최적이 아니다, 버리는 판재가 아까워지면 길로틴 최적 맞춤으로 바꾼다
export function nest(rows, o) {
  const groups = new Map();
  for (const r of rows) {
    if (r.T > 40) continue;
    const key = r.T + r.color, g = groups.get(key) || { T: r.T, color: r.color, sheets: [], over: [], pcs: [] };
    for (let i = 0; i < r.n; i++) (r.L > o.L || r.W > o.W ? g.over : g.pcs).push({ name: r.name, l: r.L, w: r.W });
    groups.set(key, g);
  }
  return [...groups.values()].map(({ pcs, ...g }) => {
    const strips = [], next = []; // strips: { s: 원판 번호, y, w, x: 다음 조각 자리 }, next: 원판마다 다음 띠의 y
    for (const p of pcs.sort((a, b) => b.w - a.w || b.l - a.l)) { // 폭이 넓은 순
      let t = strips.find(t => p.w <= t.w && t.x + p.l <= o.L);
      if (!t) {
        let s = next.findIndex(y => y + p.w <= o.W);
        if (s < 0) { s = next.push(0) - 1; g.sheets.push([]); }
        strips.push(t = { s, y: next[s], w: p.w, x: 0 }); next[s] += p.w + o.kerf;
      }
      g.sheets[t.s].push({ ...p, x: t.x, y: t.y }); t.x += p.l + o.kerf;
    }
    return g;
  });
}

/* ---------- DAE (COLLADA 1.4.1, Z_UP, mm) ---------- */
// 내보낼 묶음: 가구 하나만(def) 또는 방 전체. 묶음마다 상자는 묶음 로컬 좌표(y↑)
export function exportNodes(proj, def) {
  const node = (d, x = 0, z = 0, rot = 0, y = 0) => { const parts = partsOf(d), b = bounds(parts); return { name: d.name, x, y, z, rot, boxes: parts.map(p => ({ ...p, x: p.x - b.cx, z: p.z - b.cz })) }; };
  if (def) return [node(def)];
  const { room } = proj, walls = wallBoxes(room, proj.openings).filter(b => b.kind !== 'glass').map(b => ({ ...b, name: '벽', color: room.wall }));
  return [{ name: '방', x: 0, z: 0, rot: 0, boxes: [{ name: '바닥', x: 0, y: -50, z: 0, w: room.w, d: room.d, h: 50, color: room.floor }, ...walls] }, ...proj.items.map(it => node(defOf(proj, it), it.x, it.z, it.rot, it.y))];
}
const xml = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
// 꼭짓점 번호 = X비트 + 2·Y비트 + 4·Z비트. 면마다 바깥에서 볼 때 반시계: -Z +Z -Y +Y -X +X
const TRI = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]].map(([a, b, d, e], f) => [a, b, d, a, d, e].map(v => `${v} ${f}`).join(' ')).join(' ');
export function toDAE(nodes) {
  const f = v => +v.toFixed(3), colors = [...new Set(nodes.flatMap(n => n.boxes.map(b => b.color)))], now = new Date().toISOString();
  const rgb = v => [1, 3, 5].map(i => f(parseInt(v.slice(i, i + 2), 16) / 255)).join(' ');
  const src = (id, count, data) => `<source id="${id}"><float_array id="${id}a" count="${count * 3}">${data}</float_array><technique_common><accessor source="#${id}a" count="${count}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`;
  let geo = '', scene = '', gi = 0;
  nodes.forEach((n, ni) => {
    // y-up의 y축 회전 θ는 (X,Y,Z) = (x,−z,y)에서 Z축 회전 +θ가 된다(det = +1, 면 방향 유지)
    const co = f(Math.cos(n.rot * DEG)), si = f(Math.sin(n.rot * DEG));
    scene += `<node id="n${ni}" name="${xml(n.name)}"><matrix>${co} ${-si} 0 ${n.x} ${si} ${co} 0 ${-n.z} 0 0 1 ${n.y || 0} 0 0 0 1</matrix>`;
    for (const b of n.boxes) {
      const id = 'g' + gi++, R = rotOf(b), h = [b.w / 2, b.h / 2, b.d / 2], c = [b.x + h[0], -(b.z + h[2]), b.y + h[1]], v = [];
      const zup = (x, y, z) => { const r = R.map(r => r[0] * x + r[1] * y + r[2] * z); return [r[0], -r[2], r[1]]; }; // 부품 회전 후 Z_UP으로
      for (let i = 0; i < 8; i++) v.push(...zup((i & 1 ? 1 : -1) * h[0], (i >> 2 ? 1 : -1) * h[1], (i >> 1 & 1 ? -1 : 1) * h[2]).map((t, k) => t + c[k]));
      const nrm = [[0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [-1, 0, 0], [1, 0, 0]].flatMap(n => zup(...n)); // TRI의 면 순서(-Z +Z -Y +Y -X +X)에 맞춘 y-up 법선
      geo += `<geometry id="${id}" name="${xml(b.name)}"><mesh>${src(id + 'p', 8, v.map(f).join(' '))}${src(id + 'n', 6, nrm.map(f).join(' '))}<vertices id="${id}v"><input semantic="POSITION" source="#${id}p"/></vertices><triangles material="m" count="12"><input semantic="VERTEX" source="#${id}v" offset="0"/><input semantic="NORMAL" source="#${id}n" offset="1"/><p>${TRI}</p></triangles></mesh></geometry>`;
      scene += `<node name="${xml(b.name)}"><instance_geometry url="#${id}"><bind_material><technique_common><instance_material symbol="m" target="#m${b.color.slice(1)}"/></technique_common></bind_material></instance_geometry></node>`;
    }
    scene += '</node>';
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>FunModel</authoring_tool></contributor><created>${now}</created><modified>${now}</modified><unit name="millimeter" meter="0.001"/><up_axis>Z_UP</up_axis></asset>
<library_effects>${colors.map(v => `<effect id="e${v.slice(1)}"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${rgb(v)} 1</color></diffuse></lambert></technique></profile_COMMON></effect>`).join('')}</library_effects>
<library_materials>${colors.map(v => `<material id="m${v.slice(1)}" name="${xml(colorName(v))}"><instance_effect url="#e${v.slice(1)}"/></material>`).join('')}</library_materials>
<library_geometries>${geo}</library_geometries>
<library_visual_scenes><visual_scene id="scene">${scene}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;
}

/* ---------- SVG: 판재 배치도, 치수 도면. viewBox 단위 = mm. 패널에 innerHTML로도 넣으므로 사용자 문자열은 xml()을 거친다 ---------- */
const r1 = v => +v.toFixed(1);
const svg = (w, h, fs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}" font-family="system-ui, sans-serif" font-size="${r1(fs)}" fill="#111"><rect width="${r1(w)}" height="${r1(h)}" fill="#fff"/>${body}</svg>`;
export function nestSVG(groups, o) { // 원판을 세로로 쌓고 원판마다 제목, 조각마다 이름과 길이×폭
  const pad = 40, th = 80;
  let y = pad, body = '';
  for (const g of groups) g.sheets.forEach((sheet, i) => {
    body += `<text x="${pad}" y="${y + 52}" font-weight="600">${g.T}mm ${xml(colorName(g.color))} ${i + 1}/${g.sheets.length}</text><rect x="${pad}" y="${y + th}" width="${o.L}" height="${o.W}" fill="#eceff2" stroke="#222" stroke-width="3"/>`;
    for (const p of sheet) {
      const t = `${p.name} ${p.l}×${p.w}`, fs = Math.max(8, Math.min(40, p.w * .5, p.l / t.length / .8));
      body += `<rect x="${pad + p.x}" y="${y + th + p.y}" width="${p.l}" height="${p.w}" fill="${xml(g.color)}" stroke="#222" stroke-width="2"/><text x="${pad + p.x + p.l / 2}" y="${y + th + p.y + p.w / 2}" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#fff" stroke-width="${r1(fs / 5)}" stroke-linejoin="round">${xml(t)}</text>`;
    }
    y += th + o.W + pad;
  });
  return svg(o.L + 2 * pad, y, 48, body);
}
// 3각법: 평면도 위, 정면도 아래, 우측면도 오른쪽. 부품을 제 색으로 뒤에서부터 덮어 그려 가려진 선을 처리한다
// shortcut: 덮어 그리기라 서로 엇갈린 부품은 순서가 틀릴 수 있다, 부품별 치수는 재단 목록으로 대신한다
export function drawingSVG(def) {
  const parts = partsOf(def), b = bounds(parts), S = parts.map(p => ({ ...solid({ x: 0, z: 0, rot: 0 }, p, b), color: p.color })); // 가구 중심 좌표의 기운 상자
  const { W, D } = b, yb = Math.min(0, b.y0), H = b.y1 - yb, u = Math.max(W + D, D + H) / 60, m = 8 * u, top = 2 * m, fy = top + D + m, sx = m + W + m;
  const views = [ // [내리는 축 둘, 보는 방향 축(가까운 것이 나중), 화면 좌표]
    [[0, 2], 1, ([x, z]) => [m + x + W / 2, top + z + D / 2]],   // 평면도
    [[0, 1], 2, ([x, y]) => [m + x + W / 2, fy + b.y1 - y]],     // 정면도
    [[2, 1], 0, ([z, y]) => [sx + D / 2 - z, fy + b.y1 - y]],    // 우측면도: 앞(+z)이 정면도 쪽(왼쪽)
  ];
  const polys = views.map(([ax, k, to]) => [...S].sort((p, q) => p.c[k] + p.e[k] - q.c[k] - q.e[k])
    .map(p => `<polygon points="${flat(p, ax).map(v => to(v).map(r1).join()).join(' ')}" fill="${xml(p.color)}"/>`).join('')).join('');
  const dims = [[m, fy + H + 3 * u, m + W, fy + H + 3 * u, W], [m - 3 * u, fy, m - 3 * u, fy + b.y1, b.H], [m - 3 * u, top, m - 3 * u, top + D, D]]; // 전체 가로·높이(바닥에서)·깊이
  const lines = dims.map(([x1, y1, x2, y2]) => { const [tx, ty] = x1 === x2 ? [u, 0] : [0, u]; return `M${r1(x1 - tx)} ${r1(y1 - ty)}L${r1(x1 + tx)} ${r1(y1 + ty)}M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}M${r1(x2 - tx)} ${r1(y2 - ty)}L${r1(x2 + tx)} ${r1(y2 + ty)}`; }).join('');
  const texts = dims.map(([x1, y1, x2, y2, v]) => { const x = r1((x1 + x2) / 2), y = r1((y1 + y2) / 2); return x1 === x2 ? `<text x="${x}" y="${y}" dy="${r1(-u)}" text-anchor="middle" transform="rotate(-90 ${x} ${y})">${Math.round(v)}</text>` : `<text x="${x}" y="${y}" dy="${r1(2.8 * u)}" text-anchor="middle">${Math.round(v)}</text>`; }).join('');
  return svg(sx + D + m, fy + H + m, 2.2 * u, `<text x="${r1(m)}" y="${r1(m)}" font-size="${r1(3 * u)}" font-weight="600">${xml(def.name)} · 단위 mm</text><g stroke="#222" stroke-width="${r1(u / 6)}" stroke-linejoin="round">${polys}</g><path d="${lines}" fill="none" stroke="#b86e00" stroke-width="${r1(u / 6)}"/>${texts}`);
}

/* ---------- 프로젝트(방 하나). library는 계산용으로 달려 있을 뿐, 모든 방이 같은 목록을 본다(adopt) ---------- */
const half = v => Math.round(clamp(+v || 0, -1e5, 1e5) * 2) / 2; // 가장자리를 벽에 딱 붙이려면 중심이 0.5mm 단위여야 한다
const turn = v => { const r = ((num(v, 0, -1e6, 1e6) % 360) + 360) % 360; return r > 180 ? r - 360 : r; };
export function sanitize(raw) { // 저장본·불러온 JSON을 믿지 않고 형태와 범위를 맞춘다. 못 쓰면 null
  if (!raw || typeof raw !== 'object' || !raw.room || typeof raw.room !== 'object') return null;
  const arr = v => (Array.isArray(v) ? v.filter(o => o && typeof o === 'object') : []), r = raw.room;
  const room = { w: num(r.w, 4000, 500, 30000), d: num(r.d, 3000, 500, 30000), h: num(r.h, 2400, 1000, 6000), wall: hex(r.wall) || '#f2f0eb', floor: hex(r.floor) || '#d6c3a6', snap: [0, 10, 50, 100].includes(+r.snap) ? +r.snap : 50 };
  const library = arr(raw.library).filter(d => d.kind === 'custom' || Object.hasOwn(KINDS, d.kind))
    .map(d => ({ id: str(d.id, uid()), name: str(d.name, '가구'), kind: d.kind, ...(d.kind === 'custom' ? { parts: arr(d.parts).map(part) } : { params: paramsOf(d) }) }));
  const items = arr(raw.items).filter(i => library.some(d => d.id === String(i.def))).map(i => ({ id: str(i.id, uid()), def: String(i.def), x: half(i.x), y: num(i.y, 0, 0, 6000), z: half(i.z), rot: turn(i.rot) }));
  return { id: str(raw.id, uid()), name: str(raw.name, '방'), room, openings: arr(raw.openings).map(o => fixOpening(room, o)), library, items };
}
// 가구 목록은 방과 따로 하나만 둔다(모든 방이 같이 쓴다). 방에 딸려 온 목록(백업 파일·v1 저장본)을 거기에 합친다:
// 내용이 같은 가구는 있던 것을 쓰고, id만 겹치고 내용이 다르면 새 id로 넣는다. p.items의 def도 따라 바꾼다
export function adopt(library, p) {
  const same = (a, b) => JSON.stringify({ ...a, id: 0 }) === JSON.stringify({ ...b, id: 0 }), old = [...library], map = new Map();
  for (const d of p.library) {
    let e = old.find(e => e.id === d.id && same(e, d)) || old.find(e => same(e, d));
    if (!e) library.push(e = library.some(e => e.id === d.id) ? { ...d, id: uid() } : d);
    map.set(d.id, e.id);
  }
  for (const i of p.items) i.def = map.get(i.def);
  p.library = library;
  return p;
}
/* ---------- 저장본 = 전체 백업 파일: { v, cur, library, projects(방마다 library 없음), cut } ---------- */
export const VER = 2; // 저장본 형식 버전. 더 큰 v는 더 새 앱이 쓴 것이라 읽지 않는다
export const dumpStore = s => JSON.stringify({ v: VER, ...s, projects: s.projects.map(({ library, ...p }) => p) });
export function readStore(s) { // 저장본·전체 백업(v1: v 없음, 방마다 library) → { cur, library, projects, cut }. 더 새 버전이면 { newer: true }, 못 읽으면 null
  if (s?.v > VER) return { newer: true };
  if (!Array.isArray(s?.projects)) return null;
  const library = [], projects = s.projects.map(p => sanitize({ library: s.library, ...p })).filter(Boolean).map(p => adopt(library, p));
  return projects.length ? { cur: s.cur, library, projects, cut: cutOpts(s.cut) } : null;
}
export function mergeStore(store, inc) { // 읽은 전체 백업(readStore)을 지우지 않고 더한다 → 더한 방 수. 가구는 adopt로 합친 뒤 견줘야 같은 방이 같게 보인다
  const key = p => JSON.stringify({ ...p, id: 0, library: 0 }), n = store.projects.length;
  for (const p of inc.projects) {
    adopt(store.library, p);
    if (store.projects.some(q => key(q) === key(p))) continue; // 같은 백업을 두 번 불러와도 방이 늘지 않게
    if (store.projects.some(q => q.id === p.id)) p.id = uid();
    store.projects.push(p);
  }
  return store.projects.length - n;
}
export function newProject(name, example, lib) { // lib: 이미 있는 가구 목록. 없으면 기본 가구로 시작
  const L = {}, mk = (key, name, kind, params = {}) => (L[key] = { id: uid(), name, kind, params });
  const library = lib || [mk('bed', '퀸 침대', 'bed'), mk('wardrobe', '옷장', 'cabinet', { W: 1200, D: 600, H: 2200, shelves: 1, doors: 2 }), mk('desk', '책상', 'table'), mk('chair', '의자', 'chair'),
    mk('drawers', '서랍장', 'drawers'), mk('shelf', '책장', 'cabinet', { D: 300, C: c.white }), mk('sofa', '3인 소파', 'sofa'),
    mk('dining', '식탁', 'table', { W: 1600, D: 800, H: 750, top: 30, leg: 70, inset: 60, apron: 80, C: c.walnut, C2: c.walnut }),
    mk('tv', 'TV장', 'cabinet', { W: 1800, D: 400, H: 450, shelves: 0, doors: 3, plinth: 0, C: c.white, C2: c.oak }),
    mk('rug', '러그', 'box', { W: 2000, D: 1400, H: 10, C: c.rug }), mk('fridge', '냉장고', 'box', { W: 900, D: 750, H: 1800, C: c.metal })];
  const put = (key, x, z, rot = 0) => ({ def: L[key].id, x, z, rot });
  return sanitize({ name, room: { w: 4200, d: 3600, h: 2400 }, library, ...(example && {
    openings: [{ type: 'door', wall: 'S', pos: 1000, w: 900 }, { type: 'window', wall: 'W', pos: 600, w: 1400 }],
    items: [put('rug', 1500, 2300), put('bed', 1500, 1050), put('wardrobe', 3880, 700, -90), put('desk', 3300, 3250, 180), put('chair', 3300, 2700), put('drawers', 245, 2900, 90)],
  }) });
}
