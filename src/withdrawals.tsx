import { useState } from "react";
import { useLocation } from "react-router-dom";
import { HandCoins } from "lucide-react";
import { can, date, money, send, useApp, useData, type PageData } from "./api";
import { BankLogo } from "./contacts";
import banks from "../shared/bank-logos.json";
import {
  cents,
  Empty,
  ErrorBox,
  Field,
  Form,
  formObject,
  Loading,
  Modal,
  PageHeading,
  Pagination,
  Table,
} from "./ui";
import "./withdrawals.css";

type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  version: number;
  bank_code: string;
  bank_number: string;
  account_name: string;
  created_at: string;
  decision_note: string;
  transfer_reference: string | null;
  shop_name: string;
  approved_at: string | null;
  paid_at: string | null;
  approved_by_name: string | null;
  paid_by_name: string | null;
  processing_by: string | null;
  processing_by_name: string | null;
};
type Feed = Omit<PageData, "items"> & {
  items: Withdrawal[];
  available: number;
  held: number;
  canRequest: boolean;
};
const labels: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว · รอโอน",
  processing: "กำลังดำเนินการโอน",
  paid: "โอนแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิกแล้ว",
};
function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (["approved", "paid"].includes(value)
          ? "status-approved"
          : "status-reserved")
      }
    >
      {labels[value]}
    </span>
  );
}
function Destination({ row }: { row: Withdrawal }) {
  return (
    <div className="withdrawal-destination">
      <BankLogo code={row.bank_code} />
      <div>
        <b>{banks[row.bank_code as keyof typeof banks]?.name}</b>
        <p className="withdrawal-account-number">{row.bank_number}</p>
        <p>{row.account_name}</p>
        <strong>{money(row.amount)}</strong>
      </div>
    </div>
  );
}
export function SellerWithdrawals({ refreshKey }: { refreshKey?: string }) {
  const { notify, refresh } = useApp(),
    [page, setPage] = useState(1),
    rows = useData<Feed>(
      `/consignment/withdrawals?page=${page}&size=5`,
      refreshKey,
    ),
    [requestKey, setRequestKey] = useState<string | null>(null),
    [cancel, setCancel] = useState<Withdrawal | null>(null);
  async function changed(message: string) {
    rows.reload();
    await refresh();
    notify(message);
  }
  return (
    <section
      className="panel withdrawal-panel"
      aria-labelledby="seller-withdrawals-title"
    >
      <div className="panel-title">
        <h2 id="seller-withdrawals-title">ถอนรายได้ฝากขาย</h2>
        <button className="button secondary small" onClick={rows.reload}>
          โหลดรายการใหม่
        </button>
        <button
          className="button primary small"
          disabled={!rows.data?.canRequest || rows.data.available < 100}
          onClick={() => setRequestKey(crypto.randomUUID())}
        >
          <HandCoins size={18} />
          แจ้งถอนเงิน
        </button>
      </div>
      <p>
        ถอนได้เฉพาะรายได้ฝากขายที่เข้ากระเป๋าแล้ว
        ยอดเติมเงินและค่าคอมมิชชั่นแนะนำเพื่อนไม่นับเป็นยอดถอน
      </p>
      {rows.loading ? (
        <Loading />
      ) : rows.error ? (
        <ErrorBox error={rows.error} retry={rows.reload} />
      ) : (
        rows.data && (
          <>
            <div className="withdrawal-balances">
              <div>
                <small>รายได้ที่ถอนได้</small>
                <strong>{money(rows.data.available)}</strong>
              </div>
              <div>
                <small>กันยอดรออนุมัติ / รอโอน</small>
                <strong>{money(rows.data.held)}</strong>
              </div>
            </div>
            <p className="muted">
              กันยอดจากกระเป๋าทันทีเมื่อส่งคำขอ เมื่ออนุมัติแล้ว
              ร้านจึงดำเนินการโอนเข้าบัญชีที่ระบุ
            </p>
            {rows.data.items.length ? (
              <>
                <Table
                  headers={[
                    "คำขอ / วันที่",
                    "ยอดถอน",
                    "สถานะ / รายละเอียด",
                    "จัดการ",
                  ]}
                >
                  {rows.data.items.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <b>{w.id.slice(0, 10)}</b>
                        <small className="block muted">
                          {date(w.created_at)}
                        </small>
                        <small className="block">
                          บัญชีลงท้าย {w.bank_number.slice(-4)}
                        </small>
                      </td>
                      <td>{money(w.amount)}</td>
                      <td>
                        <Status value={w.status} />
                        {w.decision_note && (
                          <small className="block">{w.decision_note}</small>
                        )}
                        {w.transfer_reference && (
                          <small className="block">
                            เลขอ้างอิง {w.transfer_reference}
                          </small>
                        )}
                        {w.paid_at && (
                          <small className="block muted">
                            {date(w.paid_at)}
                          </small>
                        )}
                      </td>
                      <td>
                        {w.status === "pending" && (
                          <button
                            className="button secondary small"
                            onClick={() => setCancel(w)}
                          >
                            ยกเลิกคำขอ
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
                <Pagination data={rows.data} onPage={setPage} />
              </>
            ) : (
              <Empty
                title="ยังไม่มีคำขอถอนเงิน"
                description="รายได้จากออร์เดอร์ที่สำเร็จและชำระครบจะแสดงเป็นยอดที่ถอนได้"
              />
            )}
          </>
        )
      )}
      {requestKey && rows.data && (
        <Modal title="แจ้งถอนรายได้ฝากขาย" onClose={() => setRequestKey(null)}>
          <p>
            ถอนได้ {money(rows.data.available)} ·
            ตรวจสอบบัญชีรับเงินของคุณก่อนส่งคำขอ
          </p>
          <Form
            noValidate
            submit="ส่งคำขอถอนเงิน"
            onCancel={() => setRequestKey(null)}
            onSubmit={async (f) => {
              const v = formObject(f);
              await send(
                "/consignment/withdrawals",
                {
                  amount: cents(v.amount),
                  bankCode: v.bankCode,
                  bankNumber: v.bankNumber,
                  accountName: v.accountName,
                },
                "POST",
                requestKey,
              );
              setRequestKey(null);
              setPage(1);
              await changed("ส่งคำขอถอนแล้ว และกันยอดไว้รออนุมัติ");
            }}
          >
            <Field
              label="ยอดถอน (บาท)"
              name="amount"
              type="number"
              min={1}
              max={rows.data.available / 100}
              step="0.01"
              required
              inputMode="decimal"
            />
            <Field
              label="ธนาคารรับเงิน"
              name="bankCode"
              required
              defaultValue=""
            >
              <option value="" disabled>
                เลือกธนาคาร
              </option>
              {Object.entries(banks).map(([code, b]) => (
                <option key={code} value={code}>
                  {b.name}
                </option>
              ))}
            </Field>
            <Field
              label="เลขบัญชีรับเงิน"
              name="bankNumber"
              required
              inputMode="numeric"
              pattern="[0-9]{6,20}"
              minLength={6}
              maxLength={20}
              help="ระบุเฉพาะตัวเลข ไม่ใส่ขีดหรือเว้นวรรค"
            />
            <Field
              label="ชื่อบัญชีรับเงิน"
              name="accountName"
              required
              minLength={2}
              maxLength={120}
            />
            <label className="checkbox">
              <input type="checkbox" required name="confirmAccount" />
              ฉันตรวจสอบบัญชีรับเงินและยอดถอนถูกต้องแล้ว
            </label>
          </Form>
        </Modal>
      )}
      {cancel && (
        <Modal title="ยกเลิกคำขอถอน" onClose={() => setCancel(null)}>
          <p>คืนยอด {money(cancel.amount)} เข้ากระเป๋าและยอดรายได้ที่ถอนได้</p>
          <Form
            noValidate
            submit="ยืนยันยกเลิกคำขอ"
            onCancel={() => setCancel(null)}
            onSubmit={async () => {
              await send(`/consignment/withdrawals/${cancel.id}/cancel`, {
                version: cancel.version,
              });
              setCancel(null);
              await changed("ยกเลิกคำขอและคืนยอดแล้ว");
            }}
          />
        </Modal>
      )}
    </section>
  );
}
export function AdminWithdrawalsPage() {
  const location = useLocation(),
    notificationKey = location.state?.notificationId ? location.key : undefined;
  const { user, notify } = useApp(),
    [page, setPage] = useState(1),
    [status, setStatus] = useState("pending"),
    rows = useData<Feed>(
      `/admin/withdrawals?page=${page}&size=20&status=${status}`,
      notificationKey,
    ),
    [decision, setDecision] = useState<{
      row: Withdrawal;
      action: "approve" | "reject" | "claim" | "release" | "pay";
    } | null>(null);
  const title = {
    approve: "อนุมัติคำขอถอน",
    reject: "ปฏิเสธคำขอถอน",
    claim: "รับดำเนินการโอน",
    release: "คืนคิวรอโอน",
    pay: "บันทึกโอนเงิน",
  }[decision?.action || "approve"];
  return (
    <>
      <PageHeading
        title="คำขอถอนตัวแทน"
        sub="ตรวจสอบคำขอ → อนุมัติ → โอนเงินจริงและบันทึกเลขอ้างอิง"
      />
      <section className="panel withdrawal-panel">
        <button className="button secondary small" onClick={rows.reload}>
          โหลดรายการใหม่
        </button>
        <Field
          label="สถานะคำขอ"
          name="status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">ทั้งหมด</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Field>
        <p className="muted">
          การอนุมัติยังไม่ใช่การโอนเงินจริง ตรวจสอบยอดและบัญชีก่อนโอนผ่านธนาคาร
          แล้วบันทึกเลขอ้างอิงเมื่อโอนสำเร็จ
        </p>
        {rows.loading ? (
          <Loading />
        ) : rows.error ? (
          <ErrorBox error={rows.error} retry={rows.reload} />
        ) : rows.data?.items.length ? (
          <>
            <Table
              headers={["ร้าน / คำขอ", "ยอดถอน / บัญชี", "สถานะ", "จัดการ"]}
            >
              {rows.data.items.map((w) => (
                <tr key={w.id}>
                  <td>
                    <b>{w.shop_name}</b>
                    <small className="block muted">
                      {w.id.slice(0, 10)} · {date(w.created_at)}
                    </small>
                  </td>
                  <td>
                    <b>{money(w.amount)}</b>
                    <small className="block">
                      {w.account_name} · ลงท้าย {w.bank_number.slice(-4)}
                    </small>
                  </td>
                  <td>
                    <Status value={w.status} />
                    {w.approved_by_name && (
                      <small className="block">
                        อนุมัติโดย {w.approved_by_name}
                      </small>
                    )}
                    {w.paid_by_name && (
                      <small className="block">
                        บันทึกโอนโดย {w.paid_by_name}
                      </small>
                    )}
                    {w.processing_by_name && (
                      <small className="block">
                        ผู้ดำเนินการ {w.processing_by_name}
                      </small>
                    )}
                    {w.decision_note && (
                      <small className="block">{w.decision_note}</small>
                    )}
                    {w.transfer_reference && (
                      <small className="block">
                        เลขอ้างอิง {w.transfer_reference}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="withdrawal-actions">
                      {w.user_id !== user?.id && (
                        <>
                          {w.status === "pending" &&
                            can(user, "withdrawals_approve") && (
                              <button
                                className="button primary small"
                                onClick={() =>
                                  setDecision({ row: w, action: "approve" })
                                }
                              >
                                อนุมัติ
                              </button>
                            )}
                          {["pending", "approved"].includes(w.status) &&
                            can(user, "withdrawals_approve") && (
                              <button
                                className="button secondary small"
                                onClick={() =>
                                  setDecision({ row: w, action: "reject" })
                                }
                              >
                                ปฏิเสธ
                              </button>
                            )}
                          {w.status === "approved" &&
                            can(user, "withdrawals_pay") && (
                              <button
                                className="button primary small"
                                onClick={() =>
                                  setDecision({ row: w, action: "claim" })
                                }
                              >
                                รับดำเนินการโอน
                              </button>
                            )}
                          {w.status === "processing" &&
                            can(user, "withdrawals_pay") && (
                              <>
                                {w.processing_by === user?.id && (
                                  <button
                                    className="button primary small"
                                    onClick={() =>
                                      setDecision({ row: w, action: "pay" })
                                    }
                                  >
                                    บันทึกโอนเงิน
                                  </button>
                                )}
                                {(w.processing_by === user?.id ||
                                  user?.roleId === "admin") && (
                                  <button
                                    className="button secondary small"
                                    onClick={() =>
                                      setDecision({ row: w, action: "release" })
                                    }
                                  >
                                    คืนคิวรอโอน
                                  </button>
                                )}
                              </>
                            )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={rows.data} onPage={setPage} />
          </>
        ) : (
          <Empty title="ไม่มีคำขอในสถานะนี้" />
        )}
      </section>
      {decision && (
        <Modal
          key={decision.row.id + decision.action}
          title={title}
          onClose={() => setDecision(null)}
        >
          <Destination row={decision.row} />
          <Form
            noValidate
            submit={title}
            danger={decision.action === "reject"}
            onCancel={() => setDecision(null)}
            onSubmit={async (f) => {
              const v = formObject(f);
              const result = await send(
                `/admin/withdrawals/${decision.row.id}/${decision.action}`,
                {
                  version: decision.row.version,
                  note: String(v.note || ""),
                  transferReference: String(v.transferReference || ""),
                },
              );
              if (decision.action === "claim") {
                setStatus("processing");
                setDecision({ row: result, action: "pay" });
              } else setDecision(null);
              rows.reload();
              notify("บันทึกสถานะคำขอถอนแล้ว");
            }}
          >
            {["reject", "release"].includes(decision.action) ? (
              <>
                <Field
                  label={
                    decision.action === "release"
                      ? "เหตุผลคืนคิวรอโอน"
                      : "เหตุผลที่ไม่อนุมัติ"
                  }
                  name="note"
                  type="textarea"
                  required
                  minLength={5}
                  maxLength={500}
                />
                {decision.action === "release" && (
                  <label className="checkbox">
                    <input
                      name="confirmNotTransferred"
                      type="checkbox"
                      required
                    />
                    ฉันตรวจสอบแล้วว่ายังไม่ได้โอนเงินสำหรับคำขอนี้
                  </label>
                )}
              </>
            ) : decision.action === "pay" ? (
              <>
                <Field
                  label="เลขอ้างอิงการโอนสำเร็จ"
                  name="transferReference"
                  required
                  minLength={3}
                  maxLength={100}
                  pattern="[A-Za-z0-9._\/\-]+"
                  help="กรอกหลังโอนเงินจริงสำเร็จ เลขอ้างอิงต้องไม่ซ้ำรายการอื่น"
                />
                <label className="checkbox">
                  <input name="confirmTransfer" type="checkbox" required />
                  ฉันโอนเงินจริงตามยอดและบัญชีข้างต้นสำเร็จแล้ว
                </label>
              </>
            ) : decision.action === "claim" ? (
              <p>
                รับรายการนี้ไว้ดำเนินการเพียงคนเดียวก่อนโอนผ่านธนาคาร
                หากปิดหน้าต่างสามารถกลับมาบันทึกผลได้ที่สถานะ
                “กำลังดำเนินการโอน”
              </p>
            ) : (
              <p>
                อนุมัติเพื่อให้ผู้มีสิทธิ์บันทึกโอนเงินดำเนินการต่อ
                ยอดยังถูกกันไว้จนโอนหรือปฏิเสธ
              </p>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
