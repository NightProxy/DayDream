import { ChromeEvent } from './ChromeEvent';

/**
 * Base class for Chrome settings (e.g. privacy.network.webRTCIPHandlingPolicy).
 * Provides get/set/clear with an onChange event.
 */
export class ChromeSetting {
  private value: any = undefined;
  public readonly onChange: ChromeEvent = new ChromeEvent();

  /**
   * Gets the value of a setting.
   */
  get(details: object, callback?: (details: { value: any; levelOfControl: string }) => void): void {
    const result = {
      value: this.value,
      levelOfControl: 'controllable_by_this_extension',
    };
    if (callback) {
      callback(result);
    }
  }

  /**
   * Sets the value of a setting.
   */
  set(details: { value: any; scope?: string }, callback?: () => void): void {
    const oldValue = this.value;
    this.value = details.value;
    if (oldValue !== this.value) {
      this.onChange.dispatch({ value: this.value, levelOfControl: 'controlled_by_this_extension' });
    }
    if (callback) {
      callback();
    }
  }

  /**
   * Clears the setting, restoring any default value.
   */
  clear(details: object, callback?: () => void): void {
    this.value = undefined;
    this.onChange.dispatch({ value: this.value, levelOfControl: 'controllable_by_this_extension' });
    if (callback) {
      callback();
    }
  }
}
