import { hash } from "./db.mjs";

export function receivingAccountKey(s) {
  return hash(
    JSON.stringify(
      [s.bankCode, s.bankNumber, s.accountName, s.accountNameEn].map((value) =>
        String(value || "")
          .normalize("NFKC")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase(),
      ),
    ),
  );
}
export function currentPaymentQr(s, credentialHash) {
  return s.paymentQr &&
    s.paymentQrVerification?.version === 1 &&
    s.paymentQrVerification?.url === s.paymentQr &&
    s.paymentQrReceiver === receivingAccountKey(s) &&
    (credentialHash === undefined ||
      s.paymentQrVerification.credentialHash === credentialHash)
    ? s.paymentQr
    : "";
}

// Proofs are server-local and tied to the exact provider response object. JSON
// fields supplied by a client/provider cannot grant a new receiving account.
const promptpayProofs = new WeakMap();
const snapshot = (s) =>
  hash(
    JSON.stringify([
      receivingAccountKey(s),
      s.paymentQr,
      s.paymentQrReceiver,
      s.paymentQrVerification,
      s.easyslipApiKey || "",
    ]),
  );
const digits = (value) => String(value || "").replace(/[-\s]/g, "");
export function authorizePromptpayResponse(data, settings, identifier) {
  promptpayProofs.set(data, { snapshot: snapshot(settings), identifier });
}
export function isAuthorizedPromptpayResponse(data, settings) {
  const proof = data && promptpayProofs.get(data);
  return (
    !!proof &&
    !!currentPaymentQr(settings) &&
    proof.snapshot === snapshot(settings) &&
    data.matchedAccount?.bank?.code === "PROMPTPAY" &&
    digits(data.matchedAccount.bankNumber) === proof.identifier
  );
}
