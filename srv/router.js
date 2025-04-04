import express from "express";
import { Request, Response, NextFunction, Router } from "express-serve-static-core";
import path from "path";
import axios, { AxiosResponse } from "axios";
import { URL } from "url";
import contentType from "content-type";

const router: Router = express.Router();
const __dirname: string = process.cwd();

// typed (meaning typescript) by dust

interface DuckDuckGoSuggestion {
  phrase: string;
  [key: string]: any;
}

router.get("/", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public/pages/index.html"));
});

router.get("/results/:query", async (req: Request, res: Response): Promise<void> => {
  const { query } = req.params;

  try {
    const response = await fetch(
      `http://api.duckduckgo.com/ac?q=${query}&format=json`
    );
    const reply: DuckDuckGoSuggestion[] = await response.json();
    res.send(reply);
  } catch (error) {
    console.error("Error fetching search results:", error);
    res.status(500).send("Failed to fetch search results");
  }
});

router.use(
  "/internal/",
  express.static(path.join(__dirname, "public/pages/internal/"))
);

router.use("/internal/icons/:url(*)", async (req: Request, res: Response): Promise<void> => {
  let { url } = req.params;
  url = url.replace("https:/", "");
  url = url.replace("http:/", "");
  url = url.replace("https://", "");
  url = url.replace("http://", "");
  let proxiedUrl: string;
  
  try {
    proxiedUrl = "https://icon.horse/icon/" + url;
  } catch (err) {
    console.error(`Failed to decode or decrypt URL: ${err}` + `URL: ${url}`);
    res.status(400).send("Invalid URL");
    return;
  }

  try {
    const assetUrl = new URL(proxiedUrl);
    const assetResponse: AxiosResponse<ArrayBuffer> = await axios.get(assetUrl.toString(), {
      responseType: "arraybuffer",
    });

    const contentTypeHeader: string | undefined = assetResponse.headers["content-type"] as string | undefined;
    const parsedContentType: string = contentTypeHeader
      ? contentType.parse(contentTypeHeader).type
      : "";

    res.writeHead(assetResponse.status, {
      "Content-Type": parsedContentType,
    });

    res.end(Buffer.from(assetResponse.data));
  } catch (err) {
    console.error(`Failed to fetch proxied URL: ${err}`);
    res.status(500).send("Failed to fetch proxied URL");
  }
});

router.use((req: Request, res: Response): void => {
  res.status(404);
  res.sendFile(path.join(__dirname, "public/pages/internal/error/index.html"));
});

export default router;