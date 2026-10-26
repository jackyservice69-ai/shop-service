import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

// Read-only source connection: never open the application or worker before the
// versioned snapshot is complete. A failed backup blocks the release.
export async function backupBeforeMigration(databasePath, targetVersion = 16) {
  if (databasePath === ":memory:" || !existsSync(databasePath)) return null;
  const source = new DatabaseSync(databasePath, { readOnly: true });
  let target;
  try {
    const version = source.prepare("PRAGMA user_version").get().user_version;
    if (version >= targetVersion) return null;
    const directory = join(dirname(databasePath), "backups");
    mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    target = join(
      directory,
      `before-schema-${version}-to-${targetVersion}-${stamp}.sqlite`,
    );
    await backup(source, target);
    const snapshot = new DatabaseSync(target);
    try {
      snapshot.exec("PRAGMA journal_mode=DELETE");
      if (snapshot.prepare("PRAGMA quick_check").get().quick_check !== "ok")
        throw new Error("Pre-migration snapshot integrity check failed");
      if (
        snapshot.prepare("PRAGMA user_version").get().user_version !== version
      )
        throw new Error("Pre-migration snapshot version changed");
    } finally {
      snapshot.close();
    }
    return target;
  } catch (error) {
    if (target)
      for (const suffix of ["", "-wal", "-shm"])
        if (existsSync(target + suffix)) unlinkSync(target + suffix);
    throw error;
  } finally {
    source.close();
  }
}
