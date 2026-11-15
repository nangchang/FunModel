#!/usr/bin/env python3
"""개발용 정적 서버. `python3 -m http.server`와 같지만 Cache-Control: no-cache를 붙인다.
이게 없으면 브라우저(특히 iOS Safari)가 새로고침해도 예전 JS를 캐시에서 꺼내 쓴다.
no-cache는 "저장은 하되 쓸 때마다 서버에 바뀌었는지 묻기"라서 안 바뀐 파일은 304로 빠르게 끝난다."""
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


http.server.test(HandlerClass=Handler, port=int(sys.argv[1]) if len(sys.argv) > 1 else 5173)
