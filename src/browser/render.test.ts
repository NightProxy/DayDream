import { describe, expect, it } from "vitest";
import { Render } from "./render";

describe("Render", () => {
  it("preserves the shell compositing overlay", async () => {
    const root = document.createElement("div");

    new Render(root);
    await Promise.resolve();

    const overlays = Array.from(root.querySelectorAll<HTMLElement>("[aria-hidden='true']"));
    expect(
      overlays.some(
        (element) =>
          element.style.position === "absolute" &&
          element.style.inset === "0px" &&
          element.style.background === "var(--bg-2)",
      ),
    ).toBe(true);
  });
});
