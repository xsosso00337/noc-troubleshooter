import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DataFreshnessLine } from "../components/DataFreshnessLine";
import { FieldTable } from "../components/FieldTable";
import { StatusMessage } from "../components/StatusMessage";
import { loadLatestDataFreshness, searchLegacyNodes, searchNocAssets } from "../lib/nocQueries";
import type { DataFreshness, LegacyNode, NocAsset, QueryStatus } from "../types";

const cmtsOptions = ["E6K01", "E6K02", "E6K03", "E6K04", "E6K05", "E6K06", "E6K07", "E6K08", "E6K09", "E6K10", "E6K11"];

function formatPowerLevel(value: number | null) {
  if (value === null) return null;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} dBmV`;
}

function AssetCard({ asset }: { asset: NocAsset }) {
  return (
    <article className="data-card">
      <div className="card-heading">
        <h2>{asset.node || "未命名光點"}</h2>
        <div className="pill-row">
          {asset.line_code && <span className="pill">線編 {asset.line_code}</span>}
          {asset.cmts && <span className="pill">{asset.cmts}</span>}
          {asset.status && asset.status.trim().toUpperCase() !== "OK" && <span className="pill muted-pill">{asset.status}</span>}
        </div>
      </div>
      <FieldTable
        rows={[
          ["Mac Domain", asset.mac_domain],
          ["上行 Slot", asset.upstream_port],
          ["Connector", asset.upstream_connector],
          ["下行 Slot", asset.downstream_port],
          ["Power Level", formatPowerLevel(asset.power_level)],
          ["線編", asset.line_code],
          ["接收機", asset.receiver],
          ["反向 Source", asset.return_source],
          ["接收機廠牌", asset.receiver_brand],
          ["SST", asset.sst],
          ["HUB/MAX", asset.hub_max],
          ["MUX 16:1", asset.mux],
          ["DCM(B組)", asset.dcm],
          ["DEMUX A", asset.demux_a],
          ["DEMUX B", asset.demux_b],
          ["接收機機櫃", asset.receiver_rack],
          ["MAX機櫃", asset.max_rack],
          ["DEMAX機櫃", asset.demax_rack],
          ["A組發射機機櫃", asset.tx_a_rack],
          ["B組發射機機櫃", asset.tx_b_rack],
          ["Demux波長", asset.demux_wavelength],
          ["DWDM分光器", asset.dwdm_splitter],
          ["EDFA", asset.edfa],
          ["WDM", asset.wdm],
          ["A組發射機", asset.tx_a],
          ["TX/CH", asset.tx_channel],
          ["前置放大器", asset.pre_amp],
          ["A組下行芯數", asset.fiber_down_a],
          ["A組上行芯數", asset.fiber_up_a],
          ["B組發射機", asset.tx_b],
          ["來源列", asset.source_row],
        ]}
      />
    </article>
  );
}

function LegacyNodeCard({ node }: { node: LegacyNode }) {
  return (
    <article className="data-card compact">
      <div className="card-heading">
        <h2>{node.node || "未命名光點"}</h2>
        <div className="pill-row">
          {node.source_id && <span className="pill">#{node.source_id}</span>}
          {node.cmts && <span className="pill">{node.cmts}</span>}
        </div>
      </div>
      <FieldTable
        rows={[
          ["CMTS", node.cmts],
          ["Mac Domain", node.mac_domain],
          ["上行 Port", node.upstream_port],
          ["上行 Connector", node.upstream_connector],
          ["下行 Port", node.downstream_port],
          ["發射機 / CH", node.tx_channel || node.index_channel],
          ["MUX", node.mux],
          ["分光器 / Hub", node.hub],
          ["DCM(B組)", node.dcm],
          ["反向接收機", node.return_receiver],
          ["DEMUX-A", node.demux_a],
          ["DEMUX-B", node.demux_b],
          ["資料警告", node.warning],
        ]}
      />
    </article>
  );
}

export function NodeLookupPage() {
  const [query, setQuery] = useState("");
  const [cmts, setCmts] = useState("");
  const [mode, setMode] = useState<"cmts" | "legacy">("cmts");
  const [assets, setAssets] = useState<NocAsset[]>([]);
  const [legacyNodes, setLegacyNodes] = useState<LegacyNode[]>([]);
  const [status, setStatus] = useState<QueryStatus>("idle");
  const [message, setMessage] = useState("請輸入關鍵字後查詢。");
  const [freshness, setFreshness] = useState<DataFreshness | null>(null);
  const [freshnessError, setFreshnessError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFreshnessError("");
    loadLatestDataFreshness(mode === "legacy" ? "legacy_node" : "cmts")
      .then((data) => {
        if (!cancelled) setFreshness(data);
      })
      .catch(() => {
        if (!cancelled) {
          setFreshness(null);
          setFreshnessError("讀取失敗");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function runSearch(showScope = false) {
    if (!query.trim() && !showScope) {
      setStatus("idle");
      setMessage("請輸入光點、線編、Hub、Port、MUX、EDFA 或 CMTS。");
      return;
    }

    setStatus("loading");
    try {
      if (mode === "legacy") {
        const rows = await searchLegacyNodes({ query, limit: 200 });
        setLegacyNodes(rows);
        setAssets([]);
        setMessage(`舊首頁光點資料：${rows.length} 筆`);
      } else {
        const rows = await searchNocAssets({ query, cmts: cmts || undefined, limit: showScope ? 100 : 300 });
        setAssets(rows);
        setLegacyNodes([]);
        setMessage(`目前範圍：${cmts || "全部 E6K"}，查到 ${rows.length} 筆`);
      }
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "查詢失敗。");
    }
  }

  function clear() {
    setQuery("");
    setCmts("");
    setMode("cmts");
    setAssets([]);
    setLegacyNodes([]);
    setStatus("idle");
    setMessage("已清空，可直接搜尋。");
  }

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>資料查詢</span>
        <h1>光點 / CMTS / Hub 查詢</h1>
        <p>保留原本查光點、線編、Hub、Port、MUX、DEMUX、EDFA 與機櫃資訊的流程，資料改從 Supabase 讀取。</p>
        <DataFreshnessLine freshness={freshness} error={freshnessError} />
      </section>

      <section className="query-bar">
        <select value={mode} onChange={(event) => setMode(event.target.value as "cmts" | "legacy")}>
          <option value="cmts">CMTS 總表</option>
          <option value="legacy">舊首頁光點表</option>
        </select>
        <select value={cmts} onChange={(event) => setCmts(event.target.value)} disabled={mode === "legacy"}>
          <option value="">全部 E6K</option>
          {cmtsOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
          placeholder="輸入 TP0107 / 線編7 / Hub01 / DL0506 / EDFA52 / 1/5/3-5"
        />
        <button className="primary-button" onClick={() => void runSearch()}>
          <Search size={17} />
          <span>查詢</span>
        </button>
        <button className="ghost-button" onClick={() => void runSearch(true)} disabled={mode === "legacy"}>
          <Search size={17} />
          <span>顯示分類</span>
        </button>
        <button className="ghost-button" onClick={clear}>
          <Trash2 size={17} />
          <span>清空</span>
        </button>
      </section>

      <div className="stats-line">{message}</div>

      {status !== "success" && <StatusMessage status={status} idle={message} error={message} />}

      {status === "success" && mode === "cmts" && (
        <section className="result-grid">
          {assets.length ? assets.map((asset) => <AssetCard asset={asset} key={asset.id} />) : <div className="empty-state">查無資料。</div>}
        </section>
      )}

      {status === "success" && mode === "legacy" && (
        <section className="result-grid">
          {legacyNodes.length ? legacyNodes.map((node) => <LegacyNodeCard node={node} key={node.id} />) : <div className="empty-state">查無資料。</div>}
        </section>
      )}
    </main>
  );
}
