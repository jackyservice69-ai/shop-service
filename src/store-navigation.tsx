import { useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AccountNavigation } from "./account-navigation";
import "./store-navigation.css";

export function StoreNavigation({ showAccount }: { showAccount: boolean }) {
  const scroller = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    lastX: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const finish = (pointerId: number) => {
    if (drag.current?.pointerId !== pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    setDragging(false);
    if (scroller.current?.hasPointerCapture(pointerId))
      scroller.current.releasePointerCapture(pointerId);
  };
  return (
    <nav
      ref={scroller}
      className={"store-navigation" + (dragging ? " is-dragging" : "")}
      aria-label="เมนูหน้าร้าน"
      tabIndex={0}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          event.currentTarget.scrollWidth <= event.currentTarget.clientWidth ||
          (event.target as Element).closest(".account-navigation-links")
        )
          return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          lastX: event.clientX,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!(event.buttons & 1)) {
          finish(event.pointerId);
          return;
        }
        if (!current.moved) {
          if (Math.abs(event.clientX - current.startX) < 6) return;
          current.moved = true;
          setDragging(true);
          event.currentTarget
            .querySelectorAll<HTMLDetailsElement>("details[open]")
            .forEach((details) => {
              details.open = false;
            });
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        event.currentTarget.scrollBy({
          left: current.lastX - event.clientX,
          behavior: "instant",
        });
        current.lastX = event.clientX;
      }}
      onPointerUp={(event) => finish(event.pointerId)}
      onPointerCancel={(event) => finish(event.pointerId)}
      onLostPointerCapture={(event) => finish(event.pointerId)}
      onPointerLeave={() => {
        if (!drag.current?.moved) drag.current = null;
      }}
      onDragStart={(event) => {
        if (!(event.target as Element).closest(".account-navigation-links"))
          event.preventDefault();
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={() => {
        suppressClick.current = false;
      }}
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement,
          node = scroller.current;
        if (
          !node ||
          target === node ||
          target.closest(".account-navigation-links")
        )
          return;
        const frame = node.getBoundingClientRect(),
          item = target.getBoundingClientRect();
        if (item.left < frame.left + 4)
          node.scrollBy({
            left: item.left - frame.left - 4,
            behavior: "instant",
          });
        else if (item.right > frame.right - 4)
          node.scrollBy({
            left: item.right - frame.right + 4,
            behavior: "instant",
          });
      }}
      onClick={(event) => {
        if ((event.target as Element).closest("a"))
          requestAnimationFrame(() =>
            document
              .getElementById("main-content")
              ?.focus({ preventScroll: true }),
          );
      }}
    >
      <div className="store-navigation-track">
        <NavLink to="/" end className="store-primary-link">
          หน้าหลัก
        </NavLink>
        <NavLink to="/products" className="store-primary-link">
          เลือกซื้อสินค้า
        </NavLink>
        <NavLink to="/promotions">โปรโมชั่น</NavLink>
        <NavLink to="/how-to-order">วิธีสั่งซื้อ</NavLink>
        {showAccount && <AccountNavigation />}
        <Link to="/#store-contact">ติดต่อเรา</Link>
      </div>
    </nav>
  );
}
