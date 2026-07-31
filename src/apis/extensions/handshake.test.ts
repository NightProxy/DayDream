import { describe, expect, it, vi } from 'vitest';
import { attachExtensionHandshakeWhenReady } from './handshake';

describe('extension iframe handshake', () => {
  it('waits for the bootstrap receiver after iframe load', async () => {
    const receive = vi.fn();
    const win: { __helium_handshake_receive__?: (port: MessagePort) => void } = {};
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentWindow', { value: win });
    Object.defineProperty(iframe, 'contentDocument', { value: { readyState: 'complete' } });
    const timers: Array<() => void> = [];

    const channel = new MessageChannel();
    attachExtensionHandshakeWhenReady('extid', iframe, channel.port1, {
      now: () => 0,
      setTimer: (fn) => {
        timers.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: vi.fn(),
    });

    expect(receive).not.toHaveBeenCalled();
    win.__helium_handshake_receive__ = receive;
    timers.shift()?.();

    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive.mock.calls[0]?.[0]).toBe(channel.port1);
  });
});
