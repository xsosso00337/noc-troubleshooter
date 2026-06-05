import { Clipboard, Copy, Radio, RotateCcw, SearchCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Level = "ok" | "warn" | "danger" | "info";

function ResultBlock({ level, title, lines }: { level: Level; title: string; lines: string[] }) {
  return (
    <div className={`result-block ${level}`}>
      <h3>{title}</h3>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [faultResult, setFaultResult] = useState<ReactNode>(<strong>請選一個故障現象。</strong>);
  const [lastDiagnosis, setLastDiagnosis] = useState<string[]>([]);
  const [optical, setOptical] = useState({
    face: "unknown",
    dbm: "",
    type: "pon",
    distance: "",
    wave: "1490",
    symptom: "noLight",
  });
  const [rf, setRf] = useState({
    dsPower: "",
    dsSnr: "",
    usPower: "",
    usSnr: "",
  });
  const [record, setRecord] = useState({
    location: "",
    symptom: "",
    owner: "",
    note: "",
    output: "",
  });

  const tools = useMemo(
    () => [
      { to: "/pon", title: "全光 PON 查詢", meta: ["OLT 群組", "完工狀態", "Supabase"], accent: "teal" },
      { to: "/nodes", title: "光點查詢", meta: ["CMTS", "Port", "Hub"], accent: "blue" },
      { to: "/sop/troubleshooting", title: "機房查修 SOP", meta: ["光纖查修", "RF 查修", "查修紀錄"], accent: "slate" },
      { to: "/sop/optical", title: "光平衡 SOP", meta: ["光平衡", "查光功率", "圖片流程"], accent: "amber" },
      { to: "/sop/cm-upgrade", title: "CM 升版 SOP", meta: ["CM 升版", "BCC", "版本確認"], accent: "slate" },
      { to: "/sop/static-ip", title: "固 I SOP", meta: ["固定 IP", "BCC", "ISC_CPE"], accent: "teal" },
    ],
    [],
  );

  function setDiagnosis(lines: string[]) {
    setLastDiagnosis(lines.filter(Boolean));
  }

  function fault(type: string) {
    const map: Record<string, string[]> = {
      onu: ["先查 ONU Rx/Tx 與 OLT Port 狀態。", "再檢查端面與入戶線，必要時用 OTDR 定位。"],
      areaOptical: ["先確認同區多戶、同 PON 或同 Hub 是否同時異常。", "優先查 EDFA、分光器、幹線與供電。"],
      internet: ["先確認 CM/ONU 是否註冊、是否取得 IP。", "訊號正常但不通時查 DHCP、設定檔、路由與平台 log。"],
      unstable: ["先看時間序列：光功率、MER/SNR、US Power 是否飄動。", "再比對現場接頭、彎折、雜訊與供電。"],
      noise: ["先看上行 SNR、頻譜與 CMTS US channel。", "確認是否單點回灌或區域 ingress。"],
      dwdm: ["先確認波長與通道 power。", "再檢查 OSA、MUX/DEMUX、WDM、發射機與接收端。"],
      dtv: ["先量 RF power / MER / BER。", "再比對頻道群組、放大器與分配網路。"],
    };
    const lines = map[type] ?? ["請補充現場症狀。"];
    setDiagnosis(lines);
    setFaultResult(<ResultBlock level="info" title="建議處理順序" lines={lines} />);
  }

  function diagnoseOptical() {
    const dbm = optical.dbm === "" ? null : Number(optical.dbm);
    const distance = optical.distance === "" ? null : Number(optical.distance);
    const lines: string[] = [];
    let level: Level = "ok";

    if (optical.face === "dirty") {
      level = "warn";
      lines.push("端面髒污：先清潔端面後重測。");
    }
    if (optical.face === "scratch") {
      level = "danger";
      lines.push("端面刮傷或破損：更換跳線或接頭後再量測。");
    }
    if (dbm === null) {
      lines.push("尚未輸入光功率，先用 PM-500 建立基準值。");
    } else if (dbm <= -35) {
      level = "danger";
      lines.push("光功率極低或近似無光，優先查斷纖、錯接、上游設備。");
    } else if (dbm <= -28) {
      level = level === "danger" ? level : "warn";
      lines.push("光功率偏低，建議檢查接頭、分光比、彎折與幹線損耗。");
    } else {
      lines.push("光功率未達嚴重門檻，可往服務層或設備端確認。");
    }
    if (distance !== null) {
      const pulse = distance <= 5 ? "10-50 ns" : distance <= 20 ? "100-300 ns" : "1 us 以上";
      lines.push(`OTDR 建議脈寬：${pulse}，波長 ${optical.wave} nm。`);
    }
    if (optical.symptom === "dwdmPower") lines.push("DWDM/CWDM 場景請用 OSA 確認通道波長與 power。");

    setDiagnosis(lines);
    setFaultResult(<ResultBlock level={level} title="光纖診斷" lines={lines} />);
  }

  function diagnoseRf() {
    const ds = rf.dsPower === "" ? null : Number(rf.dsPower);
    const snr = rf.dsSnr === "" ? null : Number(rf.dsSnr);
    const us = rf.usPower === "" ? null : Number(rf.usPower);
    const usSnr = rf.usSnr === "" ? null : Number(rf.usSnr);
    const lines: string[] = [];
    let level: Level = "ok";

    if (ds !== null && (ds < -12 || ds > 12)) {
      level = "warn";
      lines.push("DS Power 超出建議範圍，先查分配器、放大器與線路衰減。");
    }
    if (snr !== null && snr < 32) {
      level = "danger";
      lines.push("DS SNR/MER 偏低，可能有雜訊、失真或放大器問題。");
    }
    if (us !== null && us >= 52) {
      level = "warn";
      lines.push("US Power 偏高，回傳路徑衰減或接頭問題機率高。");
    }
    if (usSnr !== null && usSnr < 29) {
      level = "danger";
      lines.push("US SNR 偏低，請用頻譜儀確認 ingress 或單頻干擾。");
    }
    if (!lines.length) lines.push("輸入值未觸發明顯 RF 警示，若服務仍異常請查註冊、IP 與平台 log。");

    setDiagnosis(lines);
    setFaultResult(<ResultBlock level={level} title="RF / DOCSIS 判斷" lines={lines} />);
  }

  function makeRecord() {
    const now = new Date().toLocaleString("zh-TW", { hour12: false });
    const output = [
      "【機房查修紀錄】",
      `時間：${now}`,
      `地點/節點：${record.location || "未填"}`,
      `故障現象：${record.symptom || "未填"}`,
      `處理人員：${record.owner || "未填"}`,
      "",
      "【系統判斷】",
      ...(lastDiagnosis.length ? lastDiagnosis.map((line) => ` - ${line}`) : [" - 尚未執行診斷"]),
      "",
      "【現場補充】",
      record.note || "無",
      "",
      "【建議順序】",
      "1. 端面檢查 / 清潔",
      "2. 數值量測",
      "3. 儀表定位",
      "4. 系統層確認",
    ].join("\n");
    setRecord((current) => ({ ...current, output }));
  }

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>Tool desk</span>
        <h1>機房查修工具</h1>
        <p>登入後查詢內部資料；查修判斷與 SOP 保留原本現場操作節奏。</p>
      </section>

      <section className="two-column">
        <div className="panel">
          <h2>故障入口</h2>
          <div className="button-grid">
            {[
              ["onu", "ONU 不上線 / 光弱"],
              ["areaOptical", "整區掉光"],
              ["internet", "客戶無法上網"],
              ["unstable", "間歇掉線"],
              ["noise", "上行雜訊 / SNR低"],
              ["dwdm", "DWDM 波長異常"],
              ["dtv", "DTV 馬賽克 / 無訊號"],
            ].map(([key, label]) => (
              <button className="secondary-button" key={key} onClick={() => fault(key)}>
                <SearchCheck size={17} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="result-area">{faultResult}</div>
        </div>

        <div className="panel">
          <h2>現場總原則</h2>
          <div className="step-list">
            <div><strong>先看端面</strong><span>ViewConn Pro，髒污先清潔再重測。</span></div>
            <div><strong>再量數值</strong><span>PM-500 / 860 DSPi 先判斷嚴重度。</span></div>
            <div><strong>最後定位</strong><span>OTDR 找距離，頻譜儀看雜訊型態。</span></div>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <h2>光纖診斷：FTB-500</h2>
          <div className="form-grid three">
            <label>端面狀態
              <select value={optical.face} onChange={(e) => setOptical({ ...optical, face: e.target.value })}>
                <option value="unknown">未檢查</option>
                <option value="clean">乾淨</option>
                <option value="dirty">髒污 / 油污 / 灰塵</option>
                <option value="scratch">刮傷 / 破損</option>
              </select>
            </label>
            <label>PM-500 光功率 dBm
              <input value={optical.dbm} onChange={(e) => setOptical({ ...optical, dbm: e.target.value })} type="number" step="0.1" placeholder="例：-15、-28、-40" />
            </label>
            <label>測試場景
              <select value={optical.type} onChange={(e) => setOptical({ ...optical, type: e.target.value })}>
                <option value="pon">PON / ONU側</option>
                <option value="catv">CATV 1550</option>
                <option value="trunk">幹線 / 骨幹</option>
                <option value="dwdm">DWDM / CWDM</option>
              </select>
            </label>
            <label>預估距離 km
              <input value={optical.distance} onChange={(e) => setOptical({ ...optical, distance: e.target.value })} type="number" step="0.1" placeholder="例：2、8、20" />
            </label>
            <label>波長
              <select value={optical.wave} onChange={(e) => setOptical({ ...optical, wave: e.target.value })}>
                <option>1490</option>
                <option>1310</option>
                <option>1550</option>
                <option>1625</option>
                <option>1650</option>
              </select>
            </label>
            <label>狀況
              <select value={optical.symptom} onChange={(e) => setOptical({ ...optical, symptom: e.target.value })}>
                <option value="noLight">無光 / 光弱</option>
                <option value="unstable">光忽高忽低</option>
                <option value="normalNoService">有光但服務不通</option>
                <option value="dwdmPower">DWDM 通道功率異常</option>
              </select>
            </label>
          </div>
          <div className="row-actions">
            <button className="primary-button" onClick={diagnoseOptical}><Wrench size={17} /><span>分析光纖</span></button>
            <button className="ghost-button" onClick={() => setOptical({ face: "unknown", dbm: "", type: "pon", distance: "", wave: "1490", symptom: "noLight" })}><RotateCcw size={17} /><span>清空</span></button>
          </div>
        </div>

        <div className="panel">
          <h2>RF / DOCSIS 自動判斷</h2>
          <div className="form-grid two">
            <label>DS Power dBmV
              <input value={rf.dsPower} onChange={(e) => setRf({ ...rf, dsPower: e.target.value })} type="number" step="0.1" placeholder="例：0、-14、18" />
            </label>
            <label>DS SNR / MER dB
              <input value={rf.dsSnr} onChange={(e) => setRf({ ...rf, dsSnr: e.target.value })} type="number" step="0.1" placeholder="例：36、32、28" />
            </label>
            <label>US Power dBmV
              <input value={rf.usPower} onChange={(e) => setRf({ ...rf, usPower: e.target.value })} type="number" step="0.1" placeholder="例：45、53" />
            </label>
            <label>US SNR dB
              <input value={rf.usSnr} onChange={(e) => setRf({ ...rf, usSnr: e.target.value })} type="number" step="0.1" placeholder="例：31、27" />
            </label>
          </div>
          <div className="row-actions">
            <button className="primary-button" onClick={diagnoseRf}><Radio size={17} /><span>分析 RF</span></button>
            <button className="ghost-button" onClick={() => setRf({ dsPower: "", dsSnr: "", usPower: "", usSnr: "" })}><RotateCcw size={17} /><span>清空</span></button>
          </div>
        </div>
      </section>

      <section className="tool-grid">
        {tools.map((tool) => (
          <Link to={tool.to} className={`tool-card ${tool.accent}`} key={tool.to}>
            <div>
              <span>{tool.meta.join(" / ")}</span>
              <h2>{tool.title}</h2>
            </div>
            <strong>開啟</strong>
          </Link>
        ))}
      </section>

      <section className="panel">
        <h2>查修紀錄產生器</h2>
        <div className="form-grid four">
          <label>地點 / 節點
            <input value={record.location} onChange={(e) => setRecord({ ...record, location: e.target.value })} />
          </label>
          <label>故障現象
            <input value={record.symptom} onChange={(e) => setRecord({ ...record, symptom: e.target.value })} />
          </label>
          <label>處理人員
            <input value={record.owner} onChange={(e) => setRecord({ ...record, owner: e.target.value })} />
          </label>
          <label>現場補充
            <input value={record.note} onChange={(e) => setRecord({ ...record, note: e.target.value })} />
          </label>
        </div>
        <div className="row-actions">
          <button className="primary-button" onClick={makeRecord}><Clipboard size={17} /><span>產生紀錄</span></button>
          <button className="ghost-button" onClick={() => navigator.clipboard?.writeText(record.output)} disabled={!record.output}><Copy size={17} /><span>複製</span></button>
        </div>
        <textarea className="record-output" value={record.output} readOnly />
      </section>
    </main>
  );
}
