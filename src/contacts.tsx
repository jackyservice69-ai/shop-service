import platforms from "../shared/socials.json";
import { useApp } from "./api";
import { Landmark } from "lucide-react";
import { useState } from "react";
import bankLogos from "../shared/bank-logos.json";

const bankAssets: Record<
  string,
  { file: string; background: string; name: string }
> = bankLogos;

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
  const [failedFile, setFailedFile] = useState("");
  const logo =
    bankAssets[
      String(code || "")
        .trim()
        .padStart(3, "0")
    ];
  const available = logo && failedFile !== logo.file;
  return (
    <span
      className="bank-logo receiving-bank-logo"
      role="img"
      aria-label={name || logo?.name || "ธนาคาร"}
      style={available ? { backgroundColor: logo.background } : undefined}
    >
      {available ? (
        <img
          className={logo.file === "ttb.svg" ? "bank-logo-padded" : undefined}
          src={"/assets/banks/" + logo.file}
          alt=""
          width={28}
          height={28}
          onError={() => setFailedFile(logo.file)}
        />
      ) : (
        <Landmark size={24} aria-hidden="true" />
      )}
    </span>
  );
}
