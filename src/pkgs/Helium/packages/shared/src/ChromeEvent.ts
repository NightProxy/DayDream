/**
 * Base class for Chrome extension event listeners.
 * Mirrors the chrome.events.Event interface.
 */
export type EventListener = (...args: any[]) => void;

export class ChromeEvent {
  private listeners: Set<EventListener> = new Set();

  /**
   * Registers an event listener callback to an event.
   */
  addListener(callback: EventListener): void {
    this.listeners.add(callback);
  }

  /**
   * Deregisters an event listener callback from an event.
   */
  removeListener(callback: EventListener): void {
    this.listeners.delete(callback);
  }

  /**
   * Returns whether a particular listener is registered for this event.
   */
  hasListener(callback: EventListener): boolean {
    return this.listeners.has(callback);
  }

  /**
   * Returns whether any listeners are registered for this event.
   */
  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * Dispatches the event to all registered listeners.
   */
  dispatch(...args: any[]): void {
    for (const listener of this.listeners) {
      try {
        listener(...args);
      } catch (e) {
        console.error('Error in event listener:', e);
      }
    }
  }
}
