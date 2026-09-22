import { renameSync, writeFileSync } from "node:fs";

// Write-then-rename, so a crash or power cut mid-write (foundry isn't UPS-backed) leaves the old
// file intact instead of a truncated one -- a corrupt budget file loads as "start fresh", which
// would hand every IP a free quota reset.
export function writeFileAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
