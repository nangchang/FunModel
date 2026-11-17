// 화면 스모크 테스트(npm run test:e2e). 서버는 Playwright가 띄우고 내린다. 5173·5174는 다른 세션이 쓸 수 있어 5199
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1, // serve.py(http.server)는 접속 대기열이 5라 브라우저 여럿이 동시에 열면 ERR_CONNECTION_RESET으로 모듈을 못 받는다
  use: { baseURL: 'http://localhost:5199' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'python3 serve.py 5199', url: 'http://localhost:5199', reuseExistingServer: false },
});
