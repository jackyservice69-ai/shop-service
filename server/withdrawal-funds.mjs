// Attribute settled consignment earnings within the existing shared wallet.
// Other funds are spent first. Refunding an order restores only its earned part.
// Replay the immutable ledger; never infer withdrawable earnings from topups.
export function consignmentFunds(db, userId) {
  let earned = 0;
  const purchases = new Map(),
    holds = new Map();
  for (const row of db
    .prepare(
      "SELECT amount,balance_after,kind,reference FROM ledger WHERE user_id=? ORDER BY rowid",
    )
    .all(userId)) {
    const before = earned;
    if (row.kind === "consignment" && row.amount > 0) earned += row.amount;
    else if (row.kind === "withdrawal_hold" && row.amount < 0) {
      const part = Math.min(earned, -row.amount);
      earned -= part;
      holds.set(row.reference, part);
    } else if (row.kind === "withdrawal_release" && row.amount > 0) {
      const part = Math.min(holds.get(row.reference) || 0, row.amount);
      earned += part;
      holds.set(row.reference, 0);
    } else if (row.kind === "refund" && row.amount > 0) {
      const part = Math.min(purchases.get(row.reference) || 0, row.amount);
      earned += part;
      purchases.set(row.reference, (purchases.get(row.reference) || 0) - part);
    }
    earned = Math.max(0, Math.min(earned, row.balance_after));
    if (row.amount < 0 && ["purchase", "settlement"].includes(row.kind))
      purchases.set(
        row.reference,
        (purchases.get(row.reference) || 0) + before - earned,
      );
  }
  const balance =
    db.prepare("SELECT balance FROM users WHERE id=?").get(userId)?.balance ||
    0;
  return Math.min(earned, balance);
}
