interface PlatformConfig {
  name: string;
  envVars: string[];
  urlFormat: (
    env: Record<string, string | undefined>,
    port: number,
  ) => string | null;
}

const PLATFORMS: PlatformConfig[] = [
  {
    name: "Render",
    envVars: ["RENDER_EXTERNAL_URL"],
    urlFormat: (env) => env.RENDER_EXTERNAL_URL || null,
  },
  {
    name: "Railway",
    envVars: ["RAILWAY_PUBLIC_DOMAIN"],
    urlFormat: (env) =>
      env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : null,
  },
  {
    name: "Railway",
    envVars: ["RAILWAY_STATIC_URL"],
    urlFormat: (env) =>
      env.RAILWAY_STATIC_URL ? `https://${env.RAILWAY_STATIC_URL}` : null,
  },
  {
    name: "Fly.io",
    envVars: ["FLY_APP_NAME"],
    urlFormat: (env) =>
      env.FLY_APP_NAME ? `https://${env.FLY_APP_NAME}.fly.dev` : null,
  },
  {
    name: "Deno Deploy",
    envVars: ["DENO_DEPLOYMENT_ID", "DENO_REGION"],
    urlFormat: (env) =>
      env.DENO_DEPLOYMENT_ID && env.DENO_REGION
        ? `https://${env.DENO_REGION}.deno.dev`
        : null,
  },
  {
    name: "GitHub Codespaces",
    envVars: [
      "CODESPACES",
      "CODESPACE_NAME",
      "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN",
    ],
    urlFormat: (env, port) =>
      env.CODESPACES &&
      env.CODESPACE_NAME &&
      env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
        ? `https://${env.CODESPACE_NAME}-${port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
        : null,
  },
  {
    name: "Gitpod",
    envVars: ["GITPOD_WORKSPACE_URL"],
    urlFormat: (env, port) =>
      env.GITPOD_WORKSPACE_URL
        ? env.GITPOD_WORKSPACE_URL.replace("https://", `https://${port}-`)
        : null,
  },
  {
    name: "Replit",
    envVars: ["REPL_SLUG", "REPL_OWNER"],
    urlFormat: (env) =>
      env.REPL_SLUG && env.REPL_OWNER
        ? `https://${env.REPL_SLUG}.${env.REPL_OWNER}.replit.dev`
        : null,
  },
  {
    name: "Replit",
    envVars: ["REPLIT_DEV_DOMAIN"],
    urlFormat: (env) =>
      env.REPLIT_DEV_DOMAIN ? `https://${env.REPLIT_DEV_DOMAIN}` : null,
  },
  {
    name: "Koyeb",
    envVars: ["KOYEB_PUBLIC_DOMAIN"],
    urlFormat: (env) =>
      env.KOYEB_PUBLIC_DOMAIN ? `https://${env.KOYEB_PUBLIC_DOMAIN}` : null,
  },
  {
    name: "Heroku",
    envVars: ["HEROKU_APP_NAME"],
    urlFormat: (env) =>
      env.HEROKU_APP_NAME
        ? `https://${env.HEROKU_APP_NAME}.herokuapp.com`
        : null,
  },
  {
    name: "Adaptable",
    envVars: ["ADAPTABLE_APP_URL"],
    urlFormat: (env) => env.ADAPTABLE_APP_URL || null,
  },
  {
    name: "CleverCloud",
    envVars: ["CLEVERCLOUD_APP_DOMAIN"],
    urlFormat: (env) =>
      env.CLEVERCLOUD_APP_DOMAIN
        ? `https://${env.CLEVERCLOUD_APP_DOMAIN}`
        : null,
  },
];

export function getPlatform(port: number) {
  for (const platform of PLATFORMS) {
    const envValues: Record<string, string | undefined> = {};
    for (const envVar of platform.envVars) {
      envValues[envVar] = process.env[envVar];
    }

    const url = platform.urlFormat(envValues, port);
    if (url) {
      return url;
    }
  }

  return null;
}
