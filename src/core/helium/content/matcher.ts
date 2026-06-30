/**
 * Compiled matcher for a ContentScriptRule.
 *
 * Encapsulates matches + exclude_matches + include_globs + exclude_globs +
 * match_about_blank logic into one callable predicate. Frame-depth
 * enforcement (`all_frames`) is surfaced as `topFrameOnly` and enforced
 * at runtime inside the injected wrapper via `window === window.top`.
 *
 * Extension origins (`*.ddx`) are always excluded so content scripts never
 * inject into BG iframes, popup pages, or other extension-owned documents
 * even when the rule is `<all_urls>`. This matches Chrome's behavior where
 * content scripts never run in `chrome-extension://` pages.
 */

import { matchGlob, matchUrlPattern } from '../extfs/war';
import type { ContentScriptRule } from '../shared/unpack/types';

export interface CompiledMatcher {
  matches: (url: URL, isAboutBlank: boolean) => boolean;
  topFrameOnly: boolean;
}

export function compileRule(rule: ContentScriptRule): CompiledMatcher {
  const includes = rule.matches ?? [];
  const excludes = rule.exclude_matches ?? [];
  const includeGlobs = rule.include_globs ?? [];
  const excludeGlobs = rule.exclude_globs ?? [];
  const matchAboutBlank = rule.match_about_blank === true;

  return {
    matches: (url: URL, isAboutBlank: boolean) => {
      if (url.hostname.endsWith('.ddx')) return false;

      if (isAboutBlank && !matchAboutBlank) return false;

      const href = url.toString();

      for (const ex of excludes) {
        if (matchUrlPattern(ex, href)) return false;
      }
      for (const ex of excludeGlobs) {
        if (matchGlob(ex, href)) return false;
      }

      let included = false;
      for (const inc of includes) {
        if (matchUrlPattern(inc, href)) {
          included = true;
          break;
        }
      }
      if (!included) return false;

      if (includeGlobs.length > 0) {
        let globHit = false;
        for (const g of includeGlobs) {
          if (matchGlob(g, href)) {
            globHit = true;
            break;
          }
        }
        if (!globHit) return false;
      }

      return true;
    },
    topFrameOnly: rule.all_frames !== true,
  };
}
