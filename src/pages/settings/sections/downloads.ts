// src/pages/settings/sections/downloads.ts
//
// Downloads section. Three rows on the main view:
//   - Download location (display + Change button stub — no real picker yet)
//   - Ask where to save each file (persisted toggle)
//   - Show download shelf (persisted toggle, also live-updates the
//     `window.downloadShelf` controller via `setAutoShow`)
//
// The actual downloads list lives on its own page (ddx://downloads/);
// this section only houses user-facing preferences.

import { createRow } from "../components/row";
import { createToggle } from "../components/toggle";
import { getHost } from "../data/host";

export async function render(container: HTMLElement): Promise<void> {
	container.innerHTML = "";
	const section = document.createElement("div");
	section.className = "settings-section";
	section.dataset.sectionId = "downloads";

	const h2 = document.createElement("h2");
	h2.className = "settings-section-title";
	h2.textContent = "Downloads";
	section.appendChild(h2);

	section.appendChild(
		createRow({
			icon: "folder",
			label: "Download location",
			description: "Where files are saved by default.",
			right: {
				kind: "button",
				text: "Change",
				onClick: () => {
					/* placeholder — no real picker yet */
				},
				variant: "ghost",
			},
			noHover: true,
			searchUnit: {
				id: "downloads/location",
				label: "Download location",
				sectionId: "downloads",
				keywords: ["folder", "save"],
			},
		}),
	);

	// "Ask where to save" — unprefixed key (no runtime consumer yet).
	const askToggle = createToggle({
		icon: "help-circle",
		label: "Ask where to save each file",
		description: "Show a save dialog every time you download something.",
		settingKey: "downloadAskLocation",
		defaultValue: false,
		searchUnit: {
			id: "downloads/ask",
			label: "Ask where to save each file",
			sectionId: "downloads",
		},
	});
	section.appendChild(askToggle.element);

	// "Show download shelf" — KEEP `settings.` prefix to match runtime reader
	// at src/browser/downloads/shelf.ts:94 (`api.getItem('settings.downloadShelfAutoShow')`).
	// Also live-update the shelf controller via setAutoShow on change.
	const shelfToggle = createToggle({
		icon: "panel-bottom",
		label: "Show download shelf",
		description:
			"Automatically display the download shelf when a file starts downloading.",
		settingKey: "settings.downloadShelfAutoShow",
		defaultValue: true,
		onChange: (value) => {
			try {
				const shelf = (getHost() as any).downloadShelf;
				if (shelf?.setAutoShow) shelf.setAutoShow(value);
			} catch {
				/* host not ready — persistence already happened, shelf will pick it up on next install() */
			}
		},
		searchUnit: {
			id: "downloads/shelf",
			label: "Show download shelf",
			sectionId: "downloads",
		},
	});
	section.appendChild(shelfToggle.element);

	container.appendChild(section);
}
