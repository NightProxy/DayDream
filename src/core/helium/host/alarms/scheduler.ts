// src/core/helium/host/alarms/scheduler.ts
//
// AlarmScheduler — singleton timer manager for chrome.alarms.
//
// Persists per-extension alarms in extfs (`__helium_alarms__.json`).
// On boot, replays + reschedules. On create/clear, mutates the timer
// table + persists. On fire, dispatches chrome.alarms.onAlarm via the
// `fire` callback and reschedules if periodic.

import { readExtensionFile, writeExtensionFile } from '../../extfs';

export interface Alarm {
  name: string;
  scheduledTime: number;        // ms timestamp
  periodInMinutes?: number;
}

interface StoredAlarms {
  version: 1;
  alarms: Alarm[];
}

const MIN_PERIOD_MS = 30_000;
const STORE_PATH = '__helium_alarms__.json';

export class AlarmScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>(); // key: `${extId}:${name}`
  private readonly alarms = new Map<string, Map<string, Alarm>>();             // extId -> name -> Alarm
  private readonly fire: (extId: string, alarm: Alarm) => void;

  constructor(fire: (extId: string, alarm: Alarm) => void) {
    this.fire = fire;
  }

  async restoreForExt(extId: string): Promise<void> {
    try {
      const bytes = await readExtensionFile(extId, STORE_PATH);
      if (!bytes) return;
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as StoredAlarms;
      if (parsed.version !== 1 || !Array.isArray(parsed.alarms)) return;
      const map = new Map<string, Alarm>();
      for (const a of parsed.alarms) {
        map.set(a.name, a);
        this.scheduleTimer(extId, a);
      }
      this.alarms.set(extId, map);
    } catch (err) {
      console.warn(`[helium/alarms] restoreForExt failed for ${extId}:`, err);
    }
  }

  async create(
    extId: string,
    name: string,
    info: { when?: number; delayInMinutes?: number; periodInMinutes?: number },
  ): Promise<void> {
    const now = Date.now();
    let scheduledTime: number;
    if (typeof info.when === 'number') scheduledTime = info.when;
    else if (typeof info.delayInMinutes === 'number') scheduledTime = now + info.delayInMinutes * 60_000;
    else if (typeof info.periodInMinutes === 'number') scheduledTime = now + info.periodInMinutes * 60_000;
    else throw new Error('alarms.create requires when, delayInMinutes, or periodInMinutes');
    const period = info.periodInMinutes;
    const alarm: Alarm = period !== undefined
      ? { name, scheduledTime, periodInMinutes: period }
      : { name, scheduledTime };
    await this.clear(extId, name); // replace existing
    let map = this.alarms.get(extId);
    if (!map) { map = new Map(); this.alarms.set(extId, map); }
    map.set(name, alarm);
    this.scheduleTimer(extId, alarm);
    await this.persist(extId);
  }

  get(extId: string, name: string): Alarm | undefined {
    return this.alarms.get(extId)?.get(name);
  }

  getAll(extId: string): Alarm[] {
    return Array.from(this.alarms.get(extId)?.values() ?? []);
  }

  async clear(extId: string, name: string): Promise<boolean> {
    const map = this.alarms.get(extId);
    if (!map) return false;
    const had = map.delete(name);
    const key = `${extId}:${name}`;
    const t = this.timers.get(key);
    if (t) { clearTimeout(t); this.timers.delete(key); }
    if (had) await this.persist(extId);
    return had;
  }

  async clearAll(extId: string): Promise<boolean> {
    const map = this.alarms.get(extId);
    if (!map || map.size === 0) return false;
    for (const name of map.keys()) {
      const key = `${extId}:${name}`;
      const t = this.timers.get(key);
      if (t) { clearTimeout(t); this.timers.delete(key); }
    }
    map.clear();
    await this.persist(extId);
    return true;
  }

  /**
   * In-memory teardown only — called on extension kill. Does not
   * touch persisted state so the alarms can be restored on next spawn.
   */
  clearAllForExt(extId: string): void {
    const map = this.alarms.get(extId);
    if (map) {
      for (const name of map.keys()) {
        const key = `${extId}:${name}`;
        const t = this.timers.get(key);
        if (t) { clearTimeout(t); this.timers.delete(key); }
      }
    }
    this.alarms.delete(extId);
  }

  private scheduleTimer(extId: string, alarm: Alarm): void {
    const key = `${extId}:${alarm.name}`;
    const delay = Math.max(0, alarm.scheduledTime - Date.now());
    const t = setTimeout(() => {
      this.timers.delete(key);
      try { this.fire(extId, alarm); } catch (err) {
        console.error('[helium/alarms] fire callback threw:', err);
      }
      // Reschedule if periodic
      if (alarm.periodInMinutes !== undefined) {
        const periodMs = Math.max(MIN_PERIOD_MS, alarm.periodInMinutes * 60_000);
        const next: Alarm = { ...alarm, scheduledTime: Date.now() + periodMs };
        const map = this.alarms.get(extId);
        if (map?.has(alarm.name)) {
          map.set(alarm.name, next);
          this.scheduleTimer(extId, next);
          void this.persist(extId);
        }
      } else {
        const map = this.alarms.get(extId);
        map?.delete(alarm.name);
        void this.persist(extId);
      }
    }, delay);
    this.timers.set(key, t);
  }

  private async persist(extId: string): Promise<void> {
    const map = this.alarms.get(extId);
    const stored: StoredAlarms = { version: 1, alarms: Array.from(map?.values() ?? []) };
    try {
      await writeExtensionFile(extId, STORE_PATH, new TextEncoder().encode(JSON.stringify(stored)));
    } catch (err) {
      console.warn(`[helium/alarms] persist failed for ${extId}:`, err);
    }
  }
}
