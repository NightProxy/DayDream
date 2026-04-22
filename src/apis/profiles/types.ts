export interface ProfileData {
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  indexedDB: DatabaseExport[];
  version: number;
  timestamp: number;
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
}
