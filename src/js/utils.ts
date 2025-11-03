import { Items } from "@browser/items";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";

interface UtilsInterface {
  items: Items;
  logger: Logger;
  settings: SettingsAPI;
}

class Utils implements UtilsInterface {
  items: Items;
  logger: Logger;
  settings: SettingsAPI;

  constructor() {
    this.items = new Items();
    this.logger = new Logger();
    this.settings = new SettingsAPI();
  }

  closest(value: number, array: number[]): number {
    let closest = Infinity;
    let closestIndex = -1;

    array.forEach((v, i) => {
      if (Math.abs(value - v) < closest) {
        closest = Math.abs(value - v);
        closestIndex = i;
      }
    });

    return closestIndex;
  }

  throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number,
  ): (...args: Parameters<T>) => void {
    let lastFunc: ReturnType<typeof setTimeout> | null = null;
    let lastRan: number | null = null;

    return function (...args: Parameters<T>) {
      if (!lastRan) {
        func(...args);
        lastRan = Date.now();
      } else {
        clearTimeout(lastFunc!);
        lastFunc = setTimeout(
          () => {
            if (Date.now() - lastRan! >= limit) {
              func(...args);
              lastRan = Date.now();
            }
          },
          limit - (Date.now() - lastRan!),
        );
      }
    };
  }
}

export { Utils };
