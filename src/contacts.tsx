import platforms from "../shared/socials.json";
import { useApp } from "./api";
import { Landmark } from "lucide-react";

export function SocialLinks() {
  const { publicData } = useApp();
  const active = platforms.filter(
    (p) =>
      publicData?.socialVisibility?.[p.key] !== false &&
      publicData?.socials?.[p.key],
  );
  return active.length ? (
    <nav className="social-links" aria-label="ช่องทางติดต่อร้าน">
      {active.map((p) => (
        <a
          key={p.key}
          href={publicData.socials[p.key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={"ติดต่อทาง " + p.label}
          title={p.label}
        >
          <img
            src={"/assets/brands/" + p.key + ".svg"}
            alt=""
            width={28}
            height={28}
          />
          <span>{p.label}</span>
        </a>
      ))}
    </nav>
  ) : null;
}
export function BankLogo({ code, name }: { code?: string; name?: string }) {
  return code === "014" ? (
    <img
      className="receiving-bank-logo"
      src="/assets/brands/scb.svg"
      alt={name || "ธนาคารไทยพาณิชย์"}
      width={130}
      height={48}
    />
  ) : (
    <span className="bank-logo" role="img" aria-label={name || "ธนาคาร"}>
      <Landmark size={28} aria-hidden="true" />
    </span>
  );
}
