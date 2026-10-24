import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, send, useApp } from "./api";
import { ErrorBox, Field, Form, Loading, formObject } from "./ui";
import { DiscoverySourceField, registrationValues } from "./discovery-source";

export function GoogleButton({
  register = false,
  next = "/",
  referralCode = "",
  divider = true,
}: {
  register?: boolean;
  next?: string;
  referralCode?: string;
  divider?: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () => {
    setError("");
    api("/auth/google/status")
      .then((d) => setEnabled(d.enabled))
      .catch(() => setError("ตรวจสอบ Google Login ไม่สำเร็จ กรุณาลองอีกครั้ง"));
  };
  useEffect(load, []);
  return (
    <div className="google-auth">
      <button
        type="button"
        className="google-button"
        disabled={!enabled || busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const d = await send("/auth/google/start", { next, referralCode });
            const url = new URL(d.url);
            if (url.origin !== "https://accounts.google.com")
              throw new Error("เปิด Google Login ไม่สำเร็จ");
            window.location.assign(url.href);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <img src="/assets/brands/google.svg" width="20" height="20" alt="" />
        <span>
          {busy
            ? "กำลังไปยัง Google…"
            : register
              ? "สมัครสมาชิกด้วย Google"
              : "เข้าสู่ระบบด้วย Google"}
        </span>
      </button>
      {enabled === false && (
        <p className="field-help">
          Google Login ยังไม่เปิดใช้งาน กรุณาใช้อีเมลด้านล่าง
        </p>
      )}
      {error && (
        <ErrorBox error={error} retry={enabled === null ? load : undefined} />
      )}
      {divider && (
        <div className="auth-divider">
          <span>หรือใช้อีเมล</span>
        </div>
      )}
    </div>
  );
}

type Pending = {
  email: string;
  firstName: string;
  lastName: string;
  existingAccount: boolean;
  referralCode: string;
};
export function GoogleCompletePage() {
  const [pending, setPending] = useState<Pending | null>(null),
    [error, setError] = useState("");
  const { refresh, notify } = useApp();
  const navigate = useNavigate();
  const load = () => {
    setError("");
    api<Pending>("/auth/google/pending")
      .then(setPending)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  return (
    <div className="contained narrow google-complete">
      <section className="panel">
        <img
          src="/assets/brands/google.svg"
          width="28"
          height="28"
          alt="Google"
        />
        <h1>
          {pending?.existingAccount
            ? "เชื่อม Google กับบัญชีเดิม"
            : "เติมข้อมูลสมาชิก"}
        </h1>
        {error ? (
          <>
            <ErrorBox error={error} retry={load} />
            <Link className="button secondary" to="/login">
              กลับไปเข้าสู่ระบบ
            </Link>
          </>
        ) : !pending ? (
          <Loading />
        ) : (
          <>
            <p className="google-verified-email">{pending.email}</p>
            <p className="muted">
              {pending.existingAccount
                ? "อีเมลนี้มีบัญชีอยู่แล้ว ยืนยันรหัสผ่านเดิมเพื่อเชื่อม Google กระเป๋าเงินและข้อมูลของคุณจะใช้บัญชีเดิม"
                : "Google ยืนยันอีเมลแล้ว กรุณาเติมข้อมูลสำหรับติดต่อและจัดส่งสินค้า ครั้งต่อไปเข้าสู่ระบบด้วย Google ได้เลย"}
            </p>
            <Form
              noValidate
              submit={
                pending.existingAccount
                  ? "ยืนยันและเชื่อม Google"
                  : "สร้างบัญชีด้วย Google"
              }
              onSubmit={async (f) => {
                const d = await send("/auth/google/complete", {
                  ...(pending.existingAccount
                    ? formObject(f)
                    : registrationValues(f)),
                  action: pending.existingAccount ? "link" : "register",
                });
                await refresh();
                notify("เข้าสู่ระบบด้วย Google เรียบร้อยแล้ว");
                navigate(d.redirectTo || "/", { replace: true });
              }}
            >
              {pending.existingAccount ? (
                <Field
                  label="รหัสผ่านบัญชีเดิม"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              ) : (
                <>
                  <div className="form-grid">
                    <Field
                      label="ชื่อหน้า"
                      name="firstName"
                      defaultValue={pending.firstName}
                      required
                      maxLength={80}
                      autoComplete="given-name"
                    />
                    <Field
                      label="นามสกุล"
                      name="lastName"
                      defaultValue={pending.lastName}
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
                    maxLength={30}
                    required
                    help="เบอร์ไทย หรือเบอร์พร้อมรหัสประเทศ เช่น +66812345678"
                  />
                  <DiscoverySourceField />
                  <Field
                    label="Line ID Add"
                    name="lineId"
                    maxLength={100}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    help="ไม่บังคับ"
                  />
                  <Field
                    label="รหัสแนะนำเพื่อน (ถ้ามี)"
                    name="referralCode"
                    defaultValue={pending.referralCode}
                    maxLength={40}
                  />
                </>
              )}
            </Form>
            <p className="auth-switch">
              <Link to="/login">กลับไปเข้าสู่ระบบด้วยอีเมล</Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
