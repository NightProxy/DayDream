interface UIPage {
  id: string;
  content: string;
}

interface MenuItem {
  label: string;
  pageId: string;
}

interface NightmareUI {
  contextMenu: ContextMenu | null;
  menu: Menu | null;
  alert: AlertToast | null;
  sidemenu: SideMenu;
  sidepanel: SidePanel;
  rightclickmenu: RightClickMenu;
  createElement(
    tag: string,
    attributes?: Record<string, any>,
    children?: (string | HTMLElement)[],
  ): HTMLElement;
  queryComponent(componentName: string): HTMLElement | null;
  queryComponentAll(componentName: string): NodeListOf<HTMLElement>;
  setState(componentName: string, state: string): void;
  getState(componentName: string): string | null;
  setStyle(componentName: string, styleName: string): void;
  getStyle(componentName: string): string | null;
  applyStyle(componentName: string, style: string): void;
  createIcons(): void;
}

interface NPInterface {
  sidemenu: SideMenu;
  sidepanel: SidePanel;
  rightclickmenu: RightClickMenu;
}

interface SideMenuInterface {
  ui: NightmareUI;
  container: HTMLElement | null;
  isOpen: boolean;
  attachTo: (
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
  ) => void;
  openMenu: (
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
  ) => void;
  closeMenu: () => void;
}

interface SidePanelInterface {
  ui: Nightmare;
  container: HTMLElement | null;
  isOpen: boolean;
  attachTo: (
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
  ) => void;
  openMenu: (
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
  ) => void;
  closeMenu: () => void;
}

interface RightClickMenuInterface {
  ui: Nightmare;
  container: HTMLElement | null;
  isOpen: boolean;
  attachTo: (
    element: HTMLElement,
    content: Function | HTMLElement | HTMLElement[],
  ) => void;
  openMenu: (
    element: HTMLElement,
    event: MouseEvent,
    content: Function | HTMLElement | HTMLElement[],
  ) => void;
  closeMenu: () => void;
}