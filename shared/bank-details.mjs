export function bankDetailsData(value) {
  const qr = value?.topupReady ? value?.paymentQr || "" : "";
  return {
    shopName: value?.shopName || "",
    bankCode: value?.bankCode || "",
    bankName: value?.bankName || "",
    bankNumber: value?.bankNumber || "",
    accountName: value?.accountName || "",
    accountNameEn: value?.accountNameEn || "",
    paymentQr: qr,
    paymentQrFrame: qr ? value?.paymentQrFrame || null : null,
    topupReady: !!value?.topupReady,
    theme: value?.theme || {},
  };
}
export const bankDetailsSnapshot = (value) =>
  JSON.stringify(bankDetailsData(value));
