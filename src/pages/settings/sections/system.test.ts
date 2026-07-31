import { afterEach, describe, expect, it, vi } from "vitest";

const settings = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};

vi.mock("../data/host", () => ({
  getSettingsAPI: () => settings,
  openInNewTab: vi.fn(),
}));

import { render } from "./system";

afterEach(() => {
  document.body.replaceChildren();
  settings.getItem.mockReset();
  settings.setItem.mockReset();
});

describe("System settings", () => {
  it("keeps the legacy Anti-Tab Close control bound to disableTabClose", async () => {
    settings.getItem.mockResolvedValue("true");
    const container = document.createElement("div");
    document.body.appendChild(container);

    await render(container, {});
    await Promise.resolve();
    const input = container.querySelector<HTMLInputElement>("#disableTabClose-input");

    expect(container.textContent).toContain("Anti-Tab Close");
    expect(container.textContent).toContain("Prevent tabs from closing accidentally with beforeunload warning");
    expect(input).not.toBeNull();
    expect(input!.checked).toBe(true);

    input!.click();
    await Promise.resolve();

    expect(settings.setItem).toHaveBeenCalledWith("disableTabClose", "false");
  });
});
