import { receivingAccountKey, currentPaymentQr } from "./receiving-policy.mjs";

export const bankFields = [
  "bankCode",
  "bankName",
  "bankNumber",
  "accountName",
  "accountNameEn",
];
const bankData = (a) =>
  Object.fromEntries(bankFields.map((k) => [k, a?.[k] || ""]));
export function merchantAccounts(s) {
  if (Array.isArray(s.merchantAccounts)) return s.merchantAccounts;
  if (!s.bankCode || !s.bankNumber || !s.accountName) return [];
  return [
    {
      ...bankData(s),
      id: "legacy",
      label: "บัญชีเดิมของร้าน",
      visible: true,
      isPrimary: true,
      version: 1,
      legacy: true,
      qrs: s.paymentQr
        ? [
            {
              id: "legacy-qr",
              label: "QR เดิมของร้าน",
              image: s.paymentQr,
              visible: true,
              isPrimary: true,
              verification: s.paymentQrVerification || null,
              receiver: s.paymentQrReceiver || "",
            },
          ]
        : [],
    },
  ];
}
export function accountReceiver(s, a, qr) {
  return {
    ...s,
    ...bankData(a),
    paymentQr: qr?.image || "",
    paymentQrReceiver: qr?.receiver || "",
    paymentQrVerification: qr?.verification || null,
  };
}
export function receivingCandidates(s) {
  if (!Array.isArray(s.merchantAccounts)) return [s];
  return merchantAccounts(s).flatMap((a) => [
    accountReceiver(s, a),
    ...(a.qrs || []).map((qr) => accountReceiver(s, a, qr)),
  ]);
}
export function receivingPublicData(s, credentialHash, apiReady) {
  const configured = merchantAccounts(s);
  const accounts = configured
    .filter((a) => a.visible !== false)
    .map((a) => {
      const qrs = (a.qrs || [])
        .filter(
          (q) =>
            q.visible !== false &&
            currentPaymentQr(accountReceiver(s, a, q), credentialHash),
        )
        .map((q) => ({
          id: q.id,
          label: q.label,
          image: q.image,
          frame: q.verification?.frame || null,
          isPrimary: !!q.isPrimary,
        }))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      return {
        ...bankData(a),
        id: a.id,
        label: a.label,
        isPrimary: !!a.isPrimary,
        qrs,
      };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const first = accounts[0];
  return {
    ...bankData(first),
    merchantAccounts: accounts,
    paymentQr: first?.qrs[0]?.image || "",
    paymentQrFrame: first?.qrs[0]?.frame || null,
    topupReady: !!apiReady && configured.length > 0,
  };
}
