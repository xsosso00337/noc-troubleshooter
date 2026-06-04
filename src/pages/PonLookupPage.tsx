import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DataFreshnessLine } from "../components/DataFreshnessLine";
import { FieldTable } from "../components/FieldTable";
import { StatusMessage } from "../components/StatusMessage";
import { loadLatestDataFreshness, loadPonGroups, searchPonAssets } from "../lib/nocQueries";
import type { DataFreshness, PonAsset, QueryStatus } from "../types";

function PonCard({ item }: { item: PonAsset }) {
  const note = [item.note, item.extra_note].filter(Boolean).join(" / ");

  return (
    <article className="data-card">
      <div className="card-heading">
        <h2>{item.building_name || item.node || item.olt_port_id || "未命名 PON"}</h2>
        <div className="pill-row">
          {item.olt_card && <span className="pill">{item.olt_card}</span>}
          {item.headend && <span className="pill">頭端 {item.headend}</span>}
          {item.node && <span className="pill">{item.node}</span>}
          {item.building_id && <span className="pill muted-pill">大樓 {item.building_id}</span>}
        </div>
      </div>
      <FieldTable
        rows={[
          ["OLT port編號", item.olt_port_id],
          ["OLT-Port", item.olt_port],
          ["OLT名稱/編號", item.olt_name],
          ["OLT群組", item.olt_card],
          ["頭端", item.headend],
          ["只可使用區域", item.only_area],
          ["PON序號", item.pon_no],
          ["PON用戶類型", item.pon_user_type],
          ["OLT光纖芯數HE", item.fiber_core_he],
          ["一階分光", item.first_splitter],
          ["二階分光", item.second_splitter],
          ["網編", item.network_code],
          ["HE跳接盤", item.patch_panel],
          ["HE EDFA", item.edfa],
          ["通知頭端配線", item.notify_date],
          ["頭端配線完成", item.patch_done_date],
          ["全光改完成", item.pon_done_date],
          ["原OLT編號", item.original_olt],
          ["大樓型態", item.building_type],
          ["可服務戶數", item.serviceable_units],
          ["大樓戶數", item.building_units],
          ["來源列", item.source_row],
        ]}
      />
      {note && <div className="note-box">{note}</div>}
    </article>
  );
}

export function PonLookupPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "completed" | "pending">("");
  const [groups, setGroups] = useState<{ group: string; count: number }[]>([]);
  const [rows, setRows] = useState<PonAsset[]>([]);
  const [status, setStatus] = useState<QueryStatus>("idle");
  const [message, setMessage] = useState("請輸入 OLT port、大樓名稱、光點、跳接盤、EDFA 或網編。");
  const [freshness, setFreshness] = useState<DataFreshness | null>(null);
  const [freshnessError, setFreshnessError] = useState("");

  useEffect(() => {
    loadPonGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
    loadLatestDataFreshness("pon")
      .then(setFreshness)
      .catch(() => {
        setFreshness(null);
        setFreshnessError("讀取失敗");
      });
  }, []);

  async function runSearch(limit = 300) {
    setStatus("loading");
    try {
      const data = await searchPonAssets({
        query,
        oltCard: group || undefined,
        status: statusFilter || undefined,
        limit,
      });
      setRows(data);
      setStatus("success");
      setMessage(`查到 ${data.length} 筆，全光改完成狀態依 Supabase 最新資料顯示。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "查詢失敗。");
    }
  }

  function clear() {
    setQuery("");
    setGroup("");
    setStatusFilter("");
    setRows([]);
    setStatus("idle");
    setMessage("已清空，可直接搜尋。");
  }

  const completed = rows.filter((row) => row.pon_done_date).length;
  const pending = rows.length - completed;

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>資料查詢</span>
        <h1>全光 PON 查詢</h1>
        <p>保留 OLT 群組、完工狀態與關鍵字搜尋；資料由 RLS 保護的 Supabase table 提供。</p>
        <DataFreshnessLine freshness={freshness} error={freshnessError} />
      </section>

      <section className="query-bar">
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="">全部 OLT群組</option>
          {groups.map((item) => (
            <option key={item.group} value={item.group === "未分類" ? "" : item.group}>
              {item.group}（{item.count}筆）
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | "completed" | "pending")}>
          <option value="">全部狀態</option>
          <option value="completed">已完成全光改</option>
          <option value="pending">未完成全光改</option>
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
          placeholder="輸入 CA110101 / PT1013 / 長順街 / A-014 / 1/1/1/1"
        />
        <button className="primary-button" onClick={() => void runSearch()}>
          <Search size={17} />
          <span>查詢</span>
        </button>
        <button className="ghost-button" onClick={() => void runSearch(100)}>
          <Search size={17} />
          <span>顯示前100筆</span>
        </button>
        <button className="ghost-button" onClick={clear}>
          <Trash2 size={17} />
          <span>清空</span>
        </button>
      </section>

      <div className="summary-row">
        <span className="pill">目前結果 {rows.length} 筆</span>
        <span className="pill ok-pill">已完成 {completed}</span>
        <span className="pill warn-pill">未完成 {pending}</span>
      </div>

      {status !== "success" && <StatusMessage status={status} idle={message} error={message} />}

      {status === "success" && (
        <section className="result-grid">
          {rows.length ? rows.map((row) => <PonCard item={row} key={row.id} />) : <div className="empty-state">查無資料。</div>}
        </section>
      )}
    </main>
  );
}
