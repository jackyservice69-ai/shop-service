export { default as catalog } from "./authorization.json";
export function hasPermission(
  user:
    | { roleId?: string; role_id?: string; permissions: string[] | string }
    | null
    | undefined,
  name: string,
): boolean;
