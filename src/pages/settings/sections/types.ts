// Shared types for settings section modules.
export interface SectionContext {
  subpage?: string;
}

export interface SectionModule {
  render(container: HTMLElement, ctx: SectionContext): Promise<void>;
  unmount?(): void;
}
