import {
  AppearancePage,
  BannersPage,
  PromotionsPage,
  CommissionsPage,
  BackToTop,
  themeStyle,
} from "./experience";
import React from "react";
import { GoogleCompletePage } from "./google-auth";
import { LineCompletePage } from "./line-auth";
import { BrowserRecoveryPage } from "./auth-browser";
import { BankDetailsExportPage } from "./bank-details";
import { MerchantAccountsPage } from "./merchant-accounts";
import { AdminWalletPage } from "./admin-wallet";
import { AddressesPage } from "./address-book";
import { ConsignmentPage, AdminConsignmentsPage } from "./consignments";
import { AdminReviewsPage } from "./reviews";
import { SocialLinks } from "./contacts";
import { ContactPage } from "./contact-page";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  NavLink,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  ShoppingBag,
  ShoppingCart,
  Wallet,
  Package,
  Users,
  LayoutDashboard,
  Ticket,
  Megaphone,
  Receipt,
  ShieldCheck,
  Settings,
  ScrollText,
  ArrowUpRight,
  LogOut,
  Store,
  UserRound,
  Star,
  ChevronRight,
  Headphones,
  Search,
  X,
} from "lucide-react";
import { AppProvider, useApp, can, send } from "./api";
import { Brand, Loading } from "./ui";
import {
  StorePage,
  AuthPage,
  CartPage,
  WalletPage,
  OrdersPage,
  ReferralPage,
  AccountPage,
  AnnouncementPopup,
} from "./shop";
import {
  DashboardPage,
  ResourcePage,
  AdminOrders,
  FinancePage,
  MembersPage,
  RolesPage,
  SettingsPage,
  AuditPage,
} from "./admin";
import "./brand.generated.css";
import "./styles.css";
import "./storefront-shell.css";
import "./responsive-ux.css";
import { CatalogPage } from "./catalog";
import { StoreNavigation } from "./store-navigation";
const ShoppingGuidePage = React.lazy(() =>
  import("./shopping-guide").then((page) => ({
    default: page.ShoppingGuidePage,
  })),
);
const nav = [
  ["dashboard", "ภาพรวม", LayoutDashboard],
  ["orders", "คำสั่งซื้อ", Package],
  ["products", "จัดการสินค้า", ShoppingBag],
  ["consignments", "ตัวแทนฝากขาย", Store],
  ["reviews", "รีวิวสินค้า", Star],
  ["members", "สมาชิก", Users],
  ["finance", "รายรับ–รายจ่าย", Receipt],
  ["wallet", "ธุรกรรมกระเป๋าเงิน", Wallet],
  ["promotions", "โปรโมชั่น", Ticket],
  ["announcements", "ประกาศ", Megaphone],
  ["roles", "สิทธิ์การใช้งาน", ShieldCheck],
  ["appearance", "สีและภาพลักษณ์", Settings],
  ["banners", "แบนเนอร์", Megaphone],
  ["commissions", "ค่าคอมมิชชั่น", Users],
  ["settings", "ตั้งค่าระบบ", Settings],
  ["merchant-accounts", "บัญชีร้านค้า", Wallet],
  ["audit", "บันทึก Audit", ScrollText],
] as const;
const navPermission = (p: string) =>
  ({
    commissions: "finance",
    wallet: "finance",
    "merchant-accounts": "settings",
  })[p] || p;
function Protected({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return (
      <Navigate
        to={
          "/login?next=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  if (user.mustChangePassword && location.pathname !== "/account")
    return <Navigate to="/account" replace />;
  if (admin && !user.permissions.length) return <Navigate to="/" replace />;
  return <Outlet />;
}
function StoreLayout() {
  const { user, cart, refresh, notify, publicData } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [composingSearch, setComposingSearch] = React.useState(false);
  const mainContent = React.useRef<HTMLElement>(null);
  const previousPath = React.useRef(location.pathname);
  const currentSearch = new URLSearchParams(location.search).get("q") || "";
  const [search, setSearch] = React.useState(currentSearch);
  const searchInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch, location.pathname]);
  React.useEffect(() => {
    if (previousPath.current !== location.pathname) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      mainContent.current?.focus({ preventScroll: true });
    }
    previousPath.current = location.pathname;
  }, [location.pathname]);
  React.useEffect(() => {
    if (
      location.pathname !== "/" ||
      location.hash !== "#store-contact" ||
      !publicData
    )
      return;
    const frame = requestAnimationFrame(() => {
      const footer = document.getElementById("store-contact");
      footer?.focus({ preventScroll: true });
      footer?.scrollIntoView({
        block: "end",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash, location.key, publicData]);
  React.useEffect(() => {
    if (
      composingSearch ||
      location.pathname !== "/products" ||
      search === currentSearch
    )
      return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(location.search);
      const query = search.trim();
      query ? params.set("q", query) : params.delete("q");
      params.delete("page");
      navigate(
        { pathname: "/products", search: params.toString() },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    search,
    currentSearch,
    location.pathname,
    location.search,
    navigate,
    composingSearch,
  ]);
  if (user?.mustChangePassword && location.pathname !== "/account")
    return <Navigate to="/account" replace />;
  return (
    <div
      className="customer-shell store-shell"
      style={themeStyle(publicData?.theme)}
    >
      <header className="store-header">
        <Link to="/" title="หน้าร้าน" className="store-header-brand">
          <Brand variant="marble" />
        </Link>
        <form
          className="store-header-search"
          role="search"
          aria-label="ค้นหาสินค้าในร้าน"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (composingSearch) return;
            const query = search.trim();
            const params = new URLSearchParams(
              location.pathname === "/products" ? location.search : "",
            );
            if (query) params.set("q", query);
            else params.delete("q");
            params.delete("page");
            setSearch(query);
            navigate({ pathname: "/products", search: params.toString() });
          }}
        >
          <Search size={20} aria-hidden="true" />
          <input
            ref={searchInput}
            type="search"
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหาสินค้าที่อยากให้หิ้ว…"
            value={search}
            onCompositionStart={() => setComposingSearch(true)}
            onCompositionEnd={(event) => {
              setComposingSearch(false);
              setSearch(event.currentTarget.value);
            }}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="store-search-clear"
              aria-label="ล้างคำค้นหา"
              onClick={() => {
                setSearch("");
                setComposingSearch(false);
                navigate("/products", { state: { resetCatalogFilters: true } });
                searchInput.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
          <button className="button primary store-search-submit" type="submit">
            ค้นหา
          </button>
        </form>
        <StoreNavigation showAccount={!!user && !user.mustChangePassword} />
        <div className="store-tools">
          {user?.permissions.length ? (
            <Link
              to="/admin"
              className="admin-link"
              aria-label="หลังบ้าน"
              title="หลังบ้าน"
            >
              <LayoutDashboard size={20} aria-hidden="true" />
            </Link>
          ) : null}
          <Link
            to="/cart"
            className="cart-button"
            aria-label={
              "ตะกร้า " + cart.reduce((s, i) => s + i.quantity, 0) + " ชิ้น"
            }
          >
            <ShoppingCart size={20} aria-hidden="true" />
            <span>{cart.reduce((s, i) => s + i.quantity, 0)}</span>
          </Link>
          <NavLink
            to="/wallet"
            className="wallet-link"
            aria-label="กระเป๋าเงิน"
            title="กระเป๋าเงิน"
          >
            <Wallet size={20} aria-hidden="true" />
          </NavLink>
          {user ? (
            <>
              <Link className="avatar" to="/account" aria-label="บัญชีของฉัน">
                <UserRound size={22} />
              </Link>
              <button
                type="button"
                className="icon-button"
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                disabled={loggingOut}
                onClick={async () => {
                  if (loggingOut) return;
                  setLoggingOut(true);
                  try {
                    await send("/auth/logout", {});
                    await refresh();
                    navigate("/", { replace: true });
                    notify("ออกจากระบบแล้ว");
                  } catch (e) {
                    notify((e as Error).message);
                  } finally {
                    setLoggingOut(false);
                  }
                }}
              >
                <LogOut size={21} />
              </button>
            </>
          ) : (
            <Link className="button primary small" to="/login">
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </header>
      <main
        id="main-content"
        ref={mainContent}
        className="store-main"
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <footer id="store-contact" className="store-footer" tabIndex={-1}>
        <Brand variant="marble" />
        <p>ของที่ชอบ ให้เราหิ้ว ดูแลตั้งแต่สั่งจนถึงมือคุณ</p>
        <SocialLinks />
        <span>Iya หิ้ว · Personal shopping service</span>
      </footer>
      <AnnouncementPopup />
      <nav aria-label="เครื่องมือช่วยเหลือหน้าร้าน">
        <BackToTop />
        {publicData && publicData.socialVisibility?.line !== false && (
          <a
            className="floating-line-contact"
            href="https://lin.ee/rwcULIh"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="เพิ่มเพื่อน LINE ของร้าน (เปิดในแท็บใหม่)"
            title="เพิ่มเพื่อน LINE ของร้าน (เปิดในแท็บใหม่)"
          >
            <img src="/assets/brands/line.svg" alt="" width={36} height={36} />
          </a>
        )}
      </nav>
    </div>
  );
}
function StoreHome() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const hasCatalogQuery = [
    "q",
    "category",
    "minPrice",
    "maxPrice",
    "inStock",
    "sort",
    "page",
  ].some((key) => params.has(key));
  return hasCatalogQuery ? (
    <Navigate to={{ pathname: "/products", search: location.search }} replace />
  ) : (
    <StorePage />
  );
}
function AdminLayout() {
  const { user, refresh } = useApp();
  const navigate = useNavigate();
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link to="/admin" className="sidebar-brand">
          <Brand />
        </Link>
        <div className="workspace-label">
          พื้นที่จัดการร้านค้า <span>ADMIN</span>
        </div>
        <div className="nav-group-label">จัดการร้านค้า</div>
        <nav>
          {nav
            .filter(([p]) => can(user, navPermission(p)))
            .map(([path, label, Icon], i) => (
              <NavLink
                end={path === "dashboard"}
                key={path}
                to={"/admin/" + (path === "dashboard" ? "" : path)}
              >
                <Icon size={19} />
                {label}
                {path === "dashboard" && <span className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <Headphones size={22} />
            <strong>ทุกอย่างอยู่ในที่เดียว</strong>
            <p>
              จัดการร้าน พร้อมดูแลลูกค้า
              <br />
              ในทุกขั้นตอน
            </p>
            <Link to="/" className="text-button">
              ไปที่หน้าร้าน <ArrowUpRight size={16} />
            </Link>
          </div>
          <button
            className="sidebar-user"
            onClick={async () => {
              await send("/auth/logout", {});
              await refresh();
              navigate("/login");
            }}
          >
            <span className="avatar">{user?.name.slice(0, 1)}</span>
            <span>
              <b>{user?.name}</b>
              <small>{user?.roleName}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <div>
            ร้านของฉัน <ChevronRight size={14} /> <span>ระบบจัดการร้านค้า</span>
          </div>
          <div>
            <span className="system-online">
              <i /> ระบบพร้อมใช้งาน
            </span>
            <Link to="/" className="button secondary small">
              <Store size={16} /> ดูหน้าร้าน <ArrowUpRight size={14} />
            </Link>
            <Link to="/account" className="avatar" aria-label="บัญชีของฉัน">
              <UserRound size={22} />
            </Link>
          </div>
        </header>
        <main id="main-content" className="admin-main">
          <Outlet />
        </main>
        <footer className="admin-footer">
          <span>Iya หิ้ว — ร้านที่ดี เริ่มจากการดูแลที่ดี</span>
          <span>จัดเก็บข้อมูลในฐานข้อมูลของร้าน</span>
        </footer>
      </div>
    </div>
  );
}
function Permission({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const { user } = useApp();
  return can(user, name) ? (
    children
  ) : (
    <div className="panel">
      <h1>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
      <Link to="/">กลับหน้าร้าน</Link>
    </div>
  );
}
function HomeAdmin() {
  const { user } = useApp();
  if (can(user, "dashboard")) return <DashboardPage />;
  const first = nav.find(([p]) => can(user, navPermission(p)));
  return first ? (
    <Navigate to={"/admin/" + first[0]} replace />
  ) : (
    <Navigate to="/" replace />
  );
}
function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <a href="#main-content" className="skip-link">
          ข้ามไปยังเนื้อหา
        </a>
        <Routes>
          <Route path="bank-details-card" element={<BankDetailsExportPage />} />
          <Route element={<StoreLayout />}>
            <Route index element={<StoreHome />} />
            <Route path="products" element={<CatalogPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route
              path="how-to-order"
              element={
                <React.Suspense fallback={<Loading />}>
                  <ShoppingGuidePage />
                </React.Suspense>
              }
            />
            <Route path="login" element={<AuthPage />} />
            <Route path="register" element={<AuthPage register />} />
            <Route path="google/complete" element={<GoogleCompletePage />} />
            <Route path="line/complete" element={<LineCompletePage />} />
            <Route
              path="auth/browser-return"
              element={<BrowserRecoveryPage />}
            />
            <Route path="cart" element={<CartPage />} />
            <Route path="promotions" element={<PromotionsPage />} />
            <Route element={<Protected />}>
              <Route path="wallet" element={<WalletPage />} />
              <Route path="coupons" element={<PromotionsPage coupons />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="referrals" element={<ReferralPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="addresses" element={<AddressesPage />} />
              <Route path="consignment" element={<ConsignmentPage />} />
            </Route>
          </Route>
          <Route element={<Protected admin />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<HomeAdmin />} />
              <Route
                path="consignments"
                element={
                  <Permission name="consignments">
                    <AdminConsignmentsPage />
                  </Permission>
                }
              />
              <Route
                path="reviews"
                element={
                  <Permission name="reviews">
                    <AdminReviewsPage />
                  </Permission>
                }
              />
              <Route
                path="appearance"
                element={
                  <Permission name="appearance">
                    <AppearancePage />
                  </Permission>
                }
              />
              <Route
                path="banners"
                element={
                  <Permission name="banners">
                    <BannersPage />
                  </Permission>
                }
              />
              <Route
                path="commissions"
                element={
                  <Permission name="finance">
                    <CommissionsPage />
                  </Permission>
                }
              />
              <Route
                path="merchant-accounts"
                element={
                  <Permission name="settings">
                    <MerchantAccountsPage />
                  </Permission>
                }
              />
              <Route
                path="orders"
                element={
                  <Permission name="orders">
                    <AdminOrders />
                  </Permission>
                }
              />
              <Route
                path="products"
                element={
                  <Permission name="products">
                    <ResourcePage resource="products" />
                  </Permission>
                }
              />
              <Route
                path="promotions"
                element={
                  <Permission name="promotions">
                    <ResourcePage resource="promotions" />
                  </Permission>
                }
              />
              <Route
                path="announcements"
                element={
                  <Permission name="announcements">
                    <ResourcePage resource="announcements" />
                  </Permission>
                }
              />
              <Route
                path="finance"
                element={
                  <Permission name="finance">
                    <FinancePage />
                  </Permission>
                }
              />
              <Route
                path="wallet"
                element={
                  <Permission name="finance">
                    <AdminWalletPage />
                  </Permission>
                }
              />
              <Route
                path="members"
                element={
                  <Permission name="members">
                    <MembersPage />
                  </Permission>
                }
              />
              <Route
                path="roles"
                element={
                  <Permission name="roles">
                    <RolesPage />
                  </Permission>
                }
              />
              <Route
                path="settings"
                element={
                  <Permission name="settings">
                    <SettingsPage />
                  </Permission>
                }
              />
              <Route
                path="audit"
                element={
                  <Permission name="audit">
                    <AuditPage />
                  </Permission>
                }
              />
            </Route>
          </Route>
          <Route
            path="*"
            element={
              <div className="empty">
                <h1>ไม่พบหน้านี้</h1>
                <Link to="/">กลับหน้าร้าน</Link>
              </div>
            }
          />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="initial-error" role="alert">
        <h1>หน้านี้แสดงผลไม่สำเร็จ</h1>
        <p>กรุณาโหลดหน้าใหม่ ข้อมูลธุรกรรมยังเก็บอยู่ในระบบ</p>
        <button className="button primary" onClick={() => location.reload()}>
          โหลดหน้าใหม่
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
