import { ProfileManagerInterface } from "./types";
import { ProfilesAPI } from "@apis/profiles";
import { Logger } from "@apis/logging";
import { Items } from "@browser/items";
import { Protocols } from "@browser/protocols";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { ModalUtilities } from "./modalUtilities";
import { createIcons, icons } from "lucide";

export class ProfileManager implements ProfileManagerInterface {
  private profiles: ProfilesAPI;
  private logger: Logger;
  private items: Items;
  private proto: Protocols;
  private ui: UI;
  private nightmarePlugins: NightmarePlugins;
  private modalUtilities: ModalUtilities;

  constructor(
    profiles: ProfilesAPI,
    logger: Logger,
    items: Items,
    proto: Protocols,
    ui: UI,
    nightmarePlugins: NightmarePlugins,
    modalUtilities: ModalUtilities,
  ) {
    this.profiles = profiles;
    this.logger = logger;
    this.items = items;
    this.proto = proto;
    this.ui = ui;
    this.nightmarePlugins = nightmarePlugins;
    this.modalUtilities = modalUtilities;
  }

  async profilesMenu(button: HTMLButtonElement): Promise<void> {
    const profilesList = await this.profiles.listProfiles();
    const currentProfile = this.profiles.getCurrentProfile();

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
                        (await this.proto.processUrl("ddx://settings/")) ||
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

        this.createProfilesList(profilesList, currentProfile),

        this.createFooterActions(),
      ],
    );

    requestAnimationFrame(() => {
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    });

    this.nightmarePlugins.sidemenu.attachTo(button, content);
  }

  private createProfilesList(
    profilesList: string[],
    currentProfile: string | null,
  ) {
    return this.ui.createElement(
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
                      class: `profile-row flex items-center justify-between p-2 rounded-md`,
                      style:
                        currentProfile === profileId
                          ? "background: var(--main-20a); border: 1px solid var(--main-35a); cursor: default;"
                          : "border: 1px solid transparent; cursor: pointer;",
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
                          class:
                            "flex items-center gap-3 flex-1 cursor-pointer",
                          style:
                            currentProfile === profileId
                              ? "cursor: default;"
                              : "cursor: pointer;",
                          onclick:
                            currentProfile !== profileId
                              ? (e: Event) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  this.switchToProfile(profileId);
                                }
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

                      this.createProfileActions(profileId, currentProfile),
                    ],
                  ),
                ),
              ],
            )
          : this.createEmptyProfilesState(),
      ],
    );
  }

  private createProfileActions(
    profileId: string,
    currentProfile: string | null,
  ) {
    return this.ui.createElement(
      "div",
      {
        class: "profile-actions flex items-center gap-1",
      },
      [
        ...(currentProfile !== profileId
          ? [
              this.ui.createElement(
                "button",
                {
                  class: "flex items-center justify-center w-5 h-5 rounded",
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

        this.ui.createElement(
          "button",
          {
            class: "flex items-center justify-center w-5 h-5 rounded",
            style: "color: var(--text); border: none; background: transparent;",
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

        ...(currentProfile !== profileId
          ? [
              this.ui.createElement(
                "button",
                {
                  class: "flex items-center justify-center w-5 h-5 rounded",
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
    );
  }

  private createEmptyProfilesState() {
    return this.ui.createElement(
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
            style: "color: var(--text); opacity: 0.7; font-size: 12px;",
          },
          ["Create your first profile to get started"],
        ),
      ],
    );
  }

  private createFooterActions() {
    return this.ui.createElement(
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
    );
  }

  async showCreateProfileDialog(): Promise<void> {
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

    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-6";

    const title = document.createElement("h2");
    title.textContent = "Create New Profile";
    title.style.cssText =
      "color: var(--text); font-size: 20px; font-weight: 600; margin: 0;";

    const closeDialog = () => {
      dialog.style.opacity = "0";
      dialogContent.style.transform = "scale(0.95)";
      setTimeout(() => {
        if (document.body.contains(dialog)) {
          document.body.removeChild(dialog);
        }
      }, 200);
      createIcons({ icons });
    };

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

        await this.createProfileWithPresetData(profileName);
        this.logger.createLog(`Created profile: ${profileName}`);

        closeDialog();

        this.modalUtilities.showAlert(
          "Profile created successfully!",
          "success",
        );

        document.location.reload();
      } catch (error) {
        console.error("Failed to create profile:", error);
        this.modalUtilities.showAlert(
          `Failed to create profile: ${error}`,
          "error",
        );
        createBtn.textContent = "Create Profile";
        createBtn.disabled = false;
        createBtn.style.opacity = "1";
      }
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);

    form.appendChild(inputGroup);
    form.appendChild(actions);

    dialogContent.appendChild(header);
    dialogContent.appendChild(form);
    dialog.appendChild(dialogContent);

    dialog.onclick = (e) => {
      if (e.target === dialog) {
        closeDialog();
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDialog();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);

    document.body.appendChild(dialog);

    if ((window as any).lucide && (window as any).lucide.createIcons) {
      (window as any).lucide.createIcons();
    }

    setTimeout(() => {
      dialog.style.opacity = "1";
      dialogContent.style.transform = "scale(1)";
      input.focus();
    }, 10);
    createIcons({ icons });
  }

  async createProfileWithPresetData(profileName: string): Promise<void> {
    const existingProfiles = await this.profiles.listProfiles();
    const isFirstProfile = existingProfiles.length === 0;

    if (isFirstProfile) {
      await this.profiles.createProfileWithCurrentData(profileName);
    } else {
      const currentProfile = this.profiles.getCurrentProfile();

      if (currentProfile) {
        await this.flushPendingChanges();
        await this.profiles.saveProfile(currentProfile);
        await this.profiles.flushStorageOperations();
      } else if (existingProfiles.length === 1) {
        await this.flushPendingChanges();
        await this.profiles.saveProfile(existingProfiles[0]);
        await this.profiles.flushStorageOperations();
      }

      await this.profiles.createProfile(profileName);
      await this.profiles.switchProfile(profileName, true);
    }
    createIcons({ icons });
  }

  async exportCurrentProfile(): Promise<void> {
    try {
      await this.profiles.downloadExport();
      this.logger.createLog("Exported current profile");
    } catch (error) {
      console.error("Failed to export profile:", error);
      this.modalUtilities.showAlert(
        `Failed to export profile: ${error}`,
        "error",
      );
    }
  }

  async saveCurrentProfile(): Promise<void> {
    const currentProfile = this.profiles.getCurrentProfile();
    if (!currentProfile) {
      this.modalUtilities.showAlert("No active profile to save", "warning");
      return;
    }

    try {
      await this.flushPendingChanges();
      await this.profiles.saveProfile(currentProfile);
      await this.profiles.flushStorageOperations();

      this.logger.createLog(`Saved profile: ${currentProfile}`);
      this.modalUtilities.showAlert("Profile saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save profile:", error);
      this.modalUtilities.showAlert(
        `Failed to save profile: ${error}`,
        "error",
      );
    }
  }

  private async flushPendingChanges(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    );
  }

  async switchToProfile(profileId: string): Promise<void> {
    try {
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile) {
        await this.flushPendingChanges();
        await this.profiles.saveProfile(currentProfile);
        this.profiles.emergencySaveProfile(currentProfile);
        await this.profiles.flushStorageOperations();
      }

      await this.profiles.switchProfile(profileId, true);
      this.logger.createLog(`Switched to profile: ${profileId}`);
      await this.profiles.flushStorageOperations();

      this.nightmarePlugins.sidemenu.closeMenu();
      this.modalUtilities.showAlert(
        `Switched to profile: ${profileId}`,
        "success",
      );

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Failed to switch profile:", error);
      this.modalUtilities.showAlert(
        `Failed to switch profile: ${error}`,
        "error",
      );
    }
  }

  async exportProfile(profileId: string): Promise<void> {
    try {
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile !== profileId) {
        await this.profiles.switchProfile(profileId);
      }

      await this.profiles.downloadExport(`${profileId}-export.json`);

      if (currentProfile && currentProfile !== profileId) {
        await this.profiles.switchProfile(currentProfile);
      }

      this.logger.createLog(`Exported profile: ${profileId}`);
    } catch (error) {
      console.error("Failed to export profile:", error);
      this.modalUtilities.showAlert(
        `Failed to export profile: ${error}`,
        "error",
      );
    }
  }

  async deleteProfile(profileId: string): Promise<void> {
    const confirmed = await this.modalUtilities.showConfirm(
      `Are you sure you want to delete the profile "${profileId}"? This action cannot be undone.`,
      "Delete Profile",
    );
    if (confirmed) {
      try {
        await this.profiles.deleteProfile(profileId);
        this.logger.createLog(`Deleted profile: ${profileId}`);
        window.location.reload();
      } catch (error) {
        console.error("Failed to delete profile:", error);
        this.modalUtilities.showAlert(
          `Failed to delete profile: ${error}`,
          "error",
        );
      }
    }
  }

  async importProfile(): Promise<void> {
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

          const profileName = await this.modalUtilities.showPrompt(
            "Enter a name for the imported profile:",
            profileData.profileId || "Imported Profile",
            "Import Profile",
          );
          if (!profileName || !profileName.trim()) {
            return;
          }

          await this.profiles.createProfile(profileName.trim());

          await this.profiles.switchProfile(profileName.trim());

          if (profileData.cookies) {
            await this.profiles.setCookies(profileData.cookies);
          }
          if (profileData.localStorage) {
            await this.profiles.setLocalStorage(profileData.localStorage);
          }
          if (profileData.indexedDB && profileData.indexedDB.length > 0) {
            await this.profiles.setIDBData(profileData.indexedDB);
          }

          await this.profiles.saveProfile(profileName.trim());

          this.logger.createLog(`Imported profile: ${profileName}`);
          this.modalUtilities
            .showAlert("Profile imported successfully!", "success")
            .then(() => {
              window.location.reload();
            });
        } catch (error) {
          console.error("Failed to import profile:", error);
          this.modalUtilities.showAlert(
            `Failed to import profile: ${error}`,
            "error",
          );
        }
      }

      document.body.removeChild(fileInput);
    };

    document.body.appendChild(fileInput);
    fileInput.click();
  }

  async clearCurrentProfileData(): Promise<void> {
    const confirmed = await this.modalUtilities.showConfirm(
      "Are you sure you want to clear all current browsing data? This will clear cookies, localStorage, and IndexedDB data.",
      "Clear Data",
    );
    if (confirmed) {
      try {
        await this.profiles.clearCurrentProfileData();
        this.logger.createLog("Cleared current profile data");
        this.modalUtilities
          .showAlert("Browsing data cleared successfully!", "success")
          .then(() => {
            window.location.reload();
          });
      } catch (error) {
        console.error("Failed to clear profile data:", error);
        this.modalUtilities.showAlert(
          `Failed to clear profile data: ${error}`,
          "error",
        );
      }
    }
  }

  async inspectCurrentData(): Promise<any> {
    try {
      const currentData = await this.profiles.getCurrentBrowserState();
      const cookies = currentData.cookies;
      const localStorage = currentData.localStorage;
      const idb = currentData.indexedDB;

      console.log("=== CURRENT BROWSER DATA INSPECTION ===");
      console.log("Cookies:", Object.keys(cookies).length, "entries");
      console.log("LocalStorage:", Object.keys(localStorage).length, "entries");
      console.log("IndexedDB:", idb.length, "databases");
      console.log("Cookie keys:", Object.keys(cookies));
      console.log("LocalStorage keys:", Object.keys(localStorage));
      console.log(
        "IndexedDB databases:",
        idb.map((db) => db.name),
      );

      if (localStorage.testProfileData) {
        console.log(
          "✅ Found test profile data:",
          localStorage.testProfileData,
        );
      }
      if (cookies.testProfileCookie) {
        console.log("✅ Found test profile cookie:", cookies.testProfileCookie);
      }

      return { cookies, localStorage, idb };
    } catch (error) {
      console.error("Failed to inspect current data:", error);
    }
  }

  async inspectProfileData(profileId: string): Promise<any> {
    try {
      const profileData = await this.profiles.getProfileData(profileId);
      if (!profileData) {
        console.log(`❌ Profile "${profileId}" not found`);
        return;
      }

      console.log(`=== PROFILE "${profileId}" DATA INSPECTION ===`);
      console.log(
        "Cookies:",
        Object.keys(profileData.cookies).length,
        "entries",
      );
      console.log(
        "LocalStorage:",
        Object.keys(profileData.localStorage).length,
        "entries",
      );
      console.log("IndexedDB:", profileData.indexedDB.length, "databases");
      console.log("Cookie keys:", Object.keys(profileData.cookies));
      console.log("LocalStorage keys:", Object.keys(profileData.localStorage));
      console.log(
        "IndexedDB databases:",
        profileData.indexedDB.map((db) => db.name),
      );

      if (profileData.localStorage.testProfileData) {
        console.log(
          "✅ Found test profile data:",
          profileData.localStorage.testProfileData,
        );
      }
      if (profileData.cookies.testProfileCookie) {
        console.log(
          "✅ Found test profile cookie:",
          profileData.cookies.testProfileCookie,
        );
      }

      return profileData;
    } catch (error) {
      console.error(`Failed to inspect profile "${profileId}":`, error);
    }
  }

  async createTestData(): Promise<void> {
    try {
      localStorage.setItem(
        "testProfileData",
        `Test data created at ${new Date().toISOString()}`,
      );
      localStorage.setItem(
        "profileTestKey",
        "This should be saved with the profile",
      );

      document.cookie = `testProfileCookie=TestValue_${Date.now()}; path=/`;

      console.log("✅ Test data created:");
      console.log("- localStorage: testProfileData, profileTestKey");
      console.log("- Cookie: testProfileCookie");

      this.modalUtilities.showAlert(
        "Test data created! Check console for details.",
        "success",
      );
    } catch (error) {
      console.error("Failed to create test data:", error);
      this.modalUtilities.showAlert(
        `Failed to create test data: ${error}`,
        "error",
      );
    }
  }
}
