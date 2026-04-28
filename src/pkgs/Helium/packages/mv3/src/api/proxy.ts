import { ChromeEvent, ChromeSetting } from '@anthropic/chrome-api-shared';

export class ChromeProxy {
  public readonly onProxyError: ChromeEvent = new ChromeEvent();
  public readonly settings: ChromeSetting = new ChromeSetting();

  static readonly Mode = {
    AUTO_DETECT: "auto_detect",
    DIRECT: "direct",
    FIXED_SERVERS: "fixed_servers",
    PAC_SCRIPT: "pac_script",
    SYSTEM: "system",
  } as const;

  static readonly Scheme = {
    HTTP: "http",
    HTTPS: "https",
    QUIC: "quic",
    SOCKS4: "socks4",
    SOCKS5: "socks5",
  } as const;

}
