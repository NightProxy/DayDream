import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeWebRequest {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onActionIgnored: ChromeEvent = new ChromeEvent();
  public readonly onErrorOccurred: ChromeEvent = new ChromeEvent();
  public readonly onCompleted: ChromeEvent = new ChromeEvent();
  public readonly onBeforeRedirect: ChromeEvent = new ChromeEvent();
  public readonly onResponseStarted: ChromeEvent = new ChromeEvent();
  public readonly onAuthRequired: ChromeEvent = new ChromeEvent();
  public readonly onHeadersReceived: ChromeEvent = new ChromeEvent();
  public readonly onSendHeaders: ChromeEvent = new ChromeEvent();
  public readonly onBeforeSendHeaders: ChromeEvent = new ChromeEvent();
  public readonly onBeforeRequest: ChromeEvent = new ChromeEvent();

  handlerBehaviorChanged(..._args: any[]): any {
    throw new Error('chrome.webRequest.handlerBehaviorChanged is not implemented');
  }

  static readonly IgnoredActionType = {
    AUTH_CREDENTIALS: "auth_credentials",
    REDIRECT: "redirect",
    REQUEST_HEADERS: "request_headers",
    RESPONSE_HEADERS: "response_headers",
  } as const;

  static readonly OnAuthRequiredOptions = {
    ASYNC_BLOCKING: "asyncBlocking",
    BLOCKING: "blocking",
    EXTRA_HEADERS: "extraHeaders",
    RESPONSE_HEADERS: "responseHeaders",
  } as const;

  static readonly OnBeforeRedirectOptions = {
    EXTRA_HEADERS: "extraHeaders",
    RESPONSE_HEADERS: "responseHeaders",
  } as const;

  static readonly OnBeforeRequestOptions = {
    BLOCKING: "blocking",
    EXTRA_HEADERS: "extraHeaders",
    REQUEST_BODY: "requestBody",
  } as const;

  static readonly OnBeforeSendHeadersOptions = {
    BLOCKING: "blocking",
    EXTRA_HEADERS: "extraHeaders",
    REQUEST_HEADERS: "requestHeaders",
  } as const;

  static readonly OnCompletedOptions = {
    EXTRA_HEADERS: "extraHeaders",
    RESPONSE_HEADERS: "responseHeaders",
  } as const;

  static readonly OnErrorOccurredOptions = {
    EXTRA_HEADERS: "extraHeaders",
  } as const;

  static readonly OnHeadersReceivedOptions = {
    BLOCKING: "blocking",
    EXTRA_HEADERS: "extraHeaders",
    RESPONSE_HEADERS: "responseHeaders",
  } as const;

  static readonly OnResponseStartedOptions = {
    EXTRA_HEADERS: "extraHeaders",
    RESPONSE_HEADERS: "responseHeaders",
  } as const;

  static readonly OnSendHeadersOptions = {
    EXTRA_HEADERS: "extraHeaders",
    REQUEST_HEADERS: "requestHeaders",
  } as const;

  static readonly ResourceType = {
    CSP_REPORT: "csp_report",
    FONT: "font",
    IMAGE: "image",
    MAIN_FRAME: "main_frame",
    MEDIA: "media",
    OBJECT: "object",
    OTHER: "other",
    PING: "ping",
    SCRIPT: "script",
    STYLESHEET: "stylesheet",
    SUB_FRAME: "sub_frame",
    WEBBUNDLE: "webbundle",
    WEBSOCKET: "websocket",
    XMLHTTPREQUEST: "xmlhttprequest",
  } as const;

  static readonly MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES: number = 20;
}
