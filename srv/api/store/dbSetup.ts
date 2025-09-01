import chalk from "chalk";
import ora from "ora";
import type { ModelStatic } from "sequelize";
import type { Catalog, CatalogModel } from "./types.ts";

async function installItems(db: ModelStatic<CatalogModel>, items: Catalog[]) {
    // Create items sequentially to avoid overwhelming the DB on cold starts
    for (const item of items) {
        await db.create({
            package_name: item.package_name,
            title: item.title,
            description: item.description,
            author: item.author,
            image: item.image,
            version: item.version,
            function: item.function,
            sites: JSON.stringify(item.sites || []),
        });
    }
}

async function setupDB(db: ModelStatic<CatalogModel>) {
    const items: Catalog[] = [
        {
            package_name: "com.night-test.github-test-plugin",
            title: "Test",
            description: "Github Test Plugin",
            author: "Night Network",
            image: "",
            version: "1.0.0",
            function: `
                if (body.includes('</head>')) {
                  const customCSS = '<style>.reflux-banner {background: linear-gradient(90deg, #6366f1, #8b5cf6);color: white;text-align: center;padding: 10px;font-weight: bold;position: fixed;top: 0;left: 0;right: 0;z-index: 9999;}body { margin-top: 40px !important; }</style>';
                  const banner = '<div class="reflux-banner">🚀 Enhanced by Reflux Plugin System</div>';
                  
                  let modifiedBody = body.replace('</head>', customCSS + '</head>');
                  
                  const bodyTagMatch = modifiedBody.match(/<body[^>]*>/);
                  if (bodyTagMatch) {
                    const bodyTag = bodyTagMatch[0];
                    modifiedBody = modifiedBody.replace(bodyTag, bodyTag + banner);
                  }
                  
                  return modifiedBody;
                }
                return body;
              `,
            sites: ["github.com"]
        },
    ];

    const dbItems = await db.findAll();
    if (dbItems.length === 0) {
        const spinner = ora(chalk.hex("#7967dd")("Performing DB setup... ")).start();
        await installItems(db, items);
        spinner.succeed(chalk.hex("#eb6f92")("DB setup complete!"));
    }
}

export { setupDB };
