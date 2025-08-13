export const cssContent = `/* Global Font Obfuscation */
@font-face {
    font-family: 'poppins-obf';
    src: url('/poppins-obf.woff2') format('woff2'),
         url('/poppins-obf.ttf') format('truetype');
    font-display: block;
    font-weight: normal;
    font-style: normal;
}

@font-face {
    font-family: 'jakarta-obf';
    src: url('/jakarta-obf.woff2') format('woff2'),
         url('/jakarta-obf.ttf') format('truetype');
    font-display: block;
    font-weight: normal;
    font-style: normal;
}

:root {
    --ob-font-poppins: 'poppins-obf', monospace;
    --ob-font-jakarta: 'jakarta-obf', monospace;
}

body.font-obfuscation-ready * {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none !important;
}

.ob-p,
body .ob-p,
html .ob-p {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none;
}

.ob-j,
body .ob-j,
html .ob-j {
    font-family: 'jakarta-obf', monospace !important;
    font-variant-ligatures: none;
}

.obfuscated,
body .obfuscated,
html .obfuscated {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none;
}

.no-obfuscate,
[data-no-obfuscate],
input[type="password"],
input[type="email"],
input[type="url"],
input[type="text"],
input[type="search"],
textarea,
select,
code,
pre,
script,
style,
[data-lucide],
.lucide,
.lucide-icon,
svg[data-lucide],
.material-icons,
.material-icons-outlined,
.material-symbols-outlined,
.material-icons-round,
.material-icons-sharp,
.material-icons-two-tone,
i.material-icons,
span.material-icons,
.mat-icon {
    font-family: inherit !important;
}

.ob-p {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none;
}

.ob-j {
    font-family: 'jakarta-obf', monospace !important;
    font-variant-ligatures: none;
}

.obfuscated {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none;
}

.tab-title,
.menu-text,
.ui-text,
[data-obfuscate] {
    font-family: 'poppins-obf', monospace !important;
    font-variant-ligatures: none;
}

.ob-p,
.ob-j,
.obfuscated {
    letter-spacing: normal;
    word-spacing: normal;
    line-height: inherit;
}`;
