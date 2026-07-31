import varsCSS from '@css/vars.scss?inline';
import importsCSS from '@css/imports.scss?inline';
import tailwindCSS from '@css/tailwind.css?inline';
import globalCSS from '@css/global.scss?inline';
import { patchDocument } from '../utils/document';
import { Render } from '@browser/render';

export function criticalRender(container: HTMLDivElement): {
  shadowRoot: ShadowRoot;
  root: HTMLDivElement;
} {
  const shadowRoot = container.attachShadow({ mode: 'open' });

  shadowRoot.append(
    Object.assign(document.createElement('style'), {
      textContent: varsCSS + importsCSS + tailwindCSS + globalCSS,
    }),
    Object.assign(document.createElement('div'), {
      id: 'root',
      style: 'width: 100%; height: 100%; position: fixed; inset: 0;',
    }),
  );

  const shadowDocument = document.implementation.createHTMLDocument('');
  patchDocument(shadowRoot, shadowDocument);
  window.d = shadowRoot;

  const root = shadowRoot.getElementById('root') as HTMLDivElement;
  new Render(root);

  return { shadowRoot, root };
}
