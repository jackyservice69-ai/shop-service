import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Package } from "lucide-react";
import "./quick-categories.css";

const definitions = [
  { label: "กระเป๋า", match: /กระเป๋า|bag/i, art: "bag" },
  { label: "น้ำหอม", match: /น้ำหอม|perfume|fragrance/i, art: "perfume" },
  {
    label: "เครื่องประดับ",
    match: /เครื่องประดับ|จิวเวล|jewel|accessor/i,
    art: "jewelry",
  },
  {
    label: "อาหาร",
    match: /อาหาร|เครื่องดื่ม|ของกิน|ขนม|food|beverage|snack/i,
    art: "food",
  },
  { label: "เสื้อผ้า", match: /เสื้อ|แฟชั่น|cloth|fashion/i, art: "clothing" },
  {
    label: "เครื่องสำอาง",
    match: /เครื่องสำอาง|makeup|cosmetic/i,
    art: "makeup",
  },
  { label: "สกินแคร์", match: /สกินแคร์|บำรุงผิว|skin/i, art: "skincare" },
  { label: "บิวตี้", match: /บิวตี้|beauty/i, art: "beauty" },
  { label: "รองเท้า", match: /รองเท้า|shoe|footwear/i, art: "shoes" },
  { label: "นาฬิกา", match: /นาฬิกา|watch/i, art: "watch" },
  { label: "แว่นตา", match: /แว่น|glasses|eyewear/i, art: "eyewear" },
  {
    label: "ของใช้ในบ้าน",
    match: /ของใช้|ไลฟ์สไตล์|home|lifestyle/i,
    art: "home",
  },
  {
    label: "อุปกรณ์ไอที",
    match: /อุปกรณ์ไอที|อิเล็กทรอนิกส์|electronic/i,
    art: "tech",
  },
  {
    label: "แก็ตเจ็ต",
    match: /แก็ตเจ็ต|แก็ดเจ็ต|แกดเจ็ต|แกดเจท|gadget/i,
    art: "gadgets",
  },
  {
    label: "ของสะสม",
    match: /ของสะสม|ของเล่น|collect|toy/i,
    art: "collectibles",
  },
];

export function categoryArtwork(name: string) {
  return definitions.find((item) => item.match.test(name))?.art;
}

function revealCategoryLink(node: HTMLUListElement, link: HTMLAnchorElement) {
  const item = link.getBoundingClientRect();
  const viewport = node.getBoundingClientRect();
  const delta =
    item.left < viewport.left + 6
      ? item.left - viewport.left - 6
      : item.right > viewport.right - 6
        ? item.right - viewport.right + 6
        : 0;
  if (delta) node.scrollBy({ left: delta, behavior: "instant" });
}

export function QuickCategories({ categories }: { categories: string[] }) {
  const track = useRef<HTMLUListElement>(null);
  const keyboardLinkFocused = useRef(false);
  const mouseDrag = useRef<{
    pointerId: number;
    startX: number;
    lastX: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const available = [...new Set(categories.filter((name) => name.trim()))];
  const used = new Set<string>();
  const items = definitions.map((item) => {
    const value =
      available.find((name) => !used.has(name) && item.match.test(name)) ||
      item.label;
    used.add(value);
    return { ...item, value };
  });
  const extra = available
    .filter((name) => !used.has(name))
    .map((value) => ({
      label: value,
      value,
      art: definitions.find((item) => item.match.test(value))?.art,
    }));
  const entries = [...items, ...extra];
  const entriesKey = entries.map((item) => item.value).join("\0");
  const entryCount = entries.length;

  useLayoutEffect(() => {
    const node = track.current;
    if (!node) return;
    let cycleWidth = 0;
    const measure = () => {
      const first = node.children[0] as HTMLElement | undefined;
      const middle = node.children[entryCount] as HTMLElement | undefined;
      if (!first || !middle) return;
      const width = middle.offsetLeft - first.offsetLeft;
      if (width <= 0) return;
      if (width !== cycleWidth) {
        const relativePosition = cycleWidth
          ? (node.scrollLeft - cycleWidth) / cycleWidth
          : 0;
        cycleWidth = width;
        node.scrollTo({
          left: width * (1 + relativePosition),
          behavior: "instant",
        });
      }
      const focused = document.activeElement;
      if (focused instanceof HTMLAnchorElement && node.contains(focused))
        revealCategoryLink(node, focused);
    };
    const wrap = () => {
      // Side copies provide room for a free native swipe. Recenter onto the
      // identical content; never shift a link while it owns keyboard focus.
      if (!cycleWidth || keyboardLinkFocused.current) return;
      const cycles = Math.floor(
        (node.scrollLeft - cycleWidth / 2) / cycleWidth,
      );
      if (cycles)
        node.scrollTo({
          left: node.scrollLeft - cycles * cycleWidth,
          behavior: "instant",
        });
    };
    measure();
    node.addEventListener("scroll", wrap, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", wrap);
      observer.disconnect();
    };
  }, [entriesKey, entryCount]);

  function finishMouseDrag(pointerId: number) {
    const drag = mouseDrag.current;
    if (!drag || drag.pointerId !== pointerId) return;
    suppressClick.current = drag.moved;
    mouseDrag.current = null;
    setDragging(false);
  }

  return (
    <nav
      className="pastel-quick-categories quick-categories-strip"
      aria-label="เลือกหมวดหมู่สินค้า"
    >
      <div className="quick-categories-heading">
        <h2>ช้อปตามหมวดหมู่</h2>
        <p id={hintId}>ลากหรือปัดซ้าย–ขวาได้ต่อเนื่อง วนดูได้ทุกหมวด</p>
      </div>
      <ul
        ref={track}
        className={"quick-categories-track" + (dragging ? " is-dragging" : "")}
        tabIndex={0}
        aria-label="หมวดหมู่สินค้าแบบเลื่อน"
        aria-describedby={hintId}
        onPointerDown={(event) => {
          keyboardLinkFocused.current = false;
          suppressClick.current = false;
          if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          mouseDrag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            lastX: event.clientX,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = mouseDrag.current;
          if (!drag || event.pointerId !== drag.pointerId) return;
          if (!(event.buttons & 1)) {
            finishMouseDrag(event.pointerId);
            return;
          }
          if (!drag.moved) {
            if (Math.abs(event.clientX - drag.startX) < 6) return;
            drag.moved = true;
            keyboardLinkFocused.current = false;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          event.preventDefault();
          event.currentTarget.scrollBy({
            left: drag.lastX - event.clientX,
            behavior: "instant",
          });
          drag.lastX = event.clientX;
        }}
        onPointerUp={(event) => finishMouseDrag(event.pointerId)}
        onPointerCancel={(event) => finishMouseDrag(event.pointerId)}
        onLostPointerCapture={(event) => finishMouseDrag(event.pointerId)}
        onPointerLeave={() => {
          if (!mouseDrag.current?.moved) mouseDrag.current = null;
        }}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={() => {
          suppressClick.current = false;
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            keyboardLinkFocused.current = false;
        }}
        onFocusCapture={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          const node = track.current;
          if (!link || !node) {
            keyboardLinkFocused.current = false;
            return;
          }
          keyboardLinkFocused.current =
            link.closest("li")?.dataset.categoryCopy === "1";
          revealCategoryLink(node, link);
        }}
      >
        {[0, 1, 2].flatMap((copy) =>
          entries.map((item, index) => {
            return (
              <li
                key={copy + ":" + item.value}
                data-category-copy={copy}
                aria-hidden={copy !== 1 ? true : undefined}
              >
                <Link
                  to={"/products?category=" + encodeURIComponent(item.value)}
                  tabIndex={copy !== 1 ? -1 : undefined}
                >
                  <span
                    className={
                      "pastel-category-art " +
                      (item.art
                        ? "art-" + item.art
                        : "art-generic quick-category-icon tone-" + (index % 3))
                    }
                    aria-hidden="true"
                  >
                    {!item.art && <Package size={38} strokeWidth={1.6} />}
                  </span>
                  <span className="quick-category-label">
                    {item.value} <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          }),
        )}
      </ul>
    </nav>
  );
}
