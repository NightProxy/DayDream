class AlertToast {
  ui: NightmareUI;

  constructor(ui: NightmareUI) {
    this.ui = ui;
  }

  display(message: string): void {
    const toastElement = this.ui.createElement("div", { class: "alert" }, [
      this.ui.createElement(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          width: "24",
          height: "24",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        [
          this.ui.createElement("circle", { cx: "12", cy: "12", r: "10" }),
          this.ui.createElement("path", { d: "m9 12 2 2 4-4" }),
        ],
      ),
      this.ui.createElement("h2", {}, [message]),
    ]);

    document.body.appendChild(toastElement);
  }
}

export { AlertToast };