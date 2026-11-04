"""Check guest exit status and recovery with a locally built SDK and kernel."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk-dir', type=Path, default=ROOT/'packages/wasmer-js/dist')
parser.add_argument('--chrome', default='/usr/bin/google-chrome')
args = parser.parse_args()

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm'}
    def translate_path(self, path):
        if path.startswith('/sdk/'):
            candidate = (args.sdk_dir/path[5:]).resolve()
            if candidate.is_relative_to(args.sdk_dir.resolve()): return str(candidate)
            return str(ROOT/'.not-found')
        return super().translate_path(path)
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
    def log_message(self, *_): pass

with ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT))) as server:
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=args.chrome, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: print('CONSOLE:', message.text, flush=True) if message.type == 'error' else None)
                page.goto(f'http://127.0.0.1:{server.server_port}/tests/process-exit.html')
                result = page.evaluate("async () => (await import('/.test-build/browser-process-exit.mjs')).checkProcessExit()")
                assert not errors, errors
                print(json.dumps(result, indent=2))
                print('Browser process exit and recovery checks passed')
            finally: browser.close()
    finally:
        server.shutdown()
        thread.join()
