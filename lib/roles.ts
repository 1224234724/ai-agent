// 角色定义（Edge / Node 均可引用，无 Node API）

export type Role = "admin" | "operator" | "analyst";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "系统管理员",
  operator: "知识运营",
  analyst: "业务分析师",
};

export function canAccessAdmin(role: Role): boolean {
  return role === "admin";
}

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "operator" || value === "analyst";
}
