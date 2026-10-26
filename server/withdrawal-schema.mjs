export function enableWithdrawals(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS withdrawals(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL CHECK(amount>=100),bank_code TEXT NOT NULL,
    bank_number TEXT NOT NULL,account_name TEXT NOT NULL,
    request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','approved','processing','paid','rejected','cancelled')),
    version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,
    approved_by TEXT REFERENCES users(id),approved_at TEXT,
    processing_by TEXT REFERENCES users(id),processing_at TEXT,
    decided_by TEXT REFERENCES users(id),decided_at TEXT,decision_note TEXT NOT NULL DEFAULT '',
    paid_by TEXT REFERENCES users(id),paid_at TEXT,transfer_reference TEXT UNIQUE,
    UNIQUE(user_id,request_key),
    CHECK(status NOT IN ('approved','processing','paid') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CHECK(status NOT IN ('processing','paid') OR (processing_by IS NOT NULL AND processing_at IS NOT NULL)),
    CHECK(status!='paid' OR (paid_by IS NOT NULL AND paid_at IS NOT NULL AND transfer_reference IS NOT NULL)));
    CREATE INDEX IF NOT EXISTS withdrawals_user ON withdrawals(user_id,created_at);
    CREATE INDEX IF NOT EXISTS withdrawals_status ON withdrawals(status,created_at);
    CREATE TRIGGER IF NOT EXISTS withdrawals_destination_immutable BEFORE UPDATE OF user_id,amount,bank_code,bank_number,account_name,request_key,request_hash,created_at ON withdrawals
      BEGIN SELECT RAISE(ABORT,'withdrawal destination is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS withdrawals_final_immutable BEFORE UPDATE ON withdrawals WHEN OLD.status IN ('paid','rejected','cancelled')
      BEGIN SELECT RAISE(ABORT,'withdrawal is final'); END;
    CREATE TRIGGER IF NOT EXISTS withdrawals_immutable_delete BEFORE DELETE ON withdrawals
      BEGIN SELECT RAISE(ABORT,'withdrawals cannot be deleted'); END;`);
  // Rebuild both parent and child together; preserve notice/read IDs and FK links.
  const sequence =
    db
      .prepare("SELECT seq FROM sqlite_sequence WHERE name='notifications'")
      .get()?.seq || 0;
  db.exec(`CREATE TABLE notifications_v16(
    id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL UNIQUE,
    recipient_id TEXT REFERENCES users(id),required_permission TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL,entity_id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,
    body TEXT NOT NULL,href TEXT NOT NULL CHECK(href IN (
      '/consignment','/consignment?tab=products','/admin/consignments','/admin/consignments?tab=products',
      '/consignment?tab=withdrawals','/admin/withdrawals')),
    created_at TEXT NOT NULL,resolved_at TEXT,
    CHECK((recipient_id IS NOT NULL AND required_permission='') OR
      (recipient_id IS NULL AND required_permission IN ('consignments','withdrawals_approve','withdrawals_pay'))));
    CREATE TABLE notification_reads_v16(
      notification_id INTEGER NOT NULL REFERENCES notifications_v16(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),read_at TEXT NOT NULL,PRIMARY KEY(notification_id,user_id));
    INSERT INTO notifications_v16 SELECT * FROM notifications;
    INSERT INTO notification_reads_v16 SELECT * FROM notification_reads;
    DROP TABLE notification_reads;
    DROP TABLE notifications;
    ALTER TABLE notifications_v16 RENAME TO notifications;
    ALTER TABLE notification_reads_v16 RENAME TO notification_reads;
    CREATE INDEX notifications_recipient ON notifications(recipient_id,id DESC);
    CREATE INDEX notifications_approval ON notifications(required_permission,resolved_at,id DESC);
    CREATE INDEX notifications_entity ON notifications(topic,entity_id,resolved_at);
    CREATE INDEX notification_reads_user ON notification_reads(user_id,notification_id);`);
  db.prepare(
    "UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='notifications'",
  ).run(sequence);
}
