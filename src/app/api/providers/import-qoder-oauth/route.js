import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { DATA_DIR } from "@/lib/dataDir";

/**
 * POST /api/providers/import-qoder-oauth - Import Qoder OAuth accounts directly to database
 * This bypasses the standard /api/providers POST which requires apiKey for all providers
 */
export async function POST(request) {
  try {
    const body = await request.json();

    // Validate input
    if (!Array.isArray(body.accounts) || body.accounts.length === 0) {
      return NextResponse.json({ error: "Invalid input: expected array of accounts" }, { status: 400 });
    }

    // Open database (write mode for insert)
    const dbPath = process.env.DB_PATH || path.join(DATA_DIR, "db", "data.sqlite");
    const db = new Database(dbPath);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const account of body.accounts) {
      try {
        const connectionId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const expiresAt = account.expireTime ? new Date(Number(account.expireTime)).toISOString() : null;

        const data = JSON.stringify({
          provider: "qoder",
          authType: "oauth",
          accessToken: account.accessToken,
          refreshToken: account.refreshToken || "",
          expiresAt: expiresAt,
          displayName: account.name,
          providerSpecificData: {
            userId: account.userId,
            machineId: account.machineId,
            authMethod: "device",
          },
          testStatus: "pending",
          lastError: null,
        });

        const insertSql = `
          INSERT INTO providerConnections (
            id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.prepare(insertSql).run(
          connectionId,
          "qoder",
          "oauth",
          account.name || "Qoder User",
          account.email || "",
          account.priority || 50,
          true,
          data,
          nowIso,
          nowIso
        );

        results.push({
          success: true,
          email: account.email,
          name: account.name,
          id: connectionId,
        });
        successCount++;
        console.log(`✅ Imported ${account.email}`);
      } catch (err) {
        console.error(`❌ Failed ${account.email}:`, err.message);
        results.push({
          success: false,
          email: account.email,
          error: err.message,
        });
        failCount++;
      }
    }

    db.close();

    return NextResponse.json({
      message: "Import completed",
      summary: {
        total: successCount + failCount,
        success: successCount,
        failed: failCount,
      },
      results,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Failed to import: " + error.message }, { status: 500 });
  }
}
