import { describe, expect, it } from 'vitest';
import { PortRouter } from './port';

describe('PortRouter runtime ports', () => {
  it('provides origin and url on runtime port sender for privileged extension pages', () => {
    const sent: Array<{ method: string; args: unknown[] }> = [];
    const extId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const channel = {
      sendEvent(method: string, args: unknown[]) {
        sent.push({ method, args });
      },
    };
    const relay = {} as { portHandler?: (data: unknown, source: Window) => void };
    const router = new PortRouter(relay as never, () => ({
      ctx: {
        id: extId,
        origin: `${extId}.ddx`,
        manifest: { manifest_version: 2, name: 'uBlock-style fixture' },
      },
      entry: {},
      channel,
    } as never));

    const portId = router.bgInitiatedConnectRuntime(extId, extId, 'popup', channel);

    expect(portId).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('chrome.runtime.onConnect-port');
    const info = (sent[0]!.args[0] as { sender?: { id?: string; origin?: string; url?: string } });
    expect(info.sender).toMatchObject({
      id: extId,
      origin: `https://${extId}.ddx`,
      url: `https://${extId}.ddx/`,
    });
  });
});
