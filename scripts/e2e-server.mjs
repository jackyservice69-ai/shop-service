// Isolated in-memory environment. Never loads .env or contacts external providers.
import { fixture, slip, PASSWORD } from "../tests/helpers.mjs";
import { bank } from "../tests/helpers.mjs";
import { branchAccounts, accountResponse } from "../tests/payment-data.mjs";
const f = fixture({
  // In-memory functional tests generate more traffic than one real browser session.
  apiRateLimit: 3000,
  authRateLimit: 100,
  origin: "http://127.0.0.1:4319",
  fetch: async (url, options) => {
    if (url.includes("/bank-accounts?"))
      return accountResponse(branchAccounts(bank));
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
