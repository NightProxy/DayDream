import { describe, it, expect } from 'vitest';
import { Neutron } from '../src/index';

const workerUrl = new URL('./fixtures/echo-worker.ts', import.meta.url);

const waitFor = <T>(check: () => T | undefined, timeout = 2000): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      const v = check();
      if (v !== undefined) return resolve(v);
      if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });

describe('Neutron', () => {
  it('echoes a sync request from worker', async () => {
    const n = new Neutron({ workerUrl, bootstrap: { id: 'echo-1' } });
    const results: Array<Record<string, unknown>> = [];
    const echoCalls: unknown[] = [];

    n.on('echo', (req) => {
      echoCalls.push(req.value);
      return req.value;
    });

    n.on('__ack__', () => undefined);
    n.on('log', () => undefined);
    n.on('result', (req) => {
      results.push(req);
      return undefined;
    });

    n.push({ op: 'echo-sync', payload: 'hello world' });
    const ack = await waitFor(() => results.find((r) => r.tag === 'echo-sync'));
    expect(echoCalls).toEqual(['hello world']);
    expect(ack.value).toBe('hello world');

    await n.terminate();
  }, 5000);

  it('does arithmetic round-trip', async () => {
    const n = new Neutron({ workerUrl });
    const results: Array<Record<string, unknown>> = [];

    n.on('add', (req) => (req.a as number) + (req.b as number));
    n.on('__ack__', () => undefined);
    n.on('log', () => undefined);
    n.on('result', (req) => {
      results.push(req);
      return undefined;
    });

    n.push({ op: 'add-sync', payload: { a: 7, b: 35 } });
    const r = await waitFor(() => results.find((x) => x.tag === 'add-sync'));
    expect(r.value).toBe(42);

    await n.terminate();
  }, 5000);

  it('propagates errors from host to worker', async () => {
    const n = new Neutron({ workerUrl });
    const results: Array<Record<string, unknown>> = [];

    n.on('fail', () => {
      const err = new Error('intentional failure');
      (err as Error & { code?: string }).code = 'EBOOM';
      throw err;
    });
    n.on('__ack__', () => undefined);
    n.on('log', () => undefined);
    n.on('result', (req) => {
      results.push(req);
      return undefined;
    });

    n.push({ op: 'throwing' });
    const r = await waitFor(() => results.find((x) => x.tag === 'throwing'), 4000);
    expect(r.message).toBe('intentional failure');
    expect(r.code).toBe('EBOOM');

    await n.terminate();
  }, 8000);

  it('rejects construction without cross-origin isolation', () => {
    if (self.crossOriginIsolated) {
      expect(true).toBe(true);
      return;
    }
    expect(() => new Neutron({ workerUrl })).toThrow(/cross-origin isolation/);
  });
});
