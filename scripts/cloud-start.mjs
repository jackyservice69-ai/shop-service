import "dotenv/config";
import { createServer } from "node:http";

// First deploy exposes no application or worker until the restored snapshot
// has been verified and the operator removes the migration flag and restarts.
if (process.env.CLOUD_MIGRATION_PENDING === "1") {
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const healthy = req.url === "/api/health";
    res.statusCode = healthy ? 200 : 503;
    if (!healthy) res.setHeader("Retry-After", "300");
    res.end(
      JSON.stringify(
        healthy
          ? { ok: true, mode: "migration" }
          : { error: "กำลังย้ายระบบ กรุณาลองใหม่ภายหลัง" },
      ),
    );
  }).listen(Number(process.env.PORT || 3002), "0.0.0.0");
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
  console.log("Cloud migration mode: application and LINE worker are stopped");
} else {
  await import("../server/index.mjs");
}
