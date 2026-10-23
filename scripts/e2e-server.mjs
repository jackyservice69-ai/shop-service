// Isolated in-memory environment. Never loads .env or contacts external providers.
import { fixture, slip, PASSWORD } from "../tests/helpers.mjs";
const f = fixture({
  // In-memory functional tests generate more traffic than one real browser session.
  apiRateLimit: 3000,
  origin: "http://127.0.0.1:4319",
  fetch: async (url, options) => {
    if (url.includes("/verify/bank"))
      return Response.json({
        success: true,
        data: slip(Number(options.body.get("matchAmount"))),
      });
    throw new Error("External network disabled in browser tests");
  },
});
f.db
  .prepare("UPDATE users SET email='admin@e2e.test' WHERE id=?")
  .run(f.admin.id);
const server = f.app.listen(4319, "127.0.0.1", () =>
  console.log("E2E isolated server ready"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      f.db.close();
      process.exit(0);
    }),
  );
