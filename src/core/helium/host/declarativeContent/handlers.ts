// src/core/helium/host/declarativeContent/handlers.ts
//
// chrome.declarativeContent — host-side rule store + matcher engine.
//
// Lifecycle:
//   1. Extension BG calls `chrome.declarativeContent.onPageChanged.addRules([{conditions: [PageStateMatcher({...})], actions: [...]}])`.
//   2. The DeclarativeEvent class (shared) stores rules locally AND
//      relays them to the host via a synthetic RPC call (added in this
//      patch — see `_host_declarative_addRules`).
//   3. Host stores per-(extId) rules. On every tabNavigated 'committed'
//      event AND every tabSelected, the host evaluates each extension's
//      rules against the (tabId, url) pair:
//        - `pageUrl` condition: matched via the existing UrlFilter
//          evaluator (`host/webNavigation/filter.ts`).
//        - `css` condition: probed by an executeScript that calls
//          `document.querySelector(selector)` for each selector,
//          returning a boolean. Results are cached per (tabId, url,
//          selector) until the URL changes.
//   4. If all conditions match, actions fire:
//        - `ShowAction` / `ShowPageAction` → call ActionHandlers
//          `pageActionShow(extId, tabId)`.
//        - `SetIcon` → ActionHandlers `setIcon` with the per-tab
//          override.
//        - `RequestContentScript` → not supported (would require
//          dynamic script injection on the fly; the existing
//          chrome.scripting.executeScript path is the better choice
//          for that and isn't declarative).
//
// Why this is worth doing: declarativeContent is one of the few "smart
// page-action" APIs. Extensions like uBlock, password managers, and
// "show icon only on certain sites" patterns rely on it. Without it
// they fall back to imperative tabs.onUpdated polling which costs
// more.

import type { ExtensionContext } from '../../extfs/types';
import type { UrlFilter } from '../webNavigation/filter';
import { matchesEventFilter } from '../webNavigation/filter';

interface PageStateMatcherCondition {
  instanceType: 'declarativeContent.PageStateMatcher';
  pageUrl?: UrlFilter;
  css?: string[];
  // isBookmarked omitted — DDX has no bookmark-flag-per-tab hook
}

interface DeclarativeAction {
  instanceType:
    | 'declarativeContent.ShowAction'
    | 'declarativeContent.ShowPageAction'
    | 'declarativeContent.SetIcon'
    | 'declarativeContent.RequestContentScript';
  // For SetIcon
  imageData?: unknown;
  // For RequestContentScript
  js?: string[];
  css?: string[];
  allFrames?: boolean;
}

interface DeclarativeRule {
  id?: string;
  conditions: PageStateMatcherCondition[];
  actions: DeclarativeAction[];
  priority?: number;
}

export interface DeclarativeContentDeps {
  /** Apply pageAction.show for (extId, tabId). */
  pageActionShow: (extId: string, tabId: number) => void;
  /** Apply pageAction.hide (called when conditions no longer match). */
  pageActionHide: (extId: string, tabId: number) => void;
  /** Apply per-tab icon override. */
  setActionIcon: (extId: string, tabId: number, imageData: unknown) => void;
  /** Probe a tab for CSS-selector presence. Returns true if any matches. */
  probeCss: (tabId: number, selectors: string[]) => Promise<boolean>;
}

/**
 * Per-extension rule store + matcher. Single instance owned by
 * ExtensionManager; rules added via `addRules` from the extension
 * BG (relayed via RPC), evaluated on tab navigation / activation.
 */
export class DeclarativeContentHandlers {
  private rulesByExt = new Map<string, DeclarativeRule[]>();
  /**
   * Per-(extId, tabId) "last applied" set so we can hide the
   * pageAction if a rule no longer matches after a URL change.
   * Otherwise the action stays sticky from previous matches.
   */
  private appliedShowState = new Map<string, Set<number>>();

  constructor(private deps: DeclarativeContentDeps) {}

  /** Replace rules for an extension. Called via RPC from BG. */
  addRules(extId: string, rules: DeclarativeRule[]): void {
    const existing = this.rulesByExt.get(extId) ?? [];
    this.rulesByExt.set(extId, [...existing, ...rules]);
  }

  /** Remove rules by id. If `ids` is undefined, removes all rules. */
  removeRules(extId: string, ids?: string[]): void {
    if (!ids || ids.length === 0) {
      this.rulesByExt.delete(extId);
      return;
    }
    const cur = this.rulesByExt.get(extId);
    if (!cur) return;
    this.rulesByExt.set(
      extId,
      cur.filter((r) => !r.id || !ids.includes(r.id)),
    );
  }

  /** Read rules. */
  getRules(extId: string, ids?: string[]): DeclarativeRule[] {
    const cur = this.rulesByExt.get(extId) ?? [];
    if (!ids || ids.length === 0) return [...cur];
    return cur.filter((r) => r.id && ids.includes(r.id));
  }

  /**
   * Re-evaluate all rules for all extensions against the given tab.
   * Wired to `tabNavigated phase:'committed'` and `tabSelected`.
   *
   * Each rule's conditions are OR'd against each other (Chrome's
   * semantics: rule fires if ANY condition matches). Within a single
   * PageStateMatcher, all properties are AND'd.
   */
  async evaluateForTab(tabId: number, url: string): Promise<void> {
    if (!url) return;
    for (const [extId, rules] of this.rulesByExt) {
      let anyMatched = false;
      for (const rule of rules) {
        const matched = await this.ruleMatches(rule, tabId, url);
        if (matched) {
          anyMatched = true;
          this.applyActions(extId, tabId, rule.actions);
          break; // first-matching-rule-wins per ext
        }
      }
      if (!anyMatched) {
        // No rule matched — revert any previously-applied show.
        const applied = this.appliedShowState.get(extId);
        if (applied?.has(tabId)) {
          this.deps.pageActionHide(extId, tabId);
          applied.delete(tabId);
        }
      }
    }
  }

  private async ruleMatches(
    rule: DeclarativeRule,
    tabId: number,
    url: string,
  ): Promise<boolean> {
    if (!rule.conditions || rule.conditions.length === 0) return false;
    for (const cond of rule.conditions) {
      if (cond.instanceType !== 'declarativeContent.PageStateMatcher') continue;
      // pageUrl gate
      if (cond.pageUrl) {
        const ok = matchesEventFilter({ url: [cond.pageUrl] }, url);
        if (!ok) continue;
      }
      // css gate — probe via deps.probeCss. Best-effort: if probe
      // throws or times out we treat as non-match (consistent with
      // Chrome's "selector not found" semantics).
      if (cond.css && cond.css.length > 0) {
        try {
          const ok = await this.deps.probeCss(tabId, cond.css);
          if (!ok) continue;
        } catch {
          continue;
        }
      }
      // All gates passed for this condition.
      return true;
    }
    return false;
  }

  private applyActions(
    extId: string,
    tabId: number,
    actions: DeclarativeAction[],
  ): void {
    let appliedShow = false;
    for (const action of actions) {
      switch (action.instanceType) {
        case 'declarativeContent.ShowAction':
        case 'declarativeContent.ShowPageAction':
          this.deps.pageActionShow(extId, tabId);
          appliedShow = true;
          break;
        case 'declarativeContent.SetIcon':
          if (action.imageData !== undefined) {
            this.deps.setActionIcon(extId, tabId, action.imageData);
          }
          break;
        case 'declarativeContent.RequestContentScript':
          // Intentionally NOT implemented — extensions should use
          // chrome.scripting.executeScript for dynamic injection.
          console.warn(
            `[declarativeContent] RequestContentScript is not supported for ${extId}; use chrome.scripting instead`,
          );
          break;
      }
    }
    if (appliedShow) {
      let set = this.appliedShowState.get(extId);
      if (!set) { set = new Set(); this.appliedShowState.set(extId, set); }
      set.add(tabId);
    }
  }

  /** Tear down when extension is uninstalled / disabled. */
  clearForExt(extId: string): void {
    this.rulesByExt.delete(extId);
    this.appliedShowState.delete(extId);
  }

  /**
   * Optional: a tab closed — drop it from applied state so we don't
   * leak Set entries forever.
   */
  onTabClosed(tabId: number): void {
    for (const set of this.appliedShowState.values()) {
      set.delete(tabId);
    }
  }
}

/** Re-export type so the host barrel can re-export it. */
export type { ExtensionContext };
