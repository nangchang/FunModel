# FunModel — 가구 설계·방 배치

이사나 가구를 사기 전에 방 치수대로 가구를 놓아 보고, 맞는지(벽·문·다른 가구와 부딪히는지) 확인하는 3D 도구다. 가구를 mm 단위로 직접 설계할 수도 있다. 설치·가입이 없고 데이터는 그 브라우저에만 저장된다.

- 바로 쓰기: https://nangchang.github.io/FunModel/
- 라이선스: MIT([LICENSE](LICENSE)). `vendor/`의 three.js도 MIT다.

```bash
npm start    # http://localhost:5173 (file:// 로는 모듈이 안 열린다)
npm test     # 모델 단위 테스트 (node --test)
```

| 파일 | 내용 |
|---|---|
| `src/model.js` | 순수 계산: 가구 생성기, 간섭 판정, 벽·문, 재단 목록, DAE, 입력 검증 |
| `src/app.js` | 화면: 상태·되돌리기, three.js 장면, 끌기, 패널, 내보내기, 저장 |
| `index.html` | 화면 뼈대. 앱이 못 열리거나 죽으면 알림과 "백업 저장"을 띄우는 작은 오류 안내 스크립트가 들어 있다 |
| `manifest.json`, `icon.png` | 홈 화면에 추가할 때 쓰는 이름·아이콘 |
| `serve.py` | 개발용 서버. 브라우저가 예전 JS를 캐시에서 쓰지 않게 `Cache-Control: no-cache`를 붙인다 |
| `vendor/` | three.js 0.160.0 (모듈 + OrbitControls, TransformControls) |

가구 목록은 방과 따로 하나만 두고 모든 방이 함께 쓴다. 데이터는 브라우저 localStorage(`funmodel-v2`)에만 저장된다(예전 `funmodel-v1`은 처음 열 때 읽어서 합친다). 다른 기기로 옮기려면 메뉴의 "전체 백업 (.json)"으로 모든 방을 한 파일에 저장하고, 옮길 곳에서 "파일에서 불러오기"로 연다(지우지 않고 없는 방만 더한다). 방 하나만 넘길 때는 "이 방만 저장 (.json)"을 쓴다. 방 없이 가구만 옮기려면 `가구` 화면의 "가구만 내보내기"를 쓴다(불러오면 목록에 없는 가구만 더해진다).
