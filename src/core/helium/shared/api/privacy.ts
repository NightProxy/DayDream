import type { ExtensionContext } from '../../extfs/types';
import { ChromeSetting } from '..';

export class ChromePrivacyNetwork {
  public readonly webRTCIPHandlingPolicy: ChromeSetting = new ChromeSetting();
  public readonly networkPredictionEnabled: ChromeSetting = new ChromeSetting();

}

export class ChromePrivacyServices {
  public readonly translationServiceEnabled: ChromeSetting = new ChromeSetting();
  public readonly spellingServiceEnabled: ChromeSetting = new ChromeSetting();
  public readonly searchSuggestEnabled: ChromeSetting = new ChromeSetting();
  public readonly safeBrowsingExtendedReportingEnabled: ChromeSetting = new ChromeSetting();
  public readonly safeBrowsingEnabled: ChromeSetting = new ChromeSetting();
  public readonly passwordSavingEnabled: ChromeSetting = new ChromeSetting();
  public readonly autofillEnabled: ChromeSetting = new ChromeSetting();
  public readonly autofillCreditCardEnabled: ChromeSetting = new ChromeSetting();
  public readonly autofillAddressEnabled: ChromeSetting = new ChromeSetting();
  public readonly alternateErrorPagesEnabled: ChromeSetting = new ChromeSetting();

}

export class ChromePrivacyWebsites {
  public readonly topicsEnabled: ChromeSetting = new ChromeSetting();
  public readonly thirdPartyCookiesAllowed: ChromeSetting = new ChromeSetting();
  public readonly relatedWebsiteSetsEnabled: ChromeSetting = new ChromeSetting();
  public readonly referrersEnabled: ChromeSetting = new ChromeSetting();
  public readonly hyperlinkAuditingEnabled: ChromeSetting = new ChromeSetting();
  public readonly fledgeEnabled: ChromeSetting = new ChromeSetting();
  public readonly doNotTrackEnabled: ChromeSetting = new ChromeSetting();
  public readonly adMeasurementEnabled: ChromeSetting = new ChromeSetting();

}

export class ChromePrivacy {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly network: ChromePrivacyNetwork = new ChromePrivacyNetwork();
  public readonly services: ChromePrivacyServices = new ChromePrivacyServices();
  public readonly websites: ChromePrivacyWebsites = new ChromePrivacyWebsites();

  static readonly IPHandlingPolicy = {
    DEFAULT: "default",
    DEFAULT_PUBLIC_AND_PRIVATE_INTERFACES: "default_public_and_private_interfaces",
    DEFAULT_PUBLIC_INTERFACE_ONLY: "default_public_interface_only",
    DISABLE_NON_PROXIED_UDP: "disable_non_proxied_udp",
  } as const;

}
