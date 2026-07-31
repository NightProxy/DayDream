export interface SectionContext {
  subpage?: string;
}

export interface SectionModule {
  render(container: HTMLElement, ctx: SectionContext): Promise<void>;
  unmount?(): void;
}
