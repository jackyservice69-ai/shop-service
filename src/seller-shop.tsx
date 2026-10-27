import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Store } from "lucide-react";
import { useData, type PublicShop } from "./api";
import { ErrorBox, Loading, PageHeading } from "./ui";
import { ShopLogo } from "./profiles";
import { CatalogPage } from "./catalog";
import "./seller-shop.css";

function SellerShopHeader({ shop }: { shop: PublicShop }) {
  const [failed, setFailed] = useState("");
  return (
    <>
      <Link className="text-button seller-store-back" to="/products">
        <ArrowLeft size={18} aria-hidden="true" />
        เลือกซื้อสินค้าทั้งหมด
      </Link>
      <header className="seller-store-header">
        <div className="seller-store-cover">
          {shop.image && failed !== shop.image && (
            <img
              src={shop.image}
              alt={"รูปหน้าร้าน " + shop.name}
              width={1200}
              height={400}
              onError={() => setFailed(shop.image)}
            />
          )}
        </div>
        <div className="seller-store-content">
          <div className="seller-store-logo">
            {shop.logo ? (
              <ShopLogo logo={shop.logo} name={shop.name} />
            ) : (
              <Store size={40} aria-hidden="true" />
            )}
          </div>
          <div className="seller-store-title">
            <span className="badge status-approved">
              ตัวแทนฝากขายที่ได้รับอนุมัติ
            </span>
            <h1>{shop.name}</h1>
            <p className="seller-store-count">
              สินค้า {shop.productCount.toLocaleString("th-TH")} รายการ
            </p>
          </div>
        </div>
      </header>
    </>
  );
}

export function SellerShopPage() {
  const { shopId = "" } = useParams();
  const { data, loading, error, reload } = useData<PublicShop>(
    "/shops/" + encodeURIComponent(shopId),
  );
  if (loading) return <Loading />;
  if (error || !data)
    return (
      <div className="seller-store-unavailable">
        <PageHeading title="หน้าร้านตัวแทน" />
        <ErrorBox error={error || "โหลดข้อมูลร้านไม่สำเร็จ"} retry={reload} />
        <Link className="button secondary" to="/products">
          กลับไปเลือกซื้อสินค้า
        </Link>
      </div>
    );
  return (
    <CatalogPage
      key={shopId}
      shop={data}
      header={<SellerShopHeader shop={data} />}
    />
  );
}
