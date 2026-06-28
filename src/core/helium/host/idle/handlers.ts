// src/core/helium/host/idle/handlers.ts
//
// `chrome.idle.*` host handlers. Provides a real-ish idle detector
// driven by:
//   - Page Visibility API (document.visibilityState) → 'idle' when
//     the DDX shell is hidden
//   - User input + setTimeout (lastInputAt + detectionInterval) →
//     'idle' when no input for N seconds
//   - 'locked' is never reported (no screen-lock signal available in
//     a web context; Chrome itself can't always detect this either)
//
// This is host-side so the same state is shared across all spawned
// extensions. Per-extension `setDetectionInterval` is honoured: the
// host tracks the minimum-requested interval and uses that as the
// effective threshold.

import type { ExtensionContext } from '../../extfs/types';

type IdleState = 'active' | 'idle' | 'locked';

export interface IdleDeps {
  /**
   * Fan-out a `chrome.idle.onStateChanged` event to all extensions
   * (gated by the `idle` permission). Signature matches
   * ExtensionManager.fanoutEvent which uses `string | undefined`.
   */
  fanoutEvent: (method: string, args: unknown[], requiredPerm?: string) => void;
}

export class IdleHandlers {
  private currentState: IdleState = 'active';
  private lastInputAt: number = Date.now();
  private detectionIntervalSec: number = 60;   // Chrome's default minimum
  private installed = false;

  constructor(private readonly deps: IdleDeps) {}

  /**
   * Start the idle detector. Hooks input listeners and starts the
   * periodic check. Idempotent.
   */
  install(): void {
    if (this.installed) return;
    this.installed = true;

    const bump = (): void => {
      this.lastInputAt = Date.now();
      if (this.currentState !== 'active') this.transitionTo('active');
    };

    // Real user-input signals. Any of these resets the idle clock.
    document.addEventListener('mousemove', bump, { passive: true });
    document.addEventListener('mousedown', bump, { passive: true });
    document.addEventListener('keydown', bump, { passive: true });
    document.addEventListener('wheel', bump, { passive: true });
    document.addEventListener('touchstart', bump, { passive: true });

    // Visibility change is a strong signal — when the user switches
    // away from the DDX window, treat as idle. (Chrome reports
    // 'locked' here on some platforms; we conservatively report
    // 'idle' since we can't distinguish.)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.transitionTo('idle');
      } else {
        bump();
      }
    });

    // Periodic check: every detectionInterval seconds, see if we've
    // exceeded the threshold since last input. Not stored — the
    // host lives for the whole DDX session and clearInterval is
    // never needed.
    setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    if (document.visibilityState === 'hidden') {
      if (this.currentState !== 'idle') this.transitionTo('idle');
      return;
    }
    const elapsedSec = (Date.now() - this.lastInputAt) / 1000;
    if (elapsedSec >= this.detectionIntervalSec) {
      if (this.currentState !== 'idle') this.transitionTo('idle');
    } else {
      if (this.currentState !== 'active') this.transitionTo('active');
    }
  }

  private transitionTo(state: IdleState): void {
    this.currentState = state;
    this.deps.fanoutEvent('chrome.idle.onStateChanged', [state], 'idle');
  }

  // --- chrome.idle.* RPC handlers ----

  queryState = async (
    _ctx: ExtensionContext,
    args: unknown[],
  ): Promise<IdleState> => {
    const requested = typeof args[0] === 'number' ? args[0] : this.detectionIntervalSec;
    if (document.visibilityState === 'hidden') return 'idle';
    const elapsedSec = (Date.now() - this.lastInputAt) / 1000;
    return elapsedSec >= requested ? 'idle' : 'active';
  };

  setDetectionInterval = async (
    _ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> => {
    const seconds = args[0];
    if (typeof seconds !== 'number' || seconds < 15) return;
    // Use the MINIMUM of all extension requests so all of them get
    // updates as fast as the most demanding caller wants.
    if (this.detectionIntervalSec === 60 || seconds < this.detectionIntervalSec) {
      this.detectionIntervalSec = seconds;
    }
  };
}
