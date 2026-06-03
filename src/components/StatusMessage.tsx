import type { QueryStatus } from "../types";

export function StatusMessage({
  status,
  idle,
  loading = "查詢中...",
  success,
  error,
}: {
  status: QueryStatus;
  idle: string;
  loading?: string;
  success?: string;
  error?: string;
}) {
  if (status === "idle") return <div className="empty-state">{idle}</div>;
  if (status === "loading") return <div className="empty-state">{loading}</div>;
  if (status === "error") return <div className="empty-state danger">{error ?? "查詢失敗。"}</div>;
  if (success) return <div className="empty-state success">{success}</div>;
  return null;
}
