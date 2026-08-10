"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({
  className,
  label = "退出登录",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" className={className} onClick={logout}>
      {label}
    </button>
  );
}
