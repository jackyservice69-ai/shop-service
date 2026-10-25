import { useId } from "react";
import { ShieldCheck, Wallet } from "lucide-react";
import { money } from "./api";
import { Brand } from "./ui";

export function WalletCard({
  balance,
  holder,
}: {
  balance: number;
  holder: string;
}) {
  const chipGradientId = useId();
  return (
    <section className="wallet-card" aria-label="บัตรกระเป๋าเงินของฉัน">
      <div className="wallet-card-header">
        <div className="wallet-card-brand">
          <Brand variant="wallet" />
          <span className="wallet-card-caption">WALLET CARD</span>
        </div>
        <span className="wallet-card-type">
          <Wallet size={22} aria-hidden="true" />
          กระเป๋าเงินดิจิทัล
        </span>
      </div>
      <div className="wallet-card-balance">
        <svg
          className="wallet-card-chip"
          viewBox="0 0 54 40"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient
              id={chipGradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#94631c" />
              <stop offset="22%" stopColor="#e5bc58" />
              <stop offset="46%" stopColor="#fff1b6" />
              <stop offset="64%" stopColor="#ddb048" />
              <stop offset="85%" stopColor="#b47d26" />
              <stop offset="100%" stopColor="#f4d17a" />
            </linearGradient>
          </defs>
          <rect
            x="1"
            y="1"
            width="52"
            height="38"
            rx="8"
            fill={`url(#${chipGradientId})`}
          />
          <path d="M19 1L24 10H31L36 1M1 13H19L24 10V30L19 39M53 13H36L31 10V30L36 39M1 27H19L24 30H31L36 27H53" />
        </svg>
        <div>
          <span className="wallet-card-label">ยอดเงินพร้อมใช้</span>
          <strong aria-label={money(balance)}>
            <span className="wallet-currency" aria-hidden="true">
              ฿
            </span>
            <span className="wallet-card-value">
              {(balance / 100).toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </strong>
        </div>
      </div>
      <div className="wallet-card-footer">
        <div className="wallet-card-holder">
          <span className="wallet-card-label">เจ้าของกระเป๋าเงิน</span>
          <span className="wallet-card-name">{holder || "—"}</span>
        </div>
        <span className="wallet-card-assurance">
          <ShieldCheck size={17} aria-hidden="true" />
          พร้อมช้อปในร้าน
        </span>
      </div>
    </section>
  );
}
