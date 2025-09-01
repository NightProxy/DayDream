import type { FastifyInstance, FastifyRequest } from "fastify";
import { DataTypes, Model, Sequelize } from "sequelize";
import type { Catalog, CatalogModel } from "./types.ts";
import { config } from "../../../config.js"

const db = new Sequelize({
    dialect: "sqlite",
    storage: "database.sqlite",
    logging: config.logging || false,
});

const catalogAssets = db.define<CatalogModel>("catalog_assets", {
    package_name: { type: DataTypes.STRING, unique: true },
    title: { type: DataTypes.TEXT },
    description: { type: DataTypes.TEXT },
    author: { type: DataTypes.TEXT },
    image: { type: DataTypes.TEXT },
    version: { type: DataTypes.TEXT },
    function: { type: DataTypes.TEXT },
    // store sites as JSON text for sqlite compatibility
    sites: { type: DataTypes.TEXT },
});

function normalizeSites(raw: any): string[] {
    if (!raw) return [];
    // If already an array, return as-is
    if (Array.isArray(raw)) return raw as string[];
    // If it's a string, try to parse JSON
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            // not JSON - fallthrough
        }
        // if comma separated
        if (raw.includes(",")) return raw.split(",").map(s => s.trim()).filter(Boolean);
        // fallback to single value
        return [raw];
    }
    // other unexpected types
    try {
        const maybe = Array.from(raw as any);
        return maybe.map(String);
    } catch (e) {
        return [];
    }
}

function marketplaceAPI(app: FastifyInstance) {
    app.get("/api/catalog-stats/", (request, reply) => {
        reply.send({
            version: "2.0.0",
            spec: "DDX",
            enabled: true
        });
    });

    type CatalogAssetsReq = FastifyRequest<{ Querystring: { page: string } }>;
    app.get("/api/catalog-assets/", async (request: CatalogAssetsReq, reply) => {
        try {
            const dbAssets = await catalogAssets.findAll();
            const assets = dbAssets.reduce<Record<string, Omit<Catalog, "package_name">>>(
                (acc, asset) => {
                    const rawSites = asset.get("sites");
                    acc[asset.get("package_name") as string] = {
                        title: asset.get("title") as string,
                        description: asset.get("description") as string,
                        author: asset.get("author") as string,
                        image: asset.get("image") as string,
                        version: asset.get("version") as string,
                        function: asset.get("function") as string,
                        sites: normalizeSites(rawSites),
                    };
                    return acc;
                },
                {}
            );
            return reply.send({ assets });
        } catch (error) {
            return reply.status(500).send({ error: "An error occured" });
        }
    });

    type PackageReq = FastifyRequest<{ Params: { package: string } }>;
    app.get("/api/packages/:package", async (request: PackageReq, reply) => {
        try {
            const packageRow = await catalogAssets.findOne({
                where: { package_name: request.params.package }
            });
            if (!packageRow) return reply.status(404).send({ error: "Package not found!" });
            const rawSites = packageRow.get("sites");
            const details: Catalog = {
                package_name: packageRow.get("package_name") as string,
                title: packageRow.get("title") as string,
                description: packageRow.get("description") as string,
                image: packageRow.get("image") as string,
                author: packageRow.get("author") as string,
                version: packageRow.get("version") as string,
                function: packageRow.get("function") as string,
                sites: normalizeSites(rawSites),
            };
            reply.send(details);
        } catch (error) {
            reply.status(500).send({ error: "An unexpected error occured" });
        }
    });

    type UploadReq = FastifyRequest<{
        Headers: { psk: string; packagename: string };
    }>;
    type CreateReq = FastifyRequest<{
        Headers: { psk: string };
        Body: {
            uuid: string;
            title: string;
            image: string;
            author: string;
            version: string;
            description: string;
            function: string;
            sites: string[];
        };
    }>;
    interface VerifyStatus {
        status: number;
        error?: Error;
    }
    async function verifyReq(
        request: UploadReq | CreateReq,
        upload: Boolean,
        data: any
    ): Promise<VerifyStatus> {
        // If a PSK is configured via environment, require it. Otherwise skip PSK check.
        const PSK = process.env.MARKETPLACE_PSK || null;
        if (PSK && request.headers.psk !== PSK) {
            return { status: 403, error: new Error("PSK isn't correct!") };
        } else if (upload && !request.headers.packagename) {
            return { status: 500, error: new Error("No packagename defined!") };
        } else if (upload && !data) {
            return { status: 400, error: new Error("No file uploaded!") };
        } else {
            return { status: 200 };
        }
    }

    app.post("/api/create-package", async (request: CreateReq, reply) => {
        const verify: VerifyStatus = await verifyReq(request, false, undefined);
        if (verify.error !== undefined) {
            reply.status(verify.status).send({ status: verify.error.message });
        } else {
            const body: Catalog = {
                package_name: request.body.uuid,
                title: request.body.title,
                image: request.body.image,
                author: request.body.author,
                version: request.body.version,
                description: request.body.description,
                function: request.body.function,
                sites: request.body.sites || [],
            };
            await catalogAssets.create({
                package_name: body.package_name,
                title: body.title,
                image: body.image,
                author: body.author,
                version: body.version,
                description: body.description,
                function: body.function,
                sites: body.sites,
            });
            try {
                return reply.status(500).send({ status: "Package already exists!" });
            } catch (err) {
                return reply
                    .status(verify.status)
                    .send({ status: "Package created successfully!" });
            }
        }
    });
}

export { marketplaceAPI, db, catalogAssets };
export type { Catalog, CatalogModel } from "./types.js";
