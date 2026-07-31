
export interface PermissionPromptRequest {
	extensionName: string;
	permissions?: string[];
	origins?: string[];
}

const STYLE_ID = '__nightmare_permission_prompt_style__';

const STYLES = `
.nightmare-perm-prompt-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 100000;
	font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.nightmare-perm-prompt {
	background: #1f1f1f;
	color: #f5f5f5;
	width: 420px;
	max-width: calc(100% - 32px);
	border-radius: 10px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
	overflow: hidden;
	display: flex;
	flex-direction: column;
}
.nightmare-perm-prompt-header {
	padding: 16px 18px 8px;
	font-size: 15px;
	font-weight: 600;
	line-height: 1.3;
}
.nightmare-perm-prompt-body {
	padding: 4px 18px 12px;
	font-size: 13px;
	color: #d2d2d2;
	line-height: 1.45;
	max-height: 260px;
	overflow-y: auto;
}
.nightmare-perm-prompt-section {
	margin-top: 8px;
}
.nightmare-perm-prompt-section h4 {
	margin: 0 0 4px;
	font-size: 12px;
	color: #aaaaaa;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.nightmare-perm-prompt-list {
	list-style: none;
	margin: 0;
	padding: 0;
}
.nightmare-perm-prompt-list li {
	padding: 2px 0;
	font-family: ui-monospace, "SF Mono", Menlo, monospace;
	color: #eaeaea;
}
.nightmare-perm-prompt-footer {
	display: flex;
	gap: 8px;
	padding: 12px 16px;
	background: #181818;
	justify-content: flex-end;
}
.nightmare-perm-prompt-button {
	font: inherit;
	font-size: 13px;
	padding: 7px 14px;
	border-radius: 6px;
	cursor: pointer;
	border: 1px solid transparent;
}
.nightmare-perm-prompt-button.deny {
	background: transparent;
	color: #d2d2d2;
	border-color: #3a3a3a;
}
.nightmare-perm-prompt-button.deny:hover {
	background: #2a2a2a;
}
.nightmare-perm-prompt-button.allow {
	background: #3478f6;
	color: #ffffff;
}
.nightmare-perm-prompt-button.allow:hover {
	background: #2c63cf;
}
`;

function ensureStyles(): void {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = STYLES;
	document.head.appendChild(style);
}

export class PermissionPrompt {
	ask(req: PermissionPromptRequest): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			ensureStyles();

			const perms = req.permissions ?? [];
			const origins = req.origins ?? [];

			const backdrop = document.createElement('div');
			backdrop.className = 'nightmare-perm-prompt-backdrop';

			const modal = document.createElement('div');
			modal.className = 'nightmare-perm-prompt';
			modal.setAttribute('role', 'dialog');
			modal.setAttribute('aria-modal', 'true');

			const header = document.createElement('div');
			header.className = 'nightmare-perm-prompt-header';
			header.textContent = `Extension "${req.extensionName}" wants additional permissions`;
			modal.appendChild(header);

			const body = document.createElement('div');
			body.className = 'nightmare-perm-prompt-body';

			if (perms.length > 0) {
				const section = document.createElement('div');
				section.className = 'nightmare-perm-prompt-section';
				const h = document.createElement('h4');
				h.textContent = 'API permissions';
				section.appendChild(h);
				const ul = document.createElement('ul');
				ul.className = 'nightmare-perm-prompt-list';
				for (const p of perms) {
					const li = document.createElement('li');
					li.textContent = p;
					ul.appendChild(li);
				}
				section.appendChild(ul);
				body.appendChild(section);
			}

			if (origins.length > 0) {
				const section = document.createElement('div');
				section.className = 'nightmare-perm-prompt-section';
				const h = document.createElement('h4');
				h.textContent = 'Host access';
				section.appendChild(h);
				const ul = document.createElement('ul');
				ul.className = 'nightmare-perm-prompt-list';
				for (const o of origins) {
					const li = document.createElement('li');
					li.textContent = o;
					ul.appendChild(li);
				}
				section.appendChild(ul);
				body.appendChild(section);
			}

			if (perms.length === 0 && origins.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'nightmare-perm-prompt-section';
				empty.textContent = 'This extension is requesting no additional permissions.';
				body.appendChild(empty);
			}

			modal.appendChild(body);

			const footer = document.createElement('div');
			footer.className = 'nightmare-perm-prompt-footer';

			const denyBtn = document.createElement('button');
			denyBtn.className = 'nightmare-perm-prompt-button deny';
			denyBtn.type = 'button';
			denyBtn.textContent = 'Deny';

			const allowBtn = document.createElement('button');
			allowBtn.className = 'nightmare-perm-prompt-button allow';
			allowBtn.type = 'button';
			allowBtn.textContent = 'Allow';

			footer.appendChild(denyBtn);
			footer.appendChild(allowBtn);
			modal.appendChild(footer);

			backdrop.appendChild(modal);

			let settled = false;
			const finish = (result: boolean): void => {
				if (settled) return;
				settled = true;
				try { backdrop.remove(); } catch { /* ignore */ }
				resolve(result);
			};

			denyBtn.addEventListener('click', () => finish(false));
			allowBtn.addEventListener('click', () => finish(true));
			backdrop.addEventListener('click', e => {
				if (e.target === backdrop) finish(false);
			});
			const keyHandler = (e: KeyboardEvent): void => {
				if (e.key === 'Escape') {
					document.removeEventListener('keydown', keyHandler);
					finish(false);
				} else if (e.key === 'Enter') {
					document.removeEventListener('keydown', keyHandler);
					finish(true);
				}
			};
			document.addEventListener('keydown', keyHandler);

			document.body.appendChild(backdrop);
			setTimeout(() => { try { allowBtn.focus(); } catch { /* ignore */ } }, 0);
		});
	}
}

export { PermissionPrompt as default };
