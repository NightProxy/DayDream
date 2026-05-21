// Local type shim for @terbiumos/tfs (and its /browser entrypoint).
//
// Why this exists:
// The upstream package ships a `lib/index.d.ts` that re-exports types from
// `../src/index` — i.e. from its own `.ts` source files. Those source files
// have a handful of type errors that `skipLibCheck` does not suppress
// (skipLibCheck only skips `.d.ts` files, not `.ts` files pulled in via
// type re-exports). They also pull in a transitive dep (`stack-trace`) that
// has no type declarations.
//
// To unblock the build without forking the package, we declare just the
// surface we actually use, and route imports through this shim via
// tsconfig `paths` (see tsconfig.json). At runtime nothing changes — the
// real package is still resolved by Vite/Node — this only affects what
// `tsc` sees when type-checking.
//
// If we start using more of the package's API, extend this file
// accordingly.

// Node-style fs callback signatures used by our consumers.
type TFS_ErrCb = (err: Error | null) => void;
type TFS_ReadFileTextCb = (err: Error | null, data: string) => void;
type TFS_ReadFileBinaryCb = (
  err: Error | null,
  data: Uint8Array | ArrayBuffer,
) => void;
type TFS_ExistsCb = (exists: boolean) => void;

/**
 * Subset of TFS's internal FS class that our code actually calls. Mirrors
 * the legacy Filer-style callback API.
 */
export declare class FS {
  constructor(handle: FileSystemDirectoryHandle);

  exists(path: string, cb: TFS_ExistsCb): void;
  mkdir(path: string, cb: TFS_ErrCb): void;

  readFile(path: string, cb: TFS_ReadFileBinaryCb): void;
  readFile(path: string, encoding: "utf8", cb: TFS_ReadFileTextCb): void;

  writeFile(path: string, data: string | Uint8Array, cb: TFS_ErrCb): void;
  writeFile(
    path: string,
    data: string,
    encoding: "utf8",
    cb: TFS_ErrCb,
  ): void;

  appendFile(path: string, data: string, cb: TFS_ErrCb): void;
  appendFile(
    path: string,
    data: string,
    encoding: "utf8",
    cb: TFS_ErrCb,
  ): void;

  unlink(path: string, cb: TFS_ErrCb): void;

  readdir(
    path: string,
    options: Record<string, unknown>,
    cb: (err: Error | null, files: string[]) => void,
  ): void;
  readdir(
    path: string,
    cb: (err: Error | null, files: string[]) => void,
  ): void;
}

/** Instance type of FS — matches the alias exported by the real package. */
export type FSType = InstanceType<typeof FS>;

export declare class TFS {
  handle: FileSystemDirectoryHandle;
  fs: FS;
  constructor(handle: FileSystemDirectoryHandle);
  static init(): Promise<TFS>;
  static initSw(): void;
}

export type TFSType = InstanceType<typeof TFS>;
