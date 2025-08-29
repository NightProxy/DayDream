import { ModalInterface } from "./types";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";

export class ModalUtilities implements ModalInterface {
  private ui: UI;

  constructor(ui: UI) {
    this.ui = ui;
  }

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

      modal.onclick = (e) => {
        if (e.target === modal) {
          closeModal();
          resolve(false);
        }
      };

      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
          document.removeEventListener("keydown", handleKeydown);
          resolve(false);
        }
      };
      document.addEventListener("keydown", handleKeydown);

      document.body.appendChild(modal);

      requestAnimationFrame(() => {
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          (window as any).lucide.createIcons();
        }
      });
    });
  }

  showAlert(
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

  showConfirm(message: string, title: string = "Confirm"): Promise<boolean> {
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

  showPrompt(
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

      modal.onclick = (e) => {
        if (e.target === modal) {
          closeModal();
          resolve(null);
        }
      };

      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
          document.removeEventListener("keydown", handleKeydown);
          resolve(null);
        }
      };
      document.addEventListener("keydown", handleKeydown);

      document.body.appendChild(modal);
      const input = modal.querySelector("input") as HTMLInputElement;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);
    });
  }
}
