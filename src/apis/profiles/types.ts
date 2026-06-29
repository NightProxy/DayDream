export interface ProfileAppearance {
  avatarType: "letter" | "icon" | "image";
  avatarIcon?: string;       // lucide name when avatarType === 'icon'
  avatarImage?: string;      // data URL when avatarType === 'image'
  color: string;             // hex (e.g. "#cba6f7") or "auto" (derived from id hash)
}

export interface ProfileData {
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  indexedDB: DatabaseExport[];
  version: number;
  timestamp: number;
  appearance?: ProfileAppearance;
}

export interface DatabaseExport {
  name: string;
  version: number;
  data: Record<string, any[]>;
}

export interface ProfileExport {
  profileId: string | null;
  timestamp: string;
  indexedDB: DatabaseExport[];
  localStorage: Record<string, string>;
  cookies: Record<string, string>;
  appearance?: ProfileAppearance;
}
