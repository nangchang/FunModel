import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';

const example = () => M.newProject('예시', true);
const defNamed = (p, name) => p.library.find(d => d.name === name);
const itemOf = (p, name) => p.items.find(i => i.def === defNamed(p, name).id);

test('예시 방은 간섭이 없다 — 책상 밑으로 들어간 의자 포함', () => {
  const p = example(), chair = M.shape(p, itemOf(p, '의자')), desk = M.shape(p, itemOf(p, '책상'));
  assert.ok(M.overlap(chair.poly, desk.poly), '발자국은 겹쳐 있어야 높이 판정을 시험하는 것');
  assert.deepEqual([...M.conflicts(p).items], []);
});

test('겹침, 벽 밖, 문 막음을 구분한다', () => {
  const p = example(), chair = itemOf(p, '의자'), why = () => M.conflicts(p).items.get(chair.id);
  chair.z = 3250; assert.equal(why(), '겹침');                 // 등받이가 책상 상판과 부딪힌다
  chair.x = 100; chair.z = 1000; assert.equal(why(), '벽 밖');
  chair.x = 1400; chair.z = 3300; assert.equal(why(), '문 막음');
  assert.equal(M.conflicts(p).doors.size, 1);
  p.openings[0].swing = 'out'; chair.z = 3000; assert.equal(why(), undefined); // 바깥 열림은 문 앞 100mm만 본다
  const rug = itemOf(p, '러그'); rug.x = 1500; rug.z = 1050; assert.equal(M.conflicts(p).items.has(rug.id), false); // 러그는 침대 밑에 깔려도 된다
});

test('생성기: 모든 종류가 유한한 치수의 부품을 만들고 요청한 가로·높이를 지킨다', () => {
  for (const kind of Object.keys(M.KINDS)) {
    const d = { kind, params: {} }, p = M.paramsOf(d), parts = M.partsOf(d), b = M.bounds(parts);
    assert.ok(parts.length > 0, kind);
    for (const q of parts) for (const k of ['w', 'd', 'h', 'x', 'y', 'z']) assert.ok(Number.isInteger(q[k]) && (q[k] >= (k < 'x' ? 1 : 0)), `${kind} ${q.name}.${k}=${q[k]}`);
    assert.equal(b.W, p.W, kind + ' W');
    if (p.H) assert.equal(b.H, p.H, kind + ' H');
  }
  const extreme = M.partsOf({ kind: 'cabinet', params: { W: 100, H: 100, T: 50, shelves: 30, doors: 8, plinth: 9999 } });
  assert.ok(extreme.every(q => q.w >= 1 && q.h >= 1 && q.y >= 0));
});

test('서랍장 재단 목록에 서랍 몸통이 들어가고 손잡이는 빠진다', () => {
  const { rows, area } = M.cutList(M.partsOf({ kind: 'drawers', params: {} })), get = n => rows.find(r => r.name === n);
  assert.equal(get('서랍 옆판').n, 8);
  assert.equal(get('서랍 앞뒤판').n, 8);
  assert.equal(get('서랍 바닥판').n, 4);
  assert.equal(get('서랍 앞판').n, 4);
  assert.ok(!rows.some(r => r.name.includes('손잡이')));
  assert.ok(area > 2 && area < 6, String(area));
  assert.match(M.cutCSV(rows), /^부품,길이/);
});

test('문·창문: 벽을 개구부 둘레로 나누고 범위를 벗어난 값은 고친다', () => {
  const p = example(), boxes = M.wallBoxes(p.room, p.openings);
  assert.equal(boxes.filter(b => b.kind === 'top').length, 2);
  assert.equal(boxes.filter(b => b.kind === 'glass').length, 1);
  const vol = boxes.filter(b => b.wall === 'S' && b.kind !== 'glass').reduce((s, b) => s + b.w * b.h * b.d, 0);
  assert.equal(vol, (p.room.w + 2 * M.WT) * p.room.h * M.WT - 900 * 2100 * M.WT, '아래 벽 부피 = 전체 − 문 구멍');
  const o = M.fixOpening(p.room, { type: 'window', wall: 'X', pos: 99999, w: 99999, h: 99999, sill: 500 });
  assert.deepEqual([o.wall, o.pos, o.w, o.h, o.sill], ['S', 0, 4200, 2400, 0]);
});

test('sanitize: 망가진 입력을 거르고 정상 입력은 그대로 둔다', () => {
  assert.equal(M.sanitize(null), null);
  assert.equal(M.sanitize({ items: [] }), null);
  const p = example();
  assert.deepEqual(M.sanitize(JSON.parse(JSON.stringify(p))), p);
  const bad = M.sanitize({ room: { w: 'x', wall: 'red"onload=' }, library: [{ kind: 'constructor' }, { id: 7, kind: 'box', params: { W: -5, C: '<b>' } }, null], items: [{ def: 7, rot: 450 }, { def: 'nope' }] });
  assert.equal(bad.room.w, 4000);
  assert.equal(bad.room.wall, '#f2f0eb');
  assert.equal(bad.library.length, 1);
  assert.equal(bad.library[0].params.W, 100);
  assert.match(bad.library[0].params.C, /^#[0-9a-f]{6}$/);
  assert.deepEqual(bad.items.map(i => [i.def, i.rot]), [['7', 90]]);
});

test('adopt: 방에 딸려 온 가구 목록을 공용 목록에 합친다', () => {
  const lib = [], a = M.adopt(lib, example()), b = M.adopt(lib, example());
  assert.equal(lib.length, 11, '내용이 같은 기본 가구는 하나로');
  assert.equal(b.library, lib);
  assert.equal(itemOf(b, '의자').def, defNamed(a, '의자').id);
  assert.deepEqual([...M.conflicts(b).items], []);
  const c = example(), bed = defNamed(c, '퀸 침대'), placed = itemOf(c, '퀸 침대'), old = defNamed(a, '퀸 침대').id; // id는 같은데 내용이 다르면 새 id로 들어가고, 놓인 가구도 따라간다
  placed.def = bed.id = old; bed.params = { ...bed.params, W: 1100 };
  M.adopt(lib, c);
  assert.equal(lib.length, 12);
  assert.equal(M.paramsOf(M.defOf(c, placed)).W, 1100);
  assert.notEqual(placed.def, old);
  assert.equal(M.newProject('빈 방', false, lib).library.length, 12);
});

test('가구만 내보낸 파일: 방 없이 읽어 목록에 없는 가구만 더한다', () => {
  const lib = M.adopt([], example()).library, read = l => M.sanitize({ room: {}, library: JSON.parse(JSON.stringify({ library: l })).library }); // 앱의 내보내기·불러오기와 같은 경로
  M.adopt(lib, read(lib));
  assert.equal(lib.length, 11, '같은 파일을 다시 불러오면 늘지 않는다');
  const other = M.adopt([], example()).library;
  other[0].name = '싱글 침대';
  M.adopt(lib, read(other));
  assert.deepEqual([lib.length, lib[11].name], [12, '싱글 침대']);
});

test('부품 회전: 감싸는 상자, 가구 치수, DAE 꼭짓점·면 방향', () => {
  const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${a} ≠ ${b}`));
  const board = { name: '판', w: 100, d: 20, h: 10, x: 0, y: 0, z: 0, color: '#ffffff' };
  near(M.ext(board).e, [50, 5, 10]);
  near(M.ext({ ...board, ry: 90 }).e, [10, 5, 50]);   // 수평으로 돌리면 가로·깊이가 바뀐다
  near(M.ext({ ...board, rz: 90 }).e, [5, 50, 10]);   // 세우면 가로가 높이가 된다
  near(M.ext({ ...board, rx: 30 }).c, [50, 5, 10]);   // 중심은 그대로
  const b = M.bounds([{ ...board, rz: 90 }]);
  near([b.W, b.H, b.D, b.y0], [10, 55, 20, -45]);
  assert.deepEqual([M.part({ rx: 999, ry: 'x' }).rx, M.part({}).ry, M.part({ rz: -30.4 }).rz], [180, 0, -30]);
  // 임의 각도로 돌린 상자의 DAE: 모든 삼각형이 바깥을 향하고 적힌 법선과 맞아야 한다
  const p = { ...board, x: 30, y: 40, z: 50, rx: 20, ry: 35, rz: -50 }, dae = M.toDAE([{ name: 'a', x: 0, z: 0, rot: 0, boxes: [p] }]);
  const nums = re => dae.match(re)[1].split(' ').map(Number), V = nums(/count="24">([^<]+)</), N = nums(/count="18">([^<]+)</), idx = nums(/<p>([^<]+)</);
  const at = (A, i) => A.slice(i * 3, i * 3 + 3), sub = (a, c) => a.map((v, i) => v - c[i]), dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]], center = [80, -60, 45]; // (cx, −cz, cy)
  for (let t = 0; t < 12; t++) {
    const [a, , c2, , c3] = idx.slice(t * 6, t * 6 + 5), n = at(N, idx[t * 6 + 1]), A = at(V, a), B = at(V, c2), C = at(V, c3), face = cross(sub(B, A), sub(C, A));
    assert.ok(dot(face, n) > 0 && dot(n, sub(A.map((v, i) => (v + B[i] + C[i]) / 3), center)) > 0, `삼각형 ${t}`);
  }
  const e = M.ext(p).e; // DAE 꼭짓점 범위 = 감싸는 상자 (Z_UP: X=x, Y=−z, Z=y)
  [[0, 0], [1, 2], [2, 1]].forEach(([k, i]) => near([Math.max(...V.filter((_, j) => j % 3 === k)) - center[k]], [e[i]].map(v => +v.toFixed(3) || v)));
});

test('돌린 부품의 간섭은 감싸는 상자가 아니라 실제 모양으로 본다', () => {
  const board = (o) => ({ id: 'a', name: 'A', kind: 'custom', parts: [{ name: '판', x: 0, y: 0, z: 0, color: '#ffffff', ...o }] });
  const scene = (o, bx, bz, by = 0) => M.sanitize({ room: { w: 4000, d: 4000, h: 2400 },
    library: [board(o), { id: 'b', name: 'B', kind: 'custom', parts: [{ name: '상자', w: 200, d: 200, h: 100, x: 0, y: by, z: 0 }] }],
    items: [{ id: 'A', def: 'a', x: 2000, z: 2000, rot: 0 }, { id: 'B', def: 'b', x: bx, z: bz, rot: 0 }] });
  const hits = p => M.conflicts(p).items.has('B'), boxes = p => { const [a, b] = p.items.map(i => M.shape(p, i)); return M.overlap(a.poly, b.poly); };
  // 수평으로 45° 돌린 긴 판(대각 방향 (1,−1)): 감싸는 사각형의 빈 모서리에 둔 상자는 안 닿는다
  const diag = { w: 1000, d: 20, h: 100, ry: 45 };
  let p = scene(diag, 2250, 2250); assert.ok(boxes(p), '감싸는 사각형끼리는 겹쳐 있어야 의미 있는 시험'); assert.equal(hits(p), false);
  assert.equal(hits(scene(diag, 2200, 1800)), true, '대각선 위에 두면 닿는다');
  // 판 법선 (1,1)/√2 방향으로: 상자 반폭 141.4 + 판 반두께 10 = 151.4. 중심 거리 = (Δx+Δz)/√2
  assert.equal(hits(scene(diag, 2113, 2113)), false, '중심 거리 159.8 → 8mm 떨어짐');
  assert.equal(hits(scene(diag, 2103, 2103)), true, '중심 거리 145.7 → 6mm 파고듦');
  // 뒤로 30° 기운 판: 위는 뒤(−z)로, 아래는 앞(+z)으로 나온다. 뒤쪽 아래 빈 곳의 상자는 안 닿고, 앞쪽 아래는 닿는다
  const lean = { w: 400, d: 20, h: 800, rx: -30 };
  p = scene(lean, 2000, 1850); assert.ok(boxes(p)); assert.equal(hits(p), false);
  assert.equal(hits(scene(lean, 2000, 2150)), true);
  assert.equal(hits(scene(lean, 2000, 1850, 600)), true, '같은 자리라도 높이 600에서는 기운 윗부분에 닿는다');
  // 가구 전체를 돌려도 같은 결과여야 한다
  p = scene(diag, 2250, 2250); p.items[0].rot = 90; assert.equal(hits(p), true, '90° 돌리면 대각선이 (1,1) 방향이 되어 닿는다');
  // 벽 밖 판정도 실제 범위로: 판(ry 45)을 가구째 45° 더 돌리면 z축 방향 판(x ±10, z ±500)이 된다. 감싸는 사각형은 ±510까지 뻗는다
  const wall = x => { const q = scene(diag, 3000, 3000); q.items[0] = { ...q.items[0], x, z: 2000, rot: 45 }; const s = M.shape(q, q.items[0]); return [M.conflicts(q).items.get('A'), Math.round(s.minx), Math.round(s.maxx), Math.round(s.minz), Math.round(Math.min(...s.poly.map(v => v[0])))]; };
  assert.deepEqual(wall(100), [undefined, 90, 110, 1500, -410], '사각형은 벽을 410mm 넘지만 판은 방 안');
  assert.equal(wall(5)[0], '벽 밖');
  assert.equal(wall(3995)[0], '벽 밖');
  assert.equal(M.shape(M.sanitize({ room: {}, library: [{ id: 'e', kind: 'custom', parts: [] }], items: [{ def: 'e', x: 500, z: 500 }] }), { def: 'e', x: 500, z: 500, rot: 0 }).minx, 450, '부품이 없는 가구는 기본 상자');
  // 문 열림 영역은 부품의 바닥 그림자와 견준다: 아래쪽 벽 문(1000~1900, 경첩 x=1000)의 부채꼴 안과, 원호 바깥 모서리
  const door = (bx, bz) => { const q = scene(diag, bx, bz); q.items.shift(); q.openings = [M.fixOpening(q.room, { type: 'door', wall: 'S', pos: 1000, w: 900 })]; return M.conflicts(q).doors.size; };
  assert.equal(door(1450, 3500), 1);
  assert.equal(door(1900, 2700), 0);
});

test('DAE: 태그 짝이 맞고, 묶음·상자 수와 좌표 변환이 맞다', () => {
  const p = example(), nodes = M.exportNodes(p), dae = M.toDAE(nodes), stack = [];
  for (const [, close, tag, self] of dae.matchAll(/<(\/?)([A-Za-z_]+)[^>]*?(\/?)>/g)) {
    if (self) continue;
    if (close) assert.equal(stack.pop(), tag); else stack.push(tag);
  }
  assert.deepEqual(stack, []);
  const boxes = nodes.reduce((s, n) => s + n.boxes.length, 0);
  assert.equal(nodes.length, 1 + p.items.length);
  assert.equal(dae.match(/<geometry /g).length, boxes);
  assert.equal(dae.match(/<instance_geometry /g).length, boxes);
  assert.match(dae, /<up_axis>Z_UP<\/up_axis>/);
  assert.match(dae, /name="옷장"><matrix>0 1 0 3880 -1 0 0 -700 0 0 1 0 0 0 0 1</, '−90° 회전, (x,−z) 이동');
  // 상자 하나: 로컬 (x 0..10, y 0..30, z 0..20) → Z_UP (X 0..10, Y −20..0, Z 0..30)
  const one = M.toDAE([{ name: 'a', x: 0, z: 0, rot: 0, boxes: [{ name: 'b', x: 0, y: 0, z: 0, w: 10, d: 20, h: 30, color: '#ffffff' }] }]);
  assert.match(one, /count="24">0 -20 0 10 -20 0 0 0 0 10 0 0 0 -20 30 10 -20 30 0 0 30 10 0 30</);
});

test('구매 목록: 손잡이·매트리스, 경첩(문 높이 기준), 서랍 레일', () => {
  const buy = params => M.buyList(M.partsOf({ kind: params.kind, params })), get = (list, n) => list.find(r => r.name === n);
  const dr = buy({ kind: 'drawers' });
  assert.deepEqual([get(dr, '서랍 레일(쌍)').n, get(dr, '서랍 레일(쌍)').spec, get(dr, '손잡이').n], [4, '400mm', 4]);
  assert.equal(get(buy({ kind: 'cabinet', W: 1200, D: 600, H: 2200, doors: 2 }), '경첩').n, 10);
  assert.equal(get(buy({ kind: 'cabinet' }), '경첩'), undefined, '문이 없으면 경첩 줄도 없다');
  assert.equal(get(buy({ kind: 'bed' }), '매트리스').n, 1);
  assert.deepEqual([M.part({ role: 'x' }).role, M.part({ role: 'doorL' }).role], [undefined, 'doorL']);
  const doors = M.partsOf({ kind: 'cabinet', params: { doors: 3 } }).filter(p => p.role);
  assert.deepEqual(doors.map(p => p.role), ['doorL', 'doorR', 'doorL']);
  assert.match(M.cutCSV([], dr), /\r\n\r\n구매품,규격,수량\r\n"손잡이"/);
});

test('판재 배치: 띠 채우기, 톱날 간격, 원판보다 큰 조각, 묶음', () => {
  const o = M.cutOpts({ L: 1220, W: 2440, kerf: 3 }), row = (L, W, n, T = 18, color = '#d8b98b', name = '판') => ({ name, L, W, T, n, color });
  assert.deepEqual(o, { L: 2440, W: 1220, kerf: 3 }, '폭이 길이보다 크면 맞바꾼다');
  assert.deepEqual(M.cutOpts({ L: 'x', kerf: 99 }), { L: 2440, W: 1220, kerf: 10 });
  assert.equal(M.nest([row(1200, 600, 4)], o)[0].sheets.length, 1);
  assert.equal(M.nest([row(1200, 600, 5)], o)[0].sheets.length, 2);
  // 실제 가구: 모든 조각이 한 번씩, 원판 안에, 서로 톱날 두께 이상 떨어져 놓인다
  const { rows } = M.cutList(M.partsOf({ kind: 'drawers', params: {} })), groups = M.nest(rows, o);
  assert.equal(groups.reduce((s, g) => s + g.over.length + g.sheets.flat().length, 0), rows.reduce((s, r) => s + r.n, 0));
  for (const g of groups) for (const sheet of g.sheets) sheet.forEach((a, i) => {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.l <= o.L && a.y + a.w <= o.W, '원판 안');
    for (const b of sheet.slice(i + 1)) assert.ok(a.x + a.l + o.kerf <= b.x || b.x + b.l + o.kerf <= a.x || a.y + a.w + o.kerf <= b.y || b.y + b.w + o.kerf <= a.y, '톱날 간격');
  });
  const mixed = M.nest([row(3000, 500, 2), row(500, 300, 1), row(500, 300, 1, 15), row(500, 300, 1, 18, '#ffffff'), row(900, 90, 4, 90)], o);
  assert.deepEqual(mixed.map(g => [g.T, g.color, g.sheets.length, g.over.length]), [[18, '#d8b98b', 1, 2], [15, '#d8b98b', 1, 0], [18, '#ffffff', 1, 0]], '두께·색이 다르면 묶음이 갈리고 각재(90mm)는 빠진다');
  const svg = M.nestSVG(M.nest([row(500, 300, 1, 18, '#d8b98b', '<b>')], o), o);
  assert.ok(!svg.includes('<b>') && svg.includes('500×300') && svg.includes('18mm 자작합판 1/1'));
});

test('치수 도면: 부품마다 세 그림, 전체 치수, 이름 escape, 돌린 부품', () => {
  const nums = s => [...s.matchAll(/>(\d+)<\/text>/g)].map(m => +m[1]).sort((a, b) => a - b);
  const d = { name: '<b>장', kind: 'cabinet', params: { doors: 2 } }, b = M.bounds(M.partsOf(d)), svg = M.drawingSVG(d);
  assert.equal(svg.match(/<polygon /g).length, M.partsOf(d).length * 3);
  assert.deepEqual(nums(svg), [b.W, b.H, b.D].sort((x, y) => x - y));
  assert.ok(!svg.includes('<b>') && svg.includes('단위 mm'));
  const tilt = M.drawingSVG({ name: '기운 판', kind: 'custom', parts: [M.part({ w: 400, d: 20, h: 800, rx: -30, ry: 45, rz: 10 }), M.part({ w: 100, d: 100, h: 100, x: 500 })] });
  assert.equal(tilt.match(/<polygon /g).length, 6);
  assert.ok(!/NaN|Infinity|undefined/.test(tilt));
  // 정면도(둘째 묶음)에서 앞에 있는 문이 뒷판보다 나중에 그려진다
  const one = M.drawingSVG({ name: 'a', kind: 'custom', parts: [M.part({ w: 100, d: 10, h: 100, z: 90, color: '#111111' }), M.part({ w: 100, d: 10, h: 100, z: 0, color: '#eeeeee' })] });
  assert.deepEqual([...one.matchAll(/fill="(#[0-9a-f]{6})"\/>/g)].slice(2, 4).map(m => m[1]), ['#eeeeee', '#111111']);
});
