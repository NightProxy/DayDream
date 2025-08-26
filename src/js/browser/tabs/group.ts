import { Logger } from "@apis/logging";

interface TabGroup {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
  tabIds: string[];
}

export class TabGroupManager {
  private tabs: any;
  private logger: Logger;
  private groupColors: string[] = [
    "#EF4444",
    "#F97316",
    "#EAB308",
    "#22C55E",
    "#06B6D4",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
  ];

  constructor(tabs: any) {
    this.tabs = tabs;
    this.logger = new Logger();
  }

  get allGroups(): TabGroup[] {
    return this.tabs.groups;
  }

  renameGroup(groupId: string, newName?: string): boolean {
    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return false;

    const name = newName || prompt("Enter new group name:", group.name);
    if (name && name !== group.name) {
      group.name = name;
      this.tabs.layoutTabs();
      this.logger.createLog(`Renamed group to "${name}"`);
      return true;
    }
    return false;
  }

  changeGroupColor(groupId: string, color: string): boolean {
    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return false;

    group.color = color;
    this.tabs.layoutTabs();
    this.logger.createLog(`Changed group "${group.name}" color to ${color}`);
    return true;
  }

  ungroupAllTabs(groupId: string): boolean {
    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return false;

    group.tabIds.forEach((tabId: string) => {
      const tab = this.tabs.tabs.find((t: any) => t.id === tabId);
      if (tab) {
        delete tab.groupId;
      }
    });

    this.tabs.groups = this.tabs.groups.filter((g: any) => g.id !== groupId);
    this.tabs.layoutTabs();
    this.logger.createLog(`Ungrouped all tabs from "${group.name}"`);
    return true;
  }

  deleteGroup(groupId: string): boolean {
    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return false;

    if (confirm(`Delete group "${group.name}" and all its tabs?`)) {
      group.tabIds.forEach((tabId: string) => {
        this.tabs.closeTabById(tabId);
      });

      this.tabs.groups = this.tabs.groups.filter((g: any) => g.id !== groupId);
      this.tabs.layoutTabs();
      this.logger.createLog(`Deleted group "${group.name}"`);
      return true;
    }
    return false;
  }

  createGroupWithTab(tabId: string, groupName?: string): string | null {
    const name = groupName || prompt("Enter group name:");
    if (!name) return null;

    const groupId = `group-${Date.now()}`;
    const color =
      this.groupColors[this.tabs.groups.length % this.groupColors.length];

    const newGroup: TabGroup = {
      id: groupId,
      name: name,
      color: color,
      isCollapsed: false,
      tabIds: [tabId],
    };

    this.tabs.groups.push(newGroup);

    const tab = this.tabs.tabs.find((t: any) => t.id === tabId);
    if (tab) {
      tab.groupId = groupId;
      if (this.tabs.isPinned(tabId)) {
        this.tabs.ui.setState(tabId, "normal");
      }
    }

    this.tabs.layoutTabs();
    this.logger.createLog(`Created group "${name}" with tab ${tabId}`);
    return groupId;
  }

  addTabToGroup(tabId: string, groupId: string): boolean {
    const tab = this.tabs.tabs.find((t: any) => t.id === tabId);
    const group = this.tabs.groups.find((g: any) => g.id === groupId);

    if (!tab || !group) return false;

    if (tab.groupId && tab.groupId !== groupId) {
      this.removeTabFromGroup(tabId);
    }

    tab.groupId = groupId;
    if (!group.tabIds.includes(tabId)) {
      group.tabIds.push(tabId);
    }

    const tabElement = document.getElementById(tabId);
    if (tabElement) {
      tabElement.setAttribute("tab-group", groupId);
    }

    if (this.tabs.isPinned(tabId)) {
      this.tabs.ui.setState(tabId, "normal");
    }

    this.tabs.layoutTabs();
    this.logger.createLog(`Added tab ${tabId} to group ${group.name}`);
    return true;
  }

  removeTabFromGroup(tabId: string): boolean {
    const tab = this.tabs.tabs.find((t: any) => t.id === tabId);
    if (!tab || !tab.groupId) return false;

    const group = this.tabs.groups.find((g: any) => g.id === tab.groupId);
    if (group) {
      group.tabIds = group.tabIds.filter((id: string) => id !== tabId);

      if (group.tabIds.length === 0) {
        this.tabs.groups = this.tabs.groups.filter(
          (g: any) => g.id !== group.id,
        );
        this.logger.createLog(`Removed empty group ${group.name}`);
      }
    }

    delete tab.groupId;

    const tabElement = document.getElementById(tabId);
    if (tabElement) {
      tabElement.removeAttribute("tab-group");
    }

    this.tabs.layoutTabs();
    this.logger.createLog(`Removed tab ${tabId} from group`);
    return true;
  }

  toggleGroup(groupId: string): boolean {
    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return false;

    group.isCollapsed = !group.isCollapsed;
    this.tabs.layoutTabs();
    this.logger.createLog(
      `${group.isCollapsed ? "Collapsed" : "Expanded"} group ${group.name}`,
    );
    return true;
  }

  getTabGroup(tabId: string): TabGroup | null {
    const tab = this.tabs.tabs.find((t: any) => t.id === tabId);
    if (!tab?.groupId) return null;

    return this.tabs.groups.find((g: any) => g.id === tab.groupId) || null;
  }

  getGroupTabs(groupId: string): any[] {
    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return [];

    return this.tabs.tabs.filter((t: any) => t.groupId === groupId);
  }
}
