# Approval notifications — local, 26 October 2026

Signed-in members and staff see a bell in the storefront header and admin top bar. The badge counts unread notifications; clicking opens the existing accessible native dialog. Each entry includes its title, message, Bangkok timestamp, explicit read state and a link to the related consignment area. Closing the dialog does not mark entries read. Opening an entry marks only that user's copy read; “อ่านทั้งหมด” marks visible entries up to the list's snapshot, preserving newer arrivals. The history supports cursor pagination, empty/loading/error/retry states and a new-items hint.

Covered approval workflows:

- Applying for consignment membership: the requester gets confirmation; users currently holding `consignments` permission see the pending request.
- Approving/rejecting/suspending membership: the member gets the result; the approver queue no longer counts the completed request.
- Submitting/editing consignment products: the seller gets confirmation and approvers see the latest submission.
- Approving/rejecting products: the seller gets the outcome. Both the dedicated moderation route and the general admin product editor are covered. Saving unchanged approval status does not create duplicate decisions.

`server/notifications.mjs` owns event creation, visibility and the authenticated API. Notifications and read markers are stored in SQLite. Event writes share the approval/request transaction; a failure rolls back the entire action. Event keys deduplicate retries. Approver requests are dynamically filtered by current permission and removed from the queue when resolved; personal events remain limited to their recipient. Internal notes and contact data are not copied into notifications.

Schema v11 adds `notifications` and `notification_reads` with indexes. The additive migration backfills only existing pending membership/product requests for approvers, once, without inventing past personal confirmations or changing balances/products. Reopening preserves read states. Existing authentication, forced password reset, Origin and CSRF checks apply. Read changes are audited and idempotent. There is no client API to create arbitrary notifications or destinations.

API:

- `GET /api/notifications?size=20&before=<id>` — own/currently authorized entries, `unreadCount`, `snapshot` and `nextCursor`. Size is bounded to 1–50.
- `POST /api/notifications/:id/read` with `{}` — read one visible entry; foreign or no-longer-authorized IDs return 404.
- `POST /api/notifications/read-all` with `{through: <visible id>}` — marks only visible entries through that snapshot. Later IDs remain unread.

The bell refreshes its badge every 30 seconds while visible, on browser focus/resume and after relevant successful writes in the same browser. Concurrent mutations request a trailing refresh. Requests are aborted when the account/permission scope unmounts. The open list remains stable; new arrivals offer “โหลดใหม่”. Clicking a notification passes a refresh key to the destination data hooks so a page already open updates too. These are persistent in-app notifications; no outside message is sent.

UI uses the existing theme, Lucide icons, 44px controls, flat borders and explicit read text. Small signed-in storefront headers place the tools in their own row to retain logo/control space. The dialog handles keyboard Escape/focus restoration and scrolls on small screens. No new shadows, purple app colors or provider credentials.

Verification: isolated API tests cover ownership/permissions, CSRF/Origin, duplicate decisions, versions, generic moderation, paging/snapshot races, audit/write rollback, inactive users and v11 migration/reopen. Browser scenarios cover both parties, read persistence, same-route data refresh, dialog focus, empty/error/retry states, 320/390/768/1440px, and Axe. Existing full suites run against in-memory fixtures and fake providers. Local screenshots: `output/playwright/notification-member-*.png`. No push or deployment in this task.
