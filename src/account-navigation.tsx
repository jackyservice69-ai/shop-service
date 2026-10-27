import { useEffect, useId, useRef } from "react";
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

function fitDropdown(details: HTMLDetailsElement | null) {
  if (!details?.open) return;
  const panel = details.querySelector<HTMLElement>(".account-navigation-links");
  const trigger = details.querySelector("summary");
  const nav = details.closest<HTMLElement>(".store-navigation");
  if (!panel || !trigger || !nav) return;
  const anchor = trigger.getBoundingClientRect(),
    rail = nav.getBoundingClientRect();
  const viewport = window.visualViewport;
  const bottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  if (
    anchor.right <= rail.left ||
    anchor.left >= rail.right ||
    anchor.bottom <= 0 ||
    anchor.top >= bottom
  ) {
    if (panel.contains(document.activeElement))
      nav.focus({ preventScroll: true });
    details.open = false;
    return;
  }
  const width = panel.getBoundingClientRect().width;
  const left = Math.max(
    12,
    Math.min(
      anchor.right - width,
      document.documentElement.clientWidth - width - 12,
    ),
  );
  const top = anchor.bottom + 8;
  panel.style.setProperty("--account-menu-left", `${left}px`);
  panel.style.setProperty("--account-menu-top", `${top}px`);
  panel.style.setProperty(
    "--account-menu-max-height",
    `${Math.max(44, bottom - top - 12)}px`,
  );
}

export function AccountNavigation() {
  const location = useLocation();
  const panelId = useId();
  const supportsPopover =
    typeof HTMLElement !== "undefined" &&
    typeof HTMLElement.prototype.showPopover === "function";
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const pointerInside = useRef(false);
  useEffect(() => {
    if (disclosure.current) disclosure.current.open = false;
  }, [location.key]);
  useEffect(() => {
    const fit = () => fitDropdown(disclosure.current);
    const closeOutside = (event: PointerEvent) => {
      pointerInside.current =
        disclosure.current?.contains(event.target as Node) || false;
      if (
        !disclosure.current?.contains(event.target as Node) &&
        disclosure.current
      )
        disclosure.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);
  return (
    <details
      ref={disclosure}
      onToggle={(event) => {
        // Popover toggle events must not re-run the disclosure's toggle handler.
        if (event.target !== event.currentTarget) return;
        const panel = disclosure.current?.querySelector<HTMLElement>(
          ".account-navigation-links",
        );
        if (panel) {
          // Safari 17 supports the top layer. A plain fixed descendant can be
          // clipped by the horizontally scrolling navigation on older WebKit.
          if (typeof panel.showPopover === "function") {
            if (disclosure.current?.open) panel.showPopover();
            else panel.hidePopover();
          }
          if (disclosure.current?.open) panel.scrollTop = 0;
        }
        fitDropdown(disclosure.current);
      }}
      className="account-navigation"
      data-active={
        links.some(([path]) => location.pathname === path) || undefined
      }
      onKeyDown={(event) => {
        pointerInside.current = false;
        if (event.key === "Escape" && disclosure.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          disclosure.current.open = false;
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          // iOS can focus the scrollable nav instead of the tapped link. Keep
          // the menu mounted through its click; outside presses close above.
          !pointerInside.current &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
      onClick={(event) => {
        pointerInside.current = false;
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
      <summary ref={trigger} aria-controls={panelId}>
        บัญชีของฉัน <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div
        id={panelId}
        className="account-navigation-links"
        popover={supportsPopover ? "manual" : undefined}
      >
        {links.map(([path, label]) => (
          <NavLink to={path} key={path}>
            {label}
          </NavLink>
        ))}
      </div>
    </details>
  );
}
