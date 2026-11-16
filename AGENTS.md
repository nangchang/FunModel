# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## 명령

```bash
npm start                                              # python3 serve.py → http://localhost:5173
npm test                                               # node --test (tests/*.test.mjs)
node --test --test-name-pattern="adopt" tests/model.test.mjs   # 이름으로 테스트 하나만
```

- 빌드·번들러·린터·npm 의존성이 없다. 정적 ES 모듈을 `index.html`의 importmap(`three` → `vendor/three.module.min.js`)으로 바로 연다. `file://`로는 모듈이 안 열리므로 서버가 필요하다.
- `serve.py`가 `Cache-Control: no-cache`를 붙인다. 이게 없으면 브라우저(특히 iOS Safari)가 예전 JS를 쓴다. 미리보기 설정은 `.claude/launch.json`의 `funmodel`(포트 5173).
- 테스트는 `src/model.js`만 본다. `src/app.js`(화면)는 자동 테스트가 없어서 브라우저로 직접 확인해야 한다. 콘솔에서 `window.app`(`M`, `ui`, `store`, `proj`, `camera`)으로 상태를 볼 수 있다.

## 구조

두 파일로 나뉜다. 계산은 전부 `src/model.js`(DOM·three.js 없음, node로 테스트)에, 화면은 `src/app.js`에 둔다. 새 계산 로직은 model.js에 넣고 테스트를 붙인다.

### 좌표와 단위 (model.js 머리 주석이 기준)
- 단위 mm. 방: x→오른쪽, z→평면도 아래, y↑. 벽 두께 `WT`(100)는 방 치수 바깥쪽에 붙는다.
- 가구 부품: `x,y,z` = 최소 모서리, z는 뒤(0)→앞(+). 부품 회전 `rx,ry,rz`(도)는 부품 중심 기준 오일러 XYZ(three.js 기본 순서와 같음, `rotOf`).
- 방에 놓인 가구(item): `x,z` = 발자국 중심, `rot` = y축 회전(0° = 앞면 +z), `y` = 바닥에서 띄운 높이(기본 0. 벽걸이, 다른 가구 위).
- DAE 내보내기는 Z_UP으로 바꾼다: (X,Y,Z) = (x, −z, y).

### 데이터 모델
- 가구 정의(def)는 두 종류: `KINDS`의 생성기(`kind` + `params`, `fields`가 폼·기본값·범위를 정함) 또는 `kind: 'custom'`(`parts` 직접 편집). `partsOf(def)`가 부품 목록을 준다.
- `partsOf`는 `def.params` 객체를 키로 WeakMap 캐시한다. 치수를 바꿀 때는 params를 고치지 말고 새 객체로 갈아 끼운다(`d.params = { ...d.params, [k]: v }`).
- 부품의 선택 표시 두 가지: `hw`(사서 쓰는 것. 재단 목록에서 빠지고 구매 목록에 들어간다), `role`(`'doorL' | 'doorR' | 'drawer'`, L·R은 경첩 쪽). 생성기만 붙이고 `part()`는 허용 값만 남긴다. `buyList`가 이것으로 경첩·서랍 레일 수를 센다.
- 가구 목록(library)은 방과 따로 하나뿐이고 모든 방이 함께 쓴다. 메모리에서는 `store.library`와 지금 방의 `proj.library`가 같은 배열이다(`setProj`). 저장할 때는 방에서 library를 빼고 최상위에 한 번만 쓴다.
- 다른 곳에서 온 목록(백업 파일, 가구만 내보낸 파일, v1 저장본)은 `adopt(library, p)`로 합친다. 내용이 같으면 있던 것을 쓰고, id만 겹치고 내용이 다르면 새 id를 주며 `p.items[].def`도 따라 바꾼다.
- `sanitize(raw)`가 유일한 검증 지점이다. 저장본·불러온 JSON뿐 아니라 매 변경 뒤에도 돈다. 새 필드를 추가하면 여기서 형태·범위를 맞춰야 저장·불러오기·되돌리기에서 살아남는다.
- 저장: localStorage `funmodel-v2`. 예전 `funmodel-v1`(방마다 목록)은 처음 열 때 읽어 합치고 원본은 그대로 둔다.
- 원판 설정 `store.cut = { L, W, kerf }`(판재 배치용, `cutOpts`가 범위를 맞춘다)은 공구 설정이라 저장본 최상위에 있다. 방 백업(.json)에는 들어가지 않고 되돌리기 대상도 아니다.

### 간섭 판정 (`checker`, `conflicts`)
가구마다 `'벽 밖' | '천장 넘음' | '문 막음' | '겹침' | null`(앞에 있는 것이 먼저). 감싸는 사각형이 아니라 부품 단위의 기운 상자(OBB 분리축)로 본다(책상 밑 의자는 통과). 윗면이 바닥에서 30mm 이하(러그)면 겹침에서 빠진다. 안쪽으로 열리는 문은 열림 부채꼴(`doorZone`)과 부품의 바닥 그림자를 견준다.

가구 자신의 문·서랍이 열리는 공간은 `openZones(proj, it)`가 따로 본다(`role`이 붙은 부품만). 고른 가구에만 바닥 선과 "열림 막힘" 표시로 보여 주고, `conflicts`와 경고 색에는 넣지 않는다. 책상 서랍 앞의 의자처럼 일부러 둔 배치가 흔해서다.

### 화면 흐름 (app.js)
- 모든 변경은 `commit(fn)`: 되돌리기용으로 `proj`를 JSON 스냅숏 → `fn`이 `proj`를 직접 고침 → `refresh()` = `sanitize` → 장면 `rebuild()` → `renderPanel()` → 400ms 뒤 저장. 되돌리기 기록은 방 단위이고 방을 바꾸면 비워진다.
- 이벤트 연결은 속성으로 한다. `data-a="이름"` 클릭 → `ACT[이름](dataset)`. 입력 `data-f="범위.키"` 변경 → `apply` → `SET[범위](k, v, raw)`. `ui.` 범위는 화면 상태만 바꾸고 commit하지 않는다.
- 패널은 매번 HTML 문자열을 `innerHTML`로 새로 그린다. 사용자 문자열은 반드시 `esc()`를 거친다.
- 모드 `ui.mode`: `room`(배치) / `lib`(가구 관리, 미리보기만) / `design`(설계). 보기 `ui.view`: `3d` / `plan`(정사영, 회전 잠금). 장면은 변경 때마다 통째로 다시 만들고, 그리기는 `invalidate()`로 필요할 때만 한다.
- 터치는 "이미 고른 가구만 끌린다", 마우스는 바로 끈다(화면 돌리기와 구분). 설계 화면의 부품은 TransformControls로 옮기거나 돌린다.

## 관례
- 주석·UI 문구·테스트 이름은 한국어. 코드는 촘촘한 한 줄 스타일이다. 주변 코드에 맞춘다.
- `vendor/`는 three.js 0.160.0 사본(모듈 + OrbitControls, TransformControls)이다. 다른 three 기능을 쓰려면 같은 버전의 파일을 여기에 더해야 한다.
