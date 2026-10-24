import { useApp } from "./api";
import { BankLogo } from "./contacts";
import { StorePaymentQr, themeStyle } from "./experience";
import { Loading } from "./ui";
import { bankDetailsSnapshot } from "../shared/bank-details.mjs";

export function BankDetailsPanel({
  data,
  exportMode = false,
}: {
  data: any;
  exportMode?: boolean;
}) {
  return (
    <div
      className="panel bank-details"
      data-bank-card-state={bankDetailsSnapshot(data)}
    >
      <h2>บัญชีรับเงินของร้าน</h2>
      <div className="bank-receiver">
        <div className="bank-account-info">
          <BankLogo code={data?.bankCode} name={data?.bankName} />
          <strong>{data?.bankName || "ยังไม่ได้ตั้งค่าธนาคาร"}</strong>
          <h2 className="bank-number">{data?.bankNumber || "—"}</h2>
          <p>{data?.accountName}</p>
          <p className="muted">{data?.accountNameEn}</p>
        </div>
        {data?.topupReady && data?.paymentQr && (
          <StorePaymentQr
            image={data.paymentQr}
            frame={data.paymentQrFrame}
            shopName={data.shopName}
            exportMode={exportMode}
          />
        )}
      </div>
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
