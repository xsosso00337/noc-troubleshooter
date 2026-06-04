import type { DataFreshness } from "../types";

function fmtTime(value: string) {
  try {
    return new Date(value).toLocaleString("zh-TW", { hour12: false });
  } catch {
    return value;
  }
}

export function DataFreshnessLine({
  freshness,
  error,
}: {
  freshness: DataFreshness | null;
  error?: string;
}) {
  if (error) {
    return <div className="freshness-line"><span className="pill warn-pill">最後更新讀取失敗</span></div>;
  }

  if (!freshness) {
    return <div className="freshness-line"><span className="pill muted-pill">尚無匯入紀錄</span></div>;
  }

  return (
    <div className="freshness-line" aria-label="資料最後更新資訊">
      <span className="pill ok-pill">最後更新：{fmtTime(freshness.imported_at)}</span>
      <span className="pill muted-pill">來源：{freshness.original_filename}</span>
      <span className="pill">資料 {freshness.row_count} 筆</span>
    </div>
  );
}
