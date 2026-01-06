import type { Protocols } from "@browser/protocols";
import type { Proxy } from "@apis/proxy";
import type { Logger } from "@apis/logging";
import type { GameData } from "./types";

export async function handleSuggestionClick(
  suggestion: string,
  proto: Protocols,
  proxy: Proxy,
  swConfig: any,
  proxySetting: string,
  logger: Logger,
): Promise<void> {
  try {
    if (proto.isRegisteredProtocol(suggestion)) {
      const processedUrl = await proto.processUrl(suggestion);
      if (
        typeof processedUrl === "string" &&
        processedUrl.startsWith("/internal/")
      ) {
        const iframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;
        if (iframe) {
          iframe.setAttribute("src", processedUrl);
        }
      }
    } else {
      await proxy.redirect(swConfig, proxySetting, suggestion);
    }
  } catch (error) {
    console.error("Navigation error:", error);
    logger.createLog(`Navigation error: ${error}`);
  }
}

export async function handleDirectNavigation(
  input: string,
  proto: Protocols,
  proxy: Proxy,
  swConfig: any,
  proxySetting: string,
  logger: Logger,
): Promise<void> {
  try {
    if (proto.isRegisteredProtocol(input)) {
      const processedUrl = await proto.processUrl(input);
      if (
        typeof processedUrl === "string" &&
        processedUrl.startsWith("/internal/")
      ) {
        const iframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;
        if (iframe) {
          iframe.setAttribute("src", processedUrl);

          window.dispatchEvent(
            new CustomEvent("tabNavigated", {
              detail: {
                tabId: iframe.getAttribute("data-tab-id") || "unknown",
                url: processedUrl,
                fromSearch: true,
              },
            }),
          );
        }
      }
    } else {
      await proxy.redirect(swConfig, proxySetting, input);

      const iframe = document.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      if (iframe) {
        window.dispatchEvent(
          new CustomEvent("tabNavigated", {
            detail: {
              tabId: iframe.getAttribute("data-tab-id") || "unknown",
              url: input,
              fromSearch: true,
            },
          }),
        );
      }
    }
  } catch (error) {
    console.error("Direct navigation error:", error);
    logger.createLog(`Direct navigation error: ${error}`);
  }
}

export async function handleGameClick(
  game: GameData,
  proxy: Proxy,
  swConfig: any,
  proxySetting: string,
  logger: Logger,
): Promise<void> {
  try {
    await proxy.redirect(swConfig, proxySetting, game.link);

    const iframe = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement | null;
    if (iframe) {
      window.dispatchEvent(
        new CustomEvent("tabNavigated", {
          detail: {
            tabId: iframe.getAttribute("data-tab-id") || "unknown",
            url: game.link,
            fromGame: true,
            gameTitle: game.name,
          },
        }),
      );
    }
  } catch (error) {
    console.error("Game navigation error:", error);
    logger.createLog(`Game navigation error: ${error}`);
  }
}

export async function syncAddressBar(
  iframe: HTMLIFrameElement,
  searchbar: HTMLInputElement,
  proto: Protocols,
  logger: Logger,
): Promise<void> {
  try {
    let url = new URL(iframe.src).pathname;

    const internalCheck = await proto.getInternalURL(url);
    if (
      typeof internalCheck === "string" &&
      proto.isRegisteredProtocol(internalCheck)
    ) {
      searchbar.value = internalCheck;
      return;
    }

    const windowObj = window as any;
    const proxyConfig = windowObj.SWconfig?.[windowObj.ProxySettings];

    if (proxyConfig?.config?.prefix) {
      url = url.replace(proxyConfig.config.prefix, "");
    }

    let decodedUrl = url;
    if (windowObj.__uv$config?.decodeUrl) {
      try {
        decodedUrl = windowObj.__uv$config.decodeUrl(url);
      } catch {
        decodedUrl = iframe.src;
      }
    }

    const decodedCheck = await proto.getInternalURL(decodedUrl);

    if (
      typeof decodedCheck === "string" &&
      proto.isRegisteredProtocol(decodedCheck)
    ) {
      searchbar.value = decodedCheck;
    } else {
      try {
        const urlObj = new URL(decodedUrl);
        searchbar.value = urlObj.href;
      } catch {
        searchbar.value = decodedUrl;
      }
    }
  } catch (error) {
    console.warn("Failed to sync address bar:", error);
    logger.createLog(`Address bar sync error: ${error}`);
  }
}
