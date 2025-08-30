import "../../css/global.css";
import "basecoat-css/all";
import "../../js/global/theming.ts";
import { createIcons, icons } from "lucide";

document.addEventListener("DOMContentLoaded", async () => {
  createIcons({ icons });
});
