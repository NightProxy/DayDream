import { describe, it, expect } from 'vitest';
import { BootReadiness } from '../src/boot/readiness';

describe('BootReadiness', () => {
  it('shell resolves independently of proxy', async () => {
    const r = new BootReadiness();
    r.resolveShell();
    await expect(r.shell).resolves.toBeUndefined();
    let proxyDone = false;
    r.proxy.then(() => { proxyDone = true; });
    await Promise.resolve();
    expect(proxyDone).toBe(false);
  });

  it('proxy resolves independently of extensions', async () => {
    const r = new BootReadiness();
    r.resolveProxy();
    await expect(r.proxy).resolves.toBeUndefined();
    let extDone = false;
    r.extensions.then(() => { extDone = true; });
    await Promise.resolve();
    expect(extDone).toBe(false);
  });

  it('settings resolves independently of shell', async () => {
    const r = new BootReadiness();
    r.resolveSettings();
    await expect(r.settings).resolves.toBeUndefined();
  });

  it('proxy promise is pending until resolveProxy is called', async () => {
    const r = new BootReadiness();
    let done = false;
    r.proxy.then(() => { done = true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(done).toBe(false);
    r.resolveProxy();
    await r.proxy;
    expect(done).toBe(true);
  });
});
