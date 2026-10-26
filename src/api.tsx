import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { hasPermission } from "../shared/authorization.mjs";
export type User = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  discoverySource: string;
  lineId: string;
  avatar: string;
  avatarVersion: number;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  balance: number;
  referralCode: string;
  mustChangePassword: boolean;
  hasPassword: boolean;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  cost?: number;
  stock: number;
  image: string;
  images?: string[];
  active?: number;
  version?: number;
  rating_average?: number;
  review_count?: number;
  shop?: { name: string; image: string; logo?: string; serviceArea: string };
};
export type PageData<T = any> = {
  items: T[];
  total: number;
  page: number;
  size: number;
};
let csrf = "";
export class ApiError extends Error {
  status: number;
  fields?: { path: string; message: string }[];
  constructor(message: string, status: number, fields?: any) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("x-csrf-token", csrf);
  const res = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await res.json();
  if (!res.ok)
    throw new ApiError(
      data.error || "เชื่อมต่อไม่สำเร็จ",
      res.status,
      data.fields,
    );
  if ("csrf" in data) csrf = data.csrf || "";
  if (
    options.method &&
    options.method !== "GET" &&
    /^\/(consignment\/(apply|products)|admin\/(consignments|consignment-products|products))(\/|$)/.test(
      path,
    )
  ) {
    window.dispatchEvent(new Event("notifications:refresh"));
  }
  return data;
}
export const send = (path: string, data: any, method = "POST", key?: string) =>
  api(path, {
    method,
    body: JSON.stringify(data),
    headers: key ? { "Idempotency-Key": key } : {},
  });
export const money = (value: number) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value / 100);
export const date = (value: string) =>
  new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
export const can = hasPermission;
export type CartItem = { product: Product; quantity: number };
type AppState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  publicData: any;
  notify: (s: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
};
const Context = createContext<AppState>(null!);
export const useApp = () => useContext(Context);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [publicData, setPublic] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [initError, setInitError] = useState("");
  const [saved] = useState<{ id: string; quantity: number }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hiewly-cart") || "[]")
        .slice(0, 50)
        .map((i: any) => ({
          id: i.id || i.product?.id,
          quantity: Math.min(99, Math.max(1, Number(i.quantity) || 1)),
        }))
        .filter((i: any) => typeof i.id === "string");
    } catch {
      return [];
    }
  });
  const [cart, setCart] = useState<CartItem[]>([]),
    [cartReady, setCartReady] = useState(false);
  const [cartError, setCartError] = useState("");
  const refresh = async () => {
    const [me, pub] = await Promise.all([api("/me"), api("/public")]);
    setUser(me.user);
    setPublic(pub);
    setInitError("");
  };
  useEffect(() => {
    refresh()
      .catch((e) => setInitError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const hydrateCart = async () => {
    if (!saved.length) {
      setCartReady(true);
      return;
    }
    try {
      const d = await api(
        "/products?size=50&ids=" +
          encodeURIComponent(saved.map((i) => i.id).join(",")),
      );
      setCart((current) => {
        const restored = saved.flatMap((i) => {
          const p = d.items.find((p: Product) => p.id === i.id);
          return p ? [{ product: p, quantity: i.quantity }] : [];
        });
        return [
          ...restored,
          ...current.filter(
            (i) => !restored.some((r) => r.product.id === i.product.id),
          ),
        ];
      });
      setCartReady(true);
      setCartError("");
    } catch {
      setCartError(
        "โหลดตะกร้าเดิมไม่สำเร็จ ข้อมูลที่บันทึกไว้ยังอยู่ กรุณาลองอีกครั้ง",
      );
    }
  };
  useEffect(() => {
    hydrateCart();
  }, []);
  useEffect(() => {
    if (cartReady)
      try {
        localStorage.setItem(
          "hiewly-cart",
          JSON.stringify(
            cart.map((i) => ({ id: i.product.id, quantity: i.quantity })),
          ),
        );
      } catch {}
  }, [cart, cartReady]);
  useEffect(() => {
    if (!publicData) return;
    document.title = publicData.shopName + " — ของที่ชอบ ให้เราหิ้ว";
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (publicData.favicon) {
      if (!icon) {
        icon = document.createElement("link");
        icon.rel = "icon";
        document.head.appendChild(icon);
      }
      icon.href = publicData.favicon;
      icon.type = "image/png";
    } else icon?.remove();
  }, [publicData]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        refresh,
        publicData,
        notify: setNotice,
        cart,
        setCart,
      }}
    >
      {cartError && (
        <div className="error-box" role="alert">
          <span>{cartError}</span>
          <button className="text-button" onClick={() => hydrateCart()}>
            โหลดตะกร้าอีกครั้ง
          </button>
        </div>
      )}
      {initError ? (
        <div className="initial-error" role="alert">
          <h2>เชื่อมต่อระบบไม่ได้</h2>
          <p>{initError}</p>
          <button
            onClick={() => refresh().catch((e) => setInitError(e.message))}
          >
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        children
      )}
      <div
        className={"toast " + (notice ? "visible" : "")}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </Context.Provider>
  );
}
export function useData<T = any>(path: string, refreshKey?: string) {
  const [result, setResult] = useState<{ path: string; value: T } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then((d) => {
        if (!controller.signal.aborted) setResult({ path, value: d });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version, refreshKey]);
  return {
    data: result?.path === path ? result.value : null,
    error,
    loading: loading || (result?.path !== path && !error),
    reload: () => setVersion((v) => v + 1),
  };
}
