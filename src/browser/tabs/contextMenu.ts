import type { TabsInterface } from './types';

export class TabContextMenu {
	private tabs: TabsInterface;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	private getRightClickMenu() {
		return (
			this.tabs.ui?.rightclickmenu ??
			this.tabs.ui?.np?.rightclickmenu ??
			this.tabs.nightmarePlugins?.rightclickmenu
		);
	}

	private closeContextMenu() {
		this.getRightClickMenu()?.closeMenu();
	}

	setupTabContextMenu = (tabElement: HTMLElement, tabId: string) => {
		const tab = this.tabs.getTabById(tabId);
		if (!tab) return this.tabs.ui.createElement('div');

		const menuItems = [];

		const isPinned = this.tabs.pinManager?.isPinned
			? this.tabs.pinManager.isPinned(tabId)
			: this.tabs.isTabPinned(tabId);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: async () => {
						await this.tabs.createTabToRight(
							tabId,
							'ddx://newtab/'
						);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'plus-square',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, [
						'New Tab to the Right'
					])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 opacity-60 cursor-not-allowed w-full text-left text-sm rounded-md',
					disabled: true
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'columns-2',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, [
						'Add Tab to New Split View'
					])
				]
			)
		);

		if (!tab.groupId) {
			menuItems.push(
				this.tabs.ui.createElement(
					'button',
					{
						class: 'flex items-start gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
						onclick: () => {
							this.tabs.groupManager?.createGroupWithTab(tabId);
							this.closeContextMenu();
						}
					},
					[
						this.tabs.ui.createElement(
							'i',
							{
								'data-lucide': 'folder-plus',
								class: 'h-4 w-4'
							},
							[]
						),
						this.tabs.ui.createElement('span', {}, [
							'Add to New Group'
						])
					]
				)
			);

			if (this.tabs.getGroups().length > 0) {
				const groupSubmenu = this.tabs.ui.createElement(
					'div',
					{ class: 'relative group' },
					[
						this.tabs.ui.createElement(
							'button',
							{
								class: 'flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md'
							},
							[
								this.tabs.ui.createElement(
									'div',
									{ class: 'flex items-center gap-3' },
									[
										this.tabs.ui.createElement(
											'i',
											{
												'data-lucide': 'folder',
												class: 'h-4 w-4'
											},
											[]
										),
										this.tabs.ui.createElement('span', {}, [
											'Add to Group'
										])
									]
								),
								this.tabs.ui.createElement(
									'i',
									{
										'data-lucide': 'chevron-right',
										class: 'h-3 w-3'
									},
									[]
								)
							]
						),
						this.tabs.ui.createElement(
							'div',
							{
								class: 'absolute left-full top-0 ml-1 min-w-48 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50'
							},
							this.tabs.getGroups().map((group: any) =>
								this.tabs.ui.createElement(
									'button',
									{
										class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm',
										onclick: () => {
											this.tabs.groupManager?.addTabToGroup(
												tabId,
												group.id
											);
											this.closeContextMenu();
										}
									},
									[
										this.tabs.ui.createElement('span', {
											class: 'w-3 h-3 rounded-full',
											style: `background-color: ${group.color};`
										}),
										this.tabs.ui.createElement('span', {}, [
											group.name
										])
									]
								)
							)
						)
					]
				);
				menuItems.push(groupSubmenu);
			}
		} else if (tab.groupId) {
			menuItems.push(
				this.tabs.ui.createElement('div', {
					class: 'h-px bg-[var(--white-08)] my-1'
				})
			);

			const currentGroup = this.tabs
				.getGroups()
				.find((g: any) => g.id === tab.groupId);

			menuItems.push(
				this.tabs.ui.createElement(
					'button',
					{
						class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
						onclick: () => {
							this.tabs.groupManager?.removeTabFromGroup(tabId);
							this.closeContextMenu();
						}
					},
					[
						this.tabs.ui.createElement(
							'i',
							{
								'data-lucide': 'folder-x',
								class: 'h-4 w-4'
							},
							[]
						),
						this.tabs.ui.createElement('span', {}, [
							`Remove from ${currentGroup?.name || 'Group'}`
						])
					]
				)
			);

			const otherGroups = this.tabs
				.getGroups()
				.filter((g: any) => g.id !== tab.groupId);
			if (otherGroups.length > 0) {
				const moveToGroupSubmenu = this.tabs.ui.createElement(
					'div',
					{ class: 'relative group' },
					[
						this.tabs.ui.createElement(
							'button',
							{
								class: 'flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md'
							},
							[
								this.tabs.ui.createElement(
									'div',
									{ class: 'flex items-center gap-3' },
									[
										this.tabs.ui.createElement(
											'i',
											{
												'data-lucide': 'folder-input',
												class: 'h-4 w-4'
											},
											[]
										),
										this.tabs.ui.createElement('span', {}, [
											'Move to Group'
										])
									]
								),
								this.tabs.ui.createElement(
									'i',
									{
										'data-lucide': 'chevron-right',
										class: 'h-3 w-3'
									},
									[]
								)
							]
						),
						this.tabs.ui.createElement(
							'div',
							{
								class: 'absolute left-full top-0 ml-1 min-w-48 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50'
							},
							otherGroups.map((group: any) =>
								this.tabs.ui.createElement(
									'button',
									{
										class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm',
										onclick: () => {
											this.tabs.groupManager?.addTabToGroup(
												tabId,
												group.id
											);
											this.closeContextMenu();
										}
									},
									[
										this.tabs.ui.createElement('span', {
											class: 'w-3 h-3 rounded-full',
											style: `background-color: ${group.color};`
										}),
										this.tabs.ui.createElement('span', {}, [
											group.name
										])
									]
								)
							)
						)
					]
				);
				menuItems.push(moveToGroupSubmenu);
			}

			if (currentGroup) {
				menuItems.push(
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.renameGroup(
									currentGroup.id
								);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'edit-3',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Rename Group'
							])
						]
					)
				);

				const colorSubmenu = this.tabs.ui.createElement(
					'div',
					{ class: 'relative group' },
					[
						this.tabs.ui.createElement(
							'button',
							{
								class: 'flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md'
							},
							[
								this.tabs.ui.createElement(
									'div',
									{ class: 'flex items-center gap-3' },
									[
										this.tabs.ui.createElement(
											'i',
											{
												'data-lucide': 'palette',
												class: 'h-4 w-4'
											},
											[]
										),
										this.tabs.ui.createElement('span', {}, [
											'Change Color'
										])
									]
								),
								this.tabs.ui.createElement(
									'i',
									{
										'data-lucide': 'chevron-right',
										class: 'h-3 w-3'
									},
									[]
								)
							]
						),
						this.tabs.ui.createElement(
							'div',
							{
								class: 'absolute left-full top-0 ml-1 min-w-32 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50'
							},
							[
								'#EF4444',
								'#F97316',
								'#EAB308',
								'#22C55E',
								'#06B6D4',
								'#3B82F6',
								'#8B5CF6',
								'#EC4899'
							].map(color =>
								this.tabs.ui.createElement(
									'button',
									{
										class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left',
										onclick: () => {
											this.tabs.groupManager?.changeGroupColor(
												currentGroup.id,
												color
											);
											this.closeContextMenu();
										}
									},
									[
										this.tabs.ui.createElement('span', {
											class: 'w-4 h-4 rounded-full border border-[var(--white-08)]',
											style: `background-color: ${color};`
										}),
										this.tabs.ui.createElement(
											'span',
											{ class: 'text-xs' },
											[color.toUpperCase()]
										)
									]
								)
							)
						)
					]
				);
				menuItems.push(colorSubmenu);

				menuItems.push(
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.toggleGroupCollapse(
									currentGroup.id
								);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': currentGroup.isCollapsed
										? 'folder-open'
										: 'folder-closed',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								currentGroup.isCollapsed
									? 'Expand Group'
									: 'Collapse Group'
							])
						]
					)
				);

				menuItems.push(
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								if (
									confirm(
										`Close all tabs in "${currentGroup.name}"?`
									)
								) {
									this.tabs.closeAllTabsInGroup?.(
										currentGroup.id
									);
								}
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'folder-x',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Close All Tabs in Group'
							])
						]
					)
				);

				menuItems.push(
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.ungroupAllTabs(
									currentGroup.id
								);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'folder-open',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Ungroup All Tabs'
							])
						]
					)
				);

				menuItems.push(
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.deleteGroup(
									currentGroup.id
								);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'trash-2',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Delete Group'
							])
						]
					)
				);
			}
		}

		menuItems.push(
			this.tabs.ui.createElement('div', {
				class: 'h-px bg-[var(--white-08)] my-1'
			})
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: () => {
						this.tabs.pinManager?.togglePin(tabId);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': isPinned ? 'pin-off' : 'pin',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, [
						isPinned ? 'Unpin Tab' : 'Pin Tab'
					])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: () => {
						this.tabs.duplicateTab(tabId);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'copy',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, ['Duplicate Tab'])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: () => {
						this.tabs.refreshTab(tabId);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'refresh-cw',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, ['Refresh Tab'])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: () => {
						this.tabs.closeTabsToRight(tabId);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'arrow-right',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, [
						'Close Tabs to the Right'
					])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: () => {
						const tabElement = document.getElementById(tabId);
						let title = tab.url;

						if (tabElement) {
							const titleEl = tabElement.querySelector(
								'.tab-title, [data-tab-title]'
							);
							if (titleEl?.textContent) {
								title = titleEl.textContent.trim();
							} else if (tab.iframe?.contentDocument?.title) {
								title = tab.iframe.contentDocument.title;
							} else {
								try {
									const url = new URL(tab.url);
									title = url.hostname || tab.url;
								} catch {
									title = tab.url;
								}
							}
						}

						this.tabs.bookmarkUI.addBookmarkFromProxiedUrl(
							tab.url,
							title
						);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'bookmark-plus',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, ['Bookmark Tab'])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement('div', {
				class: 'h-px bg-[var(--white-08)] my-1'
			})
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
					onclick: async () => {
						await this.tabs.closeOtherTabs(tabId);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'panel-right-close',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, ['Close Other Tabs'])
				]
			)
		);

		menuItems.push(
			this.tabs.ui.createElement(
				'button',
				{
					class: 'flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md',
					onclick: () => {
						this.tabs.closeTabById(tabId);
						this.closeContextMenu();
					}
				},
				[
					this.tabs.ui.createElement(
						'i',
						{
							'data-lucide': 'x',
							class: 'h-4 w-4'
						},
						[]
					),
					this.tabs.ui.createElement('span', {}, ['Close Tab'])
				]
			)
		);

		const menu = this.tabs.ui.createElement(
			'div',
			{
				class: 'fixed z-50 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 min-w-48',
				style: 'backdrop-filter: blur(8px);'
			},
			menuItems
		);

		this.initializeLucideIcons(menu);

		const rightClickMenu = this.getRightClickMenu();
		if (!rightClickMenu) return;

		rightClickMenu.attachTo(tabElement, () => {
			return menu;
		});
	};

	private initializeLucideIcons(container: HTMLElement) {
		if (typeof window !== 'undefined' && (window as any).lucide) {
			try {
				const icons = container.querySelectorAll('[data-lucide]');
				if (icons.length > 0) {
					(window as any).lucide.createIcons({
						nameAttr: 'data-lucide',
						icons: (window as any).lucide.icons
					});
				}
			} catch (error) {
				console.warn('Failed to initialize Lucide icons:', error);
			}
		}
	}

	setupGroupHeaderContextMenu = (
		groupHeader: HTMLElement,
		groupId: string
	) => {
		const rightClickMenu = this.getRightClickMenu();
		if (!rightClickMenu) return;

		rightClickMenu.attachTo(groupHeader, () => {
			const group = this.tabs.getGroupById(groupId);
			if (!group) return this.tabs.ui.createElement('div');
			const colorOptions = [
				'#d4d6dc',
				'#82aef2',
				'#f27d7d',
				'#f2d66d',
				'#7cd899',
				'#d588e8',
				'#a974de',
				'#67c6d8',
				'#f2a45f'
			];

			const nameInput = this.tabs.ui.createElement(
				'input',
				{
					type: 'text',
					value: group.name,
					placeholder: 'Name this group',
					class: 'group-menu-name-input',
					onchange: (event: Event) => {
						const nextName = (
							(event.target as HTMLInputElement).value || ''
						).trim();
						if (nextName) {
							this.tabs.groupManager?.renameGroup(
								groupId,
								nextName
							);
						}
					}
				},
				[]
			);

			const colorRow = this.tabs.ui.createElement(
				'div',
				{ class: 'group-menu-color-row' },
				colorOptions.map(color =>
					this.tabs.ui.createElement(
						'button',
						{
							class: `group-menu-color-dot ${
								group.color.toLowerCase() ===
								color.toLowerCase()
									? 'is-active'
									: ''
							}`,
							title: color,
							style: `--group-color-dot:${color};`,
							onclick: () => {
								this.tabs.groupManager?.changeGroupColor(
									groupId,
									color
								);
								this.closeContextMenu();
							}
						},
						[]
					)
				)
			);

			const menu = this.tabs.ui.createElement(
				'div',
				{
					class: 'fixed z-50 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 min-w-64 group-header-context-menu',
					style: 'backdrop-filter: blur(8px);'
				},
				[
					this.tabs.ui.createElement('div', { class: 'px-3 pb-2' }, [
						nameInput,
						colorRow
					]),
					this.tabs.ui.createElement('div', {
						class: 'h-px bg-[var(--white-08)] my-1'
					}),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
							onclick: async () => {
								const createdTabId =
									await this.tabs.createTab('ddx://newtab/');
								if (createdTabId) {
									this.tabs.groupManager?.addTabToGroup(
										createdTabId,
										groupId
									);
								}
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'square-plus',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'New tab in group'
							])
						]
					),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 opacity-60 cursor-not-allowed w-full text-left text-sm rounded-md',
							disabled: true
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'panel-right',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Move group to new window'
							])
						]
					),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.renameGroup(groupId);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{ 'data-lucide': 'edit-3', class: 'h-4 w-4' },
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Rename Group'
							])
						]
					),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.toggleGroupCollapse(
									groupId
								);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': group.isCollapsed
										? 'folder-open'
										: 'folder-closed',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								group.isCollapsed
									? 'Expand Group'
									: 'Collapse Group'
							])
						]
					),
					this.tabs.ui.createElement('div', {
						class: 'h-px bg-[var(--white-08)] my-1'
					}),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.ungroupAllTabs(groupId);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{
									'data-lucide': 'square-arrow-out-up-right',
									class: 'h-4 w-4'
								},
								[]
							),
							this.tabs.ui.createElement('span', {}, ['Ungroup'])
						]
					),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md',
							onclick: async () => {
								await this.tabs.groupManager?.closeAllTabsInGroup(
									groupId
								);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{ 'data-lucide': 'folder-x', class: 'h-4 w-4' },
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Close All Tabs in Group'
							])
						]
					),
					this.tabs.ui.createElement('div', {
						class: 'h-px bg-[var(--white-08)] my-1'
					}),
					this.tabs.ui.createElement(
						'button',
						{
							class: 'flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md',
							onclick: () => {
								this.tabs.groupManager?.deleteGroup(groupId);
								this.closeContextMenu();
							}
						},
						[
							this.tabs.ui.createElement(
								'i',
								{ 'data-lucide': 'trash-2', class: 'h-4 w-4' },
								[]
							),
							this.tabs.ui.createElement('span', {}, [
								'Delete Group'
							])
						]
					)
				]
			);

			this.initializeLucideIcons(menu);
			return menu;
		});
	};
}
