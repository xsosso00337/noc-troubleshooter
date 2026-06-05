import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { loadSopAssets } from "../lib/nocQueries";
import type { SopAsset } from "../types";

type DisplayImage = {
  id: string;
  title: string;
  caption?: string | null;
  src: string;
  width?: number | null;
  height?: number | null;
  canOpen?: boolean;
};

const opticalImages: DisplayImage[] = [
  {
    id: "optical-receiver",
    title: "第一套：寬宇接收機光平衡",
    caption: "測試站 / 光盒選擇、光站 A/B 組選擇與光站設定調整。",
    src: new URL("../../assets/optical-balance-receiver-sop.svg", import.meta.url).href,
    canOpen: true,
  },
  {
    id: "optical-gx2",
    title: "第二套：GX2 光平衡 / 查光功率",
    caption: "保留光平衡與查光功率兩個流程，方便現場對照按鍵順序。",
    src: new URL("../../assets/optical-balance-sop.svg", import.meta.url).href,
    canOpen: true,
  },
];

const staticIpSteps = [
  ["整理申裝資料", "從客服信件確認客編、CM MAC、CPE MAC、固定 IP 與 Node。"],
  ["查 Rule", "依 Node 到 BCC 確認對應 DHCPv4 Subnet Rule / Static Addresses。"],
  ["設定 BCC", "Static Address 的 MAC Address 使用 CPE MAC，Description 建議保留客編與 CPE MAC。"],
  ["設定 ISC_CPE", "Block CPE 的 custid 填客編，hd_addr 填 CPE MAC，cmmac 填 CM MAC。"],
  ["回查複核", "完成後用客編、CPE MAC、CM MAC 交叉確認，避免填反或重複設定。"],
];

const fieldRows = [
  ["CPE MAC", "BCC Static Address 的 MAC Address / Description", "ISC_CPE 的 hd_addr", "固 I 綁定用，勿填成 CM MAC。"],
  ["CM MAC", "BCC Static Address 不填在 MAC 欄", "ISC_CPE 的 cmmac", "用於排除名單，需與 CPE MAC 分開確認。"],
  ["固定 IP", "確認對應規則與可用保留列", "作為複查資訊", "設定後回查 IP / MAC 對應。"],
];

function toDataUrl(asset: SopAsset) {
  return `data:${asset.content_type};base64,${asset.image_base64}`;
}

function StepPanel({ title, steps }: { title: string; steps: string[][] }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="sop-flow-grid">
        {steps.map(([heading, text], index) => (
          <div className="sop-step" key={heading}>
            <strong>{index + 1}. {heading}</strong>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SopImageGrid({ images, loading, error, emptyText, onRetry }: {
  images: DisplayImage[];
  loading?: boolean;
  error?: string;
  emptyText?: string;
  onRetry?: () => void;
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  return (
    <section className="image-grid">
      {loading && <div className="loader-panel sop-loader">讀取 SOP 圖片中...</div>}
      {error && (
        <div className="notice danger sop-error">
          <span>{error}</span>
          {onRetry && (
            <button className="ghost-button" type="button" onClick={onRetry}>
              <RefreshCw size={16} />
              <span>重新讀取</span>
            </button>
          )}
        </div>
      )}
      {images.map((image) => (
        <figure className="sop-image" key={image.id}>
          <figcaption className="sop-image-head">
            <span>
              <strong>{image.title}</strong>
              {image.caption && <small>{image.caption}</small>}
            </span>
            {image.canOpen && (
              <a className="ghost-button sop-open-link" href={image.src} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} />
                <span>開圖</span>
              </a>
            )}
          </figcaption>
          {failed[image.id] ? (
            <div className="empty-state danger">
              {image.canOpen ? "SOP 載入失敗，請按「開圖」或重新整理頁面。" : "SOP 載入失敗，請重新整理頁面。"}
            </div>
          ) : (
            <img
              src={image.src}
              alt={image.title}
              loading="lazy"
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              onError={() => setFailed((current) => ({ ...current, [image.id]: true }))}
            />
          )}
        </figure>
      ))}
      {!loading && !error && !images.length && (
        <div className="empty-state">{emptyText ?? "尚未匯入 SOP 圖片。"}</div>
      )}
    </section>
  );
}

export function SopPage() {
  const { kind } = useParams();
  const [cmAssets, setCmAssets] = useState<SopAsset[]>([]);
  const [staticAssets, setStaticAssets] = useState<SopAsset[]>([]);
  const [troubleshootingAssets, setTroubleshootingAssets] = useState<SopAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetError, setAssetError] = useState("");

  const isOptical = kind === "optical";
  const isCmUpgrade = kind === "cm-upgrade";
  const isStaticIp = kind === "static-ip";
  const isTroubleshooting = kind === "troubleshooting";

  const loadProtectedAssets = async () => {
    setLoadingAssets(true);
    setAssetError("");
    try {
      if (isCmUpgrade) {
        setCmAssets(await loadSopAssets("cm_upgrade"));
      }
      if (isStaticIp) {
        setStaticAssets(await loadSopAssets("static_ip"));
      }
      if (isTroubleshooting) {
        const assets = await loadSopAssets("optical");
        setTroubleshootingAssets(assets.filter((asset) => asset.slug.startsWith("troubleshooting-")));
      }
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "SOP 圖片讀取失敗");
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (isCmUpgrade || isStaticIp || isTroubleshooting) void loadProtectedAssets();
  }, [isCmUpgrade, isStaticIp, isTroubleshooting]);

  const cmImages = useMemo<DisplayImage[]>(
    () => cmAssets.map((asset) => ({
      id: asset.slug,
      title: asset.title,
      caption: asset.caption,
      src: toDataUrl(asset),
      width: asset.width,
      height: asset.height,
      canOpen: asset.content_type !== "image/svg+xml",
    })),
    [cmAssets],
  );

  const staticImages = useMemo<DisplayImage[]>(
    () => staticAssets.map((asset) => ({
      id: asset.slug,
      title: asset.title,
      caption: asset.caption,
      src: toDataUrl(asset),
      width: asset.width,
      height: asset.height,
      canOpen: asset.content_type !== "image/svg+xml",
    })),
    [staticAssets],
  );

  const troubleshootingImages = useMemo<DisplayImage[]>(
    () => troubleshootingAssets.map((asset) => ({
      id: asset.slug,
      title: asset.title,
      caption: asset.caption,
      src: toDataUrl(asset),
      width: asset.width,
      height: asset.height,
      canOpen: asset.content_type !== "image/svg+xml",
    })),
    [troubleshootingAssets],
  );

  if (!isOptical && !isCmUpgrade && !isStaticIp && !isTroubleshooting) return <Navigate to="/" replace />;

  const pageTitle = isOptical ? "光平衡 SOP" : isTroubleshooting ? "機房查修 SOP" : isCmUpgrade ? "CM 升版 SOP" : "固 I 設定 SOP";
  const pageDescription = isOptical
    ? "寬宇接收機光平衡、GX2 光平衡與查光功率流程。"
    : isTroubleshooting
      ? "光纖查修、RF 查修與查修紀錄；SOP 內容由 Supabase RLS 保護，登入後才會載入。"
    : isCmUpgrade
      ? "CM 升版流程由 Supabase RLS 保護，登入後才會載入。"
      : "BCC 固 I 與 ISC_CPE 排除名單流程；SOP 內容由 Supabase RLS 保護，登入後才會載入。";

  return (
    <main className="page-stack">
      <section className="page-title">
        <span>SOP</span>
        <h1>{pageTitle}</h1>
        <p>{pageDescription}</p>
      </section>

      {isOptical ? (
        <SopImageGrid images={opticalImages} />
      ) : isTroubleshooting ? (
        <section className="panel">
          <h2>機房查修流程</h2>
          <SopImageGrid
            images={troubleshootingImages}
            loading={loadingAssets}
            error={assetError}
            emptyText="尚未匯入機房查修 SOP。"
            onRetry={loadProtectedAssets}
          />
        </section>
      ) : isCmUpgrade ? (
        <section className="panel">
          <h2>CM 升版流程</h2>
          <SopImageGrid
            images={cmImages}
            loading={loadingAssets}
            error={assetError}
            emptyText="尚未匯入 CM 升版 SOP，請由匯入頁上傳最新 Excel。"
            onRetry={loadProtectedAssets}
          />
        </section>
      ) : (
        <>
          <div className="sop-guide-grid">
            <StepPanel title="固 I 設定流程" steps={staticIpSteps} />
          </div>

          <section className="panel">
            <h2>固 I 欄位對照</h2>
            <table className="field-table wide">
              <thead>
                <tr>
                  <th>來源資料</th>
                  <th>BCC Static Addresses</th>
                  <th>ISC_CPE 排除名單</th>
                  <th>注意</th>
                </tr>
              </thead>
              <tbody>
                {fieldRows.map(([source, bcc, isc, note]) => (
                  <tr key={source}>
                    <td>{source}</td>
                    <td>{bcc}</td>
                    <td>{isc}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <SopImageGrid
            images={staticImages}
            loading={loadingAssets}
            error={assetError}
            emptyText="尚未匯入固 I SOP 圖片。"
            onRetry={loadProtectedAssets}
          />
        </>
      )}
    </main>
  );
}
