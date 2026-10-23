import "dotenv/config";
import { openDb, id, now, audit, transaction } from "../server/db.mjs";
const db = openDb(process.env.DATABASE_PATH || "./data/hiewly.sqlite");
if (!db.prepare("SELECT id FROM products LIMIT 1").get())
  transaction(db, () => {
    const products = [
      [
        "กระเป๋าสะพาย Everyday mini",
        "กระเป๋าทรงมินิ น้ำหนักเบา พร้อมสายปรับระดับ สีครีม",
        "กระเป๋า",
        159000,
        6,
        "bag",
      ],
      [
        "รองเท้า Retro everyday",
        "รองเท้าผ้าใบทรงคลาสสิก สีเขียวครีม กรุณาระบุไซซ์ในที่อยู่เพิ่มเติม",
        "แฟชั่น",
        329000,
        8,
        "shoe",
      ],
      [
        "แก้วเก็บอุณหภูมิ Daily tumbler",
        "แก้วสเตนเลส 500 ml พร้อมหลอด สีลาเวนเดอร์",
        "ไลฟ์สไตล์",
        89000,
        12,
        "cup",
      ],
      [
        "หูฟังไร้สาย Pocket sound",
        "หูฟังไร้สายพร้อมกล่องชาร์จ สีขาว",
        "แก็ดเจ็ต",
        249000,
        4,
        "headphone",
      ],
      [
        "กล้องดิจิทัล Weekend snap",
        "กล้องคอมแพกต์สำหรับบันทึกวันพักผ่อน สีเงิน",
        "แก็ดเจ็ต",
        459000,
        3,
        "camera",
      ],
      [
        "หมวกแก๊ป Little getaway",
        "หมวกผ้าคอตตอน ปรับขนาดได้ สีเขียวเสจ",
        "แฟชั่น",
        69000,
        15,
        "cap",
      ],
      [
        "กระเป๋าผ้า Soft carry",
        "กระเป๋าผ้าแคนวาส มีช่องด้านใน สีชมพู",
        "กระเป๋า",
        79000,
        10,
        "tote",
      ],
      [
        "น้ำหอม Sunday mood",
        "กลิ่นสดชื่นแนวซิตรัส ขนาด 30 ml",
        "บิวตี้",
        189000,
        7,
        "perfume",
      ],
    ];
    for (const [name, description, category, price, stock, asset] of products)
      db.prepare(
        "INSERT INTO products(id,name,description,category,price,cost,stock,image,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        id(),
        name,
        description,
        category,
        price,
        0,
        stock,
        `/assets/${asset}.svg`,
        now(),
      );
    db.prepare(
      "INSERT INTO announcements(id,title,body,active,starts_at,ends_at,version) VALUES(?,?,?,?,?,?,?)",
    ).run(
      id(),
      "ยินดีต้อนรับสู่หิ้วลี่",
      "สินค้าปัจจุบันเป็นข้อมูลตัวอย่างสำหรับทดสอบระบบ เจ้าของร้านต้องตรวจสอบสินค้า ราคา และสต็อกก่อนเปิดขายจริง",
      1,
      now(),
      new Date(Date.now() + 365 * 86400000).toISOString(),
      1,
    );
    audit(db, null, "system.sample_catalog", "products", {
      count: products.length,
    });
  });
db.close();
console.log(
  "Sample catalog ready. No users, orders or wallet balances were fabricated.",
);
