import express from "express";
import path from "path";

const router = express.Router();
const __dirname = process.cwd();

router.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public/browser.html"),
  );
});

router.get("/tabs/newtab", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public/newtab.html"),
  );
});


export default router;
