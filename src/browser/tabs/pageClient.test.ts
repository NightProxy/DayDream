import { describe, expect, it, vi } from 'vitest';
import { TabPageClient } from './pageClient';

describe('TabPageClient extension page link handling', () => {
  it('opens named-target links in a managed tab instead of letting the iframe navigate', async () => {
    const createTab = vi.fn(async () => 'tab-2');
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument!.body.innerHTML = '<a id="dashboard" href="https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ddx/dashboard.html" target="uBODashboard">dashboard</a>';

    const client = new TabPageClient({
      createTab,
      logger: { createLog: vi.fn() },
      proxy: { decodeUrl: (url: string) => url },
    } as never);

    client.pageClient(iframe);
    iframe.contentDocument!.getElementById('dashboard')!.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));

    await Promise.resolve();

    expect(createTab).toHaveBeenCalledWith('https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ddx/dashboard.html');
  });
});
