import type { TabsInterface } from "./types";

export class TabLayout {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  get tabContentWidths() {
    const numberOfTabs = this.tabs.ui.queryComponentAll(
      "tab",
      this.tabs.el,
    ).length;
    const tabsContentWidth =
      this.tabs.el.querySelector(".tabs-content")!.clientWidth;
    const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * 1;
    const targetWidth =
      (tabsContentWidth - 2 * 9 + tabsCumulativeOverlappedWidth) / numberOfTabs;
    const clampedTargetWidth = Math.max(24, Math.min(240, targetWidth));
    const flooredClampedTargetWidth = Math.floor(clampedTargetWidth);
    const totalTabsWidthUsingTarget =
      flooredClampedTargetWidth * numberOfTabs +
      2 * 9 -
      tabsCumulativeOverlappedWidth;
    const totalExtraWidthDueToFlooring =
      tabsContentWidth - totalTabsWidthUsingTarget;

    const widths = [];
    let extraWidthRemaining = totalExtraWidthDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraWidth =
        flooredClampedTargetWidth < 240 && extraWidthRemaining > 0 ? 1 : 0;
      widths.push(flooredClampedTargetWidth + extraWidth);
    }

    return widths;
  }

  get tabContentPositions() {
    const positions: number[] = [];
    const tabContentWidths = this.tabContentWidths;

    let position = 9;
    tabContentWidths.forEach((width, i) => {
      const offset = i * 1;
      positions.push(position + 4 - offset);
      position += width;
    });

    return positions;
  }

  get tabPositions() {
    const positions: number[] = [];

    this.tabContentPositions.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  get tabContentHeights() {
    const numberOfTabs = this.tabs.ui.queryComponentAll(
      "tab",
      this.tabs.el,
    ).length;
    const tabsContentHeight =
      this.tabs.el.querySelector(".tabs-content")!.clientHeight;
    const tabsCumulativeOverlappedHeight = (numberOfTabs - 1) * 1;
    const targetHeight =
      (tabsContentHeight + tabsCumulativeOverlappedHeight) / numberOfTabs;
    const clampedTargetHeight = Math.max(24, Math.min(36, targetHeight));
    const flooredClampedTargetHeight = Math.floor(clampedTargetHeight);
    const totalTabsHeightUsingTarget =
      flooredClampedTargetHeight * numberOfTabs -
      tabsCumulativeOverlappedHeight;
    const totalExtraHeightDueToFlooring =
      tabsContentHeight - totalTabsHeightUsingTarget;

    const heights = [];
    let extraHeightRemaining = totalExtraHeightDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraHeight =
        flooredClampedTargetHeight < 36 && extraHeightRemaining > 0 ? 1 : 0;
      heights.push(flooredClampedTargetHeight + extraHeight);
    }

    return heights;
  }

  get tabContentPositionsY() {
    const positions: number[] = [];
    const tabContentHeights = this.tabContentHeights;

    let position = 9;
    tabContentHeights.forEach((height, i) => {
      const offset = i * 1;
      positions.push(position + 4 - offset);
      position += height;
    });

    return positions;
  }

  get tabPositionsY() {
    const positions: number[] = [];

    this.tabContentPositionsY.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  popGlow = (el: HTMLElement) => {
    el.style.transition = ".4s ease-out";
  };
}
