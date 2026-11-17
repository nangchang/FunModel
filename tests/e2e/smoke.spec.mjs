// 화면 스모크 테스트: 방 구조를 바꾸기 전에 지금 동작을 지키는 안전망. 상태는 window.app으로 읽기만 하고 조작은 화면으로 한다
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

let errors;
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => { expect(errors).toEqual([]); }); // 잡히지 않은 예외가 한 번도 없어야 한다

const KEY = 'funmodel-v2';
const example = async page => { await page.goto('/'); await page.locator('#start button:not([data-a])').click(); }; // 첫 화면에서 "예시 방 둘러보기"
const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(r))); // 패널은 다음 프레임에 다시 그려진다
const items = page => page.evaluate(() => app.proj.items.length);

test('첫 화면: 치수를 넣고 시작하면 그 치수의 내 방이 저장된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#start [name=w]').fill('3000');
  await page.locator('#start [name=d]').fill('2500');
  await page.locator('#start [name=h]').fill('2300');
  await page.locator('#start [data-a=start]').click();
  await expect(page.locator('#start')).toBeHidden();
  expect(await page.evaluate(() => [app.proj.name, app.proj.room.w, app.proj.room.d, app.proj.room.h, app.store.projects.length])).toEqual(['내 방', 3000, 2500, 2300, 1]);
  await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k))?.projects?.[0]?.name, KEY)).toBe('내 방');
});

test('첫 화면: 예시 방 둘러보기는 예시를 남기고, 고르기 전 pagehide에는 저장하지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(k => { dispatchEvent(new Event('pagehide')); return localStorage.getItem(k); }, KEY)).toBeNull();
  await page.locator('#start button:not([data-a])').click();
  expect(await page.evaluate(() => [app.proj.name, app.proj.items.length])).toEqual(['침실 예시', 6]);
  await expect.poll(() => page.evaluate(k => localStorage.getItem(k) !== null, KEY)).toBe(true);
});

test('가구 놓기: 내 가구·규격 가구를 누르면 놓이고 고른 상태, 되돌리기 한 번에 목록까지 돌아간다', async ({ page }) => {
  await example(page);
  await page.locator('#pbody [data-a=add]').first().click();
  expect(await items(page)).toBe(7);
  expect(await page.evaluate(() => app.ui.sel?.id === app.proj.items.at(-1).id)).toBe(true);
  const lib = await page.evaluate(() => app.store.library.length);
  await page.locator('#pbody [data-a=desel]').click(); // 고른 가구 패널을 닫아야 가구 탭이 다시 보인다
  await page.locator('#pbody [data-a=addCat]').first().click();
  expect(await page.evaluate(() => [app.proj.items.length, app.store.library.length, app.ui.sel?.id === app.proj.items.at(-1).id])).toEqual([8, lib + 1, true]);
  await page.locator('[data-a=undo]').click();
  expect(await page.evaluate(() => [app.proj.items.length, app.store.library.length])).toEqual([7, lib]);
});

test('검색·분류: 맞는 카드만 보이고 입력 포커스가 남는다, 분류 칩은 그 분류만', async ({ page }) => {
  await example(page);
  const q = page.locator('#pbody .q');
  const h = await q.elementHandle();
  await q.fill('침대');
  await frame(page); // 다시 그려졌다면 이 입력은 문서에서 빠지고 포커스도 잃는다
  expect(await h.evaluate(e => e.isConnected && e === document.activeElement)).toBe(true);
  const names = await page.locator('#pbody .card[data-n]:visible').evaluateAll(els => els.map(e => e.dataset.n));
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(n => n.includes('침대'))).toBe(true);
  await q.fill('');
  await page.locator('#pbody [data-a=tab][data-k=cat][data-v=가전]').click();
  await expect(page.locator('#pbody .grp h3')).toHaveText(['가전']);
});

test('간섭 판정: 패널 입력으로 가구 둘을 같은 자리에 두면 HUD에 겹침이 뜬다', async ({ page }) => {
  await example(page);
  await expect(page.locator('#hud .chip.bad')).toHaveCount(0);
  const [x, z] = await page.evaluate(() => { const it = app.proj.items.find(i => app.M.defOf(app.proj, i).name === '퀸 침대'), s = app.M.shape(app.proj, it); return [Math.round(s.minx), Math.round(s.minz)]; });
  await page.locator('#pbody .card', { hasText: '퀸 침대' }).locator('[data-a=add]').click(); // 새 침대가 빈자리에 놓이고 골라진다
  await page.locator('[data-f="item.left"]').fill(String(x));
  await page.locator('[data-f="item.left"]').press('Tab');
  await frame(page);
  await page.locator('[data-f="item.top"]').fill(String(z));
  await page.locator('[data-f="item.top"]').press('Tab');
  await expect(page.locator('#hud .chip.bad')).toContainText('겹침·막힘');
});

test('보기 전환: 3D ↔ 평면, 화면 맞춤, 캔버스에 무언가 그려진다', async ({ page }) => {
  await example(page);
  const canvas = page.locator('#c');
  expect((await canvas.screenshot()).length).toBeGreaterThan(10000); // 한 가지 색뿐이면 PNG가 아주 작다
  await page.locator('header [data-a=view][data-v=plan]').click();
  expect(await page.evaluate(() => [app.ui.view, app.camera.isOrthographicCamera])).toEqual(['plan', true]);
  await page.locator('header [data-a=view][data-v="3d"]').click();
  expect(await page.evaluate(() => app.camera.isPerspectiveCamera)).toBe(true);
  const pos = () => page.evaluate(() => app.camera.position.toArray().map(Math.round));
  const home = await pos();
  await canvas.hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(pos).not.toEqual(home);
  await page.locator('#fit').click();
  expect(await pos()).toEqual(home);
});

test('방 목록: 새 방·복제·삭제, 삭제는 토스트에서 되돌린다', async ({ page }) => {
  await example(page);
  const names = () => page.evaluate(() => app.store.projects.map(p => p.name));
  await page.locator('[data-a=rooms]').click();
  await page.locator('#menu [data-a=newProj]').click();
  await page.locator('[data-a=rooms]').click();
  await page.locator('#menu [data-a=dupProj]').click();
  expect(await names()).toEqual(['침실 예시', '방 2', '방 2 복사']);
  await page.locator('[data-a=rooms]').click();
  await page.locator('#menu [data-a=delProj]').click();
  expect(await names()).toEqual(['침실 예시', '방 2']);
  await page.locator('#toast button').click();
  expect(await names()).toEqual(['침실 예시', '방 2', '방 2 복사']);
  expect(await page.evaluate(() => app.proj.name)).toBe('방 2 복사');
});

test('방 목록: 마지막 방을 지우면 방 1이 생기고, 되돌리면 없어진다', async ({ page }) => {
  await example(page);
  const names = () => page.evaluate(() => app.store.projects.map(p => p.name));
  await page.locator('[data-a=rooms]').click();
  await page.locator('#menu [data-a=delProj]').click();
  expect(await names()).toEqual(['방 1']);
  await page.locator('#toast button').click();
  expect(await names()).toEqual(['침실 예시']);
});

test('내보내기: 버튼이 다 있고 전체 백업·방 저장·평면도 PNG·DAE가 내려받아진다', async ({ page }) => {
  await example(page);
  await page.locator('[data-a=exports]').click();
  for (const a of ['dae', 'png', 'print', 'shot', 'share', 'json', 'backup', 'import']) await expect(page.locator(`#menu [data-a=${a}]`)).toBeVisible();
  await page.keyboard.press('Escape');
  for (const [a, ext] of [['backup', '.json'], ['json', '.json'], ['png', '.png'], ['dae', '.dae']]) {
    await page.locator('[data-a=exports]').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`#menu [data-a=${a}]`).click()]);
    expect(dl.suggestedFilename().endsWith(ext)).toBe(true);
    expect(readFileSync(await dl.path()).length).toBeGreaterThan(100);
  }
});

test('전체 백업 왕복: 같은 백업은 더할 방이 없고, 다른 방은 더해지고, 더 새 버전은 거절', async ({ page }) => {
  await example(page);
  await page.locator('[data-a=exports]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#menu [data-a=backup]').click()]);
  await page.locator('#file').setInputFiles(await dl.path());
  await expect(page.locator('#toast')).toContainText('새로 더할 방이 없습니다');
  const other = await page.evaluate(() => { const p = app.M.newProject('다른 방', false); return app.M.dumpStore({ library: p.library, projects: [p], cut: app.M.cutOpts() }); });
  await page.locator('#file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(other) });
  await expect(page.locator('#toast')).toContainText('방 1개를 불러왔습니다');
  expect(await page.evaluate(() => app.store.projects.map(p => p.name))).toEqual(['침실 예시', '다른 방']);
  const newer = await page.evaluate(() => JSON.stringify({ v: app.M.VER + 1, projects: [] }));
  await page.locator('#file').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(newer) });
  await expect(page.locator('#toast')).toContainText('더 새 버전');
  expect(await page.evaluate(() => app.store.projects.length)).toBe(2);
});

test('저장본 버전 잠금: 더 새 저장본이면 닫기 없는 안내가 뜨고 편집해도 원문이 그대로다', async ({ page }) => {
  const raw = JSON.stringify({ v: 999, projects: [] });
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, raw]);
  await page.goto('/');
  await expect(page.locator('#oops')).toBeVisible();
  await expect(page.locator('#oops [data-k=x]')).toBeHidden();
  await expect(page.locator('#start')).toBeHidden();
  await page.locator('#pbody [data-a=add]').first().click();
  expect(await items(page)).toBe(7);
  expect(await page.evaluate(k => { dispatchEvent(new Event('pagehide')); return localStorage.getItem(k); }, KEY)).toBe(raw); // pagehide = 바로 저장 시도
});

test('깨진 저장본: 원문을 -bad에 남기고 첫 화면은 띄우지 않는다', async ({ page }) => {
  await page.addInitScript(k => localStorage.setItem(k, '{깨짐'), KEY);
  await page.goto('/');
  await expect(page.locator('#pbody [data-a=add]').first()).toBeVisible();
  await expect(page.locator('#start')).toBeHidden();
  expect(await page.evaluate(k => localStorage.getItem(k + '-bad'), KEY)).toBe('{깨짐');
});

test('공유 링크: 빈 저장소에서 읽기 전용으로 열리고, 복사·닫기·못 읽는 링크', async ({ page, browser, baseURL }) => {
  await example(page);
  const hash = '/#room=' + await page.evaluate(() => app.M.encodeShare({ ...app.proj, name: '받은 방' })); // 예시와 이름이 달라야 "받은 방만 남음"을 가린다
  const ctxs = [], open = async url => { const c = await browser.newContext({ baseURL }); ctxs.push(c); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(url); return p; };
  const bed = p => p.evaluate(() => { const it = app.proj.items.find(i => app.M.defOf(app.proj, i).name === '퀸 침대'), r = app.camera.position.clone().set(it.x, app.M.shape(app.proj, it).y1 / 2, it.z).project(app.camera), c = document.querySelector('#c').getBoundingClientRect(); return { x: (r.x + 1) / 2 * c.width, y: (1 - r.y) / 2 * c.height }; }); // 침대가 화면에 찍히는 곳

  const v = await open(hash);
  await expect(v.locator('body')).toHaveClass(/viewing/);
  await expect(v.locator('#panel')).toBeHidden();
  await expect(v.locator('header [data-a=exports]')).toBeHidden();
  await expect(v.locator('#start')).toBeHidden();
  const before = await v.evaluate(() => JSON.stringify(app.proj.items));
  await v.locator('#c').click({ position: await bed(v) });
  await v.keyboard.press('r');
  await v.keyboard.press('ArrowLeft');
  expect(await v.evaluate(() => [JSON.stringify(app.proj.items), app.ui.sel])).toEqual([before, null]);
  await v.locator('[data-a=copyShared]').click();
  await expect(v.locator('body')).not.toHaveClass(/viewing/);
  expect(await v.evaluate(() => [app.store.projects.map(p => p.name), location.hash])).toEqual([['받은 방'], '']);
  await v.locator('#c').click({ position: await bed(v) }); // 편집할 수 있게 되면 같은 탭이 침대를 고른다(위의 탭이 헛손질이 아니었음)
  await expect.poll(() => v.evaluate(() => app.ui.sel?.type)).toBe('item');

  const c = await open(hash);
  await c.locator('[data-a=closeShared]').click();
  await expect(c.locator('#start')).toBeVisible();

  const bad = await open('/#room=망가진링크');
  await expect(bad.locator('#toast')).toContainText('읽을 수 없는 공유 링크');
  for (const c of ctxs) await c.close();
});

test('기둥: 넣고 치수를 키우면 방 안으로 맞춰지고 가구와 겹치면 경고, 삭제', async ({ page }) => {
  await example(page);
  await page.locator('#pbody [data-a=tab][data-k=tab][data-v=open]').click();
  await page.locator('#pbody [data-a=addBlock]').click();
  await page.locator('[data-f="block.w"]').fill('99999');
  await page.locator('[data-f="block.w"]').press('Tab');
  expect(await page.evaluate(() => { const b = app.proj.blocks[0]; return [b.x, b.w]; })).toEqual([0, 4200]);
  await expect(page.locator('#hud .chip.bad')).toContainText('겹침·막힘');
  await page.locator('#pbody [data-a=del]').click();
  expect(await page.evaluate(() => app.proj.blocks.length)).toBe(0);
});

test('밑그림: 그림을 넣으면 방 탭에 입력이 생기고, 두 점으로 축척을 맞추고, 지운다', async ({ page }) => {
  await example(page);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 20, 30); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('#img').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect.poll(() => page.evaluate(() => !!app.proj.bg)).toBe(true);
  await page.locator('#pbody [data-a=tab][data-k=tab][data-v=room]').click();
  await expect(page.locator('[data-f="bg.w"]')).toBeVisible();
  const w = await page.evaluate(() => app.proj.bg.w);
  page.once('dialog', d => d.accept('1000'));
  await page.locator('#pbody [data-a=pickBg][data-v=scale]').click();
  await expect(page.locator('#hud .chip.pick')).toBeVisible();
  const box = await page.locator('#c').boundingBox();
  await page.locator('#c').click({ position: { x: box.width * .4, y: box.height / 2 } });
  await expect(page.locator('#hud .chip.pick')).toContainText('둘째 점');
  await page.locator('#c').click({ position: { x: box.width * .6, y: box.height / 2 } });
  await expect.poll(() => page.evaluate(() => app.proj.bg.w)).not.toBe(w);
  await page.locator('#pbody [data-a=bgDel]').click();
  expect(await page.evaluate(() => app.proj.bg)).toBeUndefined();
});

test('설계 화면: 치수를 바꾸면 가구 크기가 바뀌고 재단 목록에 표가 나온다', async ({ page }) => {
  await example(page);
  await page.locator('header [data-a=mode][data-v=lib]').click();
  await page.locator('#pbody [data-f="ui.defId"]', { hasText: '책상' }).click();
  await page.locator('#pbody [data-a=mode][data-v=design]').click();
  await page.locator('[data-f="param.W"]').fill('1500');
  await page.locator('[data-f="param.W"]').press('Tab');
  expect(await page.evaluate(() => { const d = app.proj.library.find(d => d.id === app.ui.defId); return [d.name, app.M.bounds(app.M.partsOf(d)).W]; })).toEqual(['책상', 1500]);
  await page.locator('#pbody [data-a=tab][data-k=dtab][data-v=cut]').click();
  await expect(page.locator('#pbody table.cut tr').nth(1)).toBeVisible(); // 머리줄 + 부품 줄
});

test('좁은 화면(360px): 헤더가 넘치지 않고 가로 스크롤이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await example(page);
  await expect(page.locator('#pbody [data-a=add]').first()).toBeVisible();
  expect(await page.evaluate(() => { const h = document.querySelector('header'), d = document.documentElement; return [h.scrollWidth <= h.clientWidth, d.scrollWidth <= d.clientWidth]; })).toEqual([true, true]);
});
