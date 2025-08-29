import { Items } from "@browser/items";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { ProfilesAPI } from "@apis/profiles";
import { Protocols } from "@browser/protocols";
import { Utils } from "@js/utils";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { Windowing } from "@browser/windowing";
import { EventSystem } from "@apis/events";

interface FuncInterface {
  tabs: any;
  items: Items;
  ui: UI;
  logger: Logger;
  settings: SettingsAPI;
  profiles: ProfilesAPI;
  proto: Protocols;
  utils: Utils;
  nightmarePlugins: NightmarePlugins;
  windowing: Windowing;
  events: EventSystem;
  devToggle: boolean;

  erudaScriptLoaded: boolean;
  erudaScriptInjecting: boolean;
  zoomLevel: number;
  zoomSteps: Array<number>;
  currentStep: number;
}
class Functions implements FuncInterface {
  tabs: any;
  items: Items;
  ui: UI;
  logger: Logger;
  settings: SettingsAPI;
  profiles: ProfilesAPI;
  proto: Protocols;
  utils: Utils;
  nightmarePlugins: NightmarePlugins;
  windowing: Windowing;
  events: EventSystem;
  devToggle: boolean;
  erudaScriptLoaded: boolean;
  erudaScriptInjecting: boolean;
  zoomLevel: number;
  zoomSteps: Array<number>;
  currentStep: number;
  constructor(tabs: any, proto: any) {
    this.items = new Items();
    this.ui = new UI();
    this.tabs = tabs!;
    this.logger = new Logger();
    this.settings = new SettingsAPI();
    this.profiles = new ProfilesAPI();
    this.proto = proto;
    this.utils = new Utils();
    this.nightmarePlugins = new NightmarePlugins();
    this.windowing = new Windowing();
    this.events = new EventSystem();
    this.devToggle = false;
    this.erudaScriptLoaded = false;
    this.erudaScriptInjecting = false;
    this.zoomLevel = 1;
    this.zoomSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    this.currentStep = 4;
  }

  init() {
    this.items.backButton!.addEventListener("click", () => {
      this.backward();
    });
    this.items.reloadButton!.addEventListener("click", () => {
      this.refresh();
    });
    this.items.forwardButton!.addEventListener("click", () => {
      this.forward();
    });

    this.menus();
    //this.navbarfunctions();

    this.items.newTab!.addEventListener(
      "click",
      async () => await this.tabs.createTab("daydream://newtab"),
    );

    // Attach profiles menu to profiles button
    if (this.items.profilesButton) {
      this.profilesMenu(this.items.profilesButton);
    }

    // Add beforeunload event to auto-save profile data
    this.setupAutoSave();
  }

  private setupAutoSave() {
    window.addEventListener("beforeunload", async () => {
      const currentProfile = this.profiles.getCurrentProfile();

      if (currentProfile) {
        try {
          // Attempt to save the current profile data
          await this.profiles.saveProfile(currentProfile);
          this.logger.createLog(`Auto-saved profile: ${currentProfile}`);
        } catch (error) {
          console.warn("Failed to auto-save profile data:", error);
          // Don't prevent page unload even if save fails
        }
      }

      // Note: Modern browsers ignore custom messages in beforeunload
      // but we can still perform the save operation above
    });

    // Also save on visibility change (when switching tabs/apps)
    document.addEventListener("visibilitychange", async () => {
      if (document.hidden) {
        const currentProfile = this.profiles.getCurrentProfile();
        if (currentProfile) {
          try {
            await this.profiles.saveProfile(currentProfile);
            this.logger.createLog(
              `Auto-saved profile on visibility change: ${currentProfile}`,
            );
          } catch (error) {
            console.warn(
              "Failed to auto-save profile on visibility change:",
              error,
            );
          }
        }
      }
    });

    // Save profile data every 30 seconds as a backup
    setInterval(async () => {
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile) {
        try {
          await this.profiles.saveProfile(currentProfile);
          this.logger.createLog(
            `Auto-saved profile (periodic): ${currentProfile}`,
          );
        } catch (error) {
          console.warn("Failed to perform periodic profile save:", error);
        }
      }
    }, 30000); // 30 seconds
  }

  backward() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.history.back();
  }

  forward() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.history.forward();
  }

  refresh() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    iframe?.contentWindow?.location.reload();
  }

  zoomIn() {
    if (this.currentStep < this.zoomSteps.length - 1) {
      this.currentStep++;
    }
    this.zoomLevel = this.zoomSteps[this.currentStep];
    this.scaleIframeContent();
  }

  zoomOut() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
    this.zoomLevel = this.zoomSteps[this.currentStep];
    this.scaleIframeContent();
  }

  scaleIframeContent() {
    let iframe: HTMLIFrameElement | null;
    iframe = document.querySelector("iframe.active");
    if (iframe) {
      const iframeDoc =
        iframe?.contentDocument || iframe?.contentWindow?.document;
      iframeDoc!.body.style.transform = `scale(${this.zoomLevel})`;
      iframeDoc!.body.style.transformOrigin = "top left";
      iframeDoc!.body.style.overflow = "auto";
    }
  }

  injectErudaScript(iframeDocument: Document): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.erudaScriptLoaded) {
        resolve("Loaded!");
        return;
      }

      if (this.erudaScriptInjecting) {
        console.warn("Eruda script is already being injected.");
        resolve("Already Injecting!");
        return;
      }

      this.erudaScriptInjecting = true;

      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.src = location.origin + "/core/inspect.js";
      script.onload = () => {
        this.erudaScriptLoaded = true;
        this.erudaScriptInjecting = false;
        resolve("Injected!");
      };
      script.onerror = (event: Event | string) => {
        this.erudaScriptInjecting = false;
        reject(new Error(`Failed to load Eruda script: ${event}`));
      };
      iframeDocument.body.appendChild(script);
    });
  }

  injectShowScript(iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.init({
				defaults: {
					displaySize: 50,
					transparency: 0.65,
					theme: 'Night Owl'
				}
			});
			eruda.show();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }

  injectHideScript(iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.hide();
      eruda.destroy();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }
  inspectElement() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)",
      );
      return;
    }

    const iframeDocument = iframe.contentWindow.document;

    const forbiddenSrcs = ["about:blank", null, "a%60owt8bnalk", "a`owt8bnalk"];
    if (forbiddenSrcs.includes(iframe.contentWindow.location.href)) {
      console.warn("Iframe src is forbidden, skipping.");
      return;
    }

    if (iframe.contentWindow.document.readyState == "loading") {
      console.warn(
        "Iframe has not finished loading, skipping Eruda injection. Be patient, jesus fuck.",
      );
      return;
    }

    this.injectErudaScript(iframeDocument)
      .then(() => {
        if (!this.devToggle) {
          this.injectShowScript(iframeDocument);
        } else {
          this.injectHideScript(iframeDocument);
        }

        this.devToggle = !this.devToggle;
      })
      .catch((error) => {
        console.error("Error injecting Eruda script:", error);
      });

    iframe.contentWindow.addEventListener("unload", () => {
      this.devToggle = false;
      this.erudaScriptLoaded = false;
      this.erudaScriptInjecting = false;
      console.log("Iframe navigation detected, Eruda toggle reset.");
    });
    this.logger.createLog("Toggled Inspect Element");
  }

  menus() {
    const menuBtn = this.items.extrasButton;
    const menuPopup = this.items.menuContent;
    if (menuBtn && menuPopup) {
      menuPopup.style.transition = "opacity .18s ease, transform .18s ease";
      const openMenu = () => {
        menuPopup.style.pointerEvents = "auto";
        menuPopup.style.opacity = "1";
        menuPopup.style.transform = "scale(1)";
        menuPopup.style.zIndex = "99999999";
        menuPopup.style.willChange = "opacity, transform";
      };
      const closeMenu = () => {
        menuPopup.style.opacity = "0";
        menuPopup.style.transform = "scale(.95)";
        setTimeout(() => {
          menuPopup.style.pointerEvents = "none";
        }, 180);
      };
      closeMenu();
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = menuPopup.style.opacity === "1";
        open ? closeMenu() : openMenu();
      });
      document.addEventListener("click", (e) => {
        if (!menuPopup.contains(e.target as Node) && e.target !== menuBtn)
          closeMenu();
      });

      document.addEventListener("ddx:page.clicked", (e) => {
        if (!menuPopup.contains(e.target as Node) && e.target !== menuBtn)
          closeMenu();
      });
    }
  }

  goFullscreen() {
    const iframe = document.querySelector("iframe.active") as HTMLIFrameElement;

    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if ((iframe as any).mozRequestFullScreen) {
      (iframe as any).mozRequestFullScreen();
    } else if ((iframe as any).webkitRequestFullscreen) {
      (iframe as any).webkitRequestFullscreen();
    } else if ((iframe as any).msRequestFullscreen) {
      (iframe as any).msRequestFullscreen();
    }
  }

  extensionsMenu(button: HTMLButtonElement) {
    let content = this.ui.createElement("div", {}, [
      this.ui.createElement("div", { class: "menu-row" }, [
        this.ui.createElement("span", { style: "margin: 0px 20px;" }, [
          "Extensions (SOON)",
        ]),
        this.ui.createElement("div", { class: "menu-right" }, [
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "reloadExtensions",
              onclick: () => {
                console.log("Reloading extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["refresh"],
              ),
            ],
          ),
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "extensionsSettings",
              onclick: () => {
                console.log("Disabling all extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["settings"],
              ),
            ],
          ),
        ]),
      ]),
    ]);
    this.nightmarePlugins.sidemenu.attachTo(button, content, 300);
  }

  async profilesMenu(button: HTMLButtonElement) {
    const profilesList = await this.profiles.listProfiles();
    const currentProfile = this.profiles.getCurrentProfile();

    // Create the menu container using Nightmare createElement
    const content = this.ui.createElement(
      "div",
      {
        class: "profile-manager-menu",
        style: `
        min-width: 320px; 
        max-width: 400px; 
        background: var(--bg-2); 
        border: 1px solid var(--white-10); 
        padding: 0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `,
      },
      [
        // Header section
        this.ui.createElement(
          "div",
          {
            class: "flex items-center justify-between p-4 border-b",
            style: "border-bottom: 1px solid var(--white-10);",
          },
          [
            this.ui.createElement(
              "h3",
              {
                style:
                  "color: var(--text); margin: 0; font-size: 16px; font-weight: 600;",
              },
              ["Profile Manager"],
            ),

            this.ui.createElement(
              "div",
              {
                class: "flex items-center gap-2",
              },
              [
                // Create new profile button
                this.ui.createElement(
                  "button",
                  {
                    class:
                      "flex items-center justify-center w-8 h-8 rounded-md hover:bg-opacity-80",
                    style:
                      "background: var(--main); color: var(--bg-1); border: none;",
                    title: "Create New Profile",
                    onclick: () => this.showCreateProfileDialog(),
                  },
                  [
                    this.ui.createElement(
                      "i",
                      {
                        "data-lucide": "user-plus",
                        style: "width: 16px; height: 16px;",
                      },
                      [],
                    ),
                  ],
                ),

                // Settings button
                this.ui.createElement(
                  "button",
                  {
                    class:
                      "flex items-center justify-center w-8 h-8 rounded-md",
                    style:
                      "color: var(--text); border: none; background: var(--white-05);",
                    title: "Profile Settings",
                    onclick: async () => {
                      const url =
                        (await this.proto.processUrl("daydream://settings")) ||
                        "/internal/error/";
                      const iframe = this.items.frameContainer!.querySelector(
                        "iframe.active",
                      ) as HTMLIFrameElement | null;
                      iframe!.setAttribute("src", url);
                    },
                  },
                  [
                    this.ui.createElement(
                      "i",
                      {
                        "data-lucide": "settings",
                        style: "width: 16px; height: 16px;",
                      },
                      [],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),

        // Current profile section
        ...(currentProfile
          ? [
              this.ui.createElement(
                "div",
                {
                  class: "p-4 border-b",
                  style: "border-bottom: 1px solid var(--white-10);",
                },
                [
                  this.ui.createElement(
                    "div",
                    {
                      class: "flex items-center justify-between",
                    },
                    [
                      this.ui.createElement(
                        "div",
                        {
                          class: "flex items-center gap-3",
                        },
                        [
                          this.ui.createElement(
                            "div",
                            {
                              class:
                                "w-10 h-10 rounded-full flex items-center justify-center",
                              style:
                                "background: var(--main); color: var(--bg-1); font-weight: 600;",
                            },
                            [currentProfile.charAt(0).toUpperCase()],
                          ),

                          this.ui.createElement("div", {}, [
                            this.ui.createElement(
                              "div",
                              {
                                style:
                                  "color: var(--text); font-size: 14px; font-weight: 500;",
                              },
                              [currentProfile],
                            ),
                            this.ui.createElement(
                              "div",
                              {
                                style:
                                  "color: var(--text); opacity: 0.7; font-size: 12px;",
                              },
                              ["Current Profile"],
                            ),
                          ]),
                        ],
                      ),

                      this.ui.createElement(
                        "div",
                        {
                          class: "flex items-center gap-1",
                        },
                        [
                          // Export current profile button
                          this.ui.createElement(
                            "button",
                            {
                              class:
                                "flex items-center justify-center w-6 h-6 rounded",
                              style:
                                "color: var(--text); border: none; background: var(--white-05);",
                              title: "Export Profile",
                              onclick: () => this.exportCurrentProfile(),
                            },
                            [
                              this.ui.createElement(
                                "i",
                                {
                                  "data-lucide": "download",
                                  style: "width: 12px; height: 12px;",
                                },
                                [],
                              ),
                            ],
                          ),

                          // Save current profile button
                          this.ui.createElement(
                            "button",
                            {
                              class:
                                "flex items-center justify-center w-6 h-6 rounded",
                              style:
                                "color: var(--text); border: none; background: var(--white-05);",
                              title: "Save Profile",
                              onclick: () => this.saveCurrentProfile(),
                            },
                            [
                              this.ui.createElement(
                                "i",
                                {
                                  "data-lucide": "save",
                                  style: "width: 12px; height: 12px;",
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
            ]
          : []),

        // Profiles list section
        this.ui.createElement(
          "div",
          {
            style: "max-height: 300px; overflow-y: auto;",
          },
          [
            profilesList.length > 0
              ? this.ui.createElement(
                  "div",
                  {
                    class: "p-2",
                  },
                  [
                    this.ui.createElement(
                      "div",
                      {
                        style:
                          "color: var(--text); opacity: 0.7; font-size: 12px; font-weight: 500; margin-bottom: 8px; padding: 0 8px;",
                      },
                      ["Available Profiles"],
                    ),

                    ...profilesList.map((profileId) =>
                      this.ui.createElement(
                        "div",
                        {
                          class: `profile-row flex items-center justify-between p-2 rounded-md cursor-pointer`,
                          style:
                            currentProfile === profileId
                              ? "background: var(--main-20a); border: 1px solid var(--main-35a);"
                              : "border: 1px solid transparent;",
                          onmouseenter:
                            currentProfile !== profileId
                              ? (e: Event) => {
                                  (e.target as HTMLElement).style.background =
                                    "var(--white-05)";
                                }
                              : undefined,
                          onmouseleave:
                            currentProfile !== profileId
                              ? (e: Event) => {
                                  (e.target as HTMLElement).style.background =
                                    "transparent";
                                }
                              : undefined,
                        },
                        [
                          this.ui.createElement(
                            "div",
                            {
                              class: "flex items-center gap-3 flex-1",
                              onclick:
                                currentProfile !== profileId
                                  ? () => this.switchToProfile(profileId)
                                  : undefined,
                            },
                            [
                              this.ui.createElement(
                                "div",
                                {
                                  class:
                                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                                  style:
                                    currentProfile === profileId
                                      ? "background: var(--main); color: var(--bg-1);"
                                      : "background: var(--white-10); color: var(--text);",
                                },
                                [profileId.charAt(0).toUpperCase()],
                              ),

                              this.ui.createElement(
                                "div",
                                {
                                  class: "flex-1",
                                },
                                [
                                  this.ui.createElement(
                                    "div",
                                    {
                                      style:
                                        "color: var(--text); font-size: 14px; font-weight: 500;",
                                    },
                                    [profileId],
                                  ),

                                  ...(currentProfile === profileId
                                    ? [
                                        this.ui.createElement(
                                          "div",
                                          {
                                            style:
                                              "color: var(--main); font-size: 12px;",
                                          },
                                          ["● Active"],
                                        ),
                                      ]
                                    : []),
                                ],
                              ),
                            ],
                          ),

                          this.ui.createElement(
                            "div",
                            {
                              class: "profile-actions flex items-center gap-1",
                            },
                            [
                              // Switch button (only for non-active profiles)
                              ...(currentProfile !== profileId
                                ? [
                                    this.ui.createElement(
                                      "button",
                                      {
                                        class:
                                          "flex items-center justify-center w-5 h-5 rounded",
                                        style:
                                          "color: var(--success); border: none; background: transparent;",
                                        title: "Switch to Profile",
                                        onclick: (e: Event) => {
                                          e.stopPropagation();
                                          this.switchToProfile(profileId);
                                        },
                                      },
                                      [
                                        this.ui.createElement(
                                          "i",
                                          {
                                            "data-lucide": "arrow-right",
                                            style: "width: 10px; height: 10px;",
                                          },
                                          [],
                                        ),
                                      ],
                                    ),
                                  ]
                                : []),

                              // Export button
                              this.ui.createElement(
                                "button",
                                {
                                  class:
                                    "flex items-center justify-center w-5 h-5 rounded",
                                  style:
                                    "color: var(--text); border: none; background: transparent;",
                                  title: "Export Profile",
                                  onclick: (e: Event) => {
                                    e.stopPropagation();
                                    this.exportProfile(profileId);
                                  },
                                },
                                [
                                  this.ui.createElement(
                                    "i",
                                    {
                                      "data-lucide": "download",
                                      style: "width: 10px; height: 10px;",
                                    },
                                    [],
                                  ),
                                ],
                              ),

                              // Delete button (only for non-active profiles)
                              ...(currentProfile !== profileId
                                ? [
                                    this.ui.createElement(
                                      "button",
                                      {
                                        class:
                                          "flex items-center justify-center w-5 h-5 rounded",
                                        style:
                                          "color: var(--error); border: none; background: transparent;",
                                        title: "Delete Profile",
                                        onclick: (e: Event) => {
                                          e.stopPropagation();
                                          this.deleteProfile(profileId);
                                        },
                                      },
                                      [
                                        this.ui.createElement(
                                          "i",
                                          {
                                            "data-lucide": "trash-2",
                                            style: "width: 10px; height: 10px;",
                                          },
                                          [],
                                        ),
                                      ],
                                    ),
                                  ]
                                : []),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                )
              : this.ui.createElement(
                  "div",
                  {
                    class: "p-6 text-center",
                  },
                  [
                    this.ui.createElement(
                      "i",
                      {
                        "data-lucide": "users",
                        style:
                          "width: 32px; height: 32px; color: var(--text); opacity: 0.4; margin: 0 auto 12px; display: block;",
                      },
                      [],
                    ),
                    this.ui.createElement(
                      "div",
                      {
                        style:
                          "color: var(--text); font-size: 14px; font-weight: 500; margin-bottom: 4px;",
                      },
                      ["No Profiles Yet"],
                    ),
                    this.ui.createElement(
                      "div",
                      {
                        style:
                          "color: var(--text); opacity: 0.7; font-size: 12px;",
                      },
                      ["Create your first profile to get started"],
                    ),
                  ],
                ),
          ],
        ),

        // Footer actions
        this.ui.createElement(
          "div",
          {
            class: "p-4 border-t",
            style: "border-top: 1px solid var(--white-10);",
          },
          [
            this.ui.createElement(
              "div",
              {
                class: "flex items-center gap-2",
              },
              [
                // Import button
                this.ui.createElement(
                  "button",
                  {
                    class:
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md",
                    style:
                      "color: var(--text); border: 1px solid var(--white-10); background: transparent; font-size: 12px;",
                    title: "Import Profile",
                    onclick: () => this.importProfile(),
                  },
                  [
                    this.ui.createElement(
                      "i",
                      {
                        "data-lucide": "upload",
                        style: "width: 14px; height: 14px; margin-right: 6px;",
                      },
                      [],
                    ),
                    "Import",
                  ],
                ),

                // Clear data button
                this.ui.createElement(
                  "button",
                  {
                    class:
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md",
                    style:
                      "color: var(--text); border: none; background: var(--white-05); font-size: 12px;",
                    title: "Clear Current Data",
                    onclick: () => this.clearCurrentProfileData(),
                  },
                  [
                    this.ui.createElement(
                      "i",
                      {
                        "data-lucide": "trash",
                        style: "width: 14px; height: 14px; margin-right: 6px;",
                      },
                      [],
                    ),
                    "Clear Data",
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );

    // Initialize Lucide icons for the menu
    requestAnimationFrame(() => {
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    });

    this.nightmarePlugins.sidemenu.attachTo(button, content);
  }

  // Profile management helper methods
  async showCreateProfileDialog() {
    // Create basecoat dialog
    const dialog = document.createElement("div");
    dialog.className = "bc-dialog-overlay";
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999999;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const dialogContent = document.createElement("div");
    dialogContent.className = "bc-dialog-content";
    dialogContent.style.cssText = `
      background: var(--bg-2);
      border: 1px solid var(--white-10);
      border-radius: 12px;
      padding: 24px;
      min-width: 400px;
      max-width: 90vw;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      transform: scale(0.95);
      transition: transform 0.2s ease;
    `;

    // Dialog header
    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-6";

    const title = document.createElement("h2");
    title.textContent = "Create New Profile";
    title.style.cssText =
      "color: var(--text); font-size: 20px; font-weight: 600; margin: 0;";

    const closeBtn = document.createElement("button");
    closeBtn.className =
      "flex items-center justify-center w-8 h-8 rounded-full hover:bg-opacity-80";
    closeBtn.style.cssText =
      "color: var(--text); background: var(--white-05); border: none; transition: all 0.15s ease;";
    closeBtn.innerHTML =
      '<i data-lucide="x" style="width: 16px; height: 16px;"></i>';
    closeBtn.onclick = () => closeDialog();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Form content
    const form = document.createElement("form");
    form.style.cssText = "display: flex; flex-direction: column; gap: 16px;";

    const inputGroup = document.createElement("div");
    inputGroup.style.cssText =
      "display: flex; flex-direction: column; gap: 8px;";

    const label = document.createElement("label");
    label.textContent = "Profile Name";
    label.style.cssText =
      "color: var(--text); font-size: 14px; font-weight: 500;";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Enter profile name...";
    input.className = "bc-input";
    input.style.cssText = `
      background: var(--bg-1);
      border: 1px solid var(--white-10);
      border-radius: 8px;
      padding: 12px 16px;
      color: var(--text);
      font-size: 14px;
      outline: none;
      transition: all 0.15s ease;
    `;

    // Add focus styles
    input.onfocus = () => {
      input.style.borderColor = "var(--main)";
      input.style.boxShadow = "0 0 0 3px var(--main-20a)";
    };
    input.onblur = () => {
      input.style.borderColor = "var(--white-10)";
      input.style.boxShadow = "none";
    };

    const helpText = document.createElement("div");
    helpText.textContent =
      "Choose a unique name for your profile. This will help you identify it later.";
    helpText.style.cssText =
      "color: var(--text); opacity: 0.7; font-size: 12px;";

    inputGroup.appendChild(label);
    inputGroup.appendChild(input);
    inputGroup.appendChild(helpText);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "flex items-center justify-end gap-3 mt-4";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "bc-btn-secondary";
    cancelBtn.style.cssText = `
      background: transparent;
      border: 1px solid var(--white-10);
      color: var(--text);
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    cancelBtn.onmouseenter = () => {
      cancelBtn.style.background = "var(--white-05)";
    };
    cancelBtn.onmouseleave = () => {
      cancelBtn.style.background = "transparent";
    };
    cancelBtn.onclick = () => closeDialog();

    const createBtn = document.createElement("button");
    createBtn.type = "submit";
    createBtn.textContent = "Create Profile";
    createBtn.className = "bc-btn-primary";
    createBtn.style.cssText = `
      background: var(--main);
      border: none;
      color: var(--bg-1);
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    createBtn.onmouseenter = () => {
      createBtn.style.transform = "scale(1.02)";
    };
    createBtn.onmouseleave = () => {
      createBtn.style.transform = "scale(1)";
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);

    form.appendChild(inputGroup);
    form.appendChild(actions);

    // Form submission
    form.onsubmit = async (e) => {
      e.preventDefault();
      const profileName = input.value.trim();

      if (!profileName) {
        input.style.borderColor = "var(--error)";
        input.focus();
        return;
      }

      try {
        createBtn.textContent = "Creating...";
        createBtn.disabled = true;
        createBtn.style.opacity = "0.7";

        await this.profiles.createProfile(profileName);
        this.logger.createLog(`Created new profile: ${profileName}`);

        closeDialog();

        // Show success message and refresh the entire page
        this.showAlert("Profile created successfully!", "success").then(() => {
          window.location.reload();
        });
      } catch (error) {
        console.error("Failed to create profile:", error);
        this.showAlert(`Failed to create profile: ${error}`, "error");

        createBtn.textContent = "Create Profile";
        createBtn.disabled = false;
        createBtn.style.opacity = "1";
        input.style.borderColor = "var(--error)";
        input.focus();
      }
    };

    dialogContent.appendChild(header);
    dialogContent.appendChild(form);
    dialog.appendChild(dialogContent);

    const closeDialog = () => {
      dialog.style.opacity = "0";
      dialogContent.style.transform = "scale(0.95)";
      setTimeout(() => {
        document.body.removeChild(dialog);
      }, 200);
    };

    // Close on backdrop click
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        closeDialog();
      }
    };

    // Close on Escape key
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDialog();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);

    // Show dialog
    document.body.appendChild(dialog);

    // Initialize Lucide icons
    if ((window as any).lucide && (window as any).lucide.createIcons) {
      (window as any).lucide.createIcons();
    }

    // Animate in
    setTimeout(() => {
      dialog.style.opacity = "1";
      dialogContent.style.transform = "scale(1)";
      input.focus();
    }, 10);
  }

  async exportCurrentProfile() {
    try {
      await this.profiles.downloadExport();
      this.logger.createLog("Exported current profile");
    } catch (error) {
      console.error("Failed to export profile:", error);
      this.showAlert(`Failed to export profile: ${error}`, "error");
    }
  }

  async saveCurrentProfile() {
    const currentProfile = this.profiles.getCurrentProfile();
    if (!currentProfile) {
      this.showAlert("No active profile to save", "warning");
      return;
    }

    try {
      await this.profiles.saveProfile(currentProfile);
      this.logger.createLog(`Saved profile: ${currentProfile}`);
      this.showAlert("Profile saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save profile:", error);
      this.showAlert(`Failed to save profile: ${error}`, "error");
    }
  }

  async switchToProfile(profileId: string) {
    try {
      await this.profiles.switchProfile(profileId);
      this.logger.createLog(`Switched to profile: ${profileId}`);
      // Close menu and reload page to apply profile
      this.nightmarePlugins.sidemenu.closeMenu();
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch profile:", error);
      this.showAlert(`Failed to switch profile: ${error}`, "error");
    }
  }

  async exportProfile(profileId: string) {
    try {
      // First switch to the profile temporarily to export it
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile !== profileId) {
        await this.profiles.switchProfile(profileId);
      }

      await this.profiles.downloadExport(`${profileId}-export.json`);

      // Switch back to original profile if needed
      if (currentProfile && currentProfile !== profileId) {
        await this.profiles.switchProfile(currentProfile);
      }

      this.logger.createLog(`Exported profile: ${profileId}`);
    } catch (error) {
      console.error("Failed to export profile:", error);
      this.showAlert(`Failed to export profile: ${error}`, "error");
    }
  }

  async deleteProfile(profileId: string) {
    const confirmed = await this.showConfirm(
      `Are you sure you want to delete the profile "${profileId}"? This action cannot be undone.`,
      "Delete Profile",
    );
    if (confirmed) {
      try {
        await this.profiles.deleteProfile(profileId);
        this.logger.createLog(`Deleted profile: ${profileId}`);
        // Refresh the entire page
        window.location.reload();
      } catch (error) {
        console.error("Failed to delete profile:", error);
        this.showAlert(`Failed to delete profile: ${error}`, "error");
      }
    }
  }

  async importProfile() {
    // Create a file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";

    fileInput.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (file) {
        try {
          const text = await file.text();
          const profileData = JSON.parse(text);

          // Ask for profile name
          const profileName = await this.showPrompt(
            "Enter a name for the imported profile:",
            profileData.profileId || "Imported Profile",
            "Import Profile",
          );
          if (!profileName || !profileName.trim()) {
            return;
          }

          // Create new profile
          await this.profiles.createProfile(profileName.trim());

          // Switch to the new profile
          await this.profiles.switchProfile(profileName.trim());

          // Apply the imported data
          if (profileData.cookies) {
            await this.profiles.setCookies(profileData.cookies);
          }
          if (profileData.localStorage) {
            await this.profiles.setLocalStorage(profileData.localStorage);
          }
          if (profileData.indexedDB && profileData.indexedDB.length > 0) {
            const idbData: Record<string, any> = {};
            profileData.indexedDB.forEach((db: any) => {
              if (db.name && db.data) {
                idbData[db.name] = db.data;
              }
            });
            await this.profiles.setIDBData(idbData);
          }

          // Save the profile
          await this.profiles.saveProfile(profileName.trim());

          this.logger.createLog(`Imported profile: ${profileName}`);
          this.showAlert("Profile imported successfully!", "success").then(
            () => {
              // Refresh the entire page
              window.location.reload();
            },
          );
        } catch (error) {
          console.error("Failed to import profile:", error);
          this.showAlert(`Failed to import profile: ${error}`, "error");
        }
      }

      // Clean up
      document.body.removeChild(fileInput);
    };

    document.body.appendChild(fileInput);
    fileInput.click();
  }

  async clearCurrentProfileData() {
    const confirmed = await this.showConfirm(
      "Are you sure you want to clear all current browsing data? This will clear cookies, localStorage, and IndexedDB data.",
      "Clear Data",
    );
    if (confirmed) {
      try {
        await this.profiles.clearCurrentProfileData();
        this.logger.createLog("Cleared current profile data");
        this.showAlert("Browsing data cleared successfully!", "success").then(
          () => {
            window.location.reload();
          },
        );
      } catch (error) {
        console.error("Failed to clear profile data:", error);
        this.showAlert(`Failed to clear profile data: ${error}`, "error");
      }
    }
  }

  navbarfunctions() {
    const navbar = document.querySelector(".navbar");
    const games = navbar!.querySelector("#gamesShortcut");
    const chat = navbar!.querySelector("#chatShortcut") as HTMLButtonElement;
    const history = navbar!.querySelector("#historyShortcut");
    // const github = navbar!.querySelector("#gitShortcut");
    const settings = navbar!.querySelector("#settShortcut");

    games!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("daydream://games")) || "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });

    chat!.addEventListener("click", async () => {
      window.open("https://discord.night-x.com", "_blank");
    });

    history!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("daydream://history")) ||
        "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });

    /*github!.addEventListener("click", async () => {
      window.open("https://github.com/NightProxy/DayDreamX", "_blank");
    });*/

    settings!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("daydream://settings")) ||
        "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });
  }

  // Basecoat Modal Utility Functions
  private showModal(config: {
    title: string;
    message: string;
    type?: "info" | "success" | "error" | "warning";
    buttons?: Array<{ text: string; style?: string; action?: () => void }>;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = this.ui.createElement(
        "div",
        {
          class: "fixed inset-0 z-50 flex items-center justify-center",
          style: "background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px);",
        },
        [
          this.ui.createElement(
            "div",
            {
              class:
                "bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 transform transition-all",
              style: `
            background: var(--bg-2);
            border: 1px solid var(--white-10);
            animation: modal-enter 0.2s ease-out;
          `,
            },
            [
              // Header
              this.ui.createElement(
                "div",
                {
                  class: "p-4 border-b",
                  style: "border-bottom: 1px solid var(--white-10);",
                },
                [
                  this.ui.createElement(
                    "div",
                    {
                      class: "flex items-center gap-3",
                    },
                    [
                      this.ui.createElement(
                        "div",
                        {
                          class:
                            "w-8 h-8 rounded-full flex items-center justify-center",
                          style:
                            config.type === "error"
                              ? "background: var(--error); color: white;"
                              : config.type === "success"
                                ? "background: var(--success); color: white;"
                                : config.type === "warning"
                                  ? "background: var(--warning); color: white;"
                                  : "background: var(--main); color: white;",
                        },
                        [
                          this.ui.createElement(
                            "i",
                            {
                              "data-lucide":
                                config.type === "error"
                                  ? "x-circle"
                                  : config.type === "success"
                                    ? "check-circle"
                                    : config.type === "warning"
                                      ? "alert-triangle"
                                      : "info",
                              style: "width: 16px; height: 16px;",
                            },
                            [],
                          ),
                        ],
                      ),
                      this.ui.createElement(
                        "h3",
                        {
                          style:
                            "color: var(--text); margin: 0; font-size: 16px; font-weight: 600;",
                        },
                        [config.title],
                      ),
                    ],
                  ),
                ],
              ),

              // Content
              this.ui.createElement(
                "div",
                {
                  class: "p-4",
                },
                [
                  this.ui.createElement(
                    "p",
                    {
                      style: "color: var(--text); margin: 0; line-height: 1.5;",
                    },
                    [config.message],
                  ),
                ],
              ),

              // Footer
              this.ui.createElement(
                "div",
                {
                  class: "p-4 border-t flex justify-end gap-2",
                  style: "border-top: 1px solid var(--white-10);",
                },
                config.buttons?.map((button) =>
                  this.ui.createElement(
                    "button",
                    {
                      class: "px-4 py-2 rounded-md font-medium",
                      style:
                        button.style ||
                        "background: var(--main); color: var(--bg-1); border: none;",
                      onclick: () => {
                        closeModal();
                        if (button.action) button.action();
                        resolve(
                          button.text.toLowerCase().includes("ok") ||
                            button.text.toLowerCase().includes("yes"),
                        );
                      },
                    },
                    [button.text],
                  ),
                ) || [
                  this.ui.createElement(
                    "button",
                    {
                      class: "px-4 py-2 rounded-md font-medium",
                      style:
                        "background: var(--main); color: var(--bg-1); border: none;",
                      onclick: () => {
                        closeModal();
                        resolve(true);
                      },
                    },
                    ["OK"],
                  ),
                ],
              ),
            ],
          ),
        ],
      );

      const closeModal = () => {
        modal.style.opacity = "0";
        setTimeout(() => {
          document.body.removeChild(modal);
        }, 200);
      };

      // Close on backdrop click
      modal.onclick = (e) => {
        if (e.target === modal) {
          closeModal();
          resolve(false);
        }
      };

      // Close on Escape key
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
          document.removeEventListener("keydown", handleKeydown);
          resolve(false);
        }
      };
      document.addEventListener("keydown", handleKeydown);

      // Show modal
      document.body.appendChild(modal);

      // Initialize icons
      requestAnimationFrame(() => {
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          (window as any).lucide.createIcons();
        }
      });
    });
  }

  private showAlert(
    message: string,
    type: "info" | "success" | "error" | "warning" = "info",
  ): Promise<void> {
    return this.showModal({
      title: type.charAt(0).toUpperCase() + type.slice(1),
      message,
      type,
      buttons: [{ text: "OK" }],
    }).then(() => {});
  }

  private showConfirm(
    message: string,
    title: string = "Confirm",
  ): Promise<boolean> {
    return this.showModal({
      title,
      message,
      type: "warning",
      buttons: [
        {
          text: "Cancel",
          style:
            "background: var(--white-10); color: var(--text); border: none;",
        },
        {
          text: "Yes",
          style: "background: var(--error); color: white; border: none;",
        },
      ],
    });
  }

  private showPrompt(
    message: string,
    defaultValue: string = "",
    title: string = "Input",
  ): Promise<string | null> {
    return new Promise((resolve) => {
      let inputValue = defaultValue;

      const modal = this.ui.createElement(
        "div",
        {
          class: "fixed inset-0 z-50 flex items-center justify-center",
          style: "background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px);",
        },
        [
          this.ui.createElement(
            "div",
            {
              class:
                "bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 transform transition-all",
              style: `
            background: var(--bg-2);
            border: 1px solid var(--white-10);
            animation: modal-enter 0.2s ease-out;
          `,
            },
            [
              // Header
              this.ui.createElement(
                "div",
                {
                  class: "p-4 border-b",
                  style: "border-bottom: 1px solid var(--white-10);",
                },
                [
                  this.ui.createElement(
                    "h3",
                    {
                      style:
                        "color: var(--text); margin: 0; font-size: 16px; font-weight: 600;",
                    },
                    [title],
                  ),
                ],
              ),

              // Content
              this.ui.createElement(
                "div",
                {
                  class: "p-4",
                },
                [
                  this.ui.createElement(
                    "p",
                    {
                      style:
                        "color: var(--text); margin: 0 0 12px 0; line-height: 1.5;",
                    },
                    [message],
                  ),
                  this.ui.createElement(
                    "input",
                    {
                      type: "text",
                      value: defaultValue,
                      class: "w-full px-3 py-2 rounded-md",
                      style: `
                background: var(--bg-1);
                border: 1px solid var(--white-10);
                color: var(--text);
                font-size: 14px;
              `,
                      oninput: (e: Event) => {
                        inputValue = (e.target as HTMLInputElement).value;
                      },
                      onkeydown: (e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                          closeModal();
                          resolve(inputValue);
                        }
                      },
                    },
                    [],
                  ),
                ],
              ),

              // Footer
              this.ui.createElement(
                "div",
                {
                  class: "p-4 border-t flex justify-end gap-2",
                  style: "border-top: 1px solid var(--white-10);",
                },
                [
                  this.ui.createElement(
                    "button",
                    {
                      class: "px-4 py-2 rounded-md font-medium",
                      style:
                        "background: var(--white-10); color: var(--text); border: none;",
                      onclick: () => {
                        closeModal();
                        resolve(null);
                      },
                    },
                    ["Cancel"],
                  ),
                  this.ui.createElement(
                    "button",
                    {
                      class: "px-4 py-2 rounded-md font-medium",
                      style:
                        "background: var(--main); color: var(--bg-1); border: none;",
                      onclick: () => {
                        closeModal();
                        resolve(inputValue);
                      },
                    },
                    ["OK"],
                  ),
                ],
              ),
            ],
          ),
        ],
      );

      const closeModal = () => {
        modal.style.opacity = "0";
        setTimeout(() => {
          document.body.removeChild(modal);
        }, 200);
      };

      // Close on backdrop click
      modal.onclick = (e) => {
        if (e.target === modal) {
          closeModal();
          resolve(null);
        }
      };

      // Close on Escape key
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
          document.removeEventListener("keydown", handleKeydown);
          resolve(null);
        }
      };
      document.addEventListener("keydown", handleKeydown);

      // Show modal and focus input
      document.body.appendChild(modal);
      const input = modal.querySelector("input") as HTMLInputElement;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);
    });
  }
}

export { Functions };
