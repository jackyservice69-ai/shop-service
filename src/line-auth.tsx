import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { send, useApp, useData } from "./api";
import { ErrorBox, Field, Form, Loading, Modal, formObject } from "./ui";
import { DiscoverySourceField, registrationValues } from "./discovery-source";

export function LineButton({
  register = false,
  next = "/",
  referralCode = "",
}: {
  register?: boolean;
  next?: string;
  referralCode?: string;
}) {
  const { data, error, loading, reload } = useData<{ enabled: boolean }>(
    "/auth/line/status",
  );
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  return (
    <div className="line-auth">
      <button
        type="button"
        className="google-button"
        disabled={loading || !data?.enabled || busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setFailure("");
          try {
            const result = await send("/auth/line/start", {
              next,
              referralCode,
            });
            const url = new URL(result.url);
            if (url.origin !== "https://access.line.me")
              throw new Error("เปิด LINE Login ไม่สำเร็จ");
            window.location.assign(url.href);
          } catch (e) {
            setFailure((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <img src="/assets/brands/line.svg" alt="" width="24" height="24" />
        <span>
          {busy
            ? "กำลังไปยัง LINE…"
            : register
              ? "สมัครสมาชิกด้วย LINE"
              : "เข้าสู่ระบบด้วย LINE"}
        </span>
      </button>
      {data?.enabled === false && (
        <p className="field-help">LINE Login ยังไม่เปิดใช้งาน</p>
      )}
      {(error || failure) && (
        <ErrorBox error={error || failure} retry={error ? reload : undefined} />
      )}
    </div>
  );
}

type Connections = {
  google: { enabled: boolean; linked: boolean; connectionId: string };
  line: {
    enabled: boolean;
    linked: boolean;
    displayName: string;
    topupEnabled: boolean;
    connectionId: string;
  };
};
export function SocialConnections() {
  const { user, notify } = useApp();
  const { data, error, loading, reload } =
    useData<Connections>("/auth/connections");
  const [provider, setProvider] = useState<"google" | "line" | null>(null);
  const [action, setAction] = useState<"link" | "unlink">("link");
  const [expectedConnection, setExpectedConnection] = useState("");
  const [params, setParams] = useSearchParams();
  return (
    <section className="panel section-space social-connections">
      <h2>เชื่อมต่อบัญชี</h2>
      <p className="muted">
        เข้าสู่ระบบด้วย Google หรือ LINE โดยใช้บัญชีสมาชิกและกระเป๋าเงินเดิม
      </p>
      {["google", "line"].map((key) =>
        params.get(key) === "linked" ? (
          <p key={key} role="status" className="positive">
            เชื่อมต่อ {key === "line" ? "LINE" : "Google"} สำเร็จแล้ว
          </p>
        ) : params.get(key) === "link_failed" ? (
          <ErrorBox
            key={key}
            error={`เชื่อมต่อ ${key === "line" ? "LINE" : "Google"} ไม่สำเร็จ อาจยกเลิก ขั้นตอนหมดอายุ หรือบัญชีนี้เชื่อมกับสมาชิกอื่นแล้ว กรุณาลองใหม่`}
          />
        ) : null,
      )}
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : (
        data && (
          <>
            {(["google", "line"] as const).map((key) => (
              <div className="social-connection-row" key={key}>
                <img
                  src={`/assets/brands/${key}.svg`}
                  alt=""
                  width="28"
                  height="28"
                />
                <div>
                  <strong>{key === "line" ? "LINE" : "Google"}</strong>
                  <p className="muted">
                    {data[key].linked
                      ? key === "line"
                        ? `เชื่อมต่อแล้ว · ${data.line.displayName}`
                        : "เชื่อมต่อแล้ว"
                      : data[key].enabled
                        ? "ยังไม่เชื่อมต่อ"
                        : "ร้านยังไม่เปิดใช้งาน"}
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={!data[key].enabled && !data[key].linked}
                  onClick={() => {
                    setAction(data[key].linked ? "unlink" : "link");
                    setExpectedConnection(data[key].connectionId);
                    setProvider(key);
                  }}
                >
                  {data[key].linked
                    ? `ยกเลิกการเชื่อมต่อ ${key === "line" ? "LINE" : "Google"}`
                    : `เชื่อมต่อ ${key === "line" ? "LINE" : "Google"}`}
                </button>
              </div>
            ))}
            <p className="info-box">
              {data.line.linked
                ? data.line.topupEnabled
                  ? "ส่งรูปสลิปในแชทส่วนตัวกับ LINE ร้านเพื่อเติมเงินได้ ระบบจะตรวจสอบผู้รับ ยอดเงิน และสลิปซ้ำก่อนเติมยอด"
                  : "เชื่อมต่อ LINE แล้ว ร้านยังไม่เปิดเติมเงินผ่าน LINE สามารถเติมเงินผ่านเว็บไซต์ได้"
                : "ต้องเชื่อมต่อ LINE ก่อนส่งสลิปเติมเงินในแชท LINE ร้าน ช่อง Line ID Add เป็นข้อมูลติดต่อและใช้ยืนยันการผูกบัญชีไม่ได้"}
            </p>
          </>
        )
      )}
      {provider && (
        <Modal
          title={`${action === "unlink" ? "ยกเลิกการเชื่อมต่อ" : "เชื่อมต่อ"} ${provider === "line" ? "LINE" : "Google"}`}
          onClose={() => setProvider(null)}
        >
          <p>
            {action === "unlink"
              ? "ยกเลิกการเชื่อมต่อของสมาชิก"
              : "เชื่อมกับสมาชิก"}{" "}
            {user?.name} ({user?.email})
            {action === "unlink"
              ? " ช่องทางนี้จะใช้เข้าสู่ระบบไม่ได้จนกว่าจะเชื่อมต่อใหม่ ยอดเงินและข้อมูลสมาชิกยังคงเดิม"
              : " เมื่ออนุญาตแล้วจะใช้บัญชีนี้เข้าสู่ระบบได้"}
          </p>
          {action === "unlink" && (
            <p className="info-box">
              {provider === "line"
                ? "หลังยกเลิก จะส่งสลิปเติมเงินผ่าน LINE ไม่ได้จนกว่าจะเชื่อมต่อใหม่ "
                : ""}
              ระบบจะออกจากระบบบนอุปกรณ์อื่นเพื่อความปลอดภัย
            </p>
          )}
          {action === "unlink" &&
            !user?.hasPassword &&
            !data?.[provider === "line" ? "google" : "line"].linked && (
              <ErrorBox error="กรุณาเชื่อมต่อช่องทางเข้าสู่ระบบอื่นก่อนยกเลิกช่องทางสุดท้าย" />
            )}
          {!user?.hasPassword && (
            <p className="info-box">
              ใช้การเข้าสู่ระบบล่าสุดยืนยัน หากเข้าสู่ระบบเกิน 10 นาที
              กรุณาออกแล้วเข้าสู่ระบบอีกครั้ง
            </p>
          )}
          <Form
            noValidate
            submit={
              action === "unlink"
                ? `ยืนยันยกเลิกการเชื่อมต่อ ${provider === "line" ? "LINE" : "Google"}`
                : `ยืนยันและไปยัง ${provider === "line" ? "LINE" : "Google"}`
            }
            danger={action === "unlink"}
            blocked={
              action === "unlink" &&
              !user?.hasPassword &&
              !data?.[provider === "line" ? "google" : "line"].linked
            }
            onCancel={() => setProvider(null)}
            onSubmit={async (f) => {
              if (action === "unlink") {
                await send(`/auth/${provider}/unlink`, {
                  ...formObject(f),
                  connectionId: expectedConnection,
                });
                setProvider(null);
                const nextParams = new URLSearchParams(params);
                nextParams.delete(provider);
                setParams(nextParams, { replace: true });
                notify(
                  `ยกเลิกการเชื่อมต่อ ${provider === "line" ? "LINE" : "Google"} แล้ว`,
                );
                reload();
                return;
              }
              const result = await send(`/auth/${provider}/start`, {
                ...formObject(f),
                intent: "link",
              });
              const url = new URL(result.url);
              if (
                url.origin !==
                (provider === "line"
                  ? "https://access.line.me"
                  : "https://accounts.google.com")
              )
                throw new Error("เปิดหน้าผู้ให้บริการไม่สำเร็จ");
              window.location.assign(url.href);
            }}
          >
            {user?.hasPassword && (
              <Field
                label={
                  action === "unlink"
                    ? "รหัสผ่านปัจจุบันเพื่อยกเลิกการเชื่อมต่อ"
                    : "รหัสผ่านปัจจุบันเพื่อเชื่อมต่อ"
                }
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            )}
          </Form>
        </Modal>
      )}
    </section>
  );
}

export function LineCompletePage() {
  const { data, error, loading, reload } = useData<{
    displayName: string;
    referralCode: string;
  }>("/auth/line/pending");
  const { refresh, notify } = useApp();
  const navigate = useNavigate();
  return (
    <div className="contained narrow google-complete">
      <section className="panel">
        <img src="/assets/brands/line.svg" width="32" height="32" alt="LINE" />
        <h1>เติมข้อมูลสมาชิก LINE</h1>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading ? (
          <Loading />
        ) : (
          data && (
            <>
              <p>
                LINE ยืนยันบัญชี {data.displayName} แล้ว
                กรุณากรอกข้อมูลติดต่อและตั้งรหัสผ่านสำหรับเว็บไซต์
              </p>
              <p className="info-box">
                มีบัญชีสมาชิกแล้ว? <Link to="/login">เข้าสู่ระบบบัญชีเดิม</Link>{" "}
                แล้วกดเชื่อมต่อ LINE ในหน้า “บัญชีของฉัน”
                เพื่อใช้กระเป๋าเงินเดิม
              </p>
              <Form
                noValidate
                submit="สร้างบัญชีและเชื่อมต่อ LINE"
                onSubmit={async (f) => {
                  await send("/auth/line/complete", registrationValues(f));
                  await refresh();
                  notify("สร้างบัญชีและเชื่อมต่อ LINE แล้ว");
                  navigate("/", { replace: true });
                }}
              >
                <div className="form-grid">
                  <Field
                    label="ชื่อหน้า"
                    name="firstName"
                    required
                    maxLength={80}
                    autoComplete="given-name"
                  />
                  <Field
                    label="นามสกุล"
                    name="lastName"
                    required
                    maxLength={80}
                    autoComplete="family-name"
                  />
                </div>
                <Field
                  label="เบอร์โทร"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={30}
                />
                <Field
                  label="อีเมล"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  maxLength={200}
                  help="ข้อมูลติดต่อสำหรับสมาชิก อีเมลนี้ไม่ได้รับการยืนยันโดย LINE"
                />
                <Field
                  label="รหัสผ่าน"
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  help="อย่างน้อย 12 ตัวอักษร"
                />
                <DiscoverySourceField />
                <Field
                  label="Line ID Add"
                  name="lineId"
                  maxLength={100}
                  help="ไม่บังคับ · ข้อมูลติดต่อเพิ่มเติม"
                />
                <Field
                  label="รหัสแนะนำเพื่อน (ถ้ามี)"
                  name="referralCode"
                  defaultValue={data.referralCode}
                  maxLength={40}
                />
              </Form>
            </>
          )
        )}
        <p className="auth-switch">
          <Link to="/login">กลับไปเข้าสู่ระบบ</Link>
        </p>
      </section>
    </div>
  );
}
