import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromePrinterProvider {
  public readonly onPrintRequested: ChromeEvent = new ChromeEvent();
  public readonly onGetCapabilityRequested: ChromeEvent = new ChromeEvent();
  public readonly onGetUsbPrinterInfoRequested: ChromeEvent = new ChromeEvent();
  public readonly onGetPrintersRequested: ChromeEvent = new ChromeEvent();

  static readonly PrintError = {
    FAILED: "FAILED",
    INVALID_DATA: "INVALID_DATA",
    INVALID_TICKET: "INVALID_TICKET",
    OK: "OK",
  } as const;

}
