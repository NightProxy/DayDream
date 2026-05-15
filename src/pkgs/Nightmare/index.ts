import { ContextMenu } from './contextMenu';
import { Menu } from './menu';
import { AlertToast } from './alert';
import { SideMenu } from './sideMenu';
import { SidePanel } from './sidePanel';
import { RightClickMenu } from './rightClickMenu';
import { createIcons, icons } from 'lucide';

class Nightmare implements NightmareUI {
	contextMenu: ContextMenu | null = null;
	menu: Menu | null = null;
	alert: AlertToast | null = null;
	sidemenu: SideMenu | null = null;
	sidepanel: SidePanel | null = null;
	rightclickmenu: RightClickMenu | null = null;
	np: NPInterface | null = null; //polyfill for old Nightmare plugins

	constructor() {
		this.initializeComponents();
	}

	initializeComponents() {
		this.contextMenu = new ContextMenu(this);
		this.menu = new Menu(this);
		this.alert = new AlertToast(this);
		this.sidemenu = new SideMenu(this);
		this.sidepanel = new SidePanel(this);
		this.rightclickmenu = new RightClickMenu(this);
		this.np = {
			sidemenu: this.sidemenu,
			sidepanel: this.sidepanel,
			rightclickmenu: this.rightclickmenu
		}; //polyfill for old Nightmare plugins
	}

	createElement(
		tag: string,
		attributes: Record<string, any> = {},
		children: (string | HTMLElement)[] = []
	): HTMLElement {
		const element = document.createElement(tag);
		Object.entries(attributes).forEach(([key, value]) => {
			if (key.startsWith('on')) {
				(element as any)[key.toLowerCase()] = value;
			} else if (key === 'style') {
				element.style.cssText = value;
			} else {
				element.setAttribute(key, value);
			}
		});
		children.forEach(child => {
			element.appendChild(
				typeof child === 'string'
					? document.createTextNode(child)
					: child
			);
		});
		return element;
	}

	queryComponent(
		componentName: string,
		el: HTMLElement | Document = document
	): HTMLElement | null {
		return el.querySelector(`[data-component="${componentName}"]`);
	}

	queryComponentAll(
		componentName: string,
		el: HTMLElement | Document = document
	): NodeListOf<HTMLElement> {
		return el.querySelectorAll(`[data-component="${componentName}"]`);
	}

	setState(componentName: HTMLElement | null, state: string | null): void {
		if (!componentName) return;
		if (state === null) {
			componentName.removeAttribute('state');
			return;
		}
		componentName.setAttribute('state', state);
	}

	getState(componentName: HTMLElement | null): string | null {
		return componentName?.getAttribute('state') ?? null;
	}

	setStyle(component: HTMLElement | null, styleName: string): void {
		component?.setAttribute('styleMode', styleName);
	}

	getStyle(component: HTMLElement | null): string | null {
		return component?.getAttribute('styleMode') ?? null;
	}

	applyStyle(componentName: string): void {
		const component = this.queryComponent(componentName);
		if (component) {
			const styleMode = component.getAttribute('styleMode');
			if (styleMode && component.hasAttribute(styleMode)) {
				const styleValue = component.getAttribute(styleMode);
				if (styleValue) {
					component.style.cssText = styleValue;
				} else {
					console.warn(
						`Style ${styleMode} is not defined for component ${componentName}.`
					);
				}
			}
		} else {
			console.warn(
				`Component ${componentName} not found for applying style.`
			);
		}
	}

	createIcons() {
		createIcons({ icons });
	}
}

export { Nightmare };
