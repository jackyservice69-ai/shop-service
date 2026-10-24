import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { date, send, useApp } from "./api";
import { Field, Form, Modal, ErrorBox, formObject } from "./ui";

export function CustomerManagement({
  row,
  mode,
  onClose,
  changed,
}: {
  row: any;
  mode: "profile" | "reset";
  onClose: () => void;
  changed: () => void;
}) {
  const [result, setResult] = useState<{
      temporaryPassword: string;
      expiresAt: string;
    } | null>(null),
    [reveal, setReveal] = useState(false),
    [copyError, setCopyError] = useState(""),
    { notify } = useApp();
  return (
    <Modal
      title={mode === "profile" ? "แก้ไขข้อมูลลูกค้า" : "รีเซ็ตรหัสผ่านลูกค้า"}
      onClose={onClose}
    >
      <p>
        <b>{row.name}</b>
        <br />
        {row.email}
      </p>
      {result ? (
        <>
          <p className="info-box">
            รหัสชั่วคราวจะแสดงเฉพาะครั้งนี้
            กรุณาส่งให้ลูกค้าผ่านช่องทางที่ตรวจสอบตัวตนแล้ว
          </p>
          <Field
            label="รหัสผ่านชั่วคราว"
            name="temporaryPassword"
            type={reveal ? "text" : "password"}
            value={result.temporaryPassword}
            readOnly
            autoComplete="off"
          />
          <div className="form-actions member-secret-actions">
            <button
              className="button secondary"
              type="button"
              aria-pressed={reveal}
              onClick={() => setReveal(!reveal)}
            >
              {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
              {reveal ? "ซ่อนรหัสผ่านชั่วคราว" : "แสดงรหัสผ่านชั่วคราว"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={async () => {
                setCopyError("");
                try {
                  try {
                    await navigator.clipboard.writeText(
                      result.temporaryPassword,
                    );
                  } catch {
                    const input = document.querySelector<HTMLInputElement>(
                      'input[name="temporaryPassword"]',
                    );
                    input?.focus();
                    input?.select();
                    if (!document.execCommand("copy"))
                      throw Error(
                        "คัดลอกไม่ได้ กรุณากดแสดงรหัสผ่านแล้วคัดลอกด้วยตนเอง",
                      );
                  }
                  notify("คัดลอกรหัสผ่านแล้ว");
                } catch (e) {
                  setCopyError((e as Error).message);
                }
              }}
            >
              <Copy size={17} />
              คัดลอกรหัสผ่าน
            </button>
          </div>
          {copyError && <ErrorBox error={copyError} />}
          <p className="muted">
            หมดอายุ {date(result.expiresAt)}{" "}
            ลูกค้าต้องเปลี่ยนรหัสผ่านใหม่ก่อนใช้งาน
          </p>
          <button className="button primary" type="button" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </>
      ) : (
        <>
          <p className="warning-box">
            {mode === "profile"
              ? "การบันทึกจะออกจากระบบทุกอุปกรณ์ของลูกค้า หากเปลี่ยนอีเมล ระบบจะยกเลิกการเชื่อม Google เดิม บัญชีที่ใช้ Google อย่างเดียวต้องรีเซ็ตรหัสผ่านก่อนเปลี่ยนอีเมล"
              : "ระบบจะยกเลิกรหัสเดิม ออกจากระบบทุกอุปกรณ์ และสร้างรหัสชั่วคราวอายุ 24 ชั่วโมง ลูกค้าต้องตั้งรหัสใหม่ก่อนใช้งาน"}
          </p>
          <Form
            noValidate
            submit={
              mode === "profile" ? "บันทึกข้อมูลลูกค้า" : "ยืนยันรีเซ็ตรหัสผ่าน"
            }
            onCancel={onClose}
            onSubmit={async (f) => {
              const data = formObject(f);
              const response = await send(
                `/admin/members/${row.id}/${mode === "profile" ? "profile" : "reset-password"}`,
                { ...data, version: row.member_version },
                mode === "profile" ? "PUT" : "POST",
              );
              changed();
              notify(
                mode === "profile"
                  ? "บันทึกข้อมูลลูกค้าแล้ว"
                  : "รีเซ็ตรหัสผ่านแล้ว",
              );
              if (mode === "reset") setResult(response);
              else onClose();
            }}
          >
            {mode === "profile" && (
              <>
                <div className="form-grid">
                  <Field
                    label="ชื่อหน้า"
                    name="firstName"
                    defaultValue={row.first_name}
                    required
                    maxLength={80}
                    autoComplete="off"
                  />
                  <Field
                    label="นามสกุล"
                    name="lastName"
                    defaultValue={row.last_name}
                    required
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>
                <Field
                  label="อีเมลลูกค้า"
                  name="email"
                  type="email"
                  defaultValue={row.email}
                  required
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Field
                  label="เบอร์โทร"
                  name="phone"
                  type="tel"
                  defaultValue={row.phone}
                  required
                  maxLength={30}
                  autoComplete="off"
                />
                <Field
                  label="รู้จักเราจากที่ไหน"
                  name="discoverySource"
                  defaultValue={row.discovery_source}
                  maxLength={120}
                />
                <Field
                  label="Line ID Add"
                  name="lineId"
                  defaultValue={row.line_id}
                  maxLength={100}
                  autoComplete="off"
                  spellCheck={false}
                />
              </>
            )}
            <Field
              label="รหัสผ่านผู้ดำเนินการ"
              name="actorPassword"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              help="ยืนยันด้วยรหัสผ่านบัญชีของคุณ"
            />
          </Form>
        </>
      )}
    </Modal>
  );
}
