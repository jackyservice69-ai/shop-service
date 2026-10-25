import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { send, useApp, useData } from "./api";
import { BankLogo } from "./contacts";
import { ImageUpload } from "./experience";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Form,
  Loading,
  Modal,
  PageHeading,
  formObject,
} from "./ui";

type PaymentQr = {
  id: string;
  label: string;
  image: string;
  visible: boolean;
  isPrimary: boolean;
  ready: boolean;
};
type Account = {
  id: string;
  label: string;
  bankCode: string;
  bankName: string;
  bankNumber: string;
  accountName: string;
  accountNameEn: string;
  visible: boolean;
  isPrimary: boolean;
  version: number;
  qrs: PaymentQr[];
};
type Editor = { kind: "account" | "qr"; account?: Account; qr?: PaymentQr };

function VisibilityFields({
  value,
}: {
  value?: { visible: boolean; isPrimary: boolean };
}) {
  return (
    <div className="merchant-visibility">
      <label className="checkbox-field">
        <input
          name="visible"
          type="checkbox"
          defaultChecked={value?.visible !== false}
        />
        แสดงบนหน้าร้าน
      </label>
      <label className="checkbox-field">
        <input
          name="isPrimary"
          type="checkbox"
          defaultChecked={value?.isPrimary || false}
        />
        ใช้เป็นรายการหลัก
      </label>
    </div>
  );
}

function AccountEditor({
  editor,
  accounts,
  onClose,
  onSaved,
}: {
  editor: Editor;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { account, qr, kind } = editor;
  const importing = kind === "account" && !account;
  const {
    data: branch,
    loading,
    error,
    reload,
  } = useData(
    importing ? "/admin/merchant-accounts/branch" : "/admin/merchant-accounts",
  );
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const alreadyAdded = (a: any) =>
    accounts.some(
      (existing) =>
        existing.bankCode === a.bankCode &&
        existing.bankNumber.replace(/[-\s]/g, "") ===
          String(a.bankNumber).replace(/[-\s]/g, ""),
    );
  const title =
    kind === "qr"
      ? qr
        ? "แก้ไข QR รับเงิน"
        : "เพิ่ม QR รับเงิน"
      : account
        ? "แก้ไขบัญชีร้านค้า"
        : "เพิ่มบัญชีจาก EasySlip";
  return (
    <Modal title={title} onClose={onClose}>
      {importing && loading ? (
        <Loading />
      ) : importing && error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <Form
          noValidate
          onCancel={onClose}
          blocked={uploading}
          onSubmit={async (f) => {
            const values = formObject(f);
            const body: any = {
              label: values.label,
              visible: values.visible === "on",
              isPrimary: values.isPrimary === "on",
            };
            if (account) body.version = account.version;
            let path = "/admin/merchant-accounts";
            let method = "POST";
            if (kind === "account") {
              if (account) {
                path += "/" + account.id;
                method = "PUT";
              } else body.bankAccountId = Number(values.bankAccountId);
            } else {
              path += "/" + account!.id + "/qrs";
              if (qr) {
                path += "/" + qr.id;
                method = "PUT";
              } else {
                if (!image)
                  throw new Error(
                    "กรุณาอัปโหลด QR ที่ผ่านการตรวจสอบก่อนบันทึก",
                  );
                body.image = image;
              }
            }
            await send(path, body, method);
            await onSaved();
            onClose();
          }}
        >
          {importing && (
            <>
              <p className="muted">
                เลือกบัญชีธนาคารที่ลงทะเบียนชื่อผู้รับภาษาไทยและอังกฤษ
                และเชื่อมกับ Branch ของ API key ใน EasySlip แล้ว
              </p>
              <Field
                label="บัญชีใน EasySlip"
                name="bankAccountId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  เลือกบัญชีธนาคาร
                </option>
                {branch?.items?.map((a: any) => (
                  <option value={a.id} key={a.id} disabled={alreadyAdded(a)}>
                    {a.bankName} · {a.bankNumber} · {a.accountName}
                    {alreadyAdded(a) ? " · เพิ่มแล้ว" : ""}
                  </option>
                ))}
              </Field>
              {branch?.items?.length === 0 && (
                <p role="status">
                  ยังไม่มีบัญชีธนาคารที่เชื่อมกับ Branch นี้
                  กรุณาเพิ่มและเชื่อมบัญชีใน EasySlip ก่อน
                </p>
              )}
              {branch?.items?.length > 0 &&
                branch.items.every(alreadyAdded) && (
                  <p role="status">
                    เพิ่มบัญชีที่เชื่อม Branch นี้ครบแล้ว หากต้องการบัญชีอื่น
                    ให้ลงทะเบียนและเชื่อมบัญชีเพิ่มใน EasySlip ก่อน
                  </p>
                )}
            </>
          )}
          {account && (
            <p className="muted">
              {account.bankName} · {account.bankNumber}
              <br />
              {account.accountName}
            </p>
          )}
          <Field
            label={kind === "qr" ? "ชื่อ QR" : "ชื่อเรียกบัญชี"}
            name="label"
            required
            maxLength={100}
            defaultValue={
              qr?.label || (kind === "account" ? account?.label : "")
            }
          />
          {kind === "qr" && !qr && (
            <ImageUpload
              kind="paymentQr"
              value={image}
              onChange={setImage}
              onBusyChange={setUploading}
              uploadPath={
                "/admin/media/paymentQr?accountId=" +
                encodeURIComponent(account!.id)
              }
            />
          )}
          <VisibilityFields
            value={qr || (kind === "account" ? account : undefined)}
          />
          <p className="muted">
            ปิดการแสดงแล้ว ระบบยังตรวจสลิปที่โอนเข้าบัญชีนี้ได้
            หากรายการหลักถูกซ่อนจะใช้รายการที่แสดงถัดไป
          </p>
          {kind === "qr" && (
            <p className="muted">
              QR ต้องผ่านการตรวจผู้รับและการเชื่อม Branch ก่อนแสดง เมื่อเปลี่ยน
              API key ให้กด “ตรวจสอบ QR ใหม่” ที่รูปเดิมได้
            </p>
          )}
          {kind === "account" && account && (
            <p className="muted">
              ต้องการเปลี่ยนเลขบัญชีหรือชื่อผู้รับ
              ให้เพิ่มบัญชีใหม่เพื่อรักษาประวัติการรับเงินเดิม
            </p>
          )}
        </Form>
      )}
    </Modal>
  );
}

export function MerchantAccountsPage() {
  const { data, error, loading, reload } = useData("/admin/merchant-accounts");
  const { refresh, notify } = useApp();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [verifying, setVerifying] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const items: Account[] = data?.items || [];
  const groups = Array.from(new Set(items.map((a) => a.bankCode)));
  return (
    <>
      <PageHeading
        title="บัญชีร้านค้า"
        sub="บัญชีรับเงินและ QR ของแต่ละธนาคาร · สูงสุด 20 บัญชี และ 10 QR ต่อบัญชี"
      >
        <button
          className="button primary"
          disabled={items.length >= 20 || loading}
          onClick={() => setEditor({ kind: "account" })}
        >
          <Plus size={18} />
          เพิ่มบัญชี
        </button>
      </PageHeading>
      <p className="muted">
        รายการหลักที่เปิดแสดงจะใช้ในหน้ากระเป๋าเงินและรูปบัญชีที่ส่งผ่าน LINE
        ลูกค้าสามารถเลือกบัญชีและ QR อื่นที่เปิดแสดงได้
      </p>
      {verifyError && <ErrorBox error={verifyError} />}
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : !items.length ? (
        <Empty
          title="ยังไม่มีบัญชีร้านค้า"
          description="เพิ่มบัญชีที่เชื่อมกับ Branch ใน EasySlip เพื่อเริ่มรับเงิน"
        />
      ) : (
        groups.map((code) => (
          <section
            className="merchant-bank-group section-space"
            key={code}
            aria-label={items.find((a) => a.bankCode === code)!.bankName}
          >
            <h2>{items.find((a) => a.bankCode === code)!.bankName}</h2>
            <div className="merchant-accounts-grid">
              {items
                .filter((a) => a.bankCode === code)
                .map((a) => (
                  <article className="panel merchant-account" key={a.id}>
                    <div className="merchant-account-heading">
                      <BankLogo code={a.bankCode} name={a.bankName} />
                      <div>
                        <h3>{a.label}</h3>
                        <Badge
                          status={a.visible ? "completed" : "pending"}
                          label={
                            a.visible ? "แสดงบนหน้าร้าน" : "ซ่อนจากหน้าร้าน"
                          }
                        />{" "}
                        {a.isPrimary && (
                          <Badge status="info" label="บัญชีหลัก" />
                        )}
                      </div>
                    </div>
                    <p className="bank-number">{a.bankNumber}</p>
                    <p>
                      {a.accountName}
                      <br />
                      <span className="muted">{a.accountNameEn}</span>
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => setEditor({ kind: "account", account: a })}
                    >
                      <Pencil size={16} />
                      แก้ไขบัญชี
                    </button>
                    <div className="merchant-qr-heading">
                      <h3>QR รับเงิน ({a.qrs.length}/10)</h3>
                      <button
                        className="text-button"
                        disabled={a.qrs.length >= 10}
                        onClick={() => setEditor({ kind: "qr", account: a })}
                      >
                        <Plus size={16} />
                        เพิ่ม QR
                      </button>
                    </div>
                    {a.qrs.length ? (
                      <div className="merchant-qr-list">
                        {a.qrs.map((q) => (
                          <div className="merchant-qr-item" key={q.id}>
                            <img
                              src={q.image}
                              alt={q.label}
                              width="96"
                              height="96"
                              loading="lazy"
                            />
                            <div>
                              <strong>{q.label}</strong>
                              <p className="muted">
                                {q.visible ? "เปิดแสดง" : "ซ่อน"}
                                {q.isPrimary ? " · รูปหลัก" : ""}
                              </p>
                              <Badge
                                status={q.ready ? "completed" : "pending"}
                                label={
                                  q.ready ? "ตรวจสอบแล้ว" : "ต้องตรวจสอบใหม่"
                                }
                              />
                              <br />
                              <button
                                className="text-button"
                                onClick={() =>
                                  setEditor({ kind: "qr", account: a, qr: q })
                                }
                              >
                                แก้ไข QR
                              </button>
                              {!q.ready && (
                                <button
                                  className="text-button"
                                  disabled={!!verifying}
                                  onClick={async () => {
                                    setVerifyError("");
                                    setVerifying(q.id);
                                    try {
                                      await send(
                                        `/admin/merchant-accounts/${a.id}/qrs/${q.id}/verify`,
                                        { version: a.version },
                                      );
                                      reload();
                                      await refresh();
                                      notify("ตรวจสอบ QR ใหม่แล้ว");
                                    } catch (e) {
                                      setVerifyError((e as Error).message);
                                    } finally {
                                      setVerifying("");
                                    }
                                  }}
                                >
                                  {verifying === q.id
                                    ? "กำลังตรวจสอบ…"
                                    : "ตรวจสอบ QR ใหม่"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">
                        ยังไม่มี QR ลูกค้าสามารถใช้เลขบัญชีโอนเงินได้
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))
      )}
      {editor && (
        <AccountEditor
          editor={editor}
          accounts={items}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            reload();
            await refresh();
            notify("บันทึกบัญชีร้านค้าแล้ว");
          }}
        />
      )}
    </>
  );
}
