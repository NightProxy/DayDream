interface HostingInfo {
  hasBackend: boolean;
  mode: "server" | "static";
  checked: boolean;
}

class HostingAPI {
  private mode: "server" | "static" = "static";
  private backend: boolean = false;

  async detectServer(): Promise<boolean> {
    return this.backend;
  }

  async getHostingInfo(): Promise<HostingInfo> {
    return {
      hasBackend: this.backend,
      mode: this.mode,
      checked: true,
    };
  }

  async redetect(): Promise<HostingInfo> {
    return this.getHostingInfo();
  }

  getMode(): "server" | "static" {
    return this.mode;
  }

  hasBackend(): boolean {
    return this.backend;
  }

  setMode(mode: "server" | "static"): void {
    this.mode = mode;
    this.backend = mode === "server";
  }
}

export { HostingAPI };
export type { HostingInfo };
