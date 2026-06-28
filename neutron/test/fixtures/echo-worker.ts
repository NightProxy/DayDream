import { init, send, recv } from '../../src/worker';

self.addEventListener(
  'message',
  (e) => {
    const data = e.data as { lengthBuffer?: SharedArrayBuffer };
    if (data && data.lengthBuffer) {
      init(e.data);
      main(e.data as { bootstrap?: unknown });
    }
  },
  { once: true },
);

function main(initMsg: { bootstrap?: unknown }) {
  const bootstrap = initMsg.bootstrap;
  postMessage({ type: 'log', bootstrap });

  while (true) {
    let cmd: unknown;
    try {
      cmd = recv(true);
    } catch (e) {
      postMessage({ type: 'log', error: String(e) });
      continue;
    }

    if (cmd === null || typeof cmd !== 'object') continue;
    const c = cmd as { op?: string; payload?: unknown };

    if (c.op === 'exit') {
      break;
    }
    if (c.op === 'echo-sync') {
      try {
        const result = send({ type: 'echo', value: c.payload });
        postMessage({ type: 'result', tag: 'echo-sync', value: result });
      } catch (err) {
        postMessage({ type: 'result', tag: 'echo-sync', error: (err as Error).message });
      }
    }
    if (c.op === 'add-sync') {
      const p = c.payload as { a: number; b: number };
      const result = send({ type: 'add', a: p.a, b: p.b });
      postMessage({ type: 'result', tag: 'add-sync', value: result });
    }
    if (c.op === 'throwing') {
      try {
        send({ type: 'fail' });
        postMessage({ type: 'result', tag: 'throwing', value: 'no-throw' });
      } catch (err) {
        const e = err as Error & { code?: string };
        postMessage({ type: 'result', tag: 'throwing', message: e.message, code: e.code });
      }
    }
  }

  postMessage({ type: 'log', exited: true });
}
