import type { OmniboxRow, OmniboxSection } from './types';

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function rowHtml(row: OmniboxRow, isSelected: boolean): string {
	const selectedClass = isSelected
		? 'bg-[var(--white-05)]'
		: 'hover:bg-[var(--white-05)]';
	const iconHtml = row.icon
		? `<i data-lucide="${escapeHtml(row.icon)}" class="h-4 w-4 text-[var(--proto)] flex-shrink-0"></i>`
		: '';
	const sublabelHtml = row.sublabel
		? `<div class="text-xs text-[var(--proto)] truncate">${escapeHtml(row.sublabel)}</div>`
		: '';
	const rightHintHtml = row.rightHint
		? `<div class="ml-auto text-xs text-[var(--proto)] flex-shrink-0">${escapeHtml(row.rightHint)}</div>`
		: '';
	return `
		<div class="omnibox-row flex items-center gap-3 px-3 py-2 cursor-pointer ${selectedClass}" data-row-id="${escapeHtml(row.id)}">
			${iconHtml}
			<div class="flex-1 min-w-0">
				<div class="text-sm text-[var(--text)] truncate">${escapeHtml(row.label)}</div>
				${sublabelHtml}
			</div>
			${rightHintHtml}
		</div>
	`;
}

export function sectionHtml(section: OmniboxSection, selectedRowId: string | null): string {
	if (section.rows.length === 0) return '';
	const iconHtml = section.icon
		? `<i data-lucide="${escapeHtml(section.icon)}" class="h-3.5 w-3.5"></i>`
		: '';
	const moreHtml = section.hasMore
		? `<button class="omnibox-show-all text-xs text-[var(--proto)] hover:text-[var(--text)] px-3 py-1" data-section-id="${escapeHtml(section.id)}">Show all →</button>`
		: '';
	const rowsHtml = section.rows
		.map((row) => rowHtml(row, row.id === selectedRowId))
		.join('');
	return `
		<div class="omnibox-section" data-section-id="${escapeHtml(section.id)}">
			<div class="flex items-center gap-2 px-3 py-1 text-xs text-[var(--proto)] uppercase tracking-wide">
				${iconHtml}
				<span>${escapeHtml(section.title)}</span>
			</div>
			${rowsHtml}
			${moreHtml}
		</div>
	`;
}
