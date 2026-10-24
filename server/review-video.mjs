import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  writeFile,
  readFile,
  unlink,
  rmdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fail } from "./commerce.mjs";
const run = promisify(execFile);
export const videoTools = (config) => ({
  ffmpeg:
    config?.ffmpegPath ||
    process.env.FFMPEG_PATH ||
    (process.platform === "win32"
      ? resolve("tools/ffmpeg/ffmpeg.exe")
      : "ffmpeg"),
  ffprobe:
    config?.ffprobePath ||
    process.env.FFPROBE_PATH ||
    (process.platform === "win32"
      ? resolve("tools/ffmpeg/ffprobe.exe")
      : "ffprobe"),
});
let encoding = false;
export async function sanitizeReviewVideo(buffer, config = {}) {
  if (encoding) fail(429, "กำลังตรวจวิดีโออีกรายการ กรุณาลองอีกครั้ง");
  encoding = true;
  let dir, source, output;
  const { ffmpeg, ffprobe } = videoTools(config);
  const probe = async (path) =>
    JSON.parse(
      (
        await run(
          ffprobe,
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-format_whitelist",
            "mov,matroska,webm",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            path,
          ],
          { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
        )
      ).stdout,
    );
  try {
    dir = await mkdtemp(join(tmpdir(), "hiewly-review-"));
    source = join(dir, "source.bin");
    output = join(dir, "clean.mp4");
    await writeFile(source, buffer);
    const info = await probe(source),
      v = info.streams?.find((s) => s.codec_type === "video");
    if (
      !v ||
      !v.width ||
      !v.height ||
      v.width > 3840 ||
      v.height > 3840 ||
      v.width * v.height > 8388608 ||
      Number(info.format?.duration) > 60
    )
      fail(
        422,
        "วิดีโอต้องมีภาพ ความยาวไม่เกิน 60 วินาที และความละเอียดไม่เกิน 4K",
      );
    await run(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-format_whitelist",
        "mov,matroska,webm",
        "-threads",
        "2",
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-t",
        "61",
        "-vf",
        "scale=1080:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-r",
        "24",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-maxrate",
        "2M",
        "-bufsize",
        "4M",
        "-threads",
        "2",
        "-filter_threads",
        "1",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-movflags",
        "+faststart",
        "-y",
        output,
      ],
      { timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    if ((await stat(output)).size > 25 * 1024 * 1024)
      fail(422, "วิดีโอหลังแปลงใหญ่เกิน 25 MB กรุณาลดความยาว");
    const clean = await probe(output),
      video = clean.streams.find((s) => s.codec_type === "video"),
      duration = Number(clean.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60.05)
      fail(422, "วิดีโอยาวเกิน 60 วินาทีหรืออ่านความยาวไม่ได้");
    return {
      body: await readFile(output),
      mime: "video/mp4",
      width: video.width,
      height: video.height,
      duration,
    };
  } catch (e) {
    if (e.status) throw e;
    if (e.code === "ENOENT")
      fail(
        503,
        "ระบบแปลงวิดีโอยังไม่พร้อม กรุณาแจ้งผู้ดูแลติดตั้ง FFmpeg/ffprobe",
      );
    fail(422, "ไฟล์วิดีโอเสียหายหรือไม่รองรับ ใช้ MP4/WebM ไม่เกิน 60 วินาที");
  } finally {
    for (const file of [source, output])
      if (file) await unlink(file).catch(() => {});
    if (dir) await rmdir(dir).catch(() => {});
    encoding = false;
  }
}
