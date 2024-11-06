class Global {
    constructor(settings){
        this.settings = settings;
        this.init();
    }
    async init() {
        document.documentElement.style.setProperty("--main-color", await this.settings.getItem("themeColor") || "#aa00ff");
    }
}
