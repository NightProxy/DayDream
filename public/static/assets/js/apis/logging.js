class Logger {
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

  async createLog(message) {
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

  async getLog(id) {
    return await this.store.getItem(id);
  }

  async editLog(id, index, newMessage) {
    const log = await this.getLog(id);
    if (log) {
      log[index].message = newMessage;
      await this.store.setItem(id, log);
    }
  }

  async exportLogs() {
    const logs = await this.store.keys();
    const exportData = {};
    for (const logId of logs) {
      exportData[logId] = await this.getLog(logId);
    }
    return exportData;
  }

  async clearAllLogs() {
    await this.store.clear();
    sessionStorage.removeItem("sessionId");
  }

  async deleteLog(id) {
    await this.store.removeItem(id);
    if (id === this.sessionId) {
      sessionStorage.removeItem("sessionId");
    }
  }
}
