// Reproducible local Windows video runtime, linked from FFmpeg's official download page.
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
if (process.platform !== "win32")
  throw Error(
    "Install current FFmpeg and ffprobe with your system package manager; Docker includes them.",
  );
const url =
    "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip",
  expected = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
const destination = resolve("tools/ffmpeg"),
  archive = join(destination, "release.zip");
await mkdir(destination, { recursive: true });
const r = await fetch(url, { signal: AbortSignal.timeout(600000) });
if (!r.ok) throw Error("FFmpeg download failed");
await pipeline(Readable.fromWeb(r.body), createWriteStream(archive));
const hash = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
if (hash !== expected) throw Error("FFmpeg release checksum mismatch");
await promisify(execFile)(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve("scripts/unpack-video.ps1"),
    "-Archive",
    archive,
    "-Destination",
    destination,
  ],
  { windowsHide: true, timeout: 60000 },
);
await writeFile(
  join(destination, "SOURCE.txt"),
  url + "\nSHA256 " + hash + "\n",
);
await unlink(archive);
console.log("FFmpeg 9.0.2 and ffprobe ready; release checksum verified.");
