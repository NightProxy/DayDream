# Manifest Parser & CRX Loader

This document describes how Helium loads Chrome extensions from CRX files and unpacked directories, parses their manifests, resolves permissions, and registers them for execution.

## CRX File Format

Chrome extensions are distributed as `.crx` files, which are ZIP archives with a binary header containing cryptographic signatures.

### CRX3 Binary Format

```
[4 bytes]  Magic number: "Cr24" (0x43723234)
[4 bytes]  CRX format version: 3 (little-endian uint32)
[4 bytes]  Header length in bytes (little-endian uint32)
[N bytes]  Header (Protocol Buffer, CrxFileHeader message)
[M bytes]  ZIP archive containing extension files
```

### CRX3 Header (Protocol Buffer)

```protobuf
message CrxFileHeader {
  // SHA256 hash of the "signed data" portion
  repeated AsymmetricKeyProof sha256_with_rsa = 2;
  repeated AsymmetricKeyProof sha256_with_ecdsa = 3;
  // The signed data itself
  optional bytes signed_header_data = 10000;
}

message AsymmetricKeyProof {
  optional bytes public_key = 1;
  optional bytes signature = 2;
}
```

### CRXUnpacker Implementation

```typescript
class CRXUnpacker {
  /**
   * Unpack a CRX3 file into its constituent parts.
   *
   * @param buffer - ArrayBuffer containing the CRX file
   * @returns Unpacked extension data
   */
  static unpack(buffer: ArrayBuffer): UnpackedExtension {
    const view = new DataView(buffer);

    // 1. Verify magic number
    const magic = String.fromCharCode(
      view.getUint8(0), view.getUint8(1),
      view.getUint8(2), view.getUint8(3)
    );
    if (magic !== 'Cr24') {
      throw new Error('Not a CRX file: invalid magic number');
    }

    // 2. Read version
    const version = view.getUint32(4, true);
    if (version !== 3) {
      throw new Error(`Unsupported CRX version: ${version}`);
    }

    // 3. Read header length
    const headerLength = view.getUint32(8, true);

    // 4. Extract header (for signature verification, if needed)
    const headerBytes = new Uint8Array(buffer, 12, headerLength);

    // 5. Extract ZIP payload (everything after the header)
    const zipOffset = 12 + headerLength;
    const zipBytes = new Uint8Array(buffer, zipOffset);

    // 6. Extract public key from header for extension ID derivation
    const publicKey = this.extractPublicKey(headerBytes);

    // 7. Derive extension ID from public key (SHA-256 hash, first 16 bytes, hex-encoded with a-p alphabet)
    const extensionId = this.deriveExtensionId(publicKey);

    return {
      extensionId,
      publicKey,
      zipBytes,
    };
  }

  /**
   * Derive a Chrome extension ID from a public key.
   * Chrome uses the first 128 bits of SHA-256(public_key),
   * encoded as lowercase hex but using the alphabet a-p instead of 0-9a-f.
   */
  static async deriveExtensionId(publicKey: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', publicKey);
    const hashBytes = new Uint8Array(hash).slice(0, 16);
    return Array.from(hashBytes)
      .map(b => {
        const hi = (b >> 4) & 0xf;
        const lo = b & 0xf;
        return String.fromCharCode(97 + hi) + String.fromCharCode(97 + lo);
      })
      .join('');
  }
}
```

### Unpacked Extension Support

For development, extensions can also be loaded from a plain directory (or a JavaScript object representing the file tree):

```typescript
interface UnpackedExtensionInput {
  files: Map<string, Uint8Array | string>;  // path → content
}
```

This is useful for:
- Extensions bundled directly into the host application
- Development/testing without CRX packaging
- Extensions loaded from a URL (fetch all files individually)

## Manifest Parsing

### ManifestParser

```typescript
interface ParsedManifest {
  // Identity
  manifest_version: 2 | 3;
  name: string;
  version: string;
  description?: string;
  default_locale?: string;

  // Permissions
  permissions: string[];
  optional_permissions?: string[];
  host_permissions?: string[];           // MV3 only
  optional_host_permissions?: string[];  // MV3 only

  // Background
  background?: {
    // MV2
    scripts?: string[];
    page?: string;
    persistent?: boolean;

    // MV3
    service_worker?: string;
    type?: 'module';
  };

  // Content scripts
  content_scripts?: ContentScriptDeclaration[];

  // Action / Browser Action
  action?: ActionManifest;                // MV3
  browser_action?: ActionManifest;        // MV2
  page_action?: ActionManifest;           // MV2

  // Extension pages
  options_page?: string;                  // MV2 (legacy)
  options_ui?: { page: string; open_in_tab?: boolean };
  chrome_url_overrides?: {
    newtab?: string;
    bookmarks?: string;
    history?: string;
  };
  devtools_page?: string;
  side_panel?: { default_path: string };  // MV3

  // Web-accessible resources
  web_accessible_resources?: WebAccessibleResource[];

  // Internationalization
  default_locale?: string;

  // Content Security Policy
  content_security_policy?: string | {    // string in MV2, object in MV3
    extension_pages?: string;
    sandbox?: string;
  };

  // Icons
  icons?: Record<string, string>;

  // Other
  update_url?: string;
  minimum_chrome_version?: string;
  key?: string;                           // Base64-encoded public key
  externally_connectable?: {
    ids?: string[];
    matches?: string[];
    accepts_tls_channel_id?: boolean;
  };

  // DeclarativeNetRequest (MV3)
  declarative_net_request?: {
    rule_resources: Array<{
      id: string;
      enabled: boolean;
      path: string;
    }>;
  };

  // Commands
  commands?: Record<string, {
    suggested_key?: Record<string, string>;
    description?: string;
    global?: boolean;
  }>;
}

interface ContentScriptDeclaration {
  matches: string[];
  exclude_matches?: string[];
  include_globs?: string[];
  exclude_globs?: string[];
  js?: string[];
  css?: string[];
  run_at?: 'document_start' | 'document_end' | 'document_idle';
  all_frames?: boolean;
  match_about_blank?: boolean;
  match_origin_as_fallback?: boolean;
  world?: 'ISOLATED' | 'MAIN';
}

interface ActionManifest {
  default_icon?: string | Record<string, string>;
  default_title?: string;
  default_popup?: string;
}

// MV2: string[] of file paths
// MV3: object[] with resource/matches
type WebAccessibleResource =
  | string                                                    // MV2
  | { resources: string[]; matches: string[]; extension_ids?: string[] };  // MV3
```

### Parsing Logic

```typescript
class ManifestParser {
  static parse(manifestJson: string): ParsedManifest {
    const raw = JSON.parse(manifestJson);

    // 1. Validate required fields
    this.requireField(raw, 'manifest_version', [2, 3]);
    this.requireField(raw, 'name', 'string');
    this.requireField(raw, 'version', 'string');

    // 2. Validate manifest_version-specific fields
    if (raw.manifest_version === 3) {
      // MV3: background must use service_worker, not scripts/page
      if (raw.background?.scripts || raw.background?.page) {
        throw new ManifestError(
          'MV3 extensions must use background.service_worker, not background.scripts or background.page'
        );
      }
      // MV3: host_permissions must be separate
      if (raw.permissions?.some(p => this.isHostPermission(p))) {
        console.warn('MV3: host permissions should be in host_permissions, not permissions');
      }
      // MV3: browser_action is not valid
      if (raw.browser_action) {
        throw new ManifestError('MV3 extensions must use "action", not "browser_action"');
      }
    }

    if (raw.manifest_version === 2) {
      // MV2: service_worker not valid
      if (raw.background?.service_worker) {
        throw new ManifestError('MV2 extensions must use background.scripts or background.page, not service_worker');
      }
      // MV2: action is not valid
      if (raw.action) {
        throw new ManifestError('MV2 extensions must use "browser_action", not "action"');
      }
    }

    // 3. Normalize content_scripts
    if (raw.content_scripts) {
      for (const cs of raw.content_scripts) {
        cs.run_at = cs.run_at || 'document_idle';
        cs.all_frames = cs.all_frames || false;
        cs.match_about_blank = cs.match_about_blank || false;
        cs.world = cs.world || 'ISOLATED';
      }
    }

    // 4. Normalize web_accessible_resources
    if (raw.web_accessible_resources && raw.manifest_version === 2) {
      // MV2 uses string[], convert to MV3-style objects for uniform handling
      raw._normalizedWAR = raw.web_accessible_resources.map(path => ({
        resources: [path],
        matches: ['<all_urls>'],
      }));
    } else if (raw.web_accessible_resources && raw.manifest_version === 3) {
      raw._normalizedWAR = raw.web_accessible_resources;
    }

    return raw as ParsedManifest;
  }

  private static isHostPermission(perm: string): boolean {
    return perm.includes('://') || perm === '<all_urls>' || perm.startsWith('*://');
  }
}
```

## Permission Resolution

### PermissionResolver

Takes a parsed manifest and produces a set of capability flags used at runtime for permission enforcement.

```typescript
interface ResolvedPermissions {
  // API namespace permissions (e.g., "tabs", "bookmarks", "storage")
  apiPermissions: Set<string>;

  // Host permissions as match patterns
  hostPermissions: MatchPatternSet;

  // Optional permissions that can be requested at runtime
  optionalApiPermissions: Set<string>;
  optionalHostPermissions: MatchPatternSet;

  // Granted optional permissions (starts empty, populated via chrome.permissions.request)
  grantedOptionalApi: Set<string>;
  grantedOptionalHosts: MatchPatternSet;

  // Special flags
  hasAllUrls: boolean;
  hasActiveTab: boolean;
  hasUnlimitedStorage: boolean;
}

class PermissionResolver {
  static resolve(manifest: ParsedManifest): ResolvedPermissions {
    const apiPerms = new Set<string>();
    const hostPerms = new MatchPatternSet();

    // Separate API permissions from host permissions
    for (const perm of manifest.permissions || []) {
      if (this.isHostPermission(perm)) {
        hostPerms.add(perm);
      } else {
        apiPerms.add(perm);
      }
    }

    // MV3: host_permissions array
    for (const perm of manifest.host_permissions || []) {
      hostPerms.add(perm);
    }

    // Implicit permissions
    // - storage is always available (no permission needed)
    // - runtime is always available
    // - i18n is always available
    // - extension is always available
    apiPerms.add('storage');
    apiPerms.add('runtime');
    apiPerms.add('i18n');
    apiPerms.add('extension');

    return {
      apiPermissions: apiPerms,
      hostPermissions: hostPerms,
      optionalApiPermissions: new Set(manifest.optional_permissions || []),
      optionalHostPermissions: new MatchPatternSet(manifest.optional_host_permissions || []),
      grantedOptionalApi: new Set(),
      grantedOptionalHosts: new MatchPatternSet(),
      hasAllUrls: hostPerms.has('<all_urls>'),
      hasActiveTab: apiPerms.has('activeTab'),
      hasUnlimitedStorage: apiPerms.has('unlimitedStorage'),
    };
  }
}
```

### Match Pattern Evaluation

Chrome's match patterns follow the format: `<scheme>://<host>/<path>`

```typescript
class MatchPatternSet {
  private patterns: MatchPattern[] = [];

  add(patternStr: string): void {
    this.patterns.push(MatchPattern.parse(patternStr));
  }

  matches(url: string): boolean {
    return this.patterns.some(p => p.matches(url));
  }
}

class MatchPattern {
  scheme: string;    // "http", "https", "*", "file", "ftp"
  host: string;      // "*.example.com", "example.com", "*"
  path: string;      // "/*", "/foo/*", "/bar/baz"

  static parse(pattern: string): MatchPattern {
    if (pattern === '<all_urls>') {
      return { scheme: '*', host: '*', path: '/*' };
    }

    // Pattern format: <scheme>://<host><path>
    const match = pattern.match(/^(\*|https?|file|ftp):\/\/(\*|(?:\*\.)?[^/]+)(\/.*)?$/);
    if (!match) {
      throw new Error(`Invalid match pattern: ${pattern}`);
    }

    return {
      scheme: match[1],
      host: match[2],
      path: match[3] || '/*',
    };
  }

  matches(url: string): boolean {
    const parsed = new URL(url);

    // Scheme match
    if (this.scheme !== '*') {
      if (parsed.protocol !== this.scheme + ':') return false;
    } else {
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    }

    // Host match
    if (this.host !== '*') {
      if (this.host.startsWith('*.')) {
        const domain = this.host.slice(2);
        if (parsed.hostname !== domain && !parsed.hostname.endsWith('.' + domain)) {
          return false;
        }
      } else {
        if (parsed.hostname !== this.host) return false;
      }
    }

    // Path match (simple glob: * matches anything)
    const pathPattern = this.path
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escape regex chars
      .replace(/\*/g, '.*');                     // * → .*
    const pathRegex = new RegExp(`^${pathPattern}$`);
    return pathRegex.test(parsed.pathname);
  }
}
```

## Content Script Registration

After manifest parsing, content scripts need to be registered with the Reflux injection plugin so they get injected into matching pages.

```typescript
interface RegisteredContentScript {
  extensionId: string;
  matches: MatchPatternSet;
  excludeMatches: MatchPatternSet;
  includeGlobs: GlobSet;
  excludeGlobs: GlobSet;
  js: string[];           // Paths relative to extension root
  css: string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  allFrames: boolean;
  matchAboutBlank: boolean;
  world: 'ISOLATED' | 'MAIN';
}
```

The Reflux injection plugin (Layer 5) queries this registry on every HTML response to determine which content scripts to inject.

## Extension ID Generation

For unpacked extensions (no CRX public key), IDs are generated deterministically:

```typescript
function generateExtensionId(extensionName: string): string {
  // Use a deterministic hash of the extension name + a fixed salt
  // This ensures the same extension always gets the same ID
  const encoder = new TextEncoder();
  const data = encoder.encode('helium-ext:' + extensionName);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashBytes = new Uint8Array(hashBuffer).slice(0, 16);

  // Chrome's a-p alphabet encoding
  return Array.from(hashBytes)
    .map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0xf)))
    .join('');
}
```

For CRX-packaged extensions, the ID is derived from the public key in the CRX header (see `CRXUnpacker.deriveExtensionId`).

## Virtual Filesystem

Extension files are stored in a virtual filesystem backed by IndexedDB or OPFS:

```typescript
interface ExtensionFileSystem {
  /** Write a file to the extension's storage */
  writeFile(extensionId: string, path: string, content: Uint8Array): Promise<void>;

  /** Read a file from the extension's storage */
  readFile(extensionId: string, path: string): Promise<Uint8Array | null>;

  /** Check if a file exists */
  exists(extensionId: string, path: string): Promise<boolean>;

  /** List all files for an extension */
  listFiles(extensionId: string): Promise<string[]>;

  /** Delete all files for an extension */
  deleteAll(extensionId: string): Promise<void>;
}
```

**IndexedDB schema**:

```
Database: "helium-extensions"

Object store: "files"
  Key: [extensionId, path]  (compound key)
  Value: {
    extensionId: string,
    path: string,
    content: Uint8Array,
    mimeType: string,
    size: number,
  }

Object store: "metadata"
  Key: extensionId
  Value: {
    extensionId: string,
    manifest: ParsedManifest,
    permissions: ResolvedPermissions,
    enabled: boolean,
    installDate: number,
    updateDate: number,
    version: string,
  }
```

## Full Load Sequence

```
1. CRX/directory input received

2. If CRX:
   a. CRXUnpacker.unpack(buffer) → { extensionId, publicKey, zipBytes }
   b. Unzip zipBytes → Map<string, Uint8Array>
   If directory:
   a. Read all files → Map<string, Uint8Array>
   b. Generate extensionId from name or key

3. Read manifest.json from file map
   → ManifestParser.parse(manifestJson) → ParsedManifest

4. PermissionResolver.resolve(manifest) → ResolvedPermissions

5. Write all files to virtual filesystem:
   for (const [path, content] of files) {
     await fs.writeFile(extensionId, path, content);
   }

6. Write metadata to "metadata" store:
   await metadata.put({
     extensionId,
     manifest,
     permissions,
     enabled: true,
     installDate: Date.now(),
   });

7. Register content scripts with Reflux injection plugin:
   for (const cs of manifest.content_scripts) {
     refluxInjectionPlugin.registerContentScript({
       extensionId,
       ...normalizeContentScript(cs),
     });
   }

8. Register declarativeNetRequest rules (MV3):
   if (manifest.declarative_net_request) {
     for (const ruleResource of manifest.declarative_net_request.rule_resources) {
       const rulesJson = await fs.readFile(extensionId, ruleResource.path);
       declarativeNetRequest.addStaticRules(extensionId, ruleResource.id, JSON.parse(rulesJson));
     }
   }

9. Create background execution context (Layer 2):
   if (manifest.background) {
     executionContextManager.createBackground(extensionId, manifest);
   }

10. Fire chrome.runtime.onInstalled to the new extension's background:
    emit to extensionId: runtime.onInstalled({
      reason: 'install',
      id: extensionId,
    });

11. Fire chrome.management.onInstalled to all other extensions:
    broadcastToAll: management.onInstalled({
      id: extensionId,
      name: manifest.name,
      ...
    });
```
