export const cssContent = `/* Global Font Obfuscation */
@font-face {
    font-family: 'poppins-obf';
    src: url('/poppins-obf.woff2') format('woff2'),
         url('/poppins-obf.ttf') format('truetype');
    font-display: block;
    font-weight: normal;
    font-style: normal;
}

:root {
    --ob-font-poppins: 'poppins-obf', monospace;
}

/* Apply obfuscated font to most elements */
body.font-obfuscation-ready * {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none !important;
}

/* Specific obfuscated classes */
.ob-p,
body .ob-p,
html .ob-p,
.obfuscated,
body .obfuscated,
html .obfuscated {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none !important;
}

/* Exclude certain elements from obfuscation (preserve original styling) */
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

/* Input elements: don't change styling but still allow text obfuscation */
input,
textarea,
select,
option {
    /* Keep original input styling - obfuscation will be handled in JS */
}

/* Specific selectors that should be obfuscated */
.tab-title,
.menu-text,
.ui-text,
[data-obfuscate] {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none !important;
}

/* Maintain proper text rendering */
.ob-p,
.obfuscated {
    letter-spacing: normal;
    word-spacing: normal;
    line-height: inherit;
}`;
