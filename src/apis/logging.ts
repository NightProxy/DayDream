import localforage from "localforage";

interface LogEntry {
  timestamp: string;
  message: string;
}

class Logger {
  store: typeof localforage;
  sessionId: string;

  constructor() {
    this.store = localforage.createInstance({
      name: "logs",
      storeName: "logs",
    });
    this.sessionId = this.getSessionId();
  }

  getSessionId() {
    const storedSessionId = sessionStorage.getItem("sessionId");
    if (storedSessionId) {
      return storedSessionId;
    } else {
      const newSessionId = this.generateSessionId();
      sessionStorage.setItem("sessionId", newSessionId);
      return newSessionId;
    }
  }

  generateSessionId() {
    const date = new Date();
    return `log-${date.toISOString()}`;
  }

  async createLog(message: string) {
    const log = await this.getLog(this.sessionId);
    if (log) {
      log.push({ timestamp: new Date().toISOString(), message });
      await this.store.setItem(this.sessionId, log);
    } else {
      await this.store.setItem(this.sessionId, [
        { timestamp: new Date().toISOString(), message },
      ]);
    }
  }

  async getLog(id: string): Promise<LogEntry[] | null> {
    return await this.store.getItem<LogEntry[]>(id);
  }

  async editLog(id: string, index: number, newMessage: string) {
    const log = await this.getLog(id);

    if (!log) {
      throw new Error(`Log with id "${id}" not found`);
    }

    if (!Array.isArray(log)) {
      throw new Error(`Log with id "${id}" is not an array`);
    }

    if (!Number.isInteger(index)) {
      throw new TypeError(
        `Index must be an integer, got: ${index} for log id "${id}"`,
      );
    }

    if (index < 0 || index >= log.length) {
      throw new RangeError(
        `Index ${index} is out of bounds for log id "${id}" (length: ${log.length}, valid range: 0-${log.length - 1})`,
      );
    }

    log[index].message = newMessage;
    await this.store.setItem(id, log);
  }

  async exportLogs() {
    const logs = await this.store.keys();
    const exportData: Record<
      string,
      Awaited<ReturnType<typeof this.getLog>>
    > = {};

    for (const logId of logs) {
      exportData[logId] = await this.getLog(logId as string);
    }
    return exportData;
  }

  async clearAllLogs() {
    await this.store.clear();
    sessionStorage.removeItem("sessionId");
  }

  async deleteLog(id: string) {
    await this.store.removeItem(id);
    if (id === this.sessionId) {
      sessionStorage.removeItem("sessionId");
    }
  }
}

export { Logger };
