import { NextResponse } from "next/server";
import fs from "fs/promises";
import os from "os";
import path from "path";

// GET /api/cursor/import - Detect Cursor tokens in local storage (frontend only, not available remotely)
export async function GET() {
  const homeDir = os.homedir();

  // Windows/Mac/Linux paths
  const possiblePaths = [
    `${process.env.APPDATA || "%APPDATA%"}\\Cursor\\User\\globalStorage\\state.vscstate`,
    macPath(homeDir),
    linuxPath(homeDir),
    "./cursor-tokens.json", // Fallback manual file
  ].filter(Boolean);

  let tokens = [];

  for (const filePath of possiblePaths) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(content);

      const accessToken = state["cursorAuth/accessToken"];
      if (!accessToken) continue;

      const machineId = state["storage.serviceMachineId"];
      const email = state["githubName"] || state["email"] || "unknown";

      tokens.push({
        accessToken: truncate(accessToken),
        machineId: machineId || "未知",
        email: email,
      });

      if (tokens.length > 0) break;
    } catch (e) {
      // File doesn't exist or invalid JSON, continue
    }
  }

  if (tokens.length === 0) {
    return NextResponse.json({ error: "未找到有效的 Cursor Token" }, { status: 404 });
  }

  return NextResponse.json({ tokens });
}

function macPath(homeDir) {
  return `${homeDir}/Library/Application Support/Cursor/User/globalStorage/state.vscstate`;
}

function linuxPath(homeDir) {
  return `${homeDir}/.config/Cursor/User/globalStorage/state.vscstate`;
}

function truncate(str, length = 16) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

// POST /api/providers/cursor/import - Import detected tokens to 9Router database
export async function POST(request) {
  try {
    const { tokens } = await request.json();

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: "无效的 tokens 数据" }, { status: 400 });
    }

    // Import each token
    const results = [];
    for (const token of tokens) {
      if (!token.machineId && !token.accessToken) {
        continue;
      }

      const connectionData = {
        name: "Cursor IDE",
        email: token.email || "unknown",
        authType: "api_key",
        isActive: true,
        priority: 50,
        data: JSON.stringify({
          authType: "api_key",
          displayName: "Cursor IDE",
          providerSpecificData: {
            authMethod: "cursor_ide",
            machineId: token.machineId,
            clientVersion: "3.12.17",
            source: "auto_import",
          },
        }),
      };

      // Call the providers API to create the connection
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectionData),
      });

      if (res.ok) {
        results.push({ success: true, email: connectionData.email });
      } else {
        const error = await res.text();
        results.push({ success: false, email: connectionData.email, error });
      }
    }

    return NextResponse.json({
      message: "导入完成",
      results,
    });
  } catch (error) {
    console.error("Cursor import error:", error);
    return NextResponse.json({ error: "导入失败：" + error.message }, { status: 500 });
  }
}
