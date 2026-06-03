import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

type TargetTable = "noc_assets" | "noc_pon_assets" | "noc_legacy_nodes";
type SourceType = "cmts" | "pon" | "legacy_node";
type SpreadsheetRow = Record<string, unknown>;

type ImportRequest = {
  table?: TargetTable;
  filename?: string;
  base64?: string;
  replaceSource?: boolean;
};

const tableSourceType: Record<TargetTable, SourceType> = {
  noc_assets: "cmts",
  noc_pon_assets: "pon",
  noc_legacy_nodes: "legacy_node",
};

const validTables = Object.keys(tableSourceType) as TargetTable[];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeRow(row: SpreadsheetRow) {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [clean(key), clean(value)])
      .filter(([key]) => key),
  ) as Record<string, string>;
}

function pick(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value) return value;
  }

  const lowerEntries = Object.entries(row).map(([key, value]) => [key.toLowerCase(), value] as const);
  for (const name of names) {
    const found = lowerEntries.find(([key]) => key === name.toLowerCase());
    if (found?.[1]) return found[1];
  }

  return null;
}

function numberValue(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeBase64File(base64: string) {
  const rawBase64 = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = atob(rawBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readFirstSheet(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, {
    type: "array",
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Spreadsheet has no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils
    .sheet_to_json<SpreadsheetRow>(sheet, { defval: "", raw: false })
    .map(normalizeRow)
    .filter((row) => Object.values(row).some(Boolean));

  return { rows, sheetName };
}

function cmtsPayload(row: Record<string, string>, sourceFileId: string, fileName: string, sheetName: string, rowNumber: number) {
  return {
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
    source_sheet: pick(row, ["sourceSheet", "source_sheet"]) ?? sheetName,
    source_row: numberValue(pick(row, ["sourceRow", "source_row", "來源列"]), rowNumber),
    raw_data: row,
  };
}

function ponPayload(row: Record<string, string>, sourceFileId: string, fileName: string, sheetName: string, rowNumber: number) {
  return {
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
    source_file: fileName,
    source_sheet: pick(row, ["sourceSheet", "source_sheet"]) ?? sheetName,
    source_row: numberValue(pick(row, ["sourceRow", "source_row", "來源列"]), rowNumber),
    raw_data: row,
  };
}

function legacyNodePayload(row: Record<string, string>, sourceFileId: string, fileName: string, sheetName: string, rowNumber: number) {
  return {
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
    source_sheet: pick(row, ["sourceSheet", "source_sheet"]) ?? sheetName,
    source_row: numberValue(pick(row, ["sourceRow", "source_row", "來源列"]), rowNumber),
    warning: pick(row, ["warning", "資料警告"]),
    raw_data: row,
  };
}

function payloadFor(table: TargetTable, row: Record<string, string>, sourceFileId: string, fileName: string, sheetName: string, rowNumber: number) {
  if (table === "noc_assets") {
    return cmtsPayload(row, sourceFileId, fileName, sheetName, rowNumber);
  }

  if (table === "noc_pon_assets") {
    return ponPayload(row, sourceFileId, fileName, sheetName, rowNumber);
  }

  return legacyNodePayload(row, sourceFileId, fileName, sheetName, rowNumber);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let adminClient: ReturnType<typeof createClient> | null = null;
  let jobId: string | null = null;

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roles, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "editor"]);

    if (rolesError) {
      return jsonResponse({ error: "Could not verify import permissions" }, 500);
    }

    if (!roles?.length) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = (await req.json()) as ImportRequest;
    const table = body.table;
    const fileName = clean(body.filename || "noc-import.xlsx");

    if (!table || !validTables.includes(table)) {
      return jsonResponse({ error: "Invalid target table" }, 400);
    }

    if (!body.base64) {
      return jsonResponse({ error: "Missing base64 file content" }, 400);
    }

    const bytes = decodeBase64File(body.base64);
    const sha256 = await sha256Hex(bytes);
    const { rows, sheetName } = readFirstSheet(bytes);

    if (!rows.length) {
      return jsonResponse({ error: "Spreadsheet has no data rows" }, 400);
    }

    const { data: job, error: jobError } = await adminClient
      .from("noc_import_jobs")
      .insert({
        table_name: table,
        original_filename: fileName,
        status: "processing",
        created_by: user.id,
        metadata: {
          sheet_name: sheetName,
          replace_source: body.replaceSource === true,
        },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return jsonResponse({ error: "Could not create import job" }, 500);
    }

    jobId = job.id as string;

    const { data: fileRecord, error: fileError } = await adminClient
      .from("noc_files")
      .insert({
        source_type: tableSourceType[table],
        original_filename: fileName,
        sha256,
        row_count: rows.length,
        imported_by: user.id,
        metadata: {
          imported_with: "edge-function:noc-import-excel",
          sheet_name: sheetName,
        },
      })
      .select("id")
      .single();

    if (fileError || !fileRecord) {
      throw new Error(fileError?.message ?? "Could not create file record");
    }

    const sourceFileId = fileRecord.id as string;

    await adminClient
      .from("noc_import_jobs")
      .update({ source_file_id: sourceFileId })
      .eq("id", jobId);

    if (body.replaceSource === true) {
      const { error: deleteError } = await adminClient.from(table).delete().eq("source_file", fileName);
      if (deleteError) {
        throw deleteError;
      }
    }

    const payloads = rows.map((row, index) => payloadFor(table, row, sourceFileId, fileName, sheetName, index + 2));

    for (let index = 0; index < payloads.length; index += 500) {
      const chunk = payloads.slice(index, index + 500);
      const { error: insertError } = await adminClient.from(table).insert(chunk);
      if (insertError) {
        throw insertError;
      }
    }

    await adminClient
      .from("noc_import_jobs")
      .update({
        status: "succeeded",
        row_count: payloads.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return jsonResponse({
      ok: true,
      job_id: jobId,
      source_file_id: sourceFileId,
      table,
      rows: payloads.length,
      sheet_name: sheetName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (adminClient && jobId) {
      await adminClient
        .from("noc_import_jobs")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    return jsonResponse({ error: message }, 500);
  }
});
