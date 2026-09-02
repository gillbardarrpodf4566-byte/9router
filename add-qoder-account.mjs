// Direct database insert for Qoder account
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';

const accountData = {
  email: "uenxfdroboko@outlook.com",
  name: "Wulan Samosir",
  userId: "01a012af-4f57-7682-822c-75f1e81e1a3e",
  accessToken: "dt-BdcN35eMfnnrUmoU3Pv2fAs3",
  refreshToken: "drt-LZ8oYOnUozYpBi3fZqu0ua82",
  expireTime: 1790905044000,
  machineId: "b1aab6a2-b198-4115-a485-fa52f7df9ce0"
};

// Find database
const dbPath = process.env.DB_PATH || 
  (os.platform() === 'win32' 
    ? path.join(os.homedir(), 'AppData', 'Roaming', '9router', 'db', 'data.sqlite')
    : '/var/lib/9router/data.sqlite');

console.log(`📂 Database: ${dbPath}`);

const db = new Database(dbPath);

// Calculate expires_at
const expiresAt = new Date(accountData.expireTime).toISOString();
const nowIso = new Date().toISOString();

const connectionId = randomUUID();
const connectionName = accountData.name;

// Schema: id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt
// All connection data goes into the 'data' JSON field

const data = JSON.stringify({
  authType: "oauth",
  accessToken: accountData.accessToken,
  refreshToken: accountData.refreshToken,
  expiresAt: expiresAt,
  displayName: accountData.name,
  testStatus: "pending",
  lastError: null,
  providerSpecificData: {
    authMethod: "device",
    userId: accountData.userId,
    machineId: accountData.machineId,
    organizationId: ""
  }
});

const insertSql = `
  INSERT INTO providerConnections (
    id,
    provider,
    authType,
    name,
    email,
    priority,
    isActive,
    data,
    createdAt,
    updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

try {
  db.prepare(insertSql).run(
    connectionId,
    'qoder',
    'oauth',
    connectionName,
    accountData.email,
    0,
    1,
    data,
    nowIso,
    nowIso
  );

  console.log(`✅ Account added successfully!`);
  console.log(`   Connection ID: ${connectionId}`);
  console.log(`   Name: ${connectionName}`);
  console.log(`   Email: ${accountData.email}`);
  console.log(`   Expires: ${expiresAt}`);
  console.log(`\n🎉 Done! Refresh Dashboard to see the new connection.`);

} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
} finally {
  db.close();
}
