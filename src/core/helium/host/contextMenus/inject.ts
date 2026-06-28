// src/core/helium/host/contextMenus/inject.ts
//
// Helper called from the browser-side menu builders to append
// extension-contributed contextMenus entries. Adds a separator before
// the extension entries (when there are any). Clicking an entry fires
// chrome.contextMenus.onClicked on the owning extension.
//
// Usage from a menu builder:
//   import { injectExtensionMenus } from '@core/helium/host/contextMenus/inject';
//   injectExtensionMenus(menuItems, 'tab', { pageUrl }, info, { tab }, deps);

import type { ContextMenuRegistry, ContextType, ContextInfo, MenuEntry } from './registry';

export interface InjectDeps {
  registry: ContextMenuRegistry;
  // Fires chrome.contextMenus.onClicked on the extension.
  fireOnClicked: (extId: string, info: ContextMenuClickInfo, tab?: unknown) => void;
  // ui.createElement-compatible: most call-sites have access to a Nightmare/UI instance.
  createElement: (
    tag: string,
    attrs?: Record<string, unknown>,
    children?: Array<string | HTMLElement>,
  ) => HTMLElement;
  // Grants activeTab to the owning extension on click.
  grantActiveTab?: ((extId: string, tabId: number) => void) | undefined;
}

export interface ContextMenuClickInfo {
  menuItemId: string;
  parentMenuItemId?: string;
  mediaType?: 'image' | 'video' | 'audio';
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
  frameUrl?: string;
  selectionText?: string;
  editable: boolean;
  wasChecked?: boolean;
  checked?: boolean;
}

/**
 * Append extension-contributed menu entries to a host-built menu element list.
 *
 * @param menuItems  Array of menu item elements to append into (mutated).
 * @param contextType  The chrome context (e.g. 'page', 'tab', 'link').
 * @param info  ContextInfo (pageUrl/linkUrl/srcUrl/etc) used to filter.
 * @param tab  The tab object passed to onClicked (chrome.tabs.Tab shape, or null).
 * @param tabIdNum  Optional numeric tab id to grant activeTab to.
 * @param deps  Dependency injection — registry, fire helper, createElement.
 */
export function injectExtensionMenus(
  menuItems: HTMLElement[],
  contextType: ContextType,
  info: ContextInfo,
  tab: unknown,
  tabIdNum: number | undefined,
  deps: InjectDeps,
): void {
  const entries = deps.registry.getMenusForContext(contextType, info);
  if (entries.length === 0) return;

  // Separator before extension entries.
  menuItems.push(buildSeparator(deps));

  for (const { extId, entry } of entries) {
    // Skip child entries — we render them inline under their parent.
    if (entry.parentId) continue;

    if (entry.type === 'separator') {
      menuItems.push(buildSeparator(deps));
      continue;
    }

    const children = entries
      .filter((e) => e.extId === extId && e.entry.parentId === entry.id)
      .map((e) => e.entry);

    if (children.length > 0) {
      menuItems.push(buildSubmenu(entry, children, extId, info, tab, tabIdNum, deps));
    } else {
      menuItems.push(buildItem(entry, extId, info, tab, tabIdNum, deps));
    }
  }
}

function buildSeparator(deps: InjectDeps): HTMLElement {
  return deps.createElement('div', { class: 'h-px bg-[var(--white-08)] my-1' });
}

function buildItem(
  entry: MenuEntry,
  extId: string,
  info: ContextInfo,
  tab: unknown,
  tabIdNum: number | undefined,
  deps: InjectDeps,
): HTMLElement {
  const disabled = entry.enabled === false;
  const handler = disabled
    ? () => {}
    : () => {
        if (tabIdNum !== undefined && deps.grantActiveTab) {
          try { deps.grantActiveTab(extId, tabIdNum); } catch (err) { console.warn('[helium/contextMenus] grantActiveTab threw:', err); }
        }
        const click: ContextMenuClickInfo = {
          menuItemId: entry.id,
          editable: !!info.editable,
        };
        if (info.pageUrl) click.pageUrl = info.pageUrl;
        if (info.linkUrl) click.linkUrl = info.linkUrl;
        if (info.srcUrl) click.srcUrl = info.srcUrl;
        if (info.frameUrl) click.frameUrl = info.frameUrl;
        if (info.selectionText) click.selectionText = info.selectionText;
        if (entry.type === 'checkbox' || entry.type === 'radio') {
          click.wasChecked = entry.checked === true;
          click.checked = !entry.checked;
        }
        try { deps.fireOnClicked(extId, click, tab); } catch (err) { console.warn('[helium/contextMenus] fireOnClicked threw:', err); }
      };

  const classBase =
    'flex items-center gap-3 px-4 py-2 transition-colors w-full text-left text-sm rounded-md';
  const classBtn = disabled
    ? `${classBase} opacity-60 cursor-not-allowed`
    : `${classBase} hover:bg-[var(--white-05)]`;

  const prefix = entry.type === 'checkbox' && entry.checked ? '\u2713 ' : '';
  return deps.createElement(
    'button',
    {
      class: classBtn,
      disabled: disabled ? 'true' : null,
      onclick: handler,
      'data-helium-ext-menu': `${extId}::${entry.id}`,
    },
    [
      deps.createElement('span', {}, [prefix + (entry.title ?? entry.id)]),
    ],
  );
}

function buildSubmenu(
  parent: MenuEntry,
  children: MenuEntry[],
  extId: string,
  info: ContextInfo,
  tab: unknown,
  tabIdNum: number | undefined,
  deps: InjectDeps,
): HTMLElement {
  const childEls = children.map((c) => buildItem(c, extId, info, tab, tabIdNum, deps));
  return deps.createElement(
    'div',
    { class: 'relative group' },
    [
      deps.createElement(
        'button',
        {
          class: 'flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
        },
        [
          deps.createElement('span', {}, [parent.title ?? parent.id]),
          deps.createElement('span', {}, ['\u25B8']),
        ],
      ),
      deps.createElement(
        'div',
        {
          class:
            'absolute left-full top-0 ml-1 min-w-48 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50',
        },
        childEls,
      ),
    ],
  );
}
