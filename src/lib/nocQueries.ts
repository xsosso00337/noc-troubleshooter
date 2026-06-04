import type { DataFreshness, DataSourceType, LegacyNode, NocAsset, PonAsset, SopAsset } from "../types";
import { writeAuditLog } from "./audit";
import { supabase } from "./supabase";

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error("請先登入後再查詢內部資料。");
  }
  return data.session;
}

function cleanQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function likePattern(value: string) {
  return `%${cleanQuery(value).replace(/[%_]/g, "\\$&")}%`;
}

export async function searchNocAssets(params: {
  query: string;
  cmts?: string;
  limit?: number;
}) {
  await requireSession();

  let request = supabase
    .from("noc_assets")
    .select(
      "id,cmts,node,line_code,mac_domain,upstream_port,upstream_connector,downstream_port,receiver,return_source,receiver_brand,receiver_rack,sst,hub_max,max_rack,demax_rack,demux_wavelength,dwdm_splitter,edfa,wdm,mux,dcm,demux_a,demux_b,tx_a,tx_channel,tx_a_rack,pre_amp,fiber_down_a,fiber_up_a,tx_b,tx_b_rack,source_row,status,source_file,source_sheet",
    )
    .order("cmts", { ascending: true })
    .order("node", { ascending: true })
    .limit(params.limit ?? 300);

  if (params.cmts) request = request.eq("cmts", params.cmts);
  if (cleanQuery(params.query)) request = request.ilike("search_text", likePattern(params.query));

  const { data, error } = await request;
  if (error) throw error;

  await writeAuditLog("search_noc_assets", params, { result_count: data?.length ?? 0 });
  return (data ?? []) as NocAsset[];
}

export async function loadLatestDataFreshness(sourceType: DataSourceType) {
  await requireSession();

  const { data, error } = await supabase
    .from("noc_files")
    .select("source_type,original_filename,row_count,imported_at,metadata")
    .eq("source_type", sourceType)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as DataFreshness | null;
}

export async function searchLegacyNodes(params: { query: string; limit?: number }) {
  await requireSession();

  let request = supabase
    .from("noc_legacy_nodes")
    .select(
      "id,source_id,node,cmts,mac_domain,upstream_port,upstream_connector,downstream_port,tx_channel,mux,hub,dcm,return_receiver,demux_a,demux_b,index_channel,source_row,warning",
    )
    .order("node", { ascending: true })
    .limit(params.limit ?? 200);

  if (cleanQuery(params.query)) request = request.ilike("search_text", likePattern(params.query));

  const { data, error } = await request;
  if (error) throw error;

  await writeAuditLog("search_legacy_nodes", params, { result_count: data?.length ?? 0 });
  return (data ?? []) as LegacyNode[];
}

export async function searchPonAssets(params: {
  query: string;
  oltCard?: string;
  status?: "completed" | "pending";
  limit?: number;
}) {
  await requireSession();

  let request = supabase
    .from("noc_pon_assets")
    .select(
      "id,source_id,headend,olt_frame,olt_card,olt_port_id,pon_no,node,building_id,building_name,building_type,serviceable_units,address_range,building_units,fiber_core_he,olt_port,patch_panel,edfa,notify_date,patch_done_date,pon_done_date,note,extra_note,system_id,edfa_code,only_area,first_splitter,second_splitter,pon_user_type,olt_name,network_code,original_olt,source_row",
    )
    .order("olt_card", { ascending: true })
    .order("olt_port_id", { ascending: true })
    .limit(params.limit ?? 300);

  if (params.oltCard) request = request.eq("olt_card", params.oltCard);
  if (params.status === "completed") request = request.neq("pon_done_date", "");
  if (params.status === "pending") request = request.is("pon_done_date", null);
  if (cleanQuery(params.query)) request = request.ilike("search_text", likePattern(params.query));

  const { data, error } = await request;
  if (error) throw error;

  await writeAuditLog("search_pon_assets", params, { result_count: data?.length ?? 0 });
  return (data ?? []) as PonAsset[];
}

export async function loadPonGroups() {
  await requireSession();
  const { data, error } = await supabase.from("noc_pon_assets").select("olt_card").limit(2000);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const group = row.olt_card?.trim() || "未分類";
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-Hant-u-nu-latn"));
}

export async function loadSopAssets(category: "static_ip" | "cm_upgrade" | "optical") {
  await requireSession();

  const { data, error } = await supabase
    .from("noc_sop_assets")
    .select("id,category,slug,title,caption,sort_order,content_type,width,height,image_base64")
    .eq("category", category)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  await writeAuditLog("load_sop_assets", { category }, { result_count: data?.length ?? 0 });
  return (data ?? []) as SopAsset[];
}
