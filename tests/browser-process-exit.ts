import '../src/init';
import { init, runWasix, Runtime, Directory, reboot } from '@wasmer/sdk';

export async function checkProcessExit() {
    await init({ module: `${location.origin}/sdk/wasmer_js_bg.wasm`,
        sdkUrl: `${location.origin}/sdk/index.mjs`, workerUrl: `${location.origin}/dist/worker.mjs` });
    const response = await fetch('/.test-build/process-exit.wasm');
    if (!response.ok) throw Error('Build the process-exit Wasm fixture before running this test');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const filesystem = new Directory();
    const results = [];
    for (const api of ['1', '2']) {
        for (const code of [0, 7, 0]) {
            let timer: ReturnType<typeof setTimeout>;
            try {
                const result = await Promise.race([
                    (async () => {
                        const instance = await runWasix(bytes, { program: '/exit', args: [String(code), api],
                            stdin: '', runtime: new Runtime(), mount: {'/': filesystem}, cwd: '/' });
                        return instance.wait();
                    })(),
                    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Guest exit timed out')), 60000); })
                ]);
                if (result.code !== code || result.stdout !== 'guest started\n' || result.stderr !== '')
                    throw Error(`Unexpected exit result for API ${api}, requested ${code}: ${JSON.stringify(result)}`);
                results.push({api, code});
            } finally { clearTimeout(timer!); }
        }
        reboot();
    }
    return results;
}
