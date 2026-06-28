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

  /**
   * Iterate over registered listeners — used by callers that need to
   * implement Chrome's `sendResponse` contract themselves (e.g. the
   * runtime.onMessage bridge in bootstrap/client.ts, which delegates
   * to dispatchOnMessage). Returns the live Set; callers MUST treat
   * it as read-only.
   */
  _listenersForDispatch(): Iterable<EventListener> {
    return this.listeners;
  }

  /**
   * Synchronous dispatch that returns each listener's return value.
   * Used by runtime.onMessage to detect `return true` (Chrome's
   * "async sendResponse" signal). Most callers should use dispatch().
   *
   * Listeners that throw contribute `undefined` to the return array
   * and have their error logged (same as dispatch()).
   */
  dispatchSync(...args: any[]): unknown[] {
    const results: unknown[] = [];
    for (const listener of this.listeners) {
      try {
        results.push(listener(...args));
      } catch (e) {
        console.error('Error in event listener:', e);
        results.push(undefined);
      }
    }
    return results;
  }
}
