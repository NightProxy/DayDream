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
	notifications: import('./notifications').NotificationManager | null;
	permissionPrompt: import('./permissionPrompt').PermissionPrompt | null;
	createElement(
		tag: string,
		attributes?: Record<string, any>,
		children?: (string | HTMLElement)[]
	): HTMLElement;
	queryComponent(componentName: string): HTMLElement | null;
	queryComponentAll(componentName: string): NodeListOf<HTMLElement>;
	setState(componentName: HTMLElement | null, state: string | null): void;
	getState(componentName: HTMLElement | null): string | null;
	setStyle(component: HTMLElement, styleName: string): void;
	getStyle(component: HTMLElement): string | null;
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
		content: Function | HTMLElement | HTMLElement[]
	) => void;
	openMenu: (
		element: HTMLButtonElement,
		content: Function | HTMLElement | HTMLElement[]
	) => void;
	closeMenu: () => void;
}

interface SidePanelInterface {
	ui: Nightmare;
	container: HTMLElement | null;
	isOpen: boolean;
	attachTo: (
		element: HTMLButtonElement,
		content: Function | HTMLElement | HTMLElement[]
	) => void;
	openMenu: (
		element: HTMLButtonElement,
		content: Function | HTMLElement | HTMLElement[]
	) => void;
	closeMenu: () => void;
}

interface RightClickMenuInterface {
	ui: Nightmare;
	container: HTMLElement | null;
	isOpen: boolean;
	attachTo: (
		element: HTMLElement,
		content: Function | HTMLElement | HTMLElement[]
	) => void;
	openMenu: (
		element: HTMLElement,
		event: MouseEvent,
		content: Function | HTMLElement | HTMLElement[]
	) => void;
	closeMenu: () => void;
}
