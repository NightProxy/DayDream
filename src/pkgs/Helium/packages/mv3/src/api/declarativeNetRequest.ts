import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeDeclarativeNetRequest {
  public readonly onRuleMatchedDebug: ChromeEvent = new ChromeEvent();
  public DYNAMIC_RULESET_ID: string = "_dynamic";
  public SESSION_RULESET_ID: string = "_session";

  getAvailableStaticRuleCount(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getAvailableStaticRuleCount is not implemented');
  }

  getDisabledRuleIds(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getDisabledRuleIds is not implemented');
  }

  getDynamicRules(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getDynamicRules is not implemented');
  }

  getEnabledRulesets(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getEnabledRulesets is not implemented');
  }

  getMatchedRules(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getMatchedRules is not implemented');
  }

  getSessionRules(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.getSessionRules is not implemented');
  }

  isRegexSupported(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.isRegexSupported is not implemented');
  }

  setExtensionActionOptions(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.setExtensionActionOptions is not implemented');
  }

  testMatchOutcome(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.testMatchOutcome is not implemented');
  }

  updateDynamicRules(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateDynamicRules is not implemented');
  }

  updateEnabledRulesets(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateEnabledRulesets is not implemented');
  }

  updateSessionRules(...args: any[]): any {
    throw new Error('chrome.declarativeNetRequest.updateSessionRules is not implemented');
  }

  updateStaticRules(...args: any[]): any {
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
