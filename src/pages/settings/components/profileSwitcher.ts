import { createIcons, icons } from "lucide";
import { createAvatar } from "../data/profileAppearance";
import type { ProfileData } from "../../../apis/profiles/types";

export interface SwitcherEntry {
	id: string;
	/** Profile data. Required for profile entries (renders avatar); omit for generic entries. */
	data?: ProfileData | null;
	/** Click handler. Omit for `header` entries (non-clickable). */
	onClick?: () => void;
	danger?: boolean;
	disabled?: boolean;
	/** Lucide icon name (renders instead of avatar). */
	iconOnly?: string;
	/** Override display label. */
	label?: string;
	/** Small line under main label (e.g., Mullvad city detail). */
	sublabel?: string;
	/** Render as a non-clickable section header. */
	header?: boolean;
}

export function openSwitcherDropdown(
	anchor: HTMLElement,
	entries: SwitcherEntry[],
): { close: () => void } {
	const pop = document.createElement("div");
	pop.className = "profile-switcher-pop";

	for (const entry of entries) {
		if (entry.header) {
			const hd = document.createElement("div");
			hd.className = "ddx-switcher-header";
			hd.textContent = entry.label ?? entry.id;
			pop.appendChild(hd);
			continue;
		}

		const item = document.createElement("div");
		item.className = "switcher-item";
		if (entry.danger) item.classList.add("danger");
		if (entry.disabled) item.classList.add("disabled");

		if (entry.iconOnly) {
			const i = document.createElement("i");
			i.setAttribute("data-lucide", entry.iconOnly);
			item.appendChild(i);
		} else if (entry.data !== undefined) {
			item.appendChild(
				createAvatar(entry.id, entry.data?.appearance, { size: 22 }),
			);
		}

		const textWrap = document.createElement("div");
		textWrap.style.display = "flex";
		textWrap.style.flexDirection = "column";

		const label = document.createElement("span");
		label.textContent = entry.label ?? entry.id;
		textWrap.appendChild(label);

		if (entry.sublabel) {
			const sub = document.createElement("span");
			sub.style.fontSize = "11px";
			sub.style.color = "var(--text-70)";
			sub.textContent = entry.sublabel;
			textWrap.appendChild(sub);
		}

		item.appendChild(textWrap);

		if (entry.onClick) {
			item.addEventListener("click", () => {
				entry.onClick!();
				close();
			});
		}
		pop.appendChild(item);
	}

	// Position below anchor, right-aligned
	document.body.appendChild(pop);
	const rect = anchor.getBoundingClientRect();
	const popRect = pop.getBoundingClientRect();
	pop.style.top = `${rect.bottom + window.scrollY + 4}px`;
	pop.style.left = `${rect.right - popRect.width + window.scrollX}px`;

	function close() {
		pop.remove();
		document.removeEventListener("mousedown", onOutside, true);
		document.removeEventListener("keydown", onKey);
	}
	function onOutside(e: MouseEvent) {
		if (!pop.contains(e.target as Node) && e.target !== anchor) close();
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === "Escape") close();
	}
	setTimeout(() => {
		document.addEventListener("mousedown", onOutside, true);
		document.addEventListener("keydown", onKey);
	}, 0);

	queueMicrotask(() => createIcons({ icons }));
	return { close };
}
