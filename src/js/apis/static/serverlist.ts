interface WispServer {
  url: string;
  name?: string;
  region?: string;
}

interface ServerListResponse {
  servers: WispServer[];
  updated?: string;
}

class ServerListAPI {
  private serverListUrl = "https://servers.night-x.com/wisp-servers.json";
  private cachedServers: WispServer[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheDuration: number = 300000; // 5 minutes cache
  private fetchPromise: Promise<WispServer[]> | null = null;

  async fetchServerList(): Promise<WispServer[]> {
    if (
      this.cachedServers &&
      Date.now() - this.cacheTimestamp < this.cacheDuration
    ) {
      return this.cachedServers;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.performFetch();
    try {
      const servers = await this.fetchPromise;
      this.cachedServers = servers;
      this.cacheTimestamp = Date.now();
      return servers;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async performFetch(): Promise<WispServer[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(this.serverListUrl, {
        method: "GET",
        signal: controller.signal,
        cache: "no-cache",
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch server list: ${response.status}`);
      }

      const data: ServerListResponse = await response.json();

      if (!data.servers || !Array.isArray(data.servers)) {
        throw new Error("Invalid server list format");
      }

      return data.servers;
    } catch (error) {
      console.error("Error fetching server list:", error);
      return this.getFallbackServers();
    }
  }

  private getFallbackServers(): WispServer[] {
    return [
      { url: "wss://gointospace.app/wisp/", name: "Space Main" },
      { url: "wss://daydreamx.pro/wisp/", name: "DDX Main" },
    ];
  }

  clearCache(): void {
    this.cachedServers = null;
    this.cacheTimestamp = 0;
    this.fetchPromise = null;
  }

  getCachedServers(): WispServer[] | null {
    if (
      this.cachedServers &&
      Date.now() - this.cacheTimestamp < this.cacheDuration
    ) {
      return this.cachedServers;
    }
    return null;
  }

  setServerListUrl(url: string): void {
    this.serverListUrl = url;
    this.clearCache();
  }
}

export { ServerListAPI };
export type { WispServer, ServerListResponse };
