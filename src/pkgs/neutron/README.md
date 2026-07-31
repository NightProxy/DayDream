# Neutron

Synchronous-over-asynchronous IPC for Web Workers. The worker calls a function and *blocks* until the host (which may be doing async work like OPFS / IndexedDB / fetch) responds — no `await`, no callback rewriting.

Built on `SharedArrayBuffer` + `Atomics.wait`. Extracted from [DuskJS](../DuskJS/).

## Why

Web Workers communicate via `postMessage`, which is async. Code you control can `await reply`, but code you don't control — WASI binaries, embedded JS engines, sync parsers, ports of synchronous C/Rust libraries — can't. Neutron gives that code a synchronous-looking function that actually does the round-trip.

## Requirements

Your page must be **cross-origin isolated**. Serve with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If `crossOriginIsolated` is `false`, Neutron throws at construction.

## Install

```sh
npm install neutron
```

## Usage

### Host (main thread)

```ts
import { Neutron } from 'neutron';

const n = new Neutron({
  workerUrl: new URL('./my-worker.ts', import.meta.url),
});

n.on('fs.readFile', async (req) => {
  const handle = await opfsRoot.getFileHandle(req.path as string);
  const file = await handle.getFile();
  return await file.text();
});

n.on('add', (req) => {
  return (req.a as number) + (req.b as number);
});
```

### Worker

```ts
import { init, send, recv } from 'neutron/worker';

self.addEventListener('message', (e) => {
  if (e.data && e.data.lengthBuffer) {
    init(e.data);
    main();
  }
}, { once: true });

function main() {
  // Looks synchronous, actually waits for an async host handler.
  const contents = send({ type: 'fs.readFile', path: '/data.txt' });
  console.log(contents);

  const sum = send({ type: 'add', a: 2, b: 3 });
  console.log(sum); // 5
}
```

## API

### `class Neutron`

```ts
new Neutron(options: NeutronOptions)

interface NeutronOptions {
  bufferSize?: number;       // default 10 MB
  worker?: Worker;           // bring your own
  workerUrl?: string | URL;  // OR let Neutron create one
  workerOptions?: WorkerOptions;
  bootstrap?: unknown;       // extra data sent in init message
}
```

**Methods**

- `on(type, handler)` — register a handler keyed by `request.type`. Handler can be sync or async. Returning a value sends it back; throwing sends a serialized error.
- `off(type)` — remove a handler.
- `push(message)` — send an unsolicited message; worker receives via `recv()`.
- `request(message)` — host-initiated async request; resolves when worker responds via `respond()`.
- `terminate(code?)` — terminate worker and reject pending requests.
- `exited` — promise that resolves with the exit code when terminated.

### `neutron/worker`

- `init(initMessage)` — call once with the first `postMessage` from the host.
- `send(request, blocking?)` — post request; if `blocking` (default `true`), block until reply. Worker marks the message as expecting a reply; the host will write back to the SAB and unblock the worker.
- `post(message)` — fire-and-forget. Posts a message; host handlers fire (for telemetry, side-channel events) but the worker does NOT block and the host does NOT write to the SAB.
- `recv(blocking?)` — block until next host push (if `blocking`); else return current pending message or `undefined`.
- `respond(id, value)` / `respondError(id, error)` — reply to a host-initiated `request()`.
- `isRequest(msg)` — type guard.

**The blocking/non-blocking distinction is important.** `send` is for synchronous-looking calls where the worker waits. `post` is for telemetry, progress updates, or any message where the worker doesn't care about a reply. Mixing them is safe: side-channel `post` messages won't accidentally unblock a pending `send`.

## Error propagation

Throw in the host handler:

```ts
n.on('lookup', (req) => {
  if (!req.id) {
    const err = new Error('id required');
    (err as any).code = 'EBADARG';
    throw err;
  }
  return doLookup(req.id);
});
```

Worker observes a normal exception:

```ts
try {
  send({ type: 'lookup' });
} catch (err) {
  console.error(err.message);    // 'id required'
  console.error((err as any).code); // 'EBADARG'
  console.error(err.stack);      // host-side stack preserved
}
```

## Buffer overflow

Responses larger than `bufferSize` (default 10 MB) throw a clear error on the worker side. For genuinely large transfers, chunk at the application layer.

## Limitations

- Cross-origin isolation required (no workaround; fundamental to SAB).
- JSON payloads only; binary as base64 or numeric arrays.
- One in-flight `send()` per worker (the SAB has one slot).
- No cancellation; once `Atomics.wait`, only `notify` or `terminate()` unblock.
- Browser Workers only; Node `worker_threads` adapter is future work.

## License

MIT
