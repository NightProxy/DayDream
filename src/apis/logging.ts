import { NightFS } from "./data/fs";
import type { FSType } from "@terbiumos/tfs";

interface LogEntry {
  timestamp: string;
  message: string;
}

const LOGS_DIR = "/data/logs";

class Logger {
  store!: FSType;
  sessionId: string;
  private ready: Promise<void>;
  private currentLogPath: string;

  constructor() {
    this.sessionId = this.getSessionId();
    this.currentLogPath = `${LOGS_DIR}/${this.sessionId}.log`;
    const nfs = new NightFS();
    this.ready = nfs.init.then(() => {
      this.store = nfs.core.fs;
      return this.ensureLogsDir();
    });
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

  private async ensureLogsDir(): Promise<void> {
    const exists = await new Promise<boolean>((resolve) => {
      this.store.exists(LOGS_DIR, resolve);
    });
    if (!exists) {
      await new Promise<void>((resolve, reject) => {
        this.store.mkdir(LOGS_DIR, (err) => (err ? reject(err) : resolve()));
      });
    }
  }

  private parseLogText(text: string): LogEntry[] {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    const entries: LogEntry[] = [];
    for (const line of lines) {
      const match = line.match(/^\[(.*?)\] (.*)$/);
      if (match) {
        entries.push({ timestamp: match[1], message: match[2] });
      }
    }
    return entries;
  }

  private formatLogEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] ${entry.message}\n`;
  }

  private async readLogFile(path: string): Promise<LogEntry[]> {
    await this.ready;
    const fileExists = await new Promise<boolean>((resolve) => {
      this.store.exists(path, resolve);
    });
    if (!fileExists) return [];

    try {
      const data = await new Promise<string>((resolve, reject) => {
        this.store.readFile(path, "utf8", (err, content) =>
          err ? reject(err) : resolve(content as string),
        );
      });
      return this.parseLogText(data);
    } catch {
      return [];
    }
  }

  private async writeLogFile(path: string, entries: LogEntry[]): Promise<void> {
    await this.ready;
    const text = entries.map((e) => this.formatLogEntry(e)).join("");
    return new Promise<void>((resolve, reject) => {
      this.store.writeFile(path, text, "utf8", (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  async createLog(message: string) {
    await this.ready;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      message,
    };
    const formatted = this.formatLogEntry(entry);

    const fileExists = await new Promise<boolean>((resolve) => {
      this.store.exists(this.currentLogPath, resolve);
    });

    if (!fileExists) {
      return new Promise<void>((resolve, reject) => {
        this.store.writeFile(this.currentLogPath, formatted, "utf8", (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }

    return new Promise<void>((resolve, reject) => {
      this.store.appendFile(this.currentLogPath, formatted, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  async getLog(id: string): Promise<LogEntry[] | null> {
    const log = await this.readLogFile(`${LOGS_DIR}/${id}.log`);
    return log.length > 0 ? log : null;
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
    await this.writeLogFile(`${LOGS_DIR}/${id}.log`, log);
  }

  async listLogFiles(): Promise<string[]> {
    await this.ready;
    const files = await new Promise<string[]>((resolve, reject) => {
      this.store.readdir(LOGS_DIR, {}, (err, data) =>
        err ? reject(err) : resolve((data as string[]) || []),
      );
    });
    return files
      .filter((f) => f.endsWith(".log"))
      .map((f) => f.replace(".log", ""));
  }

  async dumpLogs(): Promise<string> {
    await this.ready;
    const files = await this.listLogFiles();
    const sections: string[] = [];

    for (const file of files) {
      const data = await new Promise<string>((resolve, reject) => {
        this.store.readFile(
          `${LOGS_DIR}/${file}.log`,
          "utf8",
          (err, content) => (err ? reject(err) : resolve(content as string)),
        );
      });
      sections.push(`=== ${file}.log ===\n${data}`);
    }

    return sections.join("\n");
  }

  async exportLogs() {
    await this.ready;
    const files = await this.listLogFiles();
    const exportData: Record<string, LogEntry[] | null> = {};

    for (const logId of files) {
      exportData[logId] = await this.getLog(logId);
    }
    return exportData;
  }

  async clearAllLogs() {
    await this.ready;
    const files = await this.listLogFiles();
    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        this.store.unlink(`${LOGS_DIR}/${file}.log`, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }
    sessionStorage.removeItem("sessionId");
  }

  async deleteLog(id: string) {
    await this.ready;
    await new Promise<void>((resolve, reject) => {
      this.store.unlink(`${LOGS_DIR}/${id}.log`, (err) =>
        err ? reject(err) : resolve(),
      );
    });
    if (id === this.sessionId) {
      sessionStorage.removeItem("sessionId");
    }
  }
}

export { Logger };
