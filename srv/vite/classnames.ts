import { Plugin } from "vite";
import crypto from "crypto";

interface ClassMapping {
  [originalClass: string]: string;
}

interface ObfuscationOptions {
  enabled?: boolean;
  prefix?: string;
  exclude?: string[];
  preserveClasses?: string[];
}

export function cssObfuscationPlugin(options: ObfuscationOptions = {}): Plugin {
  const {
    enabled = true,
    prefix = "_",
    exclude = [],
    preserveClasses = [],
  } = options;

  let classMapping: ClassMapping = {};
  let isProduction = false;

  // Generate a short hash for class name obfuscation
  function generateObfuscatedClass(originalClass: string): string {
    // Create a deterministic hash based on the class name
    const hash = crypto.createHash("md5").update(originalClass).digest("hex");
    // Take first 6 characters for a good balance of uniqueness and brevity
    return `${prefix}${hash.substring(0, 6)}`;
  }

  // Extract all class names from CSS - updated to be more consistent
  function extractClassNames(cssContent: string): Set<string> {
    const classNames = new Set<string>();

    try {
      // Remove comments first to avoid false positives
      const cleanCSS = cssContent
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove /* */ comments
        .replace(/\/\/.*$/gm, ""); // Remove // comments (though rare in CSS)

      // Match all class selectors (.classname) - handle both minified and normal CSS
      const classRegex = /\.([a-zA-Z_][\w-]*(?:\\[\da-fA-F]{1,6}\s?)?[\w-]*)/g;
      let match;

      while ((match = classRegex.exec(cleanCSS)) !== null) {
        const className = match[1];

        // Clean up escaped characters and validate
        const cleanClassName = className.replace(/\\[\da-fA-F]{1,6}\s?/g, ""); // Remove CSS escapes

        if (
          cleanClassName.length >= 1 &&
          !cleanClassName.startsWith("-") && // Don't start with dash (not standard)
          !/^[0-9]/.test(cleanClassName) && // Don't start with number
          !/--/.test(cleanClassName) && // Don't contain double dashes (CSS variables)
          !cleanClassName.includes(":") && // Don't include pseudo selectors
          !cleanClassName.includes("(") && // Don't include functions
          !cleanClassName.includes(")") &&
          !cleanClassName.includes("[") && // Don't include attribute selectors
          !cleanClassName.includes("]") &&
          !cleanClassName.includes("\\") && // Don't include remaining escapes
          !exclude.includes(cleanClassName) && // Skip excluded classes
          !preserveClasses.includes(cleanClassName) // Skip preserved classes
        ) {
          classNames.add(cleanClassName);
        }
      }
    } catch (error) {
      console.warn("Failed to extract class names from CSS:", error);
    }

    return classNames;
  }

  // Build class mapping
  function buildClassMapping(classNames: Set<string>): ClassMapping {
    const mapping: ClassMapping = {};

    classNames.forEach((className) => {
      mapping[className] = generateObfuscatedClass(className);
    });

    return mapping;
  }

  // Transform CSS with obfuscated class names
  function transformCSS(cssContent: string, mapping: ClassMapping): string {
    let transformedCSS = cssContent;

    try {
      // Replace each class name in the mapping
      Object.entries(mapping).forEach(([originalClass, obfuscatedClass]) => {
        // Create regex to match class selectors (.classname)
        // Look for dot + classname + non-word boundary
        const classRegex = new RegExp(
          `(^|[\\s,{])(\\.${escapeRegex(originalClass)})(?![\\w-])`,
          "g",
        );

        transformedCSS = transformedCSS.replace(
          classRegex,
          (match, before, selector) => {
            return before + "." + obfuscatedClass;
          },
        );
      });

      return transformedCSS;
    } catch (error) {
      console.warn("Failed to transform CSS for obfuscation:", error);
      return cssContent;
    }
  }

  // Escape special regex characters
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Transform JavaScript code to use obfuscated class names - conservative approach
  function transformJavaScript(
    jsContent: string,
    mapping: ClassMapping,
  ): string {
    let transformedJS = jsContent;

    try {
      // Only transform specific DOM manipulation patterns where we're confident about class names

      // 1. classList methods: classList.add(), classList.remove(), classList.toggle(), classList.contains()
      const classListRegex =
        /\.classList\.(add|remove|toggle|contains)\s*\(\s*(['"`])([a-zA-Z_][a-zA-Z0-9_-]*)\2\s*\)/g;
      transformedJS = transformedJS.replace(
        classListRegex,
        (match, method, quote, className) => {
          // Only transform if we have a mapping for this exact class name
          if (mapping[className]) {
            return `.classList.${method}(${quote}${mapping[className]}${quote})`;
          }
          return match;
        },
      );

      // 2. querySelector methods with class selectors
      const selectorRegex =
        /\.(querySelector|querySelectorAll|matches|closest)\s*\(\s*(['"`])\.([a-zA-Z_][a-zA-Z0-9_-]*)\2\s*\)/g;
      transformedJS = transformedJS.replace(
        selectorRegex,
        (match, method, quote, className) => {
          // Only transform if we have a mapping for this exact class name
          if (mapping[className]) {
            return `.${method}(${quote}.${mapping[className]}${quote})`;
          }
          return match;
        },
      );

      // 3. More complex selectors (like ".class1 .class2" or ".class1.class2")
      const complexSelectorRegex =
        /\.(querySelector|querySelectorAll|matches|closest)\s*\(\s*(['"`])([^'"`]*\.([a-zA-Z_][a-zA-Z0-9_-]*)[^'"`]*)\2\s*\)/g;
      transformedJS = transformedJS.replace(
        complexSelectorRegex,
        (match, method, quote, fullSelector, className) => {
          if (mapping[className]) {
            const transformedSelector = fullSelector.replace(
              new RegExp(`\\.${escapeRegex(className)}(?![a-zA-Z0-9_-])`, "g"),
              `.${mapping[className]}`,
            );
            return `.${method}(${quote}${transformedSelector}${quote})`;
          }
          return match;
        },
      );

      // 4. className property assignments (single class or space-separated)
      const classNameAssignRegex =
        /\.className\s*=\s*(['"`])([a-zA-Z_][a-zA-Z0-9_\-\s]*)\1/g;
      transformedJS = transformedJS.replace(
        classNameAssignRegex,
        (match, quote, classValue) => {
          // Split into individual class names
          const classNames = classValue.trim().split(/\s+/).filter(Boolean);
          let hasTransformations = false;

          const transformedClasses = classNames.map((className) => {
            if (mapping[className]) {
              hasTransformations = true;
              return mapping[className];
            }
            return className;
          });

          // Only replace if we actually transformed something
          if (hasTransformations) {
            return `.className = ${quote}${transformedClasses.join(" ")}${quote}`;
          }
          return match;
        },
      );

      // 5. setAttribute for class attribute
      const setAttributeRegex =
        /\.setAttribute\s*\(\s*(['"`])class\1\s*,\s*(['"`])([a-zA-Z_][a-zA-Z0-9_\-\s]*)\2\s*\)/g;
      transformedJS = transformedJS.replace(
        setAttributeRegex,
        (match, quote1, quote2, classValue) => {
          const classNames = classValue.trim().split(/\s+/).filter(Boolean);
          let hasTransformations = false;

          const transformedClasses = classNames.map((className) => {
            if (mapping[className]) {
              hasTransformations = true;
              return mapping[className];
            }
            return className;
          });

          if (hasTransformations) {
            return `.setAttribute(${quote1}class${quote1}, ${quote2}${transformedClasses.join(" ")}${quote2})`;
          }
          return match;
        },
      );

      return transformedJS;
    } catch (error) {
      console.warn(
        "Failed to transform JavaScript for CSS obfuscation:",
        error,
      );
      return jsContent;
    }
  }

  return {
    name: "css-obfuscation",
    configResolved(config) {
      isProduction = config.command === "build" && config.mode === "production";
    },

    generateBundle(options, bundle) {
      // Only run in production builds
      if (!enabled || !isProduction) {
        return;
      }

      // Find CSS files in the bundle
      const cssFiles = Object.keys(bundle).filter((fileName) =>
        fileName.endsWith(".css"),
      );

      if (cssFiles.length === 0) {
        return;
      }

      // Extract all class names from all CSS files
      const allClassNames = new Set<string>();

      cssFiles.forEach((fileName) => {
        const cssBundle = bundle[fileName];
        if (
          cssBundle.type === "asset" &&
          typeof cssBundle.source === "string"
        ) {
          const classNames = extractClassNames(cssBundle.source);
          classNames.forEach((className) => allClassNames.add(className));
        }
      });

      // Build the class mapping
      classMapping = buildClassMapping(allClassNames);

      console.log(
        `🎭 CSS Obfuscation: Mapped ${Object.keys(classMapping).length} class names`,
      );

      // Transform CSS files
      cssFiles.forEach((fileName) => {
        const cssBundle = bundle[fileName];
        if (
          cssBundle.type === "asset" &&
          typeof cssBundle.source === "string"
        ) {
          cssBundle.source = transformCSS(cssBundle.source, classMapping);
        }
      });

      // Transform JavaScript files
      const jsFiles = Object.keys(bundle).filter(
        (fileName) => fileName.endsWith(".js") && !fileName.includes(".min."),
      );

      jsFiles.forEach((fileName) => {
        const jsBundle = bundle[fileName];
        if (jsBundle.type === "chunk") {
          jsBundle.code = transformJavaScript(jsBundle.code, classMapping);
        }
      });

      // Also check for JS in assets (for some edge cases)
      Object.keys(bundle).forEach((fileName) => {
        const asset = bundle[fileName];
        if (
          asset.type === "asset" &&
          fileName.endsWith(".js") &&
          typeof asset.source === "string"
        ) {
          asset.source = transformJavaScript(asset.source, classMapping);
        }
      });

      // Optionally write mapping to a file for debugging (only in development)
      if (process.env.NODE_ENV === "development") {
        console.log("Class mapping:", classMapping);
      }
    },
  };
}
