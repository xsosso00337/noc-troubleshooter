import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

type TargetTable = "noc_assets" | "noc_pon_assets" | "noc_legacy_nodes";

type Args = {
  file: string;
  table: TargetTable;
  sourceType: "cmts" | "pon" | "legacy_node";
  replaceSource: boolean;
};

type CsvRow = Record<string, string>;

const tableSourceType: Record<TargetTable, Args["sourceType"]> = {
  noc_assets: "cmts",
  noc_pon_assets: "pon",
  noc_legacy_nodes: "legacy_node",
};

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  npm run import:noc -- --file ./private-data/cmts.csv --table noc_assets",
      "  npm run import:noc -- --file ./private-data/pon.csv --table noc_pon_assets",
      "  npm run import:noc -- --file ./private-data/nodes.csv --table noc_legacy_nodes",
      "",
      "Options:",
      "  --replace-source   delete existing rows with the same source_file before insert",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "replace-source") {
      args.set(key, true);
    } else {
      args.set(key, argv[index + 1]);
      index += 1;
    }
  }

  const file = args.get("file");
  const table = args.get("table");
  if (typeof file !== "string" || typeof table !== "string") usage();
  if (!["noc_assets", "noc_pon_assets", "noc_legacy_nodes"].includes(table)) usage();

  return {
    file,
    table: table as TargetTable,
    sourceType: tableSourceType[table as TargetTable],
    replaceSource: args.get("replace-source") === true,
  };
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function pick(row: CsvRow, names: string[]) {
  for (const name of names) {
    const exact = row[name];
    if (exact !== undefined && clean(exact)) return clean(exact);
  }

  const lowerEntries = Object.entries(row).map(([key, value]) => [key.toLowerCase(), value] as const);
  for (const name of names) {
    const found = lowerEntries.find(([key]) => key === name.toLowerCase());
    if (found && clean(found[1])) return clean(found[1]);
  }
  return null;
}

function numberValue(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function searchText(row: Record<string, unknown>) {
  return Object.values(row)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => clean(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function cmtsPayload(row: CsvRow, sourceFileId: string, fileName: string, rowNumber: number) {
  const payload = {
    source_file_id: sourceFileId,
    cmts: pick(row, ["cmts", "CMTS"]),
    mac_domain: pick(row, ["macDomain", "mac_domain", "Mac Domain"]),
    upstream_port: pick(row, ["upstreamPort", "upstream_port", "上行 Slot", "上行 Port"]),
    upstream_connector: pick(row, ["upstreamConnector", "upstream_connector", "Connector", "上行 Connector"]),
    downstream_port: pick(row, ["downstreamPort", "downstream_port", "下行 Slot", "下行 Port"]),
    node: pick(row, ["node", "光點"]),
    receiver: pick(row, ["receiver", "接收機"]),
    return_source: pick(row, ["returnSource", "return_source", "反向 Source"]),
    receiver_brand: pick(row, ["receiverBrand", "receiver_brand", "接收機廠牌"]),
    receiver_rack: pick(row, ["receiverRack", "receiver_rack", "接收機機櫃"]),
    sst: pick(row, ["sst", "SST"]),
    hub_max: pick(row, ["hubMax", "hub_max", "HUB/MAX", "Hub"]),
    max_rack: pick(row, ["maxRack", "max_rack", "MAX機櫃"]),
    demax_rack: pick(row, ["demaxRack", "demax_rack", "DEMAX機櫃"]),
    demux_wavelength: pick(row, ["demuxWavelength", "demux_wavelength", "Demux波長"]),
    dwdm_splitter: pick(row, ["dwdmSplitter", "dwdm_splitter", "DWDM分光器"]),
    edfa: pick(row, ["edfa", "EDFA"]),
    wdm: pick(row, ["wdm", "WDM"]),
    mux: pick(row, ["mux", "MUX 16:1", "MUX"]),
    dcm: pick(row, ["dcm", "DCM(B組)", "DCM"]),
    demux_a: pick(row, ["demuxA", "demux_a", "DEMUX A", "DEMUX-A"]),
    demux_b: pick(row, ["demuxB", "demux_b", "DEMUX B", "DEMUX-B"]),
    tx_a: pick(row, ["txA", "tx_a", "A組發射機"]),
    tx_channel: pick(row, ["txChannel", "tx_channel", "TX/CH", "發射機 / CH"]),
    tx_a_rack: pick(row, ["txARack", "tx_a_rack", "A組發射機機櫃"]),
    pre_amp: pick(row, ["preAmp", "pre_amp", "前置放大器"]),
    fiber_down_a: pick(row, ["fiberDownA", "fiber_down_a", "A組下行芯數"]),
    fiber_up_a: pick(row, ["fiberUpA", "fiber_up_a", "A組上行芯數"]),
    tx_b: pick(row, ["txB", "tx_b", "B組發射機"]),
    tx_b_rack: pick(row, ["txBRack", "tx_b_rack", "B組發射機機櫃"]),
    line_code: pick(row, ["lineCode", "line_code", "線編"]),
    source: pick(row, ["source", "來源"]),
    status: pick(row, ["status", "狀態"]),
    source_file: pick(row, ["sourceFile", "source_file"]) ?? fileName,
    source_sheet: pick(row, ["sourceSheet", "source_sheet"]),
    source_row: numberValue(pick(row, ["sourceRow", "source_row", "來源列"]), rowNumber),
    raw_data: row,
  };
  return { ...payload, search_text: searchText(payload) };
}

function ponPayload(row: CsvRow, sourceFileId: string, fileName: string, rowNumber: number) {
  const payload = {
    source_file_id: sourceFileId,
    source_id: pick(row, ["id", "source_id", "編號"]),
    headend: pick(row, ["headend", "頭端"]),
    olt_frame: pick(row, ["oltFrame", "olt_frame"]),
    olt_card: pick(row, ["oltCard", "olt_card", "OLT群組"]),
    olt_port_id: pick(row, ["oltPortId", "olt_port_id", "OLT port編號"]),
    pon_no: pick(row, ["ponNo", "pon_no", "PON序號"]),
    node: pick(row, ["node", "光點"]),
    building_id: pick(row, ["buildingId", "building_id", "大樓ID"]),
    building_name: pick(row, ["buildingName", "building_name", "大樓名稱"]),
    building_type: pick(row, ["buildingType", "building_type", "大樓型態"]),
    serviceable_units: pick(row, ["serviceableUnits", "serviceable_units", "可服務戶數"]),
    address_range: pick(row, ["addressRange", "address_range", "地址範圍"]),
    building_units: pick(row, ["buildingUnits", "building_units", "大樓戶數"]),
    fiber_core_he: pick(row, ["fiberCoreHe", "fiber_core_he", "OLT光纖芯數HE"]),
    olt_port: pick(row, ["oltPort", "olt_port", "OLT-Port"]),
    patch_panel: pick(row, ["patchPanel", "patch_panel", "HE跳接盤"]),
    edfa: pick(row, ["edfa", "HE EDFA", "EDFA"]),
    notify_date: pick(row, ["notifyDate", "notify_date", "通知頭端配線"]),
    patch_done_date: pick(row, ["patchDoneDate", "patch_done_date", "頭端配線完成"]),
    pon_done_date: pick(row, ["ponDoneDate", "pon_done_date", "全光改完成"]),
    note: pick(row, ["note", "備註"]),
    extra_note: pick(row, ["extraNote", "extra_note", "額外備註"]),
    system_id: pick(row, ["systemId", "system_id"]),
    edfa_code: pick(row, ["edfaCode", "edfa_code"]),
    only_area: pick(row, ["onlyArea", "only_area", "只可使用區域"]),
    first_splitter: pick(row, ["firstSplitter", "first_splitter", "一階分光"]),
    second_splitter: pick(row, ["secondSplitter", "second_splitter", "二階分光"]),
    pon_user_type: pick(row, ["ponUserType", "pon_user_type", "PON用戶類型"]),
    olt_name: pick(row, ["oltName", "olt_name", "OLT名稱/編號"]),
    network_code: pick(row, ["networkCode", "network_code", "網編"]),
    original_olt: pick(row, ["originalOlt", "original_olt", "原OLT編號"]),
    source_row: numberValue(pick(row, ["sourceRow", "source_row", "來源列"]), rowNumber),
    raw_data: row,
  };
  return { ...payload, search_text: searchText(payload), source_file: fileName };
}

function legacyNodePayload(row: CsvRow, sourceFileId: string, fileName: string, rowNumber: number) {
  const payload = {
    source_file_id: sourceFileId,
    source_id: pick(row, ["id", "source_id", "編號"]),
    node: pick(row, ["node", "光點"]),
    cmts: pick(row, ["cmts", "CMTS"]),
    mac_domain: pick(row, ["macDomain", "mac_domain", "Mac Domain"]),
    upstream_port: pick(row, ["upstreamPort", "upstream_port", "上行 Port"]),
    upstream_connector: pick(row, ["upstreamConnector", "upstream_connector", "上行 Connector"]),
    downstream_port: pick(row, ["downstreamPort", "downstream_port", "下行 Port"]),
    tx_channel: pick(row, ["txChannel", "tx_channel", "發射機 / CH"]),
    mux: pick(row, ["mux", "MUX"]),
    hub: pick(row, ["hub", "splitter", "分光器 / Hub"]),
    dcm: pick(row, ["dcm", "DCM(B組)", "DCM"]),
    return_receiver: pick(row, ["returnReceiver", "return_receiver", "反向接收機"]),
    demux_a: pick(row, ["demuxA", "demux_a", "DEMUX-A"]),
    demux_b: pick(row, ["demuxB", "demux_b", "DEMUX-B"]),
    index_channel: pick(row, ["indexChannel", "index_channel"]),
    source_file: fileName,
    source_sheet: pick(row, ["sourceSheet", "source_sheet"]),
    source_row: numberValue(pick(row, ["sourceRow", "source_row", "來源列"]), rowNumber),
    warning: pick(row, ["warning", "資料警告"]),
    raw_data: row,
  };
  return { ...payload, search_text: searchText(payload) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Use .env locally; never put service_role in frontend.");
  }

  const csvBuffer = readFileSync(args.file);
  const fileName = basename(args.file);
  const sha256 = createHash("sha256").update(csvBuffer).digest("hex");
  const records = parse(csvBuffer, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: fileRecord, error: fileError } = await client
    .from("noc_files")
    .insert({
      source_type: args.sourceType,
      original_filename: fileName,
      sha256,
      row_count: records.length,
      metadata: { imported_with: "scripts/import-noc-assets.ts" },
    })
    .select("id")
    .single();

  if (fileError) throw fileError;
  const sourceFileId = fileRecord.id as string;

  if (args.replaceSource) {
    const { error } = await client.from(args.table).delete().eq("source_file", fileName);
    if (error) throw error;
  }

  const payloads = records.map((row, index) => {
    if (args.table === "noc_assets") return cmtsPayload(row, sourceFileId, fileName, index + 2);
    if (args.table === "noc_pon_assets") return ponPayload(row, sourceFileId, fileName, index + 2);
    return legacyNodePayload(row, sourceFileId, fileName, index + 2);
  });

  for (let index = 0; index < payloads.length; index += 500) {
    const chunk = payloads.slice(index, index + 500);
    const { error } = await client.from(args.table).insert(chunk);
    if (error) throw error;
  }

  console.log(`Imported ${payloads.length} rows into ${args.table} from ${fileName}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
