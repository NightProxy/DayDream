const link = document.createElement("link");
link.rel = "stylesheet";
link.href =
  "https://github.com/Vendicated/Vencord/releases/download/devbuild/browser.css";
document.appendChild(link);

const script = document.createElement("script");
script.src =
  "https://github.com/Vendicated/Vencord/releases/download/devbuild/browser.js";
document.appendChild(script);
