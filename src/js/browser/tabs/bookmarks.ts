import { createIcons, icons } from "lucide";
import type { TabsInterface } from "./types";

export class BookmarkManager {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  async init() {
    await this.tabs.bookmarkManager.loadFromStorage();
    this.tabs.proxy.setBookmarkManager(this.tabs.bookmarkManager);
    this.setupBookmarkButton();
  }

  private setupBookmarkButton() {
    if (this.tabs.items.bookmarkButton) {
      this.tabs.items.bookmarkButton.addEventListener("click", () => {
        this.handleBookmarkCurrentPage();
      });
    }
  }

  private async handleBookmarkCurrentPage() {
    try {
      const activeTab = this.getActiveTab();
      if (!activeTab) {
        console.warn("No active tab found");
        return;
      }

      const activeIframe = this.getActiveIframe();
      if (!activeIframe) {
        console.warn("No active iframe found");
        return;
      }

      const tabTitleElement = activeTab.querySelector(".tab-title");
      const tabTitle = tabTitleElement?.textContent?.trim() || "Untitled";

      const iframeSrc = activeIframe.src;
      const decryptedUrl = this.getDecryptedUrlFromIframeSrc(iframeSrc);

      if (!decryptedUrl) {
        console.warn("Could not decrypt URL from iframe");
        return;
      }

      this.showBookmarkDialog(tabTitle, decryptedUrl);
    } catch (error: any) {
      console.error("Error handling bookmark:", error);
    }
  }

  private getDecryptedUrlFromIframeSrc(iframeSrc: string): string | null {
    try {
      if (this.tabs.proxySetting === "sj" && iframeSrc.includes("scramjet")) {
        const urlMatch = iframeSrc.match(/\/scramjet\/.*?\/([^/]+)/);
        if (urlMatch && urlMatch[1]) {
          return decodeURIComponent(urlMatch[1]);
        }
      } else if (this.tabs.proxySetting === "uv" && iframeSrc.includes("uv")) {
        if (window.__uv$config && window.__uv$config.decodeUrl) {
          const encodedPart = iframeSrc.split(window.__uv$config.prefix)[1];
          if (encodedPart) {
            return window.__uv$config.decodeUrl(encodedPart);
          }
        }
      }

      if (iframeSrc.includes("ddx://")) {
        return iframeSrc.replace(/.*ddx:\/\//, "ddx://");
      }

      const url = new URL(iframeSrc);
      return url.searchParams.get("url") || url.pathname || iframeSrc;
    } catch (error: any) {
      console.error("Error decrypting URL:", error);
      return null;
    }
  }

  private showBookmarkDialog(prefilledTitle: string, prefilledUrl: string) {
    const modal = this.tabs.ui.createElement(
      "div",
      {
        class:
          "fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]",
        id: "bookmark-modal",
      },
      [
        this.tabs.ui.createElement(
          "div",
          {
            class: "bg-[var(--bg-1)] rounded-xl p-6 w-96 max-w-[90vw]",
          },
          [
            this.tabs.ui.createElement(
              "h3",
              {
                class: "text-lg font-semibold text-[var(--text)] mb-4",
              },
              ["Add Bookmark"],
            ),
            this.tabs.ui.createElement(
              "div",
              {
                class: "space-y-4",
              },
              [
                this.tabs.ui.createElement("div", {}, [
                  this.tabs.ui.createElement(
                    "label",
                    {
                      class:
                        "block text-sm font-medium text-[var(--text)] mb-2",
                    },
                    ["Title"],
                  ),
                  this.tabs.ui.createElement(
                    "input",
                    {
                      type: "text",
                      id: "bookmark-title-input",
                      value: prefilledTitle,
                      class:
                        "w-full rounded-lg bg-[var(--bg-2)] border border-[var(--white-10)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]",
                    },
                    [],
                  ),
                ]),
                this.tabs.ui.createElement("div", {}, [
                  this.tabs.ui.createElement(
                    "label",
                    {
                      class:
                        "block text-sm font-medium text-[var(--text)] mb-2",
                    },
                    ["URL"],
                  ),
                  this.tabs.ui.createElement(
                    "input",
                    {
                      type: "text",
                      id: "bookmark-url-input",
                      value: prefilledUrl,
                      class:
                        "w-full rounded-lg bg-[var(--bg-2)] border border-[var(--white-10)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]",
                    },
                    [],
                  ),
                ]),
                this.tabs.ui.createElement(
                  "div",
                  {
                    class: "flex gap-3 pt-4",
                  },
                  [
                    this.tabs.ui.createElement(
                      "button",
                      {
                        id: "bookmark-cancel-btn",
                        class:
                          "flex-1 px-4 py-2 bg-[var(--white-10)] text-[var(--text)] rounded-lg text-sm font-medium hover:bg-[var(--white-20)] focus:outline-none",
                      },
                      ["Cancel"],
                    ),
                    this.tabs.ui.createElement(
                      "button",
                      {
                        id: "bookmark-save-btn",
                        class:
                          "flex-1 px-4 py-2 bg-[var(--main)] text-white rounded-lg text-sm font-medium hover:bg-[var(--main)]/90 focus:outline-none",
                      },
                      ["Save"],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );

    document.body.appendChild(modal);

    const titleInput = modal.querySelector(
      "#bookmark-title-input",
    ) as HTMLInputElement;
    const urlInput = modal.querySelector(
      "#bookmark-url-input",
    ) as HTMLInputElement;
    const cancelBtn = modal.querySelector(
      "#bookmark-cancel-btn",
    ) as HTMLButtonElement;
    const saveBtn = modal.querySelector(
      "#bookmark-save-btn",
    ) as HTMLButtonElement;

    setTimeout(() => titleInput?.select(), 100);

    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    saveBtn.addEventListener("click", async () => {
      const title = titleInput.value.trim();
      const url = urlInput.value.trim();

      if (!title || !url) {
        alert("Please fill in both title and URL");
        return;
      }

      try {
        await this.tabs.bookmarkManager.createBookmark({
          title,
          url,
        });

        this.updateBookmarkButtonState(true);

        document.body.removeChild(modal);

        this.showNotification("Bookmark saved successfully!");
      } catch (error: any) {
        console.error("Error saving bookmark:", error);
        alert("Failed to save bookmark. Please try again.");
      }
    });

    document.addEventListener("keydown", function escapeHandler(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", escapeHandler);
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      }
    });
  }

  private updateBookmarkButtonState(isBookmarked: boolean) {
    if (this.tabs.items.bookmarkButton) {
      const icon =
        this.tabs.items.bookmarkButton.querySelector("i[data-lucide]");
      if (icon) {
        icon.setAttribute("data-lucide", isBookmarked ? "star-filled" : "star");
        createIcons({ icons });
      }
    }
  }

  private showNotification(message: string) {
    const notification = this.tabs.ui.createElement(
      "div",
      {
        class:
          "fixed top-4 right-4 bg-[var(--success)] text-white px-4 py-2 rounded-lg shadow-lg z-[10001]",
      },
      [message],
    );

    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  private getActiveTab(): HTMLElement | null {
    const activeTab = this.tabs.items.tabBar.querySelector(
      `[component="tab"].active`,
    ) as HTMLElement;
    return activeTab;
  }

  private getActiveIframe(): HTMLIFrameElement | null {
    const iframes = this.tabs.items.frameContainer?.querySelectorAll("iframe");
    if (!iframes) return null;

    for (const iframe of Array.from(iframes) as HTMLIFrameElement[]) {
      if (!iframe.style.display || iframe.style.display !== "none") {
        return iframe;
      }
    }
    return null;
  }
}
