import { Nightmare } from "@libs/Nightmare/nightmare";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { createIcons, icons } from "lucide";

interface renderInterface {
  container: HTMLDivElement;
  ui: Nightmare;
  logger: Logger;
  settings: SettingsAPI;
  events: EventSystem;
}

class Render implements renderInterface {
  container: HTMLDivElement;
  ui: Nightmare;
  logger: Logger;
  settings: SettingsAPI;
  events: EventSystem;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.ui = new Nightmare();
    this.logger = new Logger();
    this.settings = new SettingsAPI();
    this.events = new EventSystem();
    this.init();
  }

  async init() {
    this.container.innerHTML = "";

    const bgElement = this.ui.createElement("div", { class: "bg-img" }, [
      this.ui.createElement("img", { src: "/res/DDX.bg.png" }, []),
    ]);
    document.body.appendChild(bgElement);

    const UI = this.ui.createElement("div", { class: "flex h-full" }, [
      this.ui.createElement("div", { id: "root" }),
      this.ui.createElement(
        "aside",
        {
          class:
            "w-12 bg-[var(--bg-1)] border-r border-[var(--white-05)] flex flex-col h-screen",
          component: "navbar",
        },
        [
          this.ui.createElement(
            "ul",
            { class: "flex flex-1 flex-col h-screen p-2" },
            [
              this.ui.createElement("div", { class: "flex flex-col gap-2" }, [
                this.ui.createElement("li", { class: "self-center" }, [
                  this.ui.createElement(
                    "a",
                    {
                      href: "/",
                      class:
                        "relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/90 hover:bg-[var(--white-05)]",
                      "data-tooltip": "DaydreamX Home",
                      "data-side": "right",
                      "data-align": "center",
                    },
                    [
                      this.ui.createElement(
                        "i",
                        {
                          class:
                            "text-[var(--main)] text-[10px] font-semibold tracking-wide",
                        },
                        [
                          this.ui.createElement(
                            "div",
                            { class: "stack h-6 w-6" },
                            [
                              this.ui.createElement(
                                "div",
                                {
                                  class: "masked-shape",
                                  style:
                                    "width: 100%; height: 100%; background: var(--main); -webkit-mask-image: url('/res/logo/mask.png'); -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; -webkit-mask-size: cover; -webkit-mask-mode: luminance; mask-image: url('/res/logo/mask.png'); mask-repeat: no-repeat; mask-position: center; mask-size: cover; mask-mode: luminance;",
                                },
                                [
                                  this.ui.createElement(
                                    "img",
                                    {
                                      class: "overlay",
                                      src: "/res/logo/overlay.png",
                                      alt: "overlay gradient",
                                      style:
                                        "width: 100%; height: 100%; mix-blend-mode: multiply; pointer-events: none;",
                                    },
                                    [],
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ]),
                this.ui.createElement("li", { class: "self-center" }, [
                  this.ui.createElement(
                    "button",
                    {
                      class:
                        "relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                      "data-tooltip": "Games",
                      "data-side": "right",
                      "data-align": "center",
                      onclick: async () => {
                        await window.tabs.createTab("ddx://games/");
                      },
                    },
                    [
                      this.ui.createElement(
                        "i",
                        { class: "h-4 w-4", "data-lucide": "joystick" },
                        [],
                      ),
                    ],
                  ),
                ]),
              ]),
              this.ui.createElement(
                "div",
                {
                  class: "flex flex-col flex-1 justify-center gap-2",
                  id: "extensions-sidebar",
                },
                [
                  this.ui.createElement("li", { class: "self-center" }, [
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "data-tooltip": "Extensions",
                        "data-side": "right",
                        "data-align": "center",
                        onclick: async () => {
                          await window.tabs.createTab("ddx://extensions/");
                        },
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { class: "h-4 w-4", "data-lucide": "puzzle" },
                          [],
                        ),
                      ],
                    ),
                  ]),
                  this.ui.createElement("li", { class: "self-center" }, [
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "data-tooltip": "Bookmarks",
                        "data-side": "right",
                        "data-align": "center",
                        onclick: async () => {
                          await window.tabs.createTab("ddx://bookmarks/");
                        },
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { class: "h-4 w-4", "data-lucide": "folder-heart" },
                          [],
                        ),
                      ],
                    ),
                  ]),
                  this.ui.createElement("li", { class: "self-center" }, [
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "data-tooltip": "History",
                        "data-side": "right",
                        "data-align": "center",
                        onclick: async () => {
                          await window.tabs.createTab("ddx://history/");
                        },
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { class: "h-4 w-4", "data-lucide": "history" },
                          [],
                        ),
                      ],
                    ),
                  ]),
                ],
              ),
              this.ui.createElement("div", { class: "flex flex-col gap-2" }, [
                this.ui.createElement("li", { class: "self-center" }, [
                  this.ui.createElement(
                    "button",
                    {
                      class:
                        "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                      "data-tooltip": "What's New",
                      "data-side": "right",
                      "data-align": "center",
                      onclick: async () => {
                        await window.tabs.createTab("ddx://updates/");
                      },
                    },
                    [
                      this.ui.createElement(
                        "i",
                        { class: "h-4 w-4", "data-lucide": "sparkles" },
                        [],
                      ),
                    ],
                  ),
                ]),
                this.ui.createElement("li", { class: "self-center" }, [
                  this.ui.createElement(
                    "button",
                    {
                      class:
                        "relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                      "data-tooltip": "Discord",
                      "data-side": "right",
                      "data-align": "center",
                      onclick: async () => {
                        await window.tabs.createTab(
                          "https://discord.night-x.com",
                        );
                      },
                    },
                    [
                      this.ui.createElement(
                        "i",
                        { class: "h-4 w-4", "data-lucide": "message-square" },
                        [],
                      ),
                    ],
                  ),
                ]),
                this.ui.createElement("li", { class: "self-center" }, [
                  this.ui.createElement(
                    "button",
                    {
                      class:
                        "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                      "data-tooltip": "Settings",
                      "data-side": "right",
                      "data-align": "center",
                      onclick: async () => {
                        await window.tabs.createTab("ddx://settings/");
                      },
                    },
                    [
                      this.ui.createElement(
                        "i",
                        { class: "h-4 w-4", "data-lucide": "settings" },
                        [],
                      ),
                    ],
                  ),
                ]),
              ]),
            ],
          ),
        ],
      ),
      this.ui.createElement("div", { class: "flex-1" }, [
        this.ui.createElement(
          "div",
          {
            class:
              "w-full border-b border-[var(--white-05)] bg-[var(--bg-2)] relative overflow-visible",
          },
          [
            this.ui.createElement(
              "div",
              { class: "flex h-12 items-center gap-1", component: "top-bar" },
              [
                this.ui.createElement(
                  "div",
                  {
                    class:
                      "flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ml-2 ring-inset ring-[var(--main-35a)] cursor-pointer",
                  },
                  [
                    this.ui.createElement(
                      "button",
                      {
                        component: "profiles",
                        class:
                          "flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--main-20a)] cursor-pointer",
                        "aria-label": "Profiles",
                      },
                      [
                        this.ui.createElement(
                          "span",
                          {
                            class:
                              "text-xs font-semibold tracking-wide text-[var(--main)]",
                          },
                          [
                            this.ui.createElement(
                              "i",
                              { "data-lucide": "users", class: "h-4 w-4" },
                              [],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
                this.ui.createElement(
                  "div",
                  {
                    component: "tab-bar-container",
                    class: "flex items-center flex-1 overflow-x-hidden",
                  },
                  [
                    this.ui.createElement(
                      "div",
                      {
                        component: "tab-bar",
                        class: "flex items-center gap-2 flex-1",
                      },
                      [],
                    ),
                  ],
                ),
                this.ui.createElement(
                  "div",
                  {
                    class:
                      "flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ring-[var(--white-10)] mr-2",
                  },
                  [
                    this.ui.createElement(
                      "button",
                      {
                        component: "new-tab",
                        class:
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "aria-label": "Open new tab",
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { "data-lucide": "plus", class: "h-4 w-4" },
                          [],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        this.ui.createElement(
          "div",
          {
            class:
              "w-full border-b border-[var(--white-05)] bg-[var(--bg-1)] relative overflow-visible",
          },
          [
            this.ui.createElement(
              "div",
              {
                class: "flex h-12 items-center gap-2 px-2",
                component: "utility-bar",
              },
              [
                this.ui.createElement(
                  "div",
                  {
                    class:
                      "flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ring-[var(--white-10)]",
                  },
                  [
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "aria-label": "Back",
                        component: "back",
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { "data-lucide": "arrow-left", class: "h-4 w-4" },
                          [],
                        ),
                      ],
                    ),
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "aria-label": "Reload",
                        component: "reload",
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { "data-lucide": "rotate-cw", class: "h-4 w-4" },
                          [],
                        ),
                      ],
                    ),
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "aria-label": "Forward",
                        component: "forward",
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { "data-lucide": "arrow-right", class: "h-4 w-4" },
                          [],
                        ),
                      ],
                    ),
                    this.ui.createElement(
                      "button",
                      {
                        class:
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                        "aria-label": "Home",
                        component: "home",
                        onclick: () => {
                          window.protocols.navigate("newtab");
                        },
                      },
                      [
                        this.ui.createElement(
                          "i",
                          { "data-lucide": "home", class: "h-4 w-4" },
                          [],
                        ),
                      ],
                    ),
                  ],
                ),
                this.ui.createElement(
                  "div",
                  { class: "relative w-full flex-1 urlbar-ring" },
                  [
                    this.ui.createElement(
                      "div",
                      {
                        class:
                          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1",
                      },
                      [
                        this.ui.createElement(
                          "i",
                          {
                            "data-lucide": "lock",
                            class: "h-4 w-4 text-[var(--success)]",
                          },
                          [],
                        ),
                      ],
                    ),
                    this.ui.createElement(
                      "input",
                      {
                        type: "text",
                        component: "address-bar",
                        value: "newtab",
                        class:
                          "w-full rounded-xl bg-[var(--bg-2)] pl-[2.5rem] py-2 text-sm text-[var(--text)] ring-1 ring-inset ring-[var(--main-35a)] outline-none placeholder:text-[var(--text)]/40 focus:ring-2 focus:ring-[var(--main)] shadow-[0_0_0_1px_var(--shadow-outer),inset_0_0_0_1px_var(--shadow-inner)]",
                        placeholder: "Search or enter website name",
                      },
                      [],
                    ),
                  ],
                ),
                this.ui.createElement(
                  "button",
                  {
                    class:
                      "absolute right-[3.5rem] inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                    "aria-label": "Bookmark current page",
                    component: "bookmark",
                  },
                  [
                    this.ui.createElement(
                      "i",
                      { "data-lucide": "star", class: "h-4 w-4" },
                      [],
                    ),
                  ],
                ),
                this.ui.createElement(
                  "div",
                  {
                    class:
                      "flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ring-[var(--white-10)] z-[10000000]",
                  },
                  [
                    this.ui.createElement("div", { class: "relative" }, [
                      this.ui.createElement(
                        "button",
                        {
                          id: "menu-btn",
                          class:
                            "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]",
                          "aria-label": "Open menu",
                          component: "menu",
                        },
                        [
                          this.ui.createElement(
                            "i",
                            { "data-lucide": "menu", class: "h-4 w-4" },
                            [],
                          ),
                        ],
                      ),
                      this.ui.createElement(
                        "div",
                        {
                          id: "menu-popup",
                          class:
                            "absolute right-0 mt-2 w-40 rounded-md bg-[var(--bg-2)] shadow-lg border border-[var(--white-10)] opacity-0 scale-95 pointer-events-none transition-all duration-150 tooltip",
                          component: "menu-content",
                        },
                        [
                          this.ui.createElement(
                            "ul",
                            { class: "py-1 text-sm text-[var(--text)]" },
                            [
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.tabs.createTab("ddx://newtab/");
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    { "data-lucide": "plus", class: "h-4 w-4" },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "New Tab",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.windowing.newWindow();
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "monitor",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "New Window",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.windowing.aboutBlankWindow();
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "eye-off",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "A:B Window",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.functions.goFullscreen();
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "maximize",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "Fullscreen",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.tabs.createTab("ddx://bookmarks/");
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "bookmark",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "Bookmarks",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.tabs.createTab("ddx://history/");
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "history",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "History",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.tabs.createTab("ddx://games/");
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "dices",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, ["Games"]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.tabs.createTab("ddx://extensions/");
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "puzzle",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "Extensions",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.functions.inspectElement();
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "square-mouse-pointer",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "Devtools",
                                  ]),
                                ],
                              ),
                              this.ui.createElement(
                                "li",
                                {
                                  class:
                                    "px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center",
                                  onclick: () => {
                                    window.tabs.createTab("ddx://settings/");
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "settings",
                                      class: "h-4 w-4",
                                    },
                                    [],
                                  ),
                                  this.ui.createElement("span", {}, [
                                    "Settings",
                                  ]),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ]),
                  ],
                ),
              ],
            ),
          ],
        ),
        this.ui.createElement(
          "div",
          {
            style:
              "border: none; outline: none; will-change: filter, transform, opacity;",
            class: "h-[calc(100vh-96px)] w-full bg-[var(--bg-2)]",
            component: "frame-container",
          },
          [],
        ),
        this.ui.createElement(
          "div",
          {
            "aria-hidden": "true",
            style:
              "position: absolute; inset: 0; background: var(--bg-2); mix-blend-mode: lighten; pointer-events: none;",
            class: "h-full w-full bg-[var(--bg-2)]",
          },
          [],
        ),
      ]),
    ]);

    this.container.appendChild(UI);
    createIcons({ icons });
  }
}

export { Render };
