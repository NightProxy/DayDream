import { NightFS } from "./fs";
import type {
  StorageWorkerErrorKind,
  StorageWorkerRequest,
  StorageWorkerResponse,
} from "./storageWorkerProtocol";
import {
  StorageWorkerService,
  type StorageFileSystem,
} from "./storageWorkerService";

const TRANSPORT_ERROR_NAMES = new Set([
  'NoModificationAllowedError',
  'NotAllowedError',
  'QuotaExceededError',
  'InvalidStateError',
  'AbortError',
  'SecurityError',
  'NotReadableError',
  'InvalidModificationError',
]);

function classifyError(error: unknown): { message: string; kind: StorageWorkerErrorKind } {
  const message = error instanceof Error ? error.message : String(error);
  const name = (error as { name?: string } | null | undefined)?.name;
  if (name && TRANSPORT_ERROR_NAMES.has(name)) {
    return { message, kind: 'transport' };
  }
  if (/\bstorage\b|\bfilesystem\b|\bopfs\b|\bbucket\b|opendb|unsafe for access|too many calls/i.test(message)) {
    return { message, kind: 'transport' };
  }
  return { message, kind: 'service' };
}

const nfs = new NightFS();
const fileSystem = nfs.init.then(
  () => nfs.core.fs as unknown as StorageFileSystem,
);
const service = new StorageWorkerService(fileSystem);
const workerScope = self as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<StorageWorkerRequest>) => void,
  ): void;
  postMessage(response: StorageWorkerResponse): void;
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  void service.execute(request).then(
    (value) => workerScope.postMessage({ id: request.id, ok: true, value }),
    (error: unknown) => {
      const { message, kind } = classifyError(error);
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error: message,
        errorKind: kind,
      });
    },
  );
});
