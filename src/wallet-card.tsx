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
      <svg
        className="wallet-card-art"
        viewBox="0 0 480 300"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="wallet-card-ribbon"
          d="M150 310C290 252 309 159 490 142V300Z"
        />
        <path
          className="wallet-card-thread"
          d="M126 310C280 257 321 145 490 131M193 310C330 263 346 190 490 181"
        />
        <g className="wallet-card-flower">
          <path d="M459 141C428 131 414 110 410 83C435 90 450 108 459 141ZM459 141C454 112 464 87 480 72C486 102 477 125 459 141ZM459 141C436 146 414 142 398 127C421 120 442 126 459 141ZM459 141C441 159 424 161 407 160C420 145 438 139 459 141ZM459 141C465 157 480 170 494 173C495 156 478 143 459 141ZM459 141C460 165 451 184 436 196C433 171 441 153 459 141Z" />
          <circle cx="459" cy="141" r="5" />
          <path d="M459 146C459 178 470 198 487 217" />
        </g>
      </svg>
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
          <strong>{money(balance)}</strong>
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
