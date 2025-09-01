export const config = {
    server: {
        host: "0.0.0.0",
        port: 8080
    },
    obfuscation: false,
    logging: false,
    db: {
        // SQLite will be used by default. For postgres, additional wiring is required.
        dialect: "sqlite",
        name: "daydreamx",
    },
    marketplace: {
        // set a PSK in your environment or here for package uploads
        psk: process.env.MARKETPLACE_PSK || "changeme"
    }
}