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
          <rect x="1" y="1" width="52" height="38" rx="8" />
          <path d="M19 1L24 10H31L36 1M1 13H19L24 10V30L19 39M53 13H36L31 10V30L36 39M1 27H19L24 30H31L36 27H53" />
        </svg>
        <div>
          <span className="wallet-card-label">ยอดเงินพร้อมใช้</span>
          <strong aria-label={money(balance)}>
            <img
              className="wallet-gold-coin"
              src="/assets/iya-refresh-v5/gold-coin.webp"
              alt=""
              width={36}
              height={36}
              aria-hidden="true"
            />
            {(balance / 100).toLocaleString("th-TH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
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
