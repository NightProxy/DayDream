import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { KeyboardManager } from "./keyboardManager";
import { DevTools } from "./devTools";

interface keysInterface {
  tabs: any;
  functions: any;
  settings: SettingsAPI;
  events: EventSystem;
  keyboardManager: KeyboardManager;
}

class Keys implements keysInterface {
  tabs: any;
  functions: any;
  settings: SettingsAPI;
  events: EventSystem;
  keyboardManager: KeyboardManager;

  constructor(tabs: any, functions: any) {
    this.tabs = tabs;
    this.functions = functions;
    this.settings = new SettingsAPI();
    this.events = new EventSystem();

    const devTools = new DevTools(
      functions.logger,
      functions.items,
      functions.devToggle,
      functions.erudaScriptLoaded,
      functions.erudaScriptInjecting,
    );

    this.keyboardManager = new KeyboardManager(
      this.tabs,
      this.settings,
      this.events,
      devTools,
    );
  }

  init(): void {
    this.keyboardManager.init();

    this.keyboardManager.updateShortcutsFromSettings();
  }

  addCustomShortcut(
    combination: {
      alt?: boolean;
      ctrl?: boolean;
      shift?: boolean;
      key: string;
    },
    callback: (event: KeyboardEvent) => void | Promise<void>,
  ): void {
    this.keyboardManager.addKeyboardShortcut(combination, callback);
  }
}

export { Keys };
