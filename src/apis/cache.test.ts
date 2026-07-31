import { describe, expect, it, vi } from "vitest";
import { CacheAPI } from "./cache";
import type { SettingsAPI } from "./settings";

describe("CacheAPI", () => {
  it("saves partial session updates with one atomic merge request", async () => {
    const store = {
      mergeItem: vi.fn().mockResolvedValue(undefined),
    } as unknown as SettingsAPI;
    const cache = new CacheAPI(store);
    const tabs = [
      {
        id: "tab-1",
        url: "https://example.com",
        title: "Example",
        pinned: false,
        order: 0,
      },
    ];

    await cache.saveTabs(tabs);

    expect(store.mergeItem).toHaveBeenCalledWith(
      "session",
      expect.objectContaining({ tabs, timestamp: expect.any(Number) }),
    );
  });
});
