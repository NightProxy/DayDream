import express from "express";
import path from "path";

const router = express.Router();
const __dirname = process.cwd();

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

router.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "public/test.html"));
});

router.use("/internal/", express.static(path.join(__dirname, "public/internal/")));


export default router;
