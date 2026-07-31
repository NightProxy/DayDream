import { describe, expect, it, vi } from "vitest";
import { ServiceWorkerSettings } from "./settings";
import type { StorageRequestExecutor } from "./settings";

describe("ServiceWorkerSettings", () => {
  it("delegates settings operations to its local serialized executor", async () => {
    const executor: StorageRequestExecutor = {
      execute: vi
        .fn()
        .mockResolvedValueOnce("dark")
        .mockResolvedValueOnce("light"),
    };
    const settings = new ServiceWorkerSettings(executor);

    await expect(settings.getItem("theme")).resolves.toBe("dark");
    await expect(settings.setItem("theme", "light")).resolves.toBe("light");

    expect(executor.execute).toHaveBeenNthCalledWith(1, {
      id: 1,
      operation: "getItem",
      filePath: "/settings.json",
      folderPath: "/",
      key: "theme",
    });
    expect(executor.execute).toHaveBeenNthCalledWith(2, {
      id: 2,
      operation: "setItem",
      filePath: "/settings.json",
      folderPath: "/",
      key: "theme",
      value: "light",
    });
  });
});
