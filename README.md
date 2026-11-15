# FunModel — 가구 설계·방 배치

브라우저에서 가구를 mm 단위로 설계하고 방에 놓아 보는 3D 모델러. 빌드 없이 도는 정적 웹앱이다.

```bash
npm start    # http://localhost:5173 (file:// 로는 모듈이 안 열린다)
npm test     # 모델 단위 테스트 (node --test)
```

| 파일 | 내용 |
|---|---|
| `src/model.js` | 순수 계산: 가구 생성기, 간섭 판정, 벽·문, 재단 목록, DAE, 입력 검증 |
| `src/app.js` | 화면: 상태·되돌리기, three.js 장면, 끌기, 패널, 내보내기, 저장 |
| `serve.py` | 개발용 서버. 브라우저가 예전 JS를 캐시에서 쓰지 않게 `Cache-Control: no-cache`를 붙인다 |
| `vendor/` | three.js 0.160.0 (모듈 + OrbitControls, TransformControls) |

가구 목록은 방과 따로 하나만 두고 모든 방이 함께 쓴다. 데이터는 브라우저 localStorage(`funmodel-v2`)에만 저장된다(예전 `funmodel-v1`은 처음 열 때 읽어서 합친다). 다른 기기로 옮기려면 메뉴의 백업(.json)을 쓴다.
