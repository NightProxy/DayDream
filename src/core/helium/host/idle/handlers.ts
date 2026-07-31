
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
  private detectionIntervalSec: number = 60;
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

    document.addEventListener('mousemove', bump, { passive: true });
    document.addEventListener('mousedown', bump, { passive: true });
    document.addEventListener('keydown', bump, { passive: true });
    document.addEventListener('wheel', bump, { passive: true });
    document.addEventListener('touchstart', bump, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.transitionTo('idle');
      } else {
        bump();
      }
    });

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
    if (this.detectionIntervalSec === 60 || seconds < this.detectionIntervalSec) {
      this.detectionIntervalSec = seconds;
    }
  };
}
