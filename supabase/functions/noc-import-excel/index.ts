import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

type TargetTable = "noc_assets" | "noc_pon_assets" | "noc_legacy_nodes";
type ImportTarget = TargetTable | "noc_sop_assets";
type SourceType = "cmts" | "pon" | "legacy_node";
type SopCategory = "static_ip" | "cm_upgrade" | "optical";
type SpreadsheetRow = Record<string, unknown>;

type ImportRequest = {
  table?: ImportTarget;
  sopCategory?: SopCategory;
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
const validTargets = [...validTables, "noc_sop_assets"] as ImportTarget[];
const validSopCategories: SopCategory[] = ["static_ip", "cm_upgrade", "optical"];

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

function isTargetTable(table: ImportTarget): table is TargetTable {
  return table !== "noc_sop_assets";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function wrapLine(line: string, maxLength = 72) {
  if (line.length <= maxLength) return [line];

  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > maxLength) {
    let breakAt = remaining.lastIndexOf(" ", maxLength);
    if (breakAt < Math.floor(maxLength * 0.55)) breakAt = maxLength;
    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function base64EncodeUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function svgFromLines(title: string, lines: string[]) {
  const width = 1200;
  const padding = 38;
  const lineHeight = 28;
  const bodyLines = lines.flatMap((line) => wrapLine(line));
  const renderedLines = [title, ...bodyLines];
  const height = Math.max(220, padding * 2 + renderedLines.length * lineHeight + 18);
  const tspans = renderedLines
    .map((line, index) => {
      const weight = index === 0 ? "700" : "400";
      const size = index === 0 ? 25 : 19;
      return `<tspan x="${padding}" y="${padding + index * lineHeight}" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return {
    width,
    height,
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '<rect width="100%" height="100%" fill="#f8fbfb"/>',
      '<rect x="18" y="18" width="1164" height="' + (height - 36) + '" rx="10" fill="#ffffff" stroke="#b9dcd7"/>',
      `<text font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif" fill="#193d3a">${tspans}</text>`,
      "</svg>",
    ].join(""),
  };
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

function readSopSheets(bytes: Uint8Array, fileName: string, category: SopCategory) {
  const workbook = XLSX.read(bytes, {
    type: "array",
    raw: false,
  });

  const assets = workbook.SheetNames.map((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet?.["!ref"];
    if (!sheet || !ref) return null;

    const range = XLSX.utils.decode_range(ref);
    const lines: string[] = [];
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const values: string[] = [];
      for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = sheet[address];
        const value = clean(cell?.w ?? cell?.v ?? "");
        if (value) values.push(value);
      }
      if (values.length) lines.push(values.join("    "));
    }

    if (!lines.length) return null;

    const slugSuffix = slugPart(sheetName) || String(index + 1).padStart(2, "0");
    const title = sheetName;
    const { svg, width, height } = svgFromLines(title, lines);

    return {
      category,
      slug: `${category}-${slugSuffix}`,
      title,
      caption: `來源：${fileName} / 工作表：${sheetName}`,
      sort_order: index + 1,
      content_type: "image/svg+xml",
      width,
      height,
      image_base64: base64EncodeUtf8(svg),
      raw_data: {
        imported_with: "edge-function:noc-import-excel",
        original_filename: fileName,
        sheet_name: sheetName,
        lines,
      },
      updated_at: new Date().toISOString(),
    };
  }).filter((asset): asset is NonNullable<typeof asset> => asset !== null);

  if (!assets.length) {
    throw new Error("Spreadsheet has no SOP text");
  }

  return {
    assets,
    sheetName: workbook.SheetNames.join(", "),
  };
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

    if (!table || !validTargets.includes(table)) {
      return jsonResponse({ error: "Invalid target table" }, 400);
    }

    const isSopImport = table === "noc_sop_assets";
    const sopCategory = body.sopCategory ?? "cm_upgrade";
    if (isSopImport && !validSopCategories.includes(sopCategory)) {
      return jsonResponse({ error: "Invalid SOP category" }, 400);
    }

    if (!body.base64) {
      return jsonResponse({ error: "Missing base64 file content" }, 400);
    }

    const bytes = decodeBase64File(body.base64);
    const sha256 = await sha256Hex(bytes);
    const spreadsheet = isSopImport
      ? { kind: "sop" as const, ...readSopSheets(bytes, fileName, sopCategory) }
      : { kind: "noc" as const, ...readFirstSheet(bytes) };

    if (spreadsheet.kind === "noc" && !spreadsheet.rows.length) {
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
          sheet_name: spreadsheet.sheetName,
          replace_source: body.replaceSource === true,
          sop_category: isSopImport ? sopCategory : undefined,
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
        source_type: isTargetTable(table) ? tableSourceType[table] : "other",
        original_filename: fileName,
        sha256,
        row_count: spreadsheet.kind === "sop" ? spreadsheet.assets.length : spreadsheet.rows.length,
        imported_by: user.id,
        metadata: {
          imported_with: "edge-function:noc-import-excel",
          sheet_name: spreadsheet.sheetName,
          sop_category: isSopImport ? sopCategory : undefined,
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

    let importedRows = 0;

    if (spreadsheet.kind === "sop") {
      const payloads = spreadsheet.assets.map((asset) => ({
        ...asset,
        raw_data: {
          ...asset.raw_data,
          source_file_id: sourceFileId,
        },
      }));

      if (body.replaceSource === true) {
        const { error: deleteError } = await adminClient.from("noc_sop_assets").delete().eq("category", sopCategory);
        if (deleteError) {
          throw deleteError;
        }
      }

      for (let index = 0; index < payloads.length; index += 100) {
        const chunk = payloads.slice(index, index + 100);
        const { error: upsertError } = await adminClient
          .from("noc_sop_assets")
          .upsert(chunk, { onConflict: "slug" });
        if (upsertError) {
          throw upsertError;
        }
      }

      importedRows = payloads.length;
    } else if (body.replaceSource === true) {
      const targetTable = table as TargetTable;
      const { error: deleteError } = await adminClient.from(targetTable).delete().eq("source_file", fileName);
      if (deleteError) {
        throw deleteError;
      }

      const payloads = spreadsheet.rows.map((row, index) =>
        payloadFor(targetTable, row, sourceFileId, fileName, spreadsheet.sheetName, index + 2)
      );

      for (let index = 0; index < payloads.length; index += 500) {
        const chunk = payloads.slice(index, index + 500);
        const { error: insertError } = await adminClient.from(targetTable).insert(chunk);
        if (insertError) {
          throw insertError;
        }
      }

      importedRows = payloads.length;
    } else {
      const targetTable = table as TargetTable;
      const payloads = spreadsheet.rows.map((row, index) =>
        payloadFor(targetTable, row, sourceFileId, fileName, spreadsheet.sheetName, index + 2)
      );

      for (let index = 0; index < payloads.length; index += 500) {
        const chunk = payloads.slice(index, index + 500);
        const { error: insertError } = await adminClient.from(targetTable).insert(chunk);
        if (insertError) {
          throw insertError;
        }
      }

      importedRows = payloads.length;
    }

    await adminClient
      .from("noc_import_jobs")
      .update({
        status: "succeeded",
        row_count: importedRows,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return jsonResponse({
      ok: true,
      job_id: jobId,
      source_file_id: sourceFileId,
      table,
      rows: importedRows,
      sheet_name: spreadsheet.sheetName,
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
