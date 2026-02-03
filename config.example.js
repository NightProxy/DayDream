export const config = {
  server: {
    // NETWORK SECURITY: Use "127.0.0.1" (localhost) for local development to prevent external access.
    // Use "0.0.0.0" only for production/containerized deployments where you need to accept connections
    // from other machines. When using "0.0.0.0", always put the app behind a reverse proxy (nginx, Caddy)
    // with proper firewall rules and HTTPS enabled.
    host: "127.0.0.1",
    port: 8080,
  },
  obfuscation: false,
  logging: false,
  db: {
    dialect: "sqlite",
    name: "daydreamx",
  },
  marketplace: {
    // SECURITY: Change this to a strong, randomly generated value (minimum 32 characters).
    // DO NOT use "changeme" in production - your application will refuse to start.
    // Generate a secure PSK with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    psk: "changeme",
  },
};
