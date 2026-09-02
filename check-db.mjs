import Database from 'better-sqlite3';

const db = new Database('C:/Users/LT/AppData/Roaming/9router/db/data.sqlite');

console.log('📊 Database tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(`  - ${t.name}`));

if (tables.length > 0) {
  const tableName = tables[0].name;
  console.log(`\n🔍 Schema of ${tableName}:`);
  const schema = db.prepare(`PRAGMA table_info(${tableName})`).all();
  schema.forEach(col => console.log(`  ${col.name} (${col.type})`));
}

db.close();
