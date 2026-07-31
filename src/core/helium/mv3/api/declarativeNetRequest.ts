import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeDeclarativeNetRequest {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onRuleMatchedDebug: ChromeEvent = new ChromeEvent();
  public DYNAMIC_RULESET_ID: string = "_dynamic";
  public SESSION_RULESET_ID: string = "_session";

  getAvailableStaticRuleCount(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getAvailableStaticRuleCount is not implemented');
  }

  getDisabledRuleIds(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getDisabledRuleIds is not implemented');
  }

  getDynamicRules(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getDynamicRules is not implemented');
  }

  getEnabledRulesets(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getEnabledRulesets is not implemented');
  }

  getMatchedRules(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getMatchedRules is not implemented');
  }

  getSessionRules(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getSessionRules is not implemented');
  }

  isRegexSupported(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.isRegexSupported is not implemented');
  }

  setExtensionActionOptions(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.setExtensionActionOptions is not implemented');
  }

  testMatchOutcome(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.testMatchOutcome is not implemented');
  }

  updateDynamicRules(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateDynamicRules is not implemented');
  }

  updateEnabledRulesets(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateEnabledRulesets is not implemented');
  }

  updateSessionRules(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateSessionRules is not implemented');
  }

  updateStaticRules(..._args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateStaticRules is not implemented');
  }

  static readonly DomainType = {
    FIRST_PARTY: "firstParty",
    THIRD_PARTY: "thirdParty",
  } as const;

  static readonly HeaderOperation = {
    APPEND: "append",
    REMOVE: "remove",
    SET: "set",
  } as const;

  static readonly RequestMethod = {
    CONNECT: "connect",
    DELETE: "delete",
    GET: "get",
    HEAD: "head",
    OPTIONS: "options",
    OTHER: "other",
    PATCH: "patch",
    POST: "post",
    PUT: "put",
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
    WEBTRANSPORT: "webtransport",
    XMLHTTPREQUEST: "xmlhttprequest",
  } as const;

  static readonly RuleActionType = {
    ALLOW: "allow",
    ALLOW_ALL_REQUESTS: "allowAllRequests",
    BLOCK: "block",
    MODIFY_HEADERS: "modifyHeaders",
    REDIRECT: "redirect",
    UPGRADE_SCHEME: "upgradeScheme",
  } as const;

  static readonly UnsupportedRegexReason = {
    MEMORY_LIMIT_EXCEEDED: "memoryLimitExceeded",
    SYNTAX_ERROR: "syntaxError",
  } as const;

  static readonly GETMATCHEDRULES_QUOTA_INTERVAL: number = 10;
  static readonly GUARANTEED_MINIMUM_STATIC_RULES: number = 30000;
  static readonly MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL: number = 20;
  static readonly MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES: number = 5000;
  static readonly MAX_NUMBER_OF_DYNAMIC_RULES: number = 30000;
  static readonly MAX_NUMBER_OF_ENABLED_STATIC_RULESETS: number = 50;
  static readonly MAX_NUMBER_OF_REGEX_RULES: number = 1000;
  static readonly MAX_NUMBER_OF_SESSION_RULES: number = 5000;
  static readonly MAX_NUMBER_OF_STATIC_RULESETS: number = 100;
  static readonly MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: number = 5000;
  static readonly MAX_NUMBER_OF_UNSAFE_SESSION_RULES: number = 5000;
}
