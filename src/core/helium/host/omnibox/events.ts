
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
