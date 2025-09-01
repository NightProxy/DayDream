import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "./shared/themeInit";
import "../global/panic";
import { createIcons, icons } from "lucide";

document.addEventListener("DOMContentLoaded", async () => {
  createIcons({ icons });
});
