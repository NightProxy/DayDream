import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerbiumDownloadProvider } from '../../src/terbium/downloads';

/**
 * Build a fake `tb` object exposing just the surface area the
 * TerbiumDownloadProvider touches.
 *
 *   - saveFileResult: explicit path the dialog "chose"; if null the
 *     dialog invokes onCancel; if undefined we default to
 *     `/home/<username>/Downloads/<filename>`.
 *   - writeFileShouldFail: makes tb.fs.promises.writeFile throw.
 */
function makeFakeTb(opts: {
  saveFileResult?: string | null;
  username?: string;
  writeFileShouldFail?: boolean;
} = {}) {
  const writes: Array<{ path: string; bytes: Uint8Array }> = [];
  const toasts: any[] = [];
  return {
    writes,
    toasts,
    tb: {
      user: {
        username: vi.fn().mockResolvedValue(opts.username ?? 'tester'),
      },
      dialog: {
        SaveFile: vi.fn().mockImplementation(async (props: any) => {
          if (opts.saveFileResult === null) {
            props.onCancel?.();
            return;
          }
          const chosen =
            opts.saveFileResult ??
            `/home/${opts.username ?? 'tester'}/Downloads/${props.filename}`;
          await props.onOk?.(chosen);
        }),
      },
      fs: {
        promises: {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockImplementation(async (p: string, data: any) => {
            if (opts.writeFileShouldFail) throw new Error('disk full');
            writes.push({ path: p, bytes: data });
          }),
          exists: vi.fn().mockResolvedValue(true),
        },
      },
      notification: {
        Toast: vi.fn().mockImplementation((p: any) => toasts.push(p)),
      },
    },
  };
}

/**
 * Build a fake DownloadController matching the real
 * `@apis/downloads` interface (reportProgress / reportComplete /
 * reportError + readonly item).
 */
function makeFakeController(filename = 'file.txt') {
  return {
    reportProgress: vi.fn(),
    reportComplete: vi.fn(),
    reportError: vi.fn(),
    item: {
      id: 1,
      url: 'https://example.test/file.txt',
      finalUrl: 'https://example.test/file.txt',
      referrer: '',
      filename,
      mime: 'application/octet-stream',
      startTime: 0,
      state: 'in_progress' as const,
      paused: false,
      canResume: false,
      bytesReceived: 0,
      totalBytes: -1,
      fileSize: -1,
      exists: false,
      providerName: 'terbium',
      danger: 'safe' as const,
    },
  };
}

describe('TerbiumDownloadProvider', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('exposes name "terbium"', () => {
    const { tb } = makeFakeTb();
    const provider = new TerbiumDownloadProvider(tb);
    expect(provider.name).toBe('terbium');
  });

  it('prompts SaveFile and writes bytes via tb.fs', async () => {
    const fake = makeFakeTb({ saveFileResult: '/home/tester/Downloads/file.txt' });
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(fake.tb.dialog.SaveFile).toHaveBeenCalled();
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]!.path).toBe('/home/tester/Downloads/file.txt');
    expect(Array.from(fake.writes[0]!.bytes)).toEqual([1, 2, 3, 4]);
    expect(fake.writes[0]!.bytes).toBeInstanceOf(Uint8Array);
    expect(controller.reportComplete).toHaveBeenCalled();
    expect(controller.reportError).not.toHaveBeenCalled();
  });

  it('handles SaveFile cancellation by reporting USER_CANCELED without writing', async () => {
    const fake = makeFakeTb({ saveFileResult: null });
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(fake.writes).toHaveLength(0);
    expect(controller.reportError).toHaveBeenCalledWith('USER_CANCELED');
    expect(controller.reportComplete).not.toHaveBeenCalled();
  });

  it('reports write failure via reportError with FILE_FAILED', async () => {
    const fake = makeFakeTb({ writeFileShouldFail: true });
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(controller.reportError).toHaveBeenCalledWith('FILE_FAILED');
    expect(controller.reportComplete).not.toHaveBeenCalled();
  });

  it('defaults the save directory to /home/<username>/Downloads/', async () => {
    const fake = makeFakeTb({ username: 'alice' });
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController('x.bin');

    await provider.start(
      { url: 'https://example.test/x.bin' },
      controller as any,
    );

    expect(fake.tb.dialog.SaveFile).toHaveBeenCalledWith(
      expect.objectContaining({ defualtDir: '/home/alice/Downloads/' }),
    );
  });

  it('infers a filename from the URL when none provided', async () => {
    const fake = makeFakeTb();
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController('report.pdf');

    await provider.start(
      { url: 'https://example.test/path/report.pdf' },
      controller as any,
    );

    expect(fake.tb.dialog.SaveFile).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'report.pdf' }),
    );
  });

  it('shows a toast on successful save', async () => {
    const fake = makeFakeTb();
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(fake.toasts.length).toBeGreaterThan(0);
    expect(fake.toasts[0]).toEqual(expect.objectContaining({
      application: 'Daydream',
    }));
  });

  it('reports FILE_FAILED when tb.dialog.SaveFile is missing', async () => {
    const fake = makeFakeTb();
    // Sabotage the dialog API
    (fake.tb.dialog as any).SaveFile = undefined;
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(controller.reportError).toHaveBeenCalledWith('FILE_FAILED');
    expect(fake.writes).toHaveLength(0);
  });

  it('reports NETWORK_FAILED when fetch rejects', async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('connect timed out'));
    const fake = makeFakeTb();
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(controller.reportError).toHaveBeenCalledWith('NETWORK_FAILED');
    expect(fake.writes).toHaveLength(0);
  });

  it('reports NETWORK_FAILED on HTTP error status', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const fake = makeFakeTb();
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(controller.reportError).toHaveBeenCalledWith('NETWORK_FAILED');
    expect(fake.writes).toHaveLength(0);
  });

  it('reports progress before completion', async () => {
    const fake = makeFakeTb();
    const provider = new TerbiumDownloadProvider(fake.tb);
    const controller = makeFakeController();

    await provider.start(
      { url: 'https://example.test/file.txt', filename: 'file.txt' },
      controller as any,
    );

    expect(controller.reportProgress).toHaveBeenCalled();
    expect(controller.reportComplete).toHaveBeenCalled();
  });
});
