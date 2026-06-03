import { Navigate, useParams } from "react-router-dom";

const opticalImages = [
  new URL("../../assets/optical-balance-receiver-sop.svg", import.meta.url).href,
  new URL("../../assets/optical-balance-sop.svg", import.meta.url).href,
];

const staticIpImages = [
  new URL("../../assets/sop-static-ip-redacted-01.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-02.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-03.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-04.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-05.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-06.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-07.png", import.meta.url).href,
  new URL("../../assets/sop-static-ip-redacted-08.png", import.meta.url).href,
];

export function SopPage() {
  const { kind } = useParams();
  if (kind !== "optical" && kind !== "static-ip") return <Navigate to="/" replace />;

  const isOptical = kind === "optical";
  const images = isOptical ? opticalImages : staticIpImages;

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>SOP</span>
        <h1>{isOptical ? "光平衡 SOP" : "CM 升版 / 固 I 設定 SOP"}</h1>
        <p>{isOptical ? "寬宇接收機光平衡、GX2 光平衡與查光功率流程。" : "CM 3B8 升版、BCC 固 I 與 ISC_CPE 排除名單流程。"}</p>
      </section>

      {!isOptical && (
        <section className="panel">
          <h2>固 I 欄位對照</h2>
          <table className="field-table wide">
            <tbody>
              <tr>
                <th>來源資料</th>
                <td>BCC Static Addresses、ISC_CPE 排除名單與客戶固定 IP 申裝資料。</td>
              </tr>
              <tr>
                <th>安全原則</th>
                <td>圖片保留 redacted 版本；原始客戶資料不可 commit，僅能放在安全環境匯入或查閱。</td>
              </tr>
              <tr>
                <th>操作順序</th>
                <td>先確認 CM 狀態與申裝資料，再進 BCC 設定，最後同步 ISC_CPE 排除名單。</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="image-grid">
        {images.map((src, index) => (
          <figure className="sop-image" key={src}>
            <img src={src} alt={`${isOptical ? "光平衡" : "固 I"} SOP ${index + 1}`} />
          </figure>
        ))}
      </section>
    </main>
  );
}
