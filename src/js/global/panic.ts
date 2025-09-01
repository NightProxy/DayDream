import { SettingsAPI } from "@apis/settings";

const STORAGE_KEY = "panicKeybind";
let initialized = false;

const normalize = (s: string) => s?.trim().toLowerCase();

const triggerPanic = () => {
    const url = "https://google.com";
    if (window.top && window.top !== window.self) {
        try {
            window.top.location.assign(url);
        } catch { }
        setTimeout(() => {
            try {
                if (window.top && window.top !== window.self) window.location.replace("about:blank");
            } catch { }
        }, 200);
    } else {
        try {
            window.location.assign(url);
        } catch { }
    }
};

(async () => {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    const settingsAPI = new SettingsAPI();
    const saved = (await settingsAPI.getItem(STORAGE_KEY)) || "`";
    let keybind = normalize(String(saved));

    window.addEventListener(
        "keydown",
        (e) => {
            if (normalize(e.key) === keybind) triggerPanic();
        },
        { passive: true }
    );
})();
