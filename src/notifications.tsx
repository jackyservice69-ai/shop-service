import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  Clock3,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import { api, send, useApp, date } from "./api";
import { Modal, Loading, ErrorBox } from "./ui";
import "./notifications.css";

type Notice = {
  id: number;
  kind: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
};
type Summary = { unreadCount: number; snapshot: number };
type Feed = Summary & { items: Notice[]; nextCursor: number | null };
const REFRESH_EVENT = "notifications:refresh";

export function NotificationBell() {
  const { user } = useApp();
  return user && !user.mustChangePassword ? (
    <SessionBell key={user.id + ":" + user.permissions.join(",")} />
  ) : null;
}

function SessionBell() {
  const { refresh } = useApp(),
    navigate = useNavigate();
  const [summary, setSummary] = useState<Summary>({
    unreadCount: 0,
    snapshot: 0,
  });
  const [summaryFailed, setSummaryFailed] = useState(false),
    [opened, setOpened] = useState(false);
  const [items, setItems] = useState<Notice[]>([]),
    [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState<number | "all" | null>(null),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    summarySequence = useRef(0),
    feedSequence = useRef(0),
    refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    let inFlight = false,
      pending = false;
    const update = async () => {
      if (document.hidden) return;
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      const sequence = ++summarySequence.current;
      try {
        const data = await api<Feed>("/notifications?size=1", {
          signal: abort.signal,
        });
        if (!abort.signal.aborted && sequence === summarySequence.current) {
          setSummary(data);
          setSummaryFailed(false);
        }
      } catch (e: any) {
        if (abort.signal.aborted) return;
        setSummaryFailed(true);
        if (e.status === 401 || e.status === 403) {
          setItems([]);
          setSummary({ unreadCount: 0, snapshot: 0 });
          void refreshRef.current().catch(() => {});
        }
      } finally {
        inFlight = false;
        if (pending && !abort.signal.aborted) {
          pending = false;
          void update();
        }
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener(REFRESH_EVENT, update);
    return () => {
      abort.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener(REFRESH_EVENT, update);
    };
  }, []);

  function applySummary(data: Summary) {
    ++summarySequence.current;
    setSummary({ unreadCount: data.unreadCount, snapshot: data.snapshot });
    setSummaryFailed(false);
  }
  async function load(before?: number) {
    const sequence = ++feedSequence.current,
      signal = controller.current?.signal;
    setLoading(true);
    setError("");
    try {
      const data = await api<Feed>(
        "/notifications?size=20" + (before ? "&before=" + before : ""),
        { signal },
      );
      if (signal?.aborted || sequence !== feedSequence.current) return;
      setItems((previous) =>
        before
          ? [
              ...previous,
              ...data.items.filter(
                (n) => !previous.some((old) => old.id === n.id),
              ),
            ]
          : data.items,
      );
      setNextCursor(data.nextCursor);
      applySummary(data);
    } catch (e: any) {
      if (!signal?.aborted && sequence === feedSequence.current)
        setError(e.message);
    } finally {
      if (!signal?.aborted && sequence === feedSequence.current)
        setLoading(false);
    }
  }
  async function read(item: Notice) {
    if (busy !== null) return;
    setBusy(item.id);
    setError("");
    try {
      if (!item.read_at)
        applySummary(await send(`/notifications/${item.id}/read`, {}));
      setItems((previous) =>
        previous.map((n) =>
          n.id === item.id
            ? { ...n, read_at: n.read_at || new Date().toISOString() }
            : n,
        ),
      );
      setOpened(false);
      navigate(item.href, { state: { notificationId: item.id } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function readAll() {
    if (busy !== null || !items.length) return;
    const through = items[0].id;
    setBusy("all");
    setError("");
    try {
      applySummary(await send("/notifications/read-all", { through }));
      setItems((previous) =>
        previous.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
        })),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  const count = summary.unreadCount;
  return (
    <>
      <button
        type="button"
        className="notification-bell"
        aria-haspopup="dialog"
        aria-expanded={opened}
        aria-label={
          summaryFailed
            ? "การแจ้งเตือน โหลดไม่สำเร็จ"
            : count
              ? `การแจ้งเตือน ยังไม่อ่าน ${count} รายการ`
              : "การแจ้งเตือน"
        }
        title="การแจ้งเตือน"
        onClick={() => {
          setOpened(true);
          setItems([]);
          setNextCursor(null);
          void load();
        }}
      >
        <Bell size={20} aria-hidden="true" />
        {(summaryFailed || count > 0) && (
          <span className="notification-count" aria-hidden="true">
            {summaryFailed ? "!" : count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <span className="notification-status" role="status">
        {count > 0 ? `การแจ้งเตือนที่ยังไม่อ่าน ${count} รายการ` : ""}
      </span>
      {opened && (
        <Modal title="การแจ้งเตือน" onClose={() => setOpened(false)}>
          <div className="notification-toolbar">
            <p className="muted">ยังไม่อ่าน {count} รายการ</p>
            <button
              type="button"
              className="button secondary small"
              disabled={loading || busy !== null}
              onClick={() => void load()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              โหลดใหม่
            </button>
            <button
              type="button"
              className="button secondary small"
              disabled={loading || busy !== null || !items.length || !count}
              onClick={() => void readAll()}
            >
              <CheckCheck size={16} aria-hidden="true" />
              {busy === "all" ? "กำลังบันทึก…" : "อ่านทั้งหมด"}
            </button>
          </div>
          {summary.snapshot > (items[0]?.id || 0) && items.length > 0 && (
            <p className="notification-new">
              มีรายการใหม่ กด “โหลดใหม่” เพื่อดูรายการล่าสุด
            </p>
          )}
          {error && <ErrorBox error={error} retry={() => void load()} />}
          {loading && !items.length ? (
            <Loading />
          ) : !items.length && !error ? (
            <div className="notification-empty">
              <Bell size={28} aria-hidden="true" />
              <p>ยังไม่มีการแจ้งเตือน</p>
              <small>คำขอและผลอนุมัติที่เกี่ยวข้องกับคุณจะแสดงที่นี่</small>
            </div>
          ) : null}
          <ul
            className="notification-feed"
            aria-label="รายการแจ้งเตือน"
            aria-busy={loading}
          >
            {items.map((item) => {
              const Icon =
                item.kind === "approved"
                  ? CheckCircle2
                  : ["rejected", "suspended"].includes(item.kind)
                    ? XCircle
                    : Clock3;
              return (
                <li
                  key={item.id}
                  className={item.read_at ? "is-read" : "is-unread"}
                >
                  <Link
                    to={item.href}
                    aria-disabled={busy !== null || undefined}
                    onClick={(event) => {
                      if (
                        event.ctrlKey ||
                        event.metaKey ||
                        event.shiftKey ||
                        event.altKey ||
                        event.button !== 0
                      )
                        return;
                      event.preventDefault();
                      if (busy === null) void read(item);
                    }}
                  >
                    <Icon
                      className="notification-kind"
                      size={22}
                      aria-hidden="true"
                    />
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                      <small>
                        <time dateTime={item.created_at}>
                          {date(item.created_at)}
                        </time>
                        <span className="notification-read-state">
                          {item.read_at ? "อ่านแล้ว" : "ยังไม่อ่าน"}
                        </span>
                      </small>
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {nextCursor !== null && (
            <button
              type="button"
              className="button secondary notification-more"
              disabled={loading || busy !== null}
              onClick={() => void load(nextCursor)}
            >
              {loading ? "กำลังโหลด…" : "ดูรายการก่อนหน้า"}
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
