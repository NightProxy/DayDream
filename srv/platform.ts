// I moved this here even though its a simple function because it looks messy in the main file, and i have no better way of doing this currently.

export function getPlatform(PORT: number): {
    method: string;
    extLink: string;
    selfHosted: boolean;
} {
    let sh = false;
    let extLink = "";
    let method = "";

    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        method = "Replit";
        extLink = ` https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    } else if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
        method = "Github Codespaces";
        extLink = ` https://${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
    } else if (process.env.HOSTNAME && process.env.GITPOD_WORKSPACE_CLUSTER_HOST) {
        method = "Gitpod";
        extLink = ` https://${PORT}-${process.env.HOSTNAME}.${process.env.GITPOD_WORKSPACE_CLUSTER_HOST}`;
    } else if (process.env.VERCEL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        method = "Vercel";
        extLink = ` https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    } else if (process.env.RENDER && process.env.RENDER_EXTERNAL_HOSTNAME) {
        method = "Render";
        extLink = ` https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
    } else if (process.env.KOYEB_APP_NAME && process.env.KOYEB_PUBLIC_DOMAIN) {
        method = "Koyeb";
        extLink = ` https://${process.env.KOYEB_PUBLIC_DOMAIN}`;
    } else {
        method = "Self-Hosted";
        sh = true;
    }
    return {
        method: method,
        extLink: extLink,
        selfHosted: sh
    };
}
