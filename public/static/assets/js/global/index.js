class Global {
  constructor(settings) {
    this.settings = settings;
    this.theming = new Themeing(settings);
    this.init();
  }
  async init() {
    this.theming.init();
  }
}
