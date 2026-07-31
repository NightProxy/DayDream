import { afterEach, describe, expect, it, vi } from "vitest";

const settings = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
const events = { emit: vi.fn() };

vi.mock("lucide", () => ({ createIcons: vi.fn(), icons: {} }));
vi.mock("@jaames/iro", () => ({ default: {} }));
vi.mock("../data/host", () => ({
  getEventsAPI: () => events,
  getSettingsAPI: () => settings,
  getTheming: vi.fn(),
}));

import { render } from "./appearance";
import { settingsSearch } from "../components/settingsSearch";

afterEach(() => {
  document.body.replaceChildren();
  settingsSearch.clearAll();
  settings.getItem.mockReset();
  settings.setItem.mockReset();
  events.emit.mockReset();
});

describe("Appearance settings", () => {
  it("persists bookmarks-bar visibility before announcing its change", async () => {
    settings.getItem.mockResolvedValue("newtab");
    const order: string[] = [];
    settings.setItem.mockImplementation(async () => { order.push("write"); });
    events.emit.mockImplementation(() => { order.push("emit"); });
    const container = document.createElement("div");
    document.body.appendChild(container);

    await render(container, {});
    await Promise.resolve();
    const select = container.querySelector<HTMLSelectElement>("select[name='bookmarksBarVisibility']");

    expect(select).not.toBeNull();
    expect(select?.getAttribute("aria-label")).toBe("Bookmarks bar visibility");
    expect(Array.from(select!.options, (option) => option.text)).toEqual([
      "New tab only",
      "Always show",
      "Hidden",
    ]);
    expect(select!.value).toBe("newtab");
    settingsSearch.filter("visibility");
    expect(select!.closest(".settings-row")?.classList.contains("search-match")).toBe(true);

    select!.value = "always";
    select!.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(settings.setItem).toHaveBeenCalledWith("bookmarksBarVisibility", "always");
    expect(events.emit).toHaveBeenCalledWith("bookmarks-bar:visibility-change", { visibility: "always", persisted: true });
    expect(order).toEqual(["write", "emit"]);
  });

  it("restores bookmarks-bar visibility and shows an inline failure notice when saving fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    settings.getItem.mockResolvedValue("newtab");
    settings.setItem.mockRejectedValue(new Error("storage unavailable"));
    const container = document.createElement("div");
    container.className = "settings-content";
    document.body.appendChild(container);

    await render(container, {});
    await Promise.resolve();
    const select = container.querySelector<HTMLSelectElement>("select[name='bookmarksBarVisibility']")!;
    select.value = "hidden";
    select.dispatchEvent(new Event("change"));
    await Promise.resolve();
    await Promise.resolve();

    expect(select.value).toBe("newtab");
    expect(events.emit).not.toHaveBeenCalled();
    expect(container.querySelector(".ddx-inline-notice")?.textContent).toBe(
      "Failed to save bookmarks bar visibility.",
    );
  });
});
