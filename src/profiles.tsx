import { useState } from "react";
import { MapPin, Store, UserRound } from "lucide-react";
import { useApp, send, type Product } from "./api";
import { Field, Form, formObject } from "./ui";
import { ImageUpload } from "./experience";
import "./profiles.css";

export function ProfileAvatar({
  image,
  fallback,
}: {
  image?: string;
  fallback?: string;
}) {
  const [failed, setFailed] = useState("");
  return image && failed !== image ? (
    <img
      className="profile-avatar-image"
      src={image}
      alt=""
      onError={() => setFailed(image)}
    />
  ) : fallback ? (
    <>{fallback}</>
  ) : (
    <UserRound size={22} aria-hidden="true" />
  );
}

export function AccountPhoto() {
  const { user, refresh, notify } = useApp();
  const [image, setImage] = useState(user?.avatar || ""),
    [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <section
      className="panel account-photo"
      aria-labelledby="account-photo-heading"
    >
      <h2 id="account-photo-heading">รูปโปรไฟล์</h2>
      <p className="muted">
        รูปนี้ใช้ในบัญชีและไอคอนของคุณ เลือกรูปแล้วกดบันทึก
      </p>
      <Form
        noValidate
        submit="บันทึกรูปโปรไฟล์"
        blocked={busy || image === user.avatar}
        onSubmit={async () => {
          await send(
            "/account/photo",
            { image, version: user.avatarVersion },
            "PUT",
          );
          await refresh();
          notify("บันทึกรูปโปรไฟล์แล้ว");
        }}
      >
        <ImageUpload
          kind="avatar"
          value={image}
          onChange={setImage}
          onBusyChange={setBusy}
          uploadPath="/profile/media/avatar"
        />
      </Form>
    </section>
  );
}

export function ShopProfileFields({
  image,
  onImage,
  onBusy,
  area = "",
}: {
  image: string;
  onImage: (image: string) => void;
  onBusy: (busy: boolean) => void;
  area?: string;
}) {
  return (
    <div className="shop-profile-fields">
      <ImageUpload
        kind="shop"
        value={image}
        onChange={onImage}
        onBusyChange={onBusy}
        uploadPath="/profile/media/shop"
      />
      <Field
        label="พื้นที่ให้บริการ"
        name="serviceArea"
        type="textarea"
        defaultValue={area}
        maxLength={1000}
        help="ระบุได้หลายบรรทัด เช่น จังหวัด เขต/อำเภอ พื้นที่รับส่ง หรือจัดส่งทั่วประเทศ ตามบริการจริงของร้าน"
      />
    </div>
  );
}

export function ShopProfileEditor({
  membership,
  onSaved,
}: {
  membership: any;
  onSaved: () => void;
}) {
  const { notify } = useApp();
  const [image, setImage] = useState(membership.image || ""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel" aria-labelledby="shop-profile-heading">
      <h2 id="shop-profile-heading">รูปหน้าร้านและพื้นที่ให้บริการ</h2>
      <p className="muted">
        แสดงในรายละเอียดสินค้าของร้านเมื่อได้รับอนุมัติเป็นตัวแทนแล้ว
      </p>
      <Form
        noValidate
        submit="บันทึกข้อมูลหน้าร้าน"
        blocked={busy}
        onSubmit={async (f) => {
          const values = formObject(f);
          await send(
            "/consignment/profile",
            {
              image,
              serviceArea: values.serviceArea,
              version: membership.version,
            },
            "PUT",
          );
          onSaved();
          notify("บันทึกข้อมูลหน้าร้านแล้ว");
        }}
      >
        <ShopProfileFields
          image={image}
          onImage={setImage}
          onBusy={setBusy}
          area={membership.service_area}
        />
      </Form>
    </section>
  );
}

export function ShopInformation({
  shop,
}: {
  shop: NonNullable<Product["shop"]>;
}) {
  const [failed, setFailed] = useState("");
  return (
    <section className="shop-information" aria-label="ข้อมูลร้านผู้ขาย">
      <div className="shop-information-photo">
        {shop.image && failed !== shop.image ? (
          <img
            src={shop.image}
            alt={"รูปหน้าร้าน " + shop.name}
            onError={() => setFailed(shop.image)}
          />
        ) : (
          <Store size={28} aria-hidden="true" />
        )}
      </div>
      <div className="shop-information-copy">
        <h3>{shop.name}</h3>
        {shop.serviceArea ? (
          <p>
            <MapPin size={16} aria-hidden="true" />
            <span>{shop.serviceArea}</span>
          </p>
        ) : (
          <p className="muted">ยังไม่ระบุพื้นที่ให้บริการ</p>
        )}
      </div>
    </section>
  );
}
