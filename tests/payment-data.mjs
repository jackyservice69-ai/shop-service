import { crc16 } from "../server/payment-qr.mjs";
export const promptpayNumber = "1234567890123";
export function paymentPayload(identifier = promptpayNumber, changes = {}) {
  const tlv = (tag, value) =>
    tag + String(value.length).padStart(2, "0") + value;
  const merchant =
    tlv("00", "A000000677010111") +
    tlv(
      identifier.length === 10 ? "01" : "02",
      identifier.length === 10 ? "0066" + identifier.slice(1) : identifier,
    );
  const fields = {
    "00": "01",
    "01": "11",
    29: merchant,
    53: "764",
    58: "TH",
    ...changes,
  };
  const raw =
    ["00", "01", "29", "53", "54", "58"]
      .filter((k) => fields[k] != null)
      .map((k) => tlv(k, fields[k]))
      .join("") + "6304";
  return raw + crc16(raw);
}
export function branchAccounts(bank) {
  return [
    {
      id: 101,
      bankCode: bank.bankCode,
      bankNumber: bank.bankNumber,
      nameTh: bank.accountName,
      nameEn: bank.accountNameEn,
    },
    {
      id: 102,
      bankCode: "PROMPTPAY",
      bankNumber: promptpayNumber,
      nameTh: bank.accountName,
      nameEn: bank.accountNameEn,
    },
  ];
}
export function accountResponse(accounts) {
  return Response.json({
    success: true,
    data: { items: accounts, total: accounts.length, page: 1, limit: 100 },
  });
}
