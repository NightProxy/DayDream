export const cssContent = `@font-face {
    font-family: 'plusjakartasans-obf';
    src: url('/plusjakartasans-obf.woff2') format('woff2'),
         url('/plusjakartasans-obf.ttf') format('truetype');
    font-display: block;
    font-weight: normal;
    font-style: normal;
}

:root {
    --ob-font-plusjakartasans: 'plusjakartasans-obf', sans-serif;
}

body.font-obfuscation-ready * {
    font-family: 'plusjakartasans-obf', sans-serif !important;
    font-variant-ligatures: none !important;
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
}

.ob-p,
body .ob-p,
html .ob-p,
.obfuscated,
body .obfuscated,
html .obfuscated {
    font-family: 'plusjakartasans-obf', sans-serif !important;
    font-variant-ligatures: none !important;
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    letter-spacing: 0 !important;
    word-spacing: normal !important;
}

.no-obfuscate,
[data-no-obfuscate],
code,
pre,
script,
style,
[data-lucide],
.lucide,
.lucide-icon,
svg[data-lucide] {
    font-family: inherit !important;
}

input,
textarea,
select,
option {
}

.tab-title,
.menu-text,
.ui-text,
[data-obfuscate] {
    font-family: 'plusjakartasans-obf', sans-serif !important;
    font-variant-ligatures: none !important;
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
}

.ob-p,
.obfuscated {
    line-height: inherit;
    font-feature-settings: normal !important;
}`;
