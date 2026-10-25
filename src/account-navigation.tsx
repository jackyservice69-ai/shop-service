import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import "./account-navigation.css";

const links = [
  ["/account", "ข้อมูลบัญชี"],
  ["/orders", "คำสั่งซื้อ"],
  ["/wallet", "กระเป๋าเงิน"],
  ["/addresses", "ที่อยู่จัดส่ง"],
  ["/coupons", "คูปอง"],
  ["/referrals", "ชวนเพื่อน"],
  ["/consignment", "ฝากขาย"],
] as const;

export function AccountNavigation({
  navigationOpen,
}: {
  navigationOpen: boolean;
}) {
  const location = useLocation();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    if (disclosure.current) disclosure.current.open = false;
  }, [location.key]);
  useEffect(() => {
    if (!navigationOpen && disclosure.current) disclosure.current.open = false;
  }, [navigationOpen]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        !disclosure.current?.contains(event.target as Node) &&
        disclosure.current
      )
        disclosure.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details
      ref={disclosure}
      className="account-navigation"
      data-active={
        links.some(([path]) => location.pathname === path) || undefined
      }
      onKeyDown={(event) => {
        if (event.key === "Escape" && disclosure.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          disclosure.current.open = false;
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
      onClick={(event) => {
        if ((event.target as Element).closest("a")) {
          if (disclosure.current) disclosure.current.open = false;
          requestAnimationFrame(() =>
            document
              .getElementById("main-content")
              ?.focus({ preventScroll: true }),
          );
        }
      }}
    >
      <summary ref={trigger}>
        บัญชีของฉัน <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="account-navigation-links">
        {links.map(([path, label]) => (
          <NavLink to={path} key={path}>
            {label}
          </NavLink>
        ))}
      </div>
    </details>
  );
}
