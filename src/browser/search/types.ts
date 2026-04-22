export interface Section {
  section: HTMLElement;
  searchResults: HTMLElement;
}

export interface GameData {
  name: string;
  image: string;
  link: string;
}

export interface SearchInterface {
  proto: any;
  ui: any;
  data: any;
  settings: any;
  proxy: any;
  swConfig: any;
  proxySetting: string;
  currentSectionIndex: number;
  maxInitialResults: number;
  maxExpandedResults: number;
  appsData: GameData[];
  sections: Record<string, Section>;
  selectedSuggestionIndex: number;
  currentMaxResults: number;
}
