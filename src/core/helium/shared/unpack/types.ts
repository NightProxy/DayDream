/**
 * Type definitions for extension manifests and the unpack result.
 *
 * The manifest types cover every field referenced by the generated
 * `chrome.*` namespace stubs in `packages/shared/src/api/`. Unknown
 * fields are preserved via the index signature on each interface so
 * consumers can still read them even if we don't type them.
 */

export type ExtensionFormat = 'crx2' | 'crx3' | 'crx4' | 'zip' | 'xpi';
export type ManifestVersion = 2 | 3;

export interface ContentScriptRule {
  matches: string[];
  exclude_matches?: string[];
  js?: string[];
  css?: string[];
  run_at?: 'document_start' | 'document_end' | 'document_idle';
  all_frames?: boolean;
  match_about_blank?: boolean;
  include_globs?: string[];
  exclude_globs?: string[];
  world?: 'ISOLATED' | 'MAIN';
  [key: string]: unknown;
}

export interface ActionDescriptor {
  default_icon?: string | Record<string, string>;
  default_popup?: string;
  default_title?: string;
  [key: string]: unknown;
}

export interface BackgroundDescriptor {
  service_worker?: string;
  type?: 'module' | 'classic';
  scripts?: string[];
  page?: string;
  persistent?: boolean;
  [key: string]: unknown;
}

export interface OptionsUiDescriptor {
  page: string;
  open_in_tab?: boolean;
  [key: string]: unknown;
}

export interface CommandDescriptor {
  suggested_key?: Record<string, string>;
  description?: string;
  global?: boolean;
  [key: string]: unknown;
}

export interface SidePanelDescriptor {
  default_path?: string;
  [key: string]: unknown;
}

export type WebAccessibleResources =
  | string[]
  | Array<{
      resources: string[];
      matches?: string[];
      extension_ids?: string[];
      use_dynamic_url?: boolean;
    }>;

export type ContentSecurityPolicy =
  | string
  | { extension_pages?: string; sandbox?: string; [key: string]: unknown };

export interface ChromeManifest {
  manifest_version: 2 | 3;
  name: string;
  version: string;
  version_name?: string;
  description?: string;
  default_locale?: string;
  icons?: Record<string, string>;
  action?: ActionDescriptor;
  browser_action?: ActionDescriptor;
  background?: BackgroundDescriptor;
  content_scripts?: ContentScriptRule[];
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_security_policy?: ContentSecurityPolicy;
  web_accessible_resources?: WebAccessibleResources;
  key?: string;
  update_url?: string;
  minimum_chrome_version?: string;
  options_ui?: OptionsUiDescriptor;
  options_page?: string;
  chrome_url_overrides?: Record<string, string>;
  commands?: Record<string, CommandDescriptor>;
  omnibox?: { keyword: string };
  incognito?: 'spanning' | 'split' | 'not_allowed';
  externally_connectable?: {
    ids?: string[];
    matches?: string[];
    accepts_tls_channel_id?: boolean;
  };
  sandbox?: { pages: string[]; content_security_policy?: string };
  side_panel?: SidePanelDescriptor;
  devtools_page?: string;
  [key: string]: unknown;
}

export interface FirefoxManifest extends ChromeManifest {
  browser_specific_settings?: {
    gecko?: {
      id?: string;
      strict_min_version?: string;
      strict_max_version?: string;
    };
  };
  applications?: {
    gecko?: { id?: string; strict_min_version?: string };
  };
}

export interface UnpackedExtension {
  /**
   * Deterministic Chrome-compatible 32-char ID (CRX3+, CRX2, or
   * manifest.key) or a UUID-derived fallback when no key is available.
   * Always 32 lowercase characters in the a..p alphabet.
   */
  id: string;
  /**
   * `true` when the ID was derived from a real public key (CRX header
   * or manifest.key). `false` for generated fallbacks.
   */
  idFromKey: boolean;
  format: ExtensionFormat;
  manifestVersion: ManifestVersion;
  manifest: ChromeManifest | FirefoxManifest;
  /**
   * Path → bytes. Paths use forward slashes, no leading slash.
   * Directory entries are not included.
   */
  files: Map<string, Uint8Array>;
}

export interface UnpackOptions {
  /** Override format detection. Useful for tests. */
  formatHint?: ExtensionFormat;
  /** Maximum total uncompressed size in bytes. Default: 200 MiB. */
  maxUncompressedSize?: number;
  /** Maximum individual file size in bytes. Default: 50 MiB. */
  maxFileSize?: number;
}
