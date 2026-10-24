import catalog from "./authorization.json" with { type: "json" };
export { catalog };
export function hasPermission(user, name) {
  if (!user) return false;
  const rule = catalog.permissions.find((p) => p.id === name);
  if (!rule || (rule.ownerOnly && (user.roleId ?? user.role_id) !== "admin"))
    return false;
  let permissions = user.permissions;
  if (typeof permissions === "string") {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      return false;
    }
  }
  return (
    Array.isArray(permissions) &&
    (permissions.includes("*") || permissions.includes(name)) &&
    rule.requires.every((required) => hasPermission(user, required))
  );
}
