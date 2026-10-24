import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { can, date, money, send, useApp, useData, type PageData } from "./api";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Form,
  Loading,
  Modal,
  PageHeading,
  Pagination,
  SearchBox,
  Table,
  cents,
  formObject,
  useListQuery,
} from "./ui";
const sources: Record<string, string> = {
  bank_transfer: "รับโอนเงินที่ตรวจแล้ว",
  cash: "รับเงินสด",
  adjustment: "เครดิตชดเชย/ปรับเพิ่มยอด",
};
const kinds: Record<string, string> = {
  topup: "เติมเงินจากสลิป",
  admin_topup: "เติมเงินโดยผู้ดูแล",
  purchase: "ซื้อสินค้า",
  settlement: "ชำระส่วนที่เหลือ",
  refund: "คืนเงิน",
  commission: "ค่าคอมมิชชั่น",
  consignment: "รายรับฝากขาย",
};
export function AdminWalletPage() {
  const list = useListQuery(),
    [params, setParams] = useSearchParams(),
    { user } = useApp();
  const kind = params.get("kind") || "";
  const { data, error, loading, reload } = useData<PageData>(
    "/admin/wallet/transactions?" +
      list.query +
      "&kind=" +
      encodeURIComponent(kind),
  );
  const [adding, setAdding] = useState(false),
    [view, setView] = useState<any>(null);
  return (
    <>
      <PageHeading
        title="ธุรกรรมกระเป๋าเงิน"
        sub="ตรวจสอบยอดเข้า–ออกและรายการเติมเงินให้ลูกค้า"
      >
        {can(user, "wallet_topup") && (
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={17} /> เติมเงินให้ลูกค้า
          </button>
        )}
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar wallet-transaction-filters">
          <SearchBox
            value={list.q}
            onChange={list.setQ}
            placeholder="ค้นหาลูกค้า อีเมล เลขอ้างอิง หรือผู้ดำเนินการ…"
          />
          <Field
            label="ประเภทธุรกรรม"
            name="kind"
            value={kind}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              p.set("kind", e.target.value);
              p.delete("page");
              setParams(p, { replace: true });
            }}
          >
            <option value="">ทุกประเภท</option>
            {Object.entries(kinds).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </Field>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "วันที่ / เลขรายการ",
                "ลูกค้า",
                "ประเภท",
                "จำนวนเงิน",
                "ยอดก่อน → หลัง",
                "ผู้ดำเนินการ",
                "รายละเอียด",
              ]}
            >
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {date(row.created_at)}
                    <small className="block muted">
                      #{row.id.slice(0, 8).toUpperCase()}
                    </small>
                  </td>
                  <td>
                    <b>{row.customer_name}</b>
                    <small className="block muted">{row.customer_email}</small>
                  </td>
                  <td>
                    <Badge status={row.kind} />
                  </td>
                  <td className={row.amount >= 0 ? "positive" : "negative"}>
                    {row.amount >= 0 ? "+" : ""}
                    {money(row.amount)}
                  </td>
                  <td>
                    {money(row.balance_before)} → {money(row.balance_after)}
                  </td>
                  <td>
                    {row.actor_name || "ระบบ"}
                    {row.source && (
                      <small className="block muted">
                        {sources[row.source]}
                      </small>
                    )}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setView(row)}
                    >
                      ดูรายละเอียด
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty
            title="ยังไม่มีธุรกรรมที่ตรงกัน"
            description="รายการเติมเงิน ซื้อสินค้า และคืนเงินจะแสดงที่นี่"
          />
        )}
      </section>
      {adding && <ManualTopup onClose={() => setAdding(false)} done={reload} />}
      {view && (
        <Modal
          title="รายละเอียดธุรกรรมกระเป๋าเงิน"
          onClose={() => setView(null)}
        >
          <div className="transaction-detail">
            <Badge status={view.kind} />
            <p>
              <b>เลขรายการ</b>
              <br />
              {view.id}
            </p>
            <p>
              {view.customer_name}
              <br />
              {view.customer_email}
            </p>
            <p>{date(view.created_at)} · สำเร็จ</p>
            <p>
              จำนวนเงิน <b>{money(view.amount)}</b>
            </p>
            <p>
              ยอดก่อน {money(view.balance_before)} → ยอดหลัง{" "}
              {money(view.balance_after)}
            </p>
            <p>ผู้ดำเนินการ: {view.actor_name || "ระบบ"}</p>
            <p>
              อ้างอิง:{" "}
              {view.document_reference ||
                view.slip_bank_reference ||
                view.reference}
            </p>
            {view.source && <p>ที่มา: {sources[view.source]}</p>}
            {view.reason && (
              <p className="address-copy">เหตุผล: {view.reason}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
type Customer = { id: string; name: string; email: string; balance: number };
function ManualTopup({
  onClose,
  done,
}: {
  onClose: () => void;
  done: () => void;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Customer | null>(null),
    [source, setSource] = useState("bank_transfer");
  const { data, loading, error, reload } = useData<{ items: Customer[] }>(
    "/admin/wallet/customers?q=" + encodeURIComponent(search),
  );
  const [draft, setDraft] = useState<any>(null),
    [reviewing, setReviewing] = useState(false),
    [result, setResult] = useState<any>(null);
  const key = useRef(crypto.randomUUID());
  return (
    <Modal
      title={
        result
          ? "เติมเงินสำเร็จ"
          : reviewing
            ? "ยืนยันเติมเงินให้ลูกค้า"
            : "เติมเงินให้ลูกค้า"
      }
      onClose={onClose}
    >
      {result ? (
        <>
          <p className="info-box">
            เติมเงินให้ {selected?.name} สำเร็จ {money(result.amount)}
          </p>
          <p>
            เลขที่รายการ <b>{result.id}</b>
          </p>
          <p>
            ยอดก่อน {money(result.balanceBefore)} → ยอดหลัง{" "}
            <b>{money(result.balanceAfter)}</b>
          </p>
          <button type="button" className="button primary" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </>
      ) : reviewing ? (
        <>
          <div className="summary-lines">
            <p>
              <span>ลูกค้า</span>
              <b>{selected?.name}</b>
            </p>
            <p>{selected?.email}</p>
            <p>
              <span>ยอดเติม</span>
              <b>{money(draft.amount)}</b>
            </p>
            <p>
              <span>ยอดก่อน → หลัง</span>
              <b>
                {money(draft.expectedBalance)} →{" "}
                {money(draft.expectedBalance + draft.amount)}
              </b>
            </p>
          </div>
          <p>
            {sources[draft.source]} · อ้างอิง {draft.reference}
          </p>
          {draft.senderBankCode && <p>ธนาคารผู้โอน {draft.senderBankCode}</p>}
          <p className="address-copy">เหตุผล: {draft.reason}</p>
          <Form
            key="confirm"
            noValidate
            submit="ยืนยันเติมเงิน"
            onCancel={() => setReviewing(false)}
            onSubmit={async (f) => {
              const v = formObject(f);
              const res = await send(
                "/admin/wallet/topups",
                { ...draft, actorPassword: v.actorPassword },
                "POST",
                key.current,
              );
              setResult(res);
              done();
            }}
          >
            <Field
              label="รหัสผ่านผู้ดำเนินการ"
              name="actorPassword"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
              help="ยืนยันด้วยรหัสผ่านบัญชีของคุณ เงินจะเข้ากระเป๋าทันทีเมื่อบันทึกสำเร็จ"
            />
          </Form>
        </>
      ) : (
        <Form
          key="input"
          noValidate
          submit="ตรวจสอบรายการเติมเงิน"
          onCancel={onClose}
          onSubmit={async (f) => {
            if (!selected) throw Error("กรุณาค้นหาและเลือกลูกค้าก่อน");
            const v = formObject(f);
            setDraft({
              userId: selected.id,
              amount: cents(v.amount),
              expectedBalance: selected.balance,
              source,
              reference: v.reference,
              reason: v.reason,
              ...(source === "bank_transfer"
                ? { senderBankCode: v.senderBankCode }
                : {}),
            });
            setReviewing(true);
          }}
        >
          <p className="info-box">
            ตรวจผู้รับ ยอดเงิน และเอกสารก่อนยืนยัน
            รายการนี้เป็นการเติมโดยผู้ดำเนินการ ไม่ได้ตรวจสลิปด้วย EasySlip
          </p>
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setSelected(null);
            }}
            placeholder="ค้นหาชื่อหรืออีเมลลูกค้าอย่างน้อย 2 ตัวอักษร…"
          />
          {search.trim().length >= 2 &&
            (error ? (
              <ErrorBox error={error} retry={reload} />
            ) : loading ? (
              <Loading />
            ) : (
              <div className="wallet-customer-results">
                {data?.items.length ? (
                  data.items.map((c) => (
                    <button
                      type="button"
                      className="wallet-customer-choice"
                      aria-pressed={selected?.id === c.id}
                      key={c.id}
                      onClick={() => setSelected(c)}
                    >
                      <b>{c.name}</b>
                      <span>{c.email}</span>
                      <small>ยอดพร้อมใช้ {money(c.balance)}</small>
                    </button>
                  ))
                ) : (
                  <p className="muted">ไม่พบลูกค้าที่ใช้งานอยู่</p>
                )}
              </div>
            ))}
          {selected && (
            <p className="info-box">
              เลือก {selected.name} · {selected.email} · ยอดปัจจุบัน{" "}
              {money(selected.balance)}
            </p>
          )}
          {search.trim().length >= 2 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSelected(null);
                reload();
              }}
            >
              รีเฟรชยอดลูกค้า
            </button>
          )}
          <Field
            label="จำนวนเงินที่เติม (บาท)"
            name="amount"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            defaultValue={draft ? draft.amount / 100 : undefined}
          />
          <Field
            label="ที่มาของยอดเติม"
            name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {Object.entries(sources).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </Field>
          {source === "bank_transfer" && (
            <Field
              label="รหัสธนาคารผู้โอน 3 หลัก"
              name="senderBankCode"
              required
              pattern="[0-9]{3}"
              maxLength={3}
              inputMode="numeric"
              defaultValue={draft?.senderBankCode}
              help="ใช้รหัสธนาคารผู้โอนจากข้อมูลสลิป เพื่อป้องกันซ้ำกับสลิปอัตโนมัติ"
            />
          )}
          <Field
            label={
              source === "bank_transfer"
                ? "เลขอ้างอิงธุรกรรมธนาคาร (transRef)"
                : "เลขที่เอกสารอ้างอิง"
            }
            name="reference"
            required
            minLength={3}
            maxLength={100}
            defaultValue={draft?.reference}
            help={
              source === "bank_transfer"
                ? "กรอก transRef ให้ตรงกับข้อมูลสลิป ไม่ใช้เลขบัญชีหรือเลขสั่งซื้อ"
                : "ใช้เลขอ้างอิงที่ไม่ซ้ำ เช่น CASH-20261024-001"
            }
          />
          <Field
            label="เหตุผลการเติมเงิน"
            name="reason"
            type="textarea"
            required
            minLength={5}
            maxLength={500}
            defaultValue={draft?.reason}
          />
        </Form>
      )}
    </Modal>
  );
}
