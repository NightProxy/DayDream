import * as networkTypes from "@apis/platform/types";
import { SettingsAPI } from "@apis/settings";
import { Hostlist, Pathlist } from "./hosting.hostlist";

class NetworkAPI {
  private settings = new SettingsAPI();

  constructor() {
    this.settings = new SettingsAPI();
  }

  async getServerType(): Promise<string> {
    return await this.settings.getItem("serverType") || "wisp";
  }

  async setServerType(serverType: string): Promise<void> {
    return await this.settings.setItem("serverType", serverType);
  }

  async getServerAddress(): Promise<networkTypes.ServerAddressResponse> {
    return await this.settings.getItem(await this.getServerType());
  }

  async setServerAddress(address: string): Promise<void> {
    return await this.settings.setItem(await this.getServerType(), address);
  }

  async setRemoteProxyServer(server: string) {
    await this.settings.setItem("proxyServer", server);
  }

  async getRemoteProxyServer(): Promise<string> {
    return await this.settings.getItem("proxyServer");
  }

  genBaseServerURL(): string {
    const domainList = Hostlist;
    const cloudflareDomains = domainList.map((domain: string) => `${domain}.cdn.cloudflare.net/`);
    const randomSubdomain = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(36))
      .join('')
      .substring(0, 32);
    
    return `${randomSubdomain}.${cloudflareDomains[Math.floor(Math.random() * cloudflareDomains.length)]}`;
  }

  listVPNPaths(): string[] {
    return Pathlist.map((item: any) => item.path);
  }

  listVPNLocations(): string[] {
    return Pathlist.map((item: any) => item.location);
  }

  async wsPing(
    server: string,
  ): Promise<{ online: boolean; ping: number | string }> {
    return new Promise((resolve) => {
      const websocket = new WebSocket(server);
      const startTime = Date.now();
      websocket.addEventListener("open", () => {
        const pingTime = Date.now() - startTime;
        websocket.close();
        resolve({ online: true, ping: pingTime });
      });
      websocket.addEventListener("message", () => {
        const pingTime = Date.now() - startTime;
        websocket.close();
        resolve({ online: true, ping: pingTime });
      });
      websocket.addEventListener("error", () => {
        websocket.close();
        resolve({ online: false, ping: "N/A" });
      });
      setTimeout(() => {
        websocket.close();
        resolve({ online: false, ping: "N/A" });
      }, 5000);
    });
  }
}

export { NetworkAPI };