import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "./shared/themeInit";
import "../global/panic";
import { createIcons, icons } from "lucide";

document.addEventListener("DOMContentLoaded", async () => {
  createIcons({ icons });

  const urlParams = new URLSearchParams(window.location.search);
  const errorMessage = urlParams.get("error") || "Unknown error occurred";
  const errorStack = urlParams.get("stack") || "";
  const errorCode = urlParams.get("code") || "—";
  const errorUrl = urlParams.get("url") || "";

  const errorTextarea = document.getElementById(
    "error-textarea",
  ) as HTMLTextAreaElement;
  if (errorTextarea) {
    let errorText = `Error: ${errorMessage}\n`;
    if (errorUrl) {
      errorText += `URL: ${errorUrl}\n`;
    }
    if (errorCode !== "—") {
      errorText += `Code: ${errorCode}\n`;
    }
    errorText += `Timestamp: ${new Date().toISOString()}\n`;
    if (errorStack) {
      errorText += `\nStack Trace:\n${errorStack}`;
    }
    errorTextarea.value = errorText;
  }

  const errCodeEl = document.getElementById("err-code");
  const errReqEl = document.getElementById("err-req");
  const errTimeEl = document.getElementById("err-time");
  const errStackEl = document.getElementById("err-stack");

  if (errCodeEl) errCodeEl.textContent = errorCode;
  if (errReqEl) errReqEl.textContent = crypto.randomUUID().slice(0, 8);
  if (errTimeEl) errTimeEl.textContent = new Date().toLocaleTimeString();
  if (errStackEl) errStackEl.textContent = errorStack || "No stack available";

  const copyErrorTextareaBtn = document.getElementById("copy-error-textarea");
  if (copyErrorTextareaBtn && errorTextarea) {
    copyErrorTextareaBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(errorTextarea.value);
        const icon = copyErrorTextareaBtn.querySelector("i");
        const originalIcon = icon?.getAttribute("data-lucide");
        icon?.setAttribute("data-lucide", "check");
        createIcons({ icons });
        setTimeout(() => {
          if (icon && originalIcon) {
            icon.setAttribute("data-lucide", originalIcon);
            createIcons({ icons });
          }
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });
  }

  const copyDetailsBtn = document.getElementById("copy-details");
  if (copyDetailsBtn && errorTextarea) {
    copyDetailsBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(errorTextarea.value);
        const icon = copyDetailsBtn.querySelector("i");
        const originalIcon = icon?.getAttribute("data-lucide");
        icon?.setAttribute("data-lucide", "check");
        createIcons({ icons });
        setTimeout(() => {
          if (icon && originalIcon) {
            icon.setAttribute("data-lucide", originalIcon);
            createIcons({ icons });
          }
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });
  }

  const saveLogBtn = document.getElementById("save-log");
  if (saveLogBtn && errorTextarea) {
    saveLogBtn.addEventListener("click", () => {
      const blob = new Blob([errorTextarea.value], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `error-log-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const retryBtn = document.getElementById("action-retry");
  const backBtn = document.getElementById("action-back");
  const homeBtn = document.getElementById("action-home");
  const clearBtn = document.getElementById("action-clear");
  const reportBtn = document.getElementById("action-report");

  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      if (errorUrl) {
        window.location.href = errorUrl;
      } else {
        window.location.reload();
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      window.location.href = "/internal/newtab/";
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (confirm("Clear browser cache? This will reload the page.")) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
          window.location.reload();
        } catch (err) {
          console.error("Failed to clear cache:", err);
        }
      }
    });
  }

  if (reportBtn) {
    reportBtn.addEventListener("click", () => {
      const issueBody = encodeURIComponent(errorTextarea?.value || "");
      const issueTitle = encodeURIComponent(`Error: ${errorMessage}`);
      window.open(
        `https://gitlab.com/nightnetwork/daydreamx/issues/new?title=${issueTitle}&body=${issueBody}`,
        "_blank",
      );
    });
  }

  const statusRefreshBtn = document.getElementById("status-refresh");
  if (statusRefreshBtn) {
    statusRefreshBtn.addEventListener("click", () => {
      checkStatus();
    });
  }

  async function checkStatus() {
    const latencyEl = document.getElementById("status-latency");
    const backendEl = document.getElementById("status-backend");

    if (latencyEl) latencyEl.textContent = "Checking...";
    if (backendEl) backendEl.textContent = "Checking...";

    try {
      const start = Date.now();
      await fetch("/", { method: "HEAD" });
      const latency = Date.now() - start;
      if (latencyEl) latencyEl.textContent = `${latency}ms`;
      if (backendEl) backendEl.textContent = "Online";
    } catch (err) {
      if (latencyEl) latencyEl.textContent = "Timeout";
      if (backendEl) backendEl.textContent = "Offline";
    }
  }

  checkStatus();
});
