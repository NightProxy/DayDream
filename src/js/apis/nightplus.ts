import { SettingsAPI } from "./settings";
import localforage from "localforage";

const settingsAPI = new SettingsAPI();

const API_BASE_URL = "/api/plus";

interface NightPlusStatus {
  active: boolean;
  status: string;
  member_length: number;
  expires_at: string | null;
}

interface WispServer {
  id: string;
  name: string;
  region: string;
  url: string;
}

interface ProxyServer {
  id: string;
  name: string;
  region: string;
  url: string;
}

interface NightPlusCache {
  status: NightPlusStatus | null;
  wispServers: WispServer[];
  proxyServers: ProxyServer[];
  lastUpdated: number;
}

const nightPlusStore = localforage.createInstance({
  name: "nightplus",
  storeName: "nightplus_data",
});

async function getAccessToken(): Promise<string | null> {
  return (await settingsAPI.getItem("auth_access_token")) as string | null;
}

async function setAccessToken(token: string): Promise<void> {
  await settingsAPI.setItem("auth_access_token", token);
}

async function clearAccessToken(): Promise<void> {
  await settingsAPI.removeItem("auth_access_token");
}

async function makeAuthRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error("No access token found. Please log in.");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = await getAccessToken();
      const retryHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
        ...options.headers,
      };

      return fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: retryHeaders,
        credentials: "include",
      });
    } else {
      throw new Error("Session expired. Please log in again.");
    }
  }

  return response;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      await setAccessToken(data.access_token);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Failed to refresh access token:", error);
    return false;
  }
}

export async function checkNightPlusStatus(): Promise<boolean> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return false;
    }

    const response = await makeAuthRequest("/night-plus/status", {
      method: "POST",
    });

    if (!response.ok) {
      return false;
    }

    const data: NightPlusStatus = await response.json();
    return data.active;
  } catch (error) {
    console.error("Failed to check Night+ status:", error);
    return false;
  }
}

export async function getNightPlusInfo(): Promise<NightPlusStatus | null> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return null;
    }

    const response = await makeAuthRequest("/night-plus/status", {
      method: "POST",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to get Night+ info:", error);
    return null;
  }
}

export async function getPremiumWispServers(): Promise<WispServer[]> {
  try {
    const response = await makeAuthRequest("/night-plus/wisp-servers", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch premium WISP servers");
    }

    const data = await response.json();
    return data.servers;
  } catch (error) {
    console.error("Failed to get premium WISP servers:", error);
    return [];
  }
}

export async function getPremiumProxyServers(): Promise<ProxyServer[]> {
  try {
    const response = await makeAuthRequest("/night-plus/proxy-servers", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch premium proxy servers");
    }

    const data = await response.json();
    return data.servers;
  } catch (error) {
    console.error("Failed to get premium proxy servers:", error);
    return [];
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

// LocalForage cache management functions
export async function getCachedNightPlusData(): Promise<NightPlusCache | null> {
  try {
    return await nightPlusStore.getItem<NightPlusCache>("cache");
  } catch (error) {
    console.error("Failed to get cached Night+ data:", error);
    return null;
  }
}

export async function setCachedNightPlusData(
  data: Partial<NightPlusCache>,
): Promise<void> {
  try {
    const existing = await getCachedNightPlusData();
    const updated: NightPlusCache = {
      status: data.status ?? existing?.status ?? null,
      wispServers: data.wispServers ?? existing?.wispServers ?? [],
      proxyServers: data.proxyServers ?? existing?.proxyServers ?? [],
      lastUpdated: Date.now(),
    };
    await nightPlusStore.setItem("cache", updated);
  } catch (error) {
    console.error("Failed to cache Night+ data:", error);
  }
}

export async function clearNightPlusCache(): Promise<void> {
  try {
    await nightPlusStore.clear();
  } catch (error) {
    console.error("Failed to clear Night+ cache:", error);
  }
}

export async function dumpNightPlusData(): Promise<void> {
  try {
    const [status, wispServers, proxyServers] = await Promise.all([
      getNightPlusInfo(),
      getPremiumWispServers(),
      getPremiumProxyServers(),
    ]);

    await setCachedNightPlusData({
      status,
      wispServers,
      proxyServers,
    });

    console.log("Night+ data dumped to localforage successfully");
  } catch (error) {
    console.error("Failed to dump Night+ data:", error);
    throw error;
  }
}

// Get Night+ data with cache fallback
export async function getNightPlusDataWithCache(): Promise<NightPlusCache | null> {
  try {
    // Try to fetch fresh data
    await dumpNightPlusData();
    return await getCachedNightPlusData();
  } catch (error) {
    console.warn("Failed to fetch fresh Night+ data, using cache:", error);
    // Fallback to cached data
    return await getCachedNightPlusData();
  }
}

export { getAccessToken, setAccessToken, clearAccessToken, nightPlusStore };
