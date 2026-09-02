import Database from 'better-sqlite3';

const db = new Database('C:/Users/LT/AppData/Roaming/9router/db/data.sqlite');

console.log('📊 All Qoder connections:\n');

const connections = db.prepare(`
  SELECT id, name, email, authType, isActive, createdAt
  FROM providerConnections
  WHERE provider = 'qoder'
  ORDER BY createdAt DESC
`).all();

connections.forEach((conn, idx) => {
  console.log(`${idx + 1}. ${conn.name}`);
  console.log(`   Email: ${conn.email}`);
  console.log(`   Auth Type: ${conn.authType}`);
  console.log(`   Active: ${conn.isActive ? '✅' : '❌'}`);
  console.log(`   Added: ${conn.createdAt}`);
  console.log(`   ID: ${conn.id}`);
  console.log('');
});

console.log(`Total: ${connections.length} Qoder connection(s)`);

db.close();
