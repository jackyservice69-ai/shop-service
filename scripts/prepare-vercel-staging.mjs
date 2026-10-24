import { mkdir, readdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";

// Upload only the compiled public site. Never package the repository, database,
// uploaded private media, environment files, OAuth credentials or test artifacts.
const source = resolve("dist");
const target = resolve("output", "vercel-staging", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(target, { recursive: true });
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Deploy input must not contain symlinks");
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) {
      const name = relative(source, path).replaceAll("\\", "/");
      if (name.split("/").some((part) => part.startsWith(".")) || /\.(sqlite|db|map|env|pem|key)$/i.test(name)) throw new Error(`Unexpected deploy file: ${name}`);
      const destination = join(target, name);
      await mkdir(resolve(destination, ".."), { recursive: true });
      await copyFile(path, destination);
      files.push(name);
    }
  }
}
await collect(source);
await mkdir(join(target, "_deployment"), { recursive: true });
await writeFile(join(target, "_deployment", "api-unavailable.json"), JSON.stringify({ error: "กำลังเตรียมฐานข้อมูลบนคลาวด์ หน้านี้ยังไม่เปิดรับรายการจริง" }));
await writeFile(join(target, "_deployment", "not-found.json"), JSON.stringify({ error: "Not found" }));
const config = {
  version: 2,
  builds: [{ src: "**", use: "@vercel/static" }],
  routes: [
    { src: "/.*", headers: {
      "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin", "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests"
    }, continue: true },
    { src: "/api(?:/.*)?", dest: "/_deployment/api-unavailable.json", status: 503, headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8" } },
    { src: "/(?:\\.env.*|\\.git(?:/.*)?|\\.secrets(?:/.*)?|data(?:/.*)?|server(?:/.*)?|tests(?:/.*)?)", dest: "/_deployment/not-found.json", status: 404 },
    { handle: "filesystem" },
    { src: "/.*", dest: "/index.html" }
  ]
};
await writeFile(join(target, "vercel.json"), JSON.stringify(config, null, 2));
files.push("_deployment/api-unavailable.json", "_deployment/not-found.json", "vercel.json");
const manifest = [];
for (const file of files) {
  const contents = await readFile(join(target, file));
  manifest.push({ file, size: contents.length, sha: createHash("sha1").update(contents).digest("hex") });
}
await writeFile(resolve("output", "vercel-staging-manifest.json"), JSON.stringify({ directory: target, files: manifest }, null, 2));
console.log(JSON.stringify({ directory: target, files: manifest.length, bytes: manifest.reduce((n, f) => n + f.size, 0), mode: "private frontend staging; API rejects writes until cloud migration is ready" }));
