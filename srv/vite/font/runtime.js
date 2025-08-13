function fontObfuscationRuntime() {
  "use strict";

  let mappings = {};
  let reverseMappings = {};
  let initialized = false;
  let globalObfuscationEnabled = true;
  let defaultFontType = "poppins";
  if (typeof window !== "undefined" && window.FONT_OBFUSCATION_CONFIG) {
    const config = window.FONT_OBFUSCATION_CONFIG;
    globalObfuscationEnabled = config.enabled !== false;
    defaultFontType = config.defaultFont || "poppins";
  }

  const obfuscationConfig = {
    excludeSelectors: [
      "script",
      "style",
      "meta",
      "title",
      "link",
      "[data-no-obfuscate]",
      ".no-obfuscate",
      "input",
      "textarea",
      "select",
      "option",
      'input[type="password"]',
      'input[type="email"]',
      'input[type="url"]',
      "code",
      "pre",
      "[data-lucide]",
      ".lucide",
      ".lucide-icon",
      "svg[data-lucide]",
      ".material-icons",
      ".material-icons-outlined",
      ".material-symbols-outlined",
      ".material-icons-round",
      ".material-icons-sharp",
      ".material-icons-two-tone",
      "i.material-icons",
      "span.material-icons",
      ".mat-icon",
    ],
    forceObfuscateSelectors: [
      ".obfuscated",
      ".ob-p",
      ".ob-j",
      "[data-obfuscate]",
      ".tab-title",
      ".menu-text",
      ".ui-text",
    ],
  };

  async function initMappings() {
    if (initialized) return;
    try {
      console.log("Font obfuscation: Starting initialization...");
      const [poppinsMap, poppinsRev, jakartaMap, jakartaRev] =
        await Promise.all([
          fetch("/poppins-obf-mappings.json")
            .then((r) => r.json())
            .catch((e) => {
              console.error("Failed to load poppins mappings:", e);
              return {};
            }),
          fetch("/poppins-obf-reverse-mappings.json")
            .then((r) => r.json())
            .catch((e) => {
              console.error("Failed to load poppins reverse mappings:", e);
              return {};
            }),
          fetch("/jakarta-obf-mappings.json")
            .then((r) => r.json())
            .catch((e) => {
              console.error("Failed to load jakarta mappings:", e);
              return {};
            }),
          fetch("/jakarta-obf-reverse-mappings.json")
            .then((r) => r.json())
            .catch((e) => {
              console.error("Failed to load jakarta reverse mappings:", e);
              return {};
            }),
        ]);

      mappings = { poppins: poppinsMap, jakarta: jakartaMap };
      reverseMappings = { poppins: poppinsRev, jakarta: jakartaRev };
      initialized = true;
      console.log("Font obfuscation mappings loaded successfully");
      console.log("Poppins mappings count:", Object.keys(poppinsMap).length);
      console.log("Jakarta mappings count:", Object.keys(jakartaMap).length);

      setTimeout(() => processExistingDOM(), 100);
    } catch (e) {
      console.warn("Failed to load font obfuscation mappings:", e);
    }
  }

  function encode(text, fontType = defaultFontType) {
    if (!initialized) return text;
    const mapping = reverseMappings[fontType];
    if (!mapping) return text;
    return text
      .split("")
      .map((char) => mapping[char] || char)
      .join("");
  }

  function decode(text, fontType = defaultFontType) {
    if (!initialized) return text;
    const mapping = mappings[fontType];
    if (!mapping) return text;
    return text
      .split("")
      .map((char) => mapping[char] || char)
      .join("");
  }

  function detectFontType(element) {
    if (!element || !element.classList) return defaultFontType;
    if (element.classList.contains("ob-p")) return "poppins";
    if (element.classList.contains("ob-j")) return "jakarta";
    if (element.classList.contains("obfuscated")) return defaultFontType;
    return defaultFontType;
  }

  function shouldObfuscate(element) {
    if (!element || !initialized) return false;

    for (const selector of obfuscationConfig.forceObfuscateSelectors) {
      try {
        if (element.matches && element.matches(selector)) return true;
      } catch (e) {}
    }

    if (!globalObfuscationEnabled) return false;

    for (const selector of obfuscationConfig.excludeSelectors) {
      try {
        if (element.matches && element.matches(selector)) return false;
        if (element.closest && element.closest(selector)) return false;
      } catch (e) {}
    }

    if (element.hasAttribute && element.hasAttribute("data-lucide")) {
      return false;
    }

    const computedStyle = window.getComputedStyle(element);
    const fontFamily = computedStyle.fontFamily;
    if (
      fontFamily &&
      (fontFamily.includes("Material Icons") ||
        fontFamily.includes("Material Symbols") ||
        fontFamily.includes("material-icons"))
    ) {
      return false;
    }

    if (
      element.closest &&
      element.closest(".no-obfuscate, [data-no-obfuscate]")
    ) {
      return false;
    }

    return true;
  }

  function processText(element, text) {
    if (!shouldObfuscate(element)) return text;
    const fontType = detectFontType(element);
    return encode(text, fontType);
  }

  function applyObfuscatedFont(element) {
    if (!element || !shouldObfuscate(element)) return;
    const fontType = detectFontType(element);

    if (
      !element.classList.contains("ob-p") &&
      !element.classList.contains("ob-j") &&
      !element.classList.contains("obfuscated")
    ) {
      element.classList.add("ob-" + fontType);
    }

    element.style.fontFamily =
      fontType === "jakarta"
        ? "'jakarta-obf', monospace"
        : "'poppins-obf', monospace";
    element.style.fontVariantLigatures = "none";
  }

  const originalTextContent = Object.getOwnPropertyDescriptor(
    Node.prototype,
    "textContent",
  );
  const originalInnerText = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "innerText",
  );
  const originalInnerHTML = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "innerHTML",
  );
  const originalCreateTextNode = Document.prototype.createTextNode;
  const originalAppendChild = Node.prototype.appendChild;
  const originalInsertBefore = Node.prototype.insertBefore;
  const originalReplaceChild = Node.prototype.replaceChild;
  const originalSetAttribute = Element.prototype.setAttribute;

  if (originalTextContent && originalTextContent.set) {
    Object.defineProperty(Node.prototype, "textContent", {
      get: originalTextContent.get,
      set: function (value) {
        if (typeof value === "string" && this.nodeType === 1) {
          const processed = processText(this, value);
          applyObfuscatedFont(this);
          originalTextContent.set.call(this, processed);
        } else {
          originalTextContent.set.call(this, value);
        }
      },
      configurable: true,
      enumerable: true,
    });
  }

  if (originalInnerText && originalInnerText.set) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      get: originalInnerText.get,
      set: function (value) {
        if (typeof value === "string") {
          const processed = processText(this, value);
          applyObfuscatedFont(this);
          originalInnerText.set.call(this, processed);
        } else {
          originalInnerText.set.call(this, value);
        }
      },
      configurable: true,
      enumerable: true,
    });
  }

  if (originalInnerHTML && originalInnerHTML.set) {
    Object.defineProperty(Element.prototype, "innerHTML", {
      get: originalInnerHTML.get,
      set: function (value) {
        originalInnerHTML.set.call(this, value);
        setTimeout(() => processElementTree(this), 0);
      },
      configurable: true,
      enumerable: true,
    });
  }

  const originalCreateElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tagName, options) {
    const element = originalCreateElement.call(this, tagName, options);
    setTimeout(() => {
      if (element.textContent || element.innerText) {
        processElementTree(element);
      }
    }, 0);
    return element;
  };

  Node.prototype.appendChild = function (child) {
    const result = originalAppendChild.call(this, child);

    if (child && child.nodeType === 1) {
      processElementTree(child);
      setTimeout(() => processElementTree(child), 0);
    } else if (
      child &&
      child.nodeType === 3 &&
      typeof child.textContent === "string"
    ) {
      if (shouldObfuscate(this)) {
        child.textContent = encode(child.textContent, detectFontType(this));
        applyObfuscatedFont(this);
      }
    }

    return result;
  };

  Node.prototype.insertBefore = function (newNode, referenceNode) {
    const result = originalInsertBefore.call(this, newNode, referenceNode);

    if (newNode && newNode.nodeType === 1) {
      processElementTree(newNode);
      setTimeout(() => processElementTree(newNode), 0);
    } else if (
      newNode &&
      newNode.nodeType === 3 &&
      typeof newNode.textContent === "string"
    ) {
      if (shouldObfuscate(this)) {
        newNode.textContent = encode(newNode.textContent, detectFontType(this));
        applyObfuscatedFont(this);
      }
    }

    return result;
  };

  function shouldObfuscateAttribute(element, attributeName) {
    if (attributeName === "placeholder") {
      return window.FONT_OBFUSCATION_CONFIG?.obfuscatePlaceholders !== false;
    }

    return shouldObfuscate(element);
  }

  Element.prototype.setAttribute = function (name, value) {
    if (
      typeof value === "string" &&
      (name === "title" || name === "placeholder" || name === "alt")
    ) {
      if (shouldObfuscateAttribute(this, name)) {
        value = processText(this, value);
      }
    }
    return originalSetAttribute.call(this, name, value);
  };

  function processElementTree(element) {
    if (!element || element.nodeType !== 1) return;

    if (shouldObfuscate(element)) {
      applyObfuscatedFont(element);

      if (
        element.children.length === 0 &&
        element.textContent &&
        element.textContent.trim()
      ) {
        const currentText = element.textContent;
        const encodedText = encode(currentText, detectFontType(element));
        if (encodedText !== currentText) {
          element.textContent = encodedText;
        }
      }

      ["title", "placeholder", "alt"].forEach((attr) => {
        const value = element.getAttribute(attr);
        if (value && value.trim()) {
          if (shouldObfuscateAttribute(element, attr)) {
            const encodedValue = encode(value, detectFontType(element));
            if (encodedValue !== value) {
              originalSetAttribute.call(element, attr, encodedValue);
            }
          }
        }
      });
    }

    for (let child of element.children) {
      processElementTree(child);
    }
  }

  function processExistingDOM() {
    if (!initialized) return;

    if (document.title && shouldObfuscate(document.documentElement)) {
      document.title = encode(document.title, defaultFontType);
    }

    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    const nodesToProcess = [];
    let node;

    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) {
        nodesToProcess.push(node);
      }
    }

    nodesToProcess.forEach((element) => {
      if (shouldObfuscate(element)) {
        processElementTree(element);
      }
    });

    document.body.classList.add("font-obfuscation-ready");
    console.log("Font obfuscation ready class added to body");

    setupMutationObserver();
  }

  function setupMutationObserver() {
    if (typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (shouldObfuscate(node)) {
              processElementTree(node);
            }
          }
        });

        if (
          mutation.type === "characterData" &&
          mutation.target.parentElement
        ) {
          const parent = mutation.target.parentElement;
          if (shouldObfuscate(parent)) {
            applyObfuscatedFont(parent);
          }
        }
      });
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  let originalTitle = document.title;
  Object.defineProperty(document, "title", {
    get: () => originalTitle,
    set: (newTitle) => {
      originalTitle = newTitle;
      if (shouldObfuscate(document.documentElement)) {
        document.getElementsByTagName("title")[0].textContent = encode(
          newTitle,
          defaultFontType,
        );
      }
    },
  });

  window.fontObfuscation = {
    encode,
    decode,
    processElement: processElementTree,
    processExistingDOM,
    isInitialized: () => initialized,
    setGlobalObfuscation: (enabled) => {
      globalObfuscationEnabled = enabled;
      if (enabled) processExistingDOM();
    },
    setDefaultFont: (fontType) => {
      defaultFontType = fontType;
    },
    config: obfuscationConfig,
  };

  async function waitForFontsToLoad() {
    if ("fonts" in document) {
      try {
        await Promise.all([
          document.fonts.load("16px poppins-obf"),
          document.fonts.load("14px poppins-obf"),
          document.fonts.load("18px poppins-obf"),
          document.fonts.load("16px jakarta-obf"),
          document.fonts.load("14px jakarta-obf"),
          document.fonts.load("18px jakarta-obf"),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        console.log("Obfuscated fonts loaded successfully");
      } catch (e) {
        console.warn("Font loading failed, continuing anyway:", e);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
      await initMappings();
      await waitForFontsToLoad();
      setTimeout(() => processExistingDOM(), 200);
    });
  } else {
    Promise.all([initMappings(), waitForFontsToLoad()]).then(() => {
      setTimeout(() => processExistingDOM(), 200);
    });
  }

  window.addEventListener("load", () => {
    setTimeout(() => {
      if (initialized) {
        console.log("Window loaded, processing DOM again");
        processExistingDOM();
      }
    }, 300);
  });

  initMappings();
}

export function runtime() {
  return `(${fontObfuscationRuntime.toString()})();`;
}
