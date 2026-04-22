interface ClipboardDeobfuscatorConfig {
  enabled: boolean;
  debug: boolean;
}

class ClipboardDeobfuscator {
  private config: ClipboardDeobfuscatorConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<ClipboardDeobfuscatorConfig>) {
    this.config = {
      enabled: true,
      debug: false,
      ...config,
    };
  }

  private hasCJKCharacters(text: string): boolean {
    return /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(text);
  }

  private deobfuscate(text: string): string {
    if (typeof window === "undefined") return text;

    const fontObf = (window as any).fontObfuscation;

    if (!fontObf || !fontObf.isInitialized()) {
      if (this.config.debug) {
        console.warn(
          "[Clipboard Deobfuscator] Font obfuscation not initialized",
        );
      }
      return text;
    }

    try {
      const decoded = fontObf.decode(text);
      if (this.config.debug) {
        console.log("[Clipboard Deobfuscator] Text deobfuscated:", {
          original: text.substring(0, 50),
          decoded: decoded.substring(0, 50),
        });
      }
      return decoded;
    } catch (error) {
      console.error("[Clipboard Deobfuscator] Deobfuscation failed:", error);
      return text;
    }
  }

  public init(): void {
    if (this.isInitialized || !this.config.enabled) {
      return;
    }

    document.addEventListener("copy", (e: ClipboardEvent) => {
      this.handleCopyEvent(e);
    });

    document.addEventListener("cut", (e: ClipboardEvent) => {
      this.handleCopyEvent(e);
    });

    this.interceptClipboardAPI();

    this.isInitialized = true;

    if (this.config.debug) {
      console.log("[Clipboard Deobfuscator] Initialized");
    }
  }

  private handleCopyEvent(e: ClipboardEvent): void {
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const selectedText = selection.toString();

      if (!this.hasCJKCharacters(selectedText)) {
        return;
      }

      const deobfuscated = this.deobfuscate(selectedText);

      e.preventDefault();

      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", deobfuscated);
        e.clipboardData.setData("text/html", deobfuscated);
      }
    } catch (error) {
      console.error(
        "[Clipboard Deobfuscator] Copy event handling failed:",
        error,
      );
    }
  }

  private interceptClipboardAPI(): void {
    if (!navigator.clipboard) return;

    const originalWriteText = navigator.clipboard.writeText;
    if (originalWriteText) {
      navigator.clipboard.writeText = async (text: string): Promise<void> => {
        if (this.hasCJKCharacters(text)) {
          const deobfuscated = this.deobfuscate(text);
          return originalWriteText.call(navigator.clipboard, deobfuscated);
        }
        return originalWriteText.call(navigator.clipboard, text);
      };
    }

    const originalWrite = navigator.clipboard.write;
    if (originalWrite) {
      navigator.clipboard.write = async (
        data: ClipboardItems,
      ): Promise<void> => {
        try {
          const processedItems: ClipboardItem[] = [];

          for (const item of data) {
            if (item.types.includes("text/plain")) {
              const blob = await item.getType("text/plain");
              const text = await blob.text();

              if (this.hasCJKCharacters(text)) {
                const deobfuscated = this.deobfuscate(text);
                const newBlob = new Blob([deobfuscated], {
                  type: "text/plain",
                });
                processedItems.push(
                  new ClipboardItem({ "text/plain": newBlob }),
                );
                continue;
              }
            }
            processedItems.push(item);
          }

          return originalWrite.call(navigator.clipboard, processedItems);
        } catch (error) {
          console.error(
            "[Clipboard Deobfuscator] Clipboard write interception failed:",
            error,
          );
          return originalWrite.call(navigator.clipboard, data);
        }
      };
    }
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled && !this.isInitialized) {
      this.init();
    }
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }
}

let globalDeobfuscator: ClipboardDeobfuscator | null = null;

export function getClipboardDeobfuscator(
  config?: Partial<ClipboardDeobfuscatorConfig>,
): ClipboardDeobfuscator {
  if (!globalDeobfuscator) {
    globalDeobfuscator = new ClipboardDeobfuscator(config);
  }
  return globalDeobfuscator;
}

export function initClipboardDeobfuscator(
  config?: Partial<ClipboardDeobfuscatorConfig>,
): void {
  const deobfuscator = getClipboardDeobfuscator(config);
  deobfuscator.init();
}

export { ClipboardDeobfuscator };
