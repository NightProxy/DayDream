interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

export class BootReadiness {
  private _shell = deferred();
  private _settings = deferred();
  private _proxy = deferred();
  private _extensions = deferred();

  get shell(): Promise<void> { return this._shell.promise; }
  get settings(): Promise<void> { return this._settings.promise; }
  get proxy(): Promise<void> { return this._proxy.promise; }
  get extensions(): Promise<void> { return this._extensions.promise; }

  resolveShell(): void { this._shell.resolve(); }
  resolveSettings(): void { this._settings.resolve(); }
  resolveProxy(): void { this._proxy.resolve(); }
  resolveExtensions(): void { this._extensions.resolve(); }
}
