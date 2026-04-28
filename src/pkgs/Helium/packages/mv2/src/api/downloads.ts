import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeDownloads {
  public readonly onDeterminingFilename: ChromeEvent = new ChromeEvent();
  public readonly onChanged: ChromeEvent = new ChromeEvent();
  public readonly onErased: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  acceptDanger(...args: any[]): any {
    throw new Error('chrome.downloads.acceptDanger is not implemented');
  }

  cancel(...args: any[]): any {
    throw new Error('chrome.downloads.cancel is not implemented');
  }

  download(...args: any[]): any {
    throw new Error('chrome.downloads.download is not implemented');
  }

  erase(...args: any[]): any {
    throw new Error('chrome.downloads.erase is not implemented');
  }

  getFileIcon(...args: any[]): any {
    throw new Error('chrome.downloads.getFileIcon is not implemented');
  }

  open(...args: any[]): any {
    throw new Error('chrome.downloads.open is not implemented');
  }

  pause(...args: any[]): any {
    throw new Error('chrome.downloads.pause is not implemented');
  }

  removeFile(...args: any[]): any {
    throw new Error('chrome.downloads.removeFile is not implemented');
  }

  resume(...args: any[]): any {
    throw new Error('chrome.downloads.resume is not implemented');
  }

  search(...args: any[]): any {
    throw new Error('chrome.downloads.search is not implemented');
  }

  setShelfEnabled(...args: any[]): any {
    throw new Error('chrome.downloads.setShelfEnabled is not implemented');
  }

  setUiOptions(...args: any[]): any {
    throw new Error('chrome.downloads.setUiOptions is not implemented');
  }

  show(...args: any[]): any {
    throw new Error('chrome.downloads.show is not implemented');
  }

  showDefaultFolder(...args: any[]): any {
    throw new Error('chrome.downloads.showDefaultFolder is not implemented');
  }

  static readonly DangerType = {
    ACCEPTED: "accepted",
    ACCOUNT_COMPROMISE: "accountCompromise",
    ALLOWLISTED_BY_POLICY: "allowlistedByPolicy",
    ASYNC_LOCAL_PASSWORD_SCANNING: "asyncLocalPasswordScanning",
    ASYNC_SCANNING: "asyncScanning",
    BLOCKED_SCAN_FAILED: "blockedScanFailed",
    BLOCKED_TOO_LARGE: "blockedTooLarge",
    CONTENT: "content",
    DEEP_SCANNED_FAILED: "deepScannedFailed",
    DEEP_SCANNED_OPENED_DANGEROUS: "deepScannedOpenedDangerous",
    DEEP_SCANNED_SAFE: "deepScannedSafe",
    FILE: "file",
    HOST: "host",
    PASSWORD_PROTECTED: "passwordProtected",
    PROMPT_FOR_LOCAL_PASSWORD_SCANNING: "promptForLocalPasswordScanning",
    PROMPT_FOR_SCANNING: "promptForScanning",
    SAFE: "safe",
    SENSITIVE_CONTENT_BLOCK: "sensitiveContentBlock",
    SENSITIVE_CONTENT_WARNING: "sensitiveContentWarning",
    UNCOMMON: "uncommon",
    UNWANTED: "unwanted",
    URL: "url",
  } as const;

  static readonly FilenameConflictAction = {
    OVERWRITE: "overwrite",
    PROMPT: "prompt",
    UNIQUIFY: "uniquify",
  } as const;

  static readonly HttpMethod = {
    GET: "GET",
    POST: "POST",
  } as const;

  static readonly InterruptReason = {
    CRASH: "CRASH",
    FILE_ACCESS_DENIED: "FILE_ACCESS_DENIED",
    FILE_BLOCKED: "FILE_BLOCKED",
    FILE_BLOCKED_BY_APPLICATION_GUARD: "FILE_BLOCKED_BY_APPLICATION_GUARD",
    FILE_FAILED: "FILE_FAILED",
    FILE_HASH_MISMATCH: "FILE_HASH_MISMATCH",
    FILE_NAME_TOO_LONG: "FILE_NAME_TOO_LONG",
    FILE_NO_SPACE: "FILE_NO_SPACE",
    FILE_SAME_AS_SOURCE: "FILE_SAME_AS_SOURCE",
    FILE_SECURITY_CHECK_FAILED: "FILE_SECURITY_CHECK_FAILED",
    FILE_TOO_LARGE: "FILE_TOO_LARGE",
    FILE_TOO_SHORT: "FILE_TOO_SHORT",
    FILE_TRANSIENT_ERROR: "FILE_TRANSIENT_ERROR",
    FILE_VIRUS_INFECTED: "FILE_VIRUS_INFECTED",
    NETWORK_DISCONNECTED: "NETWORK_DISCONNECTED",
    NETWORK_FAILED: "NETWORK_FAILED",
    NETWORK_INVALID_REQUEST: "NETWORK_INVALID_REQUEST",
    NETWORK_SERVER_DOWN: "NETWORK_SERVER_DOWN",
    NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
    SERVER_BAD_CONTENT: "SERVER_BAD_CONTENT",
    SERVER_CERT_PROBLEM: "SERVER_CERT_PROBLEM",
    SERVER_CONTENT_LENGTH_MISMATCH: "SERVER_CONTENT_LENGTH_MISMATCH",
    SERVER_CROSS_ORIGIN_REDIRECT: "SERVER_CROSS_ORIGIN_REDIRECT",
    SERVER_FAILED: "SERVER_FAILED",
    SERVER_FORBIDDEN: "SERVER_FORBIDDEN",
    SERVER_NO_RANGE: "SERVER_NO_RANGE",
    SERVER_UNAUTHORIZED: "SERVER_UNAUTHORIZED",
    SERVER_UNREACHABLE: "SERVER_UNREACHABLE",
    USER_CANCELED: "USER_CANCELED",
    USER_SHUTDOWN: "USER_SHUTDOWN",
  } as const;

  static readonly State = {
    COMPLETE: "complete",
    IN_PROGRESS: "in_progress",
    INTERRUPTED: "interrupted",
  } as const;

}
