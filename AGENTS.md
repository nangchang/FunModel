# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## 명령

```bash
npm start                                              # python3 serve.py → http://localhost:5173
npm test                                               # node --test (tests/*.test.mjs)
node --test --test-name-pattern="adopt" tests/model.test.mjs   # 이름으로 테스트 하나만
npm run test:e2e                                       # 화면 스모크 테스트(Playwright, tests/e2e/smoke.spec.mjs)
```

- 빌드·번들러·린터가 없고 런타임 의존성이 없다(개발용으로 Playwright 하나). 정적 ES 모듈을 `index.html`의 importmap(`three` → `vendor/three.module.min.js`)으로 바로 연다. `file://`로는 모듈이 안 열리므로 서버가 필요하다.
- `serve.py`가 `Cache-Control: no-cache`를 붙인다. 이게 없으면 브라우저(특히 iOS Safari)가 예전 JS를 쓴다. 미리보기 설정은 `.claude/launch.json`의 `funmodel`(포트 5173).
- 푸시·PR마다 GitHub Actions(`.github/workflows/test.yml`)가 `npm test`를 돈다.
- `npm test`는 `src/model.js`만 보고 의존성 없이 돈다. `npm run test:e2e`는 Playwright가 `python3 serve.py 5199`를 띄워 Chromium으로 화면 흐름(첫 화면·배치·내보내기·공유 링크 등)을 훑는다. 처음에는 `npm i && npx playwright install chromium`. 스모크 테스트라 세부 동작·모양은 여전히 브라우저로 직접 확인해야 한다. 콘솔에서 `window.app`(`M`, `ui`, `store`, `proj`, `camera`)으로 상태를 볼 수 있다.

## 구조

계산과 화면 두 파일로 나뉜다(규격 가구 데이터만 따로). 계산은 전부 `src/model.js`(DOM·three.js 없음, node로 테스트)에, 화면은 `src/app.js`에 둔다. 새 계산 로직은 model.js에 넣고 테스트를 붙인다. `src/catalog.js`는 규격 가구 데이터(`CATALOG` = `{ cat, name, kind, params }[]`, 분류 순서 `CATS`)만 둔다. params는 생성기 `fields` 범위 안이어야 한다(테스트가 본다).

### 좌표와 단위 (model.js 머리 주석이 기준)
- 단위 mm. 방: x→오른쪽, z→평면도 아래, y↑. 벽 두께 `WT`(100)는 방 치수 바깥쪽에 붙는다.
- 가구 부품: `x,y,z` = 최소 모서리, z는 뒤(0)→앞(+). 부품 회전 `rx,ry,rz`(도)는 부품 중심 기준 오일러 XYZ(three.js 기본 순서와 같음, `rotOf`).
- 방에 놓인 가구(item): `x,z` = 발자국 중심, `rot` = y축 회전(0° = 앞면 +z), `y` = 바닥에서 띄운 높이(기본 0. 벽걸이, 다른 가구 위).
- 방 모양 `room.parts = [{ id, x, z, w, d }]`: 축 정렬 사각형 조각의 합집합(겹치거나 맞붙으면 이어짐). 조각이 하나면 늘 (0,0)이고 치수는 `room.w`·`room.d`가 정한다. 둘 이상이면 `room.w`·`room.d`는 sanitize가 다시 계산한 원점부터 감싸는 크기다(카메라·빈자리 훑기·SVG 크기는 이것을 쓴다). 기하는 조각 경계의 압축 격자 하나로: `inside`, `cells`(안쪽·바깥 칸 사각형), `segs`(둘레 벽 조각 `{ wall, at, s0, s1 }`, wall = 방의 위(N)/아래(S)/왼(W)/오른(E) 벽, at = 벽 선 좌표, s = 벽을 따라가는 절대 좌표), `reach`(점에서 네 방향으로 닿는 벽).
- 문·창문 `{ wall, at, pos, ... }`: `at`으로 붙은 벽 선, `pos`는 벽을 따라가는 절대 좌표(사각형 방에서는 모서리에서 잰 값과 같다). `fixOpening`이 같은 방향 벽 조각 중 가장 가까운 줄·구간에 붙인다(at 없는 예전 저장본은 바깥 벽, 벽이 사라지면 가까운 벽으로 옮김). 벽 좌표계 `FRAMES[wall]({ at })`는 벽 조각·개구부 객체에서 바로 만든다(`spanBox(sg, ...)`, `doorZone(o)`).
- 안쪽 벽 `proj.walls = [{ id, dir, x, z, len }]`: 축 정렬 선분(`h`는 (x, z)에서 +x로, `v`는 +z로). 두께 `WT`는 선 양쪽에 반씩, 높이는 방 높이. `fixWall`이 범위를 맞춘다(감싸는 상자 안, 길이 300 이상, 100개까지). `segs(room, walls)`가 둘레 벽 뒤에 면마다 하나씩 `{ ..., inner: id }`를 덧붙인다(가로 벽은 N(아래를 보는 면)·S, 세로 벽은 W(오른쪽을 보는 면)·E). wall의 뜻이 둘레 벽과 같아 `FRAMES`·`doorZone`·`spanBox`가 그대로 통하고, 문을 붙인 면이 곧 열리는 쪽이다. `wallBoxes(room, openings, blocks, walls)`는 안쪽 벽을 한 번만(`inner: true`, `id`, wall 없음) 만들고 어느 면의 개구부든 뚫는다. `segs`를 쓰는 곳(`fixOpening`, `reach`, `planSVG`, 화면의 끌기 붙이기·벽 선택)은 모두 walls를 넘겨받는다.
- DAE 내보내기는 Z_UP으로 바꾼다: (X,Y,Z) = (x, −z, y).

### 데이터 모델
- 가구 정의(def)는 두 종류: `KINDS`의 생성기(`kind` + `params`, `fields`가 폼·기본값·범위를 정함) 또는 `kind: 'custom'`(`parts` 직접 편집). `partsOf(def)`가 부품 목록을 준다.
- `partsOf`는 `def.params` 객체를 키로 WeakMap 캐시한다. 치수를 바꿀 때는 params를 고치지 말고 새 객체로 갈아 끼운다(`d.params = { ...d.params, [k]: v }`).
- 부품의 선택 표시 두 가지: `hw`(사서 쓰는 것. 재단 목록에서 빠지고 구매 목록에 들어간다), `role`(`'doorL' | 'doorR' | 'drawer'`, L·R은 경첩 쪽). 생성기만 붙이고 `part()`는 허용 값만 남긴다. `buyList`가 이것으로 경첩·서랍 레일 수를 센다.
- 가구 목록(library)은 방과 따로 하나뿐이고 모든 방이 함께 쓴다. 메모리에서는 `store.library`와 지금 방의 `proj.library`가 같은 배열이다(`setProj`). 저장할 때는 방에서 library를 빼고 최상위에 한 번만 쓴다.
- 다른 곳에서 온 목록(백업 파일, 가구만 내보낸 파일, v1 저장본)은 `adopt(library, p)`로 합친다. 내용이 같으면 있던 것을 쓰고, id만 겹치고 내용이 다르면 새 id를 주며 `p.items[].def`도 따라 바꾼다.
- 규격 가구는 `useDef(library, entry)`로 공용 목록에 넣는다(내용이 같은 것이 있으면 그것, 없으면 새 id로 push). `findDef`는 찾기만 한다. 견주기는 `adopt`와 같은 `same`이라 sanitize가 만드는 모양(키 순서, 다 채운 params)으로 만들어 견준다. 목록에 이미 있는 규격 항목은 가구 탭에서 숨긴다.
- `sanitize(raw)`가 유일한 검증 지점이다. 저장본·불러온 JSON뿐 아니라 매 변경 뒤에도 돈다. 새 필드를 추가하면 여기서 형태·범위를 맞춰야 저장·불러오기·되돌리기에서 살아남는다.
- 방의 고정 요소 `proj.blocks = [{ id, x, z, w, d, h }]`(기둥·붙박이): 방 좌표의 축 정렬 상자, x,z = 최소 모서리, h = 바닥부터(기본 방 높이). `fixBlock`이 범위를 맞춘다. `wallBoxes(room, openings, blocks)`가 `kind: 'block'`(wall 없음)으로 덧붙여 벽과 같이 그리고 내보낸다.
- 밑그림 `proj.bg = { src, ar, x, z, w, op }`(없으면 키가 없다): 줄인 그림의 data URL(png·jpeg·webp, `BGMAX` 이하), 세로/가로 비, 그림 왼쪽 위의 방 좌표, 그림 가로의 실제 mm, 불투명도. 소수를 유지한다(`real`). 축척·위치는 `bgScale`·`bgMove`. 공유 링크(`encodeShare`)에서는 뺀다.
- 저장: localStorage `funmodel-v2`. 저장본 형식 `VER` = 4(3: blocks·bg, 4: room.parts와 개구부 at·절대 pos, 안쪽 벽 walls. 예전 앱이 새 필드를 지운 채 덮어쓰지 않게 올렸다. 없는 필드는 기본값이라 v 없음·2·3도 그대로 읽는다). 형식은 `dumpStore`(쓰기)·`readStore`(읽기, v1도 같은 경로)이고 이것이 곧 전체 백업 파일이다. 예전 `funmodel-v1`(방마다 목록)은 처음 열 때 읽어 합치고 원본은 그대로 둔다. 둘 다 없으면(`fresh`) 예시 방 위에 첫 화면 `<dialog id="start">`(방 치수로 시작 / 예시 둘러보기)를 띄우고, 닫힐 때까지 `flush`가 저장하지 않는다(`locked`와 따로).
- 버전: 저장본의 `v`가 `VER`보다 크면(더 새 앱이 씀) 예시로 시작하고 `flush`가 저장하지 않는다(`locked`). 불러온 파일이면 거절한다. 저장본을 못 읽으면 예시로 덮어쓰기 전에 원문을 `funmodel-v2-bad`에 옮긴다.
- 전체 백업 불러오기는 `mergeStore`: 지우지 않고 더한다. 가구는 `adopt`, 방은 내용이 같으면 건너뛰고 id만 겹치면 새 id. 원판 설정은 그대로 두고, 되돌리기 기록은 비운다.
- 공유 링크: `#room=` 뒤에 base64url(deflate-raw(JSON `{ v, ...방 }`)). 방의 library에는 놓인 가구의 정의만 싣는다. `encodeShare(proj)`·`decodeShare(str)`(비동기, 더 새 버전이면 `{ newer: true }`, 못 읽으면 null, 풀린 크기 2MB에서 끊음)가 model.js에 있다.
- 원판 설정 `store.cut = { L, W, kerf }`(판재 배치용, `cutOpts`가 범위를 맞춘다)은 공구 설정이라 저장본 최상위에 있다. 방 백업(.json)에는 들어가지 않고 되돌리기 대상도 아니다.

### 간섭 판정 (`checker`, `conflicts`)
가구마다 `'벽 밖' | '천장 넘음' | '문 막음' | '겹침' | null`(앞에 있는 것이 먼저). '벽 밖' = 감싸는 상자를 넘거나, 부품의 바닥 그림자가 바깥 칸(`cells(room).out`, 감싸는 상자 안의 방 아닌 곳)과 겹침(맞붙은 조각의 이음매는 통과). `openZones`의 방 밖도 같은 기준. 감싸는 사각형이 아니라 부품 단위의 기운 상자(OBB 분리축)로 본다(책상 밑 의자는 통과). 윗면이 바닥에서 30mm 이하(러그)면 겹침에서 빠진다. 기둥(`blocks`)과 안쪽 벽의 바닥에 닿는 조각(벽, 창 아래. 문 자리는 지나갈 수 있다)은 가짜 모양(`blockShape`, id 자리는 null, `fixed`)으로 같은 목록에 넣어 높이까지 본다. 방 문의 열림 부채꼴과는 견주지 않는다(구조는 원래 그 자리에 있다). 안쪽으로 열리는 문은 열림 부채꼴(`doorZone`)과 부품의 바닥 그림자를 견준다.

가구 자신의 문·서랍이 열리는 공간은 `openZones(proj, it)`가 따로 본다(`role`이 붙은 부품만, 기둥·안쪽 벽도 막는 것으로 본다). 고른 가구에만 바닥 선과 "열림 막힘" 표시로 보여 주고, `conflicts`와 경고 색에는 넣지 않는다. 책상 서랍 앞의 의자처럼 일부러 둔 배치가 흔해서다.

통로 보기는 `walk(proj)`(`{ none, area, doors, starts }`): 둘레 벽의 문 가운데에서 300mm 들어간 칸부터 사람 폭 600mm로 걸어서 닿지 않는 바닥. 50mm 격자에서 방 밖·격자 밖, 기둥·안쪽 벽(`fixed`, 문 자리는 뚫림), 머리 높이 1800mm 아래에 걸친 가구 부품의 바닥 그림자(러그 제외)를 막힌 칸으로 보고, 사람은 정사각형(중심에서 5칸)으로 부풀려 번진다(flood fill). 안쪽 벽의 문은 시작점이 아니라 지나가는 자리이고, 둘레 벽에 문이 없으면 칠하지 않는다. 화면은 #hud의 [통로 보기](`ui.walk`, 저장 안 함)를 켰을 때만 계산하고(방 객체가 바뀔 때만, 끄는 동안은 안 함) `conflicts`·경고 개수에는 넣지 않는다(열림 공간과 같은 이유).

### 화면 흐름 (app.js)
- 모든 변경은 `commit(fn)`: 되돌리기용으로 `proj`를 JSON 스냅숏 → `fn`이 `proj`를 직접 고침 → `refresh()` = `sanitize` → 장면 `rebuild()` → `renderPanel()` → 400ms 뒤 저장. 되돌리기 기록은 방 단위이고 방을 바꾸면 비워진다.
- 오류 안내는 `index.html` 머리의 인라인 일반 스크립트다(app.js가 못 열려도 떠야 해서 모듈보다 먼저, 예전 문법으로). 확장·다른 출처 오류는 거른다. app.js는 `window.fmBar(msg, head, keep)`로 같은 막대를 쓴다.
- 이벤트 연결은 속성으로 한다. `data-a="이름"` 클릭 → `ACT[이름](dataset)`. 입력 `data-f="범위.키"` 변경 → `apply` → `SET[범위](k, v, raw)`. `ui.` 범위는 화면 상태만 바꾸고 commit하지 않는다.
- 패널은 매번 HTML 문자열을 `innerHTML`로 새로 그린다. 사용자 문자열은 반드시 `esc()`를 거친다.
- 가구 검색(`ui.q`, 입력 `.q`)은 예외로 다시 그리지 않는다. `#pbody`의 `input` 이벤트에서 `[data-n]`(소문자 이름)의 `hidden`만 바꾸고(`filterQ`), 비게 된 `.grp`(분류 묶음)도 숨긴다. `renderPanel`도 그린 뒤 `filterQ`를 부른다. 분류는 `ui.cat`(기본 '전체', 칩은 `tabs(..., 'chips')`).
- 헤더: 방 이름 버튼(`rooms`: 방 목록·새 방·복제·삭제)과 `내보내기`(`exports`: 내보내기·백업). 둘 다 `<dialog id="menu">` 하나에 내용만 바꿔 띄운다. 방 삭제는 확인 없이 지우고 `toast(msg, undo)`의 [되돌리기](8초)로 되살린다.
- 모드 `ui.mode`: `room`(배치) / `lib`(가구 관리, 미리보기만) / `design`(설계). 보기 `ui.view`: `3d` / `plan`(정사영, 회전 잠금). 장면은 변경 때마다 통째로 다시 만들고, 그리기는 `invalidate()`로 필요할 때만 한다.
- 공유 링크로 열면 보기 상태(`viewing`, 모듈 최상위 await로 풀고 시작)다. 받은 방이 `proj`지만 store에는 넣지 않는다: `setProj`는 store를 건드리지 않고 `flush`·`commit`·되돌리기·끌기·고르기·키보드가 막힌다. `body.viewing`이 패널과 헤더의 `.edit` 버튼을 숨기고 `#shared` 막대를 보인다. [내 방으로 복사]는 파일에서 방을 불러올 때와 같은 `addProject`를 쓴다.
- 평면도는 `planSVG`(치수 포함) 하나를 PNG(이미지로 읽어 캔버스에)와 인쇄(`#print`에 넣고 `window.print()`)가 같이 쓴다.
- 선택 `ui.sel = { type: 'item' | 'open' | 'block' | 'part' | 'wall', id }`. 안쪽 벽(`wall`, '벽·문·기둥' 탭의 [＋ 안쪽 벽]·목록, 입력은 `wall.*`), 기둥과 방 조각(`part`, '방' 탭 목록에서 고름. `selPiece`는 조각이 둘 이상일 때만, 입력은 `piece.*`)은 끌지 않고 패널의 치수 입력으로만 옮긴다. 조각을 지워 하나가 남으면 `ACT.del`이 그 치수를 `room.w`·`room.d`에 넣는다. 문·창문의 벽 선택 값은 `segs(room, walls)` 순번이고, 안쪽 벽의 면은 `안쪽 벽 1 · 오른쪽으로`처럼 열리는 쪽으로 부른다. 안쪽 벽은 3D에서 늘 보이고(wall 없음) 고르면 조각마다 테두리.
- 밑그림 점 찍기 `ui.pick = { kind: 'scale' | 'origin', pts }`: 평면 보기로 바꾸고 #hud에 안내와 [취소]. 그동안 캔버스 탭은 바닥(y = 0) 교점만 받고 가구를 고르거나 끌지 않는다. Esc·취소(`desel`)·모드·방 전환(`go`)·bg가 없어지면(`refresh`) 끝난다. 밑그림 텍스처는 `src` 하나만 캐시하고(`bgTex`) 그림이 바뀔 때 dispose한다.
- 터치는 "이미 고른 가구만 끌린다", 마우스는 바로 끈다(화면 돌리기와 구분). 설계 화면의 부품은 TransformControls로 옮기거나 돌린다.

## 관례
- 주석·UI 문구·테스트 이름은 한국어. 코드는 촘촘한 한 줄 스타일이다. 주변 코드에 맞춘다.
- `vendor/`는 three.js 0.160.0 사본(모듈 + OrbitControls, TransformControls)이다. 다른 three 기능을 쓰려면 같은 버전의 파일을 여기에 더해야 한다.
