interface WispServer {
  url: string;
  name?: string;
  region?: string;
}

interface ServerListResponse {
  servers: WispServer[];
  updated?: string;
}

interface ServerAddressResponse {
  address: string;
  serverType: string;
}

export type { WispServer, ServerListResponse, ServerAddressResponse };
