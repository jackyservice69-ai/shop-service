import { useApp } from "./api";
import { useState } from "react";
import { BankLogo } from "./contacts";
import { StorePaymentQr, themeStyle } from "./experience";
import { Field, Loading } from "./ui";
import { bankDetailsSnapshot } from "../shared/bank-details.mjs";

export function BankDetailsPanel({
  data,
  exportMode = false,
}: {
  data: any;
  exportMode?: boolean;
}) {
  const [accountId, setAccountId] = useState("");
  const [qrId, setQrId] = useState("");
  const accounts: any[] | undefined = data?.merchantAccounts;
  const account =
    accounts?.find((a) => !exportMode && a.id === accountId) || accounts?.[0];
  const qr =
    account?.qrs?.find((q: any) => !exportMode && q.id === qrId) ||
    account?.qrs?.[0];
  const selected = accounts
    ? {
        ...data,
        ...account,
        paymentQr: qr?.image || "",
        paymentQrFrame: qr?.frame || null,
      }
    : data;
  const bankCodes = Array.from(new Set(accounts?.map((a) => a.bankCode) || []));
  return (
    <div
      className="panel bank-details"
      data-bank-card-state={bankDetailsSnapshot(data)}
    >
      <h2>บัญชีรับเงินของร้าน</h2>
      {accounts?.length === 0 ? (
        <p className="muted">
          ยังไม่มีบัญชีที่เปิดแสดง กรุณาติดต่อร้านก่อนโอนเงิน
        </p>
      ) : (
        <>
          {!exportMode && accounts && accounts.length > 1 && (
            <Field
              label="เลือกบัญชีรับเงิน"
              name="receivingAccount"
              value={account?.id || ""}
              onChange={(e) => {
                setAccountId(e.target.value);
                setQrId("");
              }}
            >
              {bankCodes.map((code) => (
                <optgroup
                  key={code}
                  label={accounts.find((a) => a.bankCode === code).bankName}
                >
                  {accounts
                    .filter((a) => a.bankCode === code)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.bankNumber}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Field>
          )}
          {!exportMode && account?.qrs?.length > 1 && (
            <Field
              label="เลือก QR รับเงิน"
              name="receivingQr"
              value={qr?.id || ""}
              onChange={(e) => setQrId(e.target.value)}
            >
              {account.qrs.map((q: any) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                  {q.isPrimary ? " · รูปหลัก" : ""}
                </option>
              ))}
            </Field>
          )}
          <div className="bank-receiver">
            <div className="bank-account-info">
              <BankLogo code={selected?.bankCode} name={selected?.bankName} />
              <strong>{selected?.bankName || "ยังไม่ได้ตั้งค่าธนาคาร"}</strong>
              <h2 className="bank-number">{selected?.bankNumber || "—"}</h2>
              <p>{selected?.accountName}</p>
              <p className="muted">{selected?.accountNameEn}</p>
            </div>
            {selected?.topupReady && selected?.paymentQr && (
              <StorePaymentQr
                key={selected.paymentQr}
                image={selected.paymentQr}
                frame={selected.paymentQrFrame}
                shopName={data.shopName}
                exportMode={exportMode}
              />
            )}
          </div>
        </>
      )}
      <p className="warning-note">
        ตรวจสอบชื่อและเลขบัญชีให้ตรงก่อนโอนทุกครั้ง สลิปต้องเป็นรายการภายใน 24
        ชั่วโมง
      </p>
    </div>
  );
}

export function BankDetailsExportPage() {
  const { publicData } = useApp();
  if (!publicData) return <Loading />;
  return (
    <main
      className="customer-shell bank-card-export"
      style={themeStyle(publicData.theme)}
    >
      <BankDetailsPanel data={publicData} exportMode />
    </main>
  );
}
