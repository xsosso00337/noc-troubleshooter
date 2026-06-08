import { FormEvent, useState } from "react";
import { CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useUserRoles } from "../lib/useUserRoles";

type ImportTarget = "noc_assets" | "noc_pon_assets" | "noc_legacy_nodes" | "noc_sop_assets";

type ImportResult = {
  ok: boolean;
  job_id: string;
  source_file_id: string;
  table: ImportTarget;
  rows: number;
  sheet_name: string;
  quality?: {
    total: number;
    missing_key: number;
    duplicate_rows: number;
    key_columns: string[];
  };
};

const maxUploadBytes = 10 * 1024 * 1024;

const targetOptions: Array<{ value: ImportTarget; label: string; hint: string }> = [
  { value: "noc_assets", label: "CMTS / 光點主資料", hint: "更新 CMTS、Node、機櫃、接收機與光路欄位。" },
  { value: "noc_pon_assets", label: "PON 全光資料", hint: "更新 OLT、PON、建物、配線與完工欄位。" },
  { value: "noc_legacy_nodes", label: "舊光點資料", hint: "更新舊版 Node、CMTS、TX/CH 與回傳接收機欄位。" },
  { value: "noc_sop_assets", label: "CM 升版 SOP", hint: "將 Excel 工作表轉成登入後才可讀取的 SOP 內容。" },
];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("檔案讀取失敗"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportPage() {
  const { canImport, loading: roleLoading } = useUserRoles();
  const [targetTable, setTargetTable] = useState<ImportTarget>("noc_assets");
  const [file, setFile] = useState<File | null>(null);
  const [replaceSource, setReplaceSource] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  if (roleLoading) return <main className="page-stack"><div className="loader-panel">確認匯入權限中...</div></main>;
  if (!canImport) return <Navigate to="/" replace />;

  const selectedOption = targetOptions.find((option) => option.value === targetTable) ?? targetOptions[0];
  const resultOption = result
    ? targetOptions.find((option) => option.value === result.table) ?? selectedOption
    : selectedOption;
  const isSopImport = targetTable === "noc_sop_assets";

  async function importFile(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setResult(null);

    if (!file) {
      setError("請先選擇 Excel 或 CSV 檔案。");
      return;
    }

    if (file.size > maxUploadBytes) {
      setError(`檔案太大，目前網站匯入上限是 ${formatBytes(maxUploadBytes)}。`);
      return;
    }

    setSubmitting(true);
    try {
      const base64 = await readFileAsDataUrl(file);
      const { data, error: invokeError } = await supabase.functions.invoke("noc-import-excel", {
        body: {
          table: targetTable,
          sopCategory: isSopImport ? "cm_upgrade" : undefined,
          filename: file.name,
          base64,
          replaceSource,
        },
      });

      if (invokeError || data?.error) {
        throw new Error(invokeError?.message || data?.error || "匯入失敗");
      }

      setResult(data as ImportResult);
      setMessage(`已匯入 ${data.rows} 筆資料，來源工作表：${data.sheet_name}`);
      setFile(null);
      setFileInputKey((current) => current + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "匯入失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>Import</span>
        <h1>Excel 資料匯入</h1>
        <p>選擇資料類型後上傳 Excel 或 CSV，系統會寫入 Supabase 並保留匯入紀錄。</p>
      </section>

      <section className="panel">
        <h2>選擇資料與檔案</h2>
        <form className="import-form" onSubmit={importFile}>
          <div className="import-target-grid" role="radiogroup" aria-label="匯入資料類型">
            {targetOptions.map((option) => (
              <label className={targetTable === option.value ? "import-target active" : "import-target"} key={option.value}>
                <input
                  checked={targetTable === option.value}
                  name="targetTable"
                  onChange={() => setTargetTable(option.value)}
                  type="radio"
                  value={option.value}
                />
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </label>
            ))}
          </div>

          <label className="file-drop">
            <FileSpreadsheet size={26} />
            <span>
              <strong>{file ? file.name : "選擇 Excel / CSV 檔案"}</strong>
              <small>{file ? `${formatBytes(file.size)}，將匯入到 ${selectedOption.label}` : "支援 .xlsx、.xls、.csv，檔案不會 commit 到 Git。"}</small>
            </span>
            <input
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              key={fileInputKey}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>

          <label className="toggle-row">
            <input checked={replaceSource} onChange={(event) => setReplaceSource(event.target.checked)} type="checkbox" />
            <span>
              <strong>{isSopImport ? "取代既有 CM 升版 SOP" : "取代同檔名舊資料"}</strong>
              <small>{isSopImport ? "開啟後會先刪除舊的 CM 升版 SOP，再寫入新內容。" : "開啟後會先刪除同一個檔名匯入過的資料，再寫入新資料。"}</small>
            </span>
          </label>

          <div className="row-actions">
            <button className="primary-button" disabled={submitting} type="submit">
              <UploadCloud size={17} />
              <span>{submitting ? "匯入中..." : "開始匯入"}</span>
            </button>
          </div>
        </form>

        {message && <div className="notice success-notice">{message}</div>}
        {error && <div className="notice danger">{error}</div>}
      </section>

      {result && (
        <section className="panel">
          <div className="import-result-head">
            <CheckCircle2 size={22} />
            <h2>匯入完成</h2>
          </div>
          <table className="field-table wide">
            <tbody>
              <tr>
                <th>資料類型</th>
                <td>{resultOption.label}</td>
              </tr>
              <tr>
                <th>匯入筆數</th>
                <td>{result.rows}</td>
              </tr>
              <tr>
                <th>工作表</th>
                <td>{result.sheet_name}</td>
              </tr>
              <tr>
                <th>Job ID</th>
                <td>{result.job_id}</td>
              </tr>
            </tbody>
          </table>
          {result.quality && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ margin: "0 0 8px" }}>資料品質</h3>
              <div className="quality-grid">
                <div className="quality-card">
                  <strong>{result.quality.total}</strong>
                  <span>總筆數</span>
                </div>
                <div className={`quality-card${result.quality.missing_key > 0 ? " warn" : ""}`}>
                  <strong>{result.quality.missing_key}</strong>
                  <span>關鍵欄位空白（{result.quality.key_columns.join(" + ")}）</span>
                </div>
                <div className={`quality-card${result.quality.duplicate_rows > 0 ? " warn" : ""}`}>
                  <strong>{result.quality.duplicate_rows}</strong>
                  <span>重複資料（依關鍵欄位）</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
