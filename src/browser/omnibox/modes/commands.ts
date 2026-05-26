import type { OmniboxRow, OmniboxSection } from '../types';
import type { CommandRegistry, Command } from '@apis/commands';

export interface CommandModeDeps {
	query: string;
	commands: CommandRegistry;
}

export interface CommandModeResult {
	sections: OmniboxSection[];
}

export function renderCommandMode(deps: CommandModeDeps): CommandModeResult {
	const { query, commands } = deps;
	const toRow = (cmd: Command): OmniboxRow => ({
		id: `cmd-${cmd.id}`,
		icon: cmd.icon,
		label: cmd.label,
		rightHint: cmd.shortcut,
		onSelect: () => commands.execute(cmd.id),
	});

	if (!query.trim()) {
		const grouped = commands.listByCategory();
		const sections: OmniboxSection[] = Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([category, cmds]) => ({
				id: `cmd-cat-${category}`,
				title: category,
				icon: cmds[0]?.icon,
				rows: cmds
					.sort((a, b) => a.label.localeCompare(b.label))
					.map(toRow),
			}));
		return { sections };
	}
	const matches = commands.find(query, 50);
	const rows = matches.map(toRow);
	if (rows.length === 0) return { sections: [] };
	return {
		sections: [{ id: 'cmd-results', title: 'Commands', icon: 'terminal', rows }],
	};
}
