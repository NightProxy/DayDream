// src/core/helium/host/omnibox/events.ts
//
// Helpers used by the omnibox UI's extension mode to fire chrome.omnibox.*
// events on the registered extension. The dispatcher passes a
// fireEventOn callback bound to ExtensionManager.

export type Disposition = 'currentTab' | 'newForegroundTab' | 'newBackgroundTab';

export interface OmniboxEventDispatcher {
  fireInputStarted: (extId: string) => void;
  fireInputChanged: (extId: string, text: string) => void;
  fireInputEntered: (extId: string, text: string, disposition: Disposition) => void;
  fireInputCancelled: (extId: string) => void;
  fireDeleteSuggestion: (extId: string, text: string) => void;
}

export function buildOmniboxEventDispatcher(
  fireEventOn: (extId: string, method: string, args: unknown[]) => void,
): OmniboxEventDispatcher {
  return {
    fireInputStarted: (extId) => fireEventOn(extId, 'chrome.omnibox.onInputStarted', []),
    fireInputChanged: (extId, text) => {
      // Real Chrome contract: listener is invoked with (text, suggest)
      // where `suggest` is a callback the extension calls with an
      // array of `SuggestResult`s. Helium's transport is fire-and-
      // forget across the channel — functions can't be cloned over a
      // MessagePort, so we cannot pass a live suggest callback to the
      // BG iframe. The BG bootstrap synthesizes a no-op suggest stub
      // (see installEventRouter in bootstrap/client.ts) so listeners
      // that unconditionally call `suggest(...)` don't crash; the
      // suggestions themselves are dropped.
      //
      // Documented best-effort behaviour: the omnibox UI only shows
      // the default suggestion. Async-populated suggestions are not
      // surfaced. A future revision could move to a `requestEvent`
      // round-trip (host awaits the BG's suggest call and patches the
      // pending omnibox row set) — see omnibox/modes/extension.ts.
      fireEventOn(extId, 'chrome.omnibox.onInputChanged', [text]);
    },
    fireInputEntered: (extId, text, disposition) =>
      fireEventOn(extId, 'chrome.omnibox.onInputEntered', [text, disposition]),
    fireInputCancelled: (extId) =>
      fireEventOn(extId, 'chrome.omnibox.onInputCancelled', []),
    fireDeleteSuggestion: (extId, text) =>
      fireEventOn(extId, 'chrome.omnibox.onDeleteSuggestion', [text]),
  };
}
