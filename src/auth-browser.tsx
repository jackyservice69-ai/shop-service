import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  browserNames,
  browserReturnUrl,
  validCallback,
  type AuthBrowser,
} from "../shared/auth-browser.mjs";
import { ErrorBox, Field } from "./ui";

export function BrowserRecoveryPage() {
  const [failure, setFailure] = useState("");
  const [copied, setCopied] = useState(false);
  const [callback] = useState(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const provider = fragment.get("provider") || "";
    const browser = fragment.get("browser") || "";
    const values = {
      state: fragment.get("state"),
      code: fragment.get("code"),
      error: fragment.get("error"),
    };
    if (
      !validCallback(provider, values) ||
      !Object.hasOwn(browserNames, browser)
    )
      return null;
    const target = new URL(`/api/auth/${provider}/callback`, location.origin);
    target.searchParams.set("state", values.state!);
    target.searchParams.set(
      values.error ? "error" : "code",
      values.error || values.code!,
    );
    target.searchParams.set("browser_return", "1");
    return {
      provider,
      browser: browser as AuthBrowser,
      target,
      mode: fragment.get("mode"),
    };
  });
  useEffect(() => {
    history.replaceState(
      history.state,
      "",
      location.pathname + location.search,
    );
  }, []);
  if (!callback)
    return (
      <div className="contained narrow google-complete">
        <section className="panel">
          <h1>กลับไปเบราว์เซอร์เดิม</h1>
          <ErrorBox error="ไม่พบขั้นตอนยืนยัน กรุณาเปิดเบราว์เซอร์ที่ใช้งานและเริ่มเชื่อมต่อใหม่" />
          <Link className="button secondary" to="/account">
            กลับบัญชีของฉัน
          </Link>
        </section>
      </div>
    );
  const name = browserNames[callback.browser];
  const manual = callback.browser === "safari" || callback.browser === "same";
  const fallback = new URL("/auth/browser-return", location.origin);
  return (
    <div className="contained narrow google-complete">
      <section className="panel">
        <img
          src={`/assets/brands/${callback.provider}.svg`}
          alt={callback.provider === "line" ? "LINE" : "Google"}
          width="32"
          height="32"
        />
        <h1>กลับไปยืนยันใน {name}</h1>
        <p>
          เริ่มเชื่อมต่อจาก {name}{" "}
          แต่ผู้ให้บริการเปิดผลกลับมาในอีกเบราว์เซอร์หนึ่ง
          กรุณากลับไปยังเบราว์เซอร์เดิมเพื่อยืนยันให้เสร็จ
        </p>
        <p className="info-box">
          ขั้นตอนมีอายุ 10 นาที หากหมดอายุ
          ให้เริ่มเชื่อมต่อใหม่จากเบราว์เซอร์ที่ต้องการใช้งาน
        </p>
        {!manual && (
          <a
            className="button primary"
            href={browserReturnUrl(
              callback.target.href,
              fallback.href,
              callback.browser,
            )}
            rel="noreferrer"
          >
            กลับไปยืนยันใน {name}
          </a>
        )}
        <p>
          {manual
            ? `เปิด ${name} ที่เริ่มเชื่อมต่อไว้ แล้ววางลิงก์ยืนยันในช่องที่อยู่เว็บไซต์`
            : "หากปุ่มเปิดเบราว์เซอร์ไม่ได้ ให้คัดลอกลิงก์แล้วเปิดในเบราว์เซอร์เดิม"}
        </p>
        <button
          type="button"
          className={manual ? "button primary" : "button secondary"}
          onClick={async () => {
            setFailure("");
            try {
              await navigator.clipboard.writeText(callback.target.href);
              setCopied(true);
            } catch {
              setFailure(
                "คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกลิงก์ในช่องด้านล่าง",
              );
            }
          }}
        >
          คัดลอกลิงก์ยืนยัน
        </button>
        {copied && (
          <p role="status" className="positive">
            คัดลอกแล้ว กรุณาวางใน {name} ที่เริ่มเชื่อมต่อ
          </p>
        )}
        {failure && (
          <>
            <ErrorBox error={failure} />
            <Field
              label="ลิงก์ยืนยันชั่วคราว"
              name="callback"
              readOnly
              value={callback.target.href}
            />
          </>
        )}
        <p className="auth-switch">
          <Link to={callback.mode === "link" ? "/account" : "/login"}>
            กลับไปเริ่มใหม่
          </Link>
        </p>
      </section>
    </div>
  );
}
