interface HostingInfo {
  hasBackend: boolean;
  mode: "server" | "static";
  checked: boolean;
}

class HostingAPI {
  private cachedResult: HostingInfo | null = null;
  private detectionPromise: Promise<HostingInfo> | null = null;

  async detectServer(): Promise<boolean> {
    const info = await this.getHostingInfo();
    return info.hasBackend;
  }

  async getHostingInfo(): Promise<HostingInfo> {
    if (this.cachedResult) {
      return this.cachedResult;
    }

    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.performDetection();
    const result = await this.detectionPromise;
    this.cachedResult = result;
    this.detectionPromise = null;

    return result;
  }
  private async performDetection(): Promise<HostingInfo> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch("/api/detect", {
        method: "GET",
        signal: controller.signal,
        cache: "no-cache",
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return {
          hasBackend: data.server === true,
          mode: "server",
          checked: true,
        };
      }

      return {
        hasBackend: false,
        mode: "static",
        checked: true,
      };
    } catch (error) {
      return {
        hasBackend: false,
        mode: "static",
        checked: true,
      };
    }
  }

  async redetect(): Promise<HostingInfo> {
    this.cachedResult = null;
    this.detectionPromise = null;
    return this.getHostingInfo();
  }

  getMode(): "server" | "static" | null {
    return this.cachedResult?.mode ?? null;
  }

  hasBackend(): boolean | null {
    return this.cachedResult?.hasBackend ?? null;
  }
}

export { HostingAPI };
export type { HostingInfo };
