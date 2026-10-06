const fs = require('node:fs');
const [app, stage] = process.argv.slice(2);
require(app + '/node_modules/dotenv').config({ path: app + '/.env' });
const { pool } = require(app + '/src/db');
(async () => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const file of ['006_dong_tien_learning.sql', '007_dong_tien_stages.sql']) {
      await client.query(fs.readFileSync(stage + '/db/migrations/' + file, 'utf8'));
    }
    const existing = (await client.query('select count(*)::int n from dong_tien_lessons')).rows[0].n;
    if (!existing) {
      for (const table of ['dong_tien_stages', 'dong_tien_lessons']) {
        const rows = JSON.parse(fs.readFileSync(stage + '/deployment-data/' + table + '.json', 'utf8'));
        for (const row of rows) {
          if (!Number.isSafeInteger(Number(row.id))) throw Error('Invalid course ID');
          await client.query(`insert into ${table}(key,data) values($1,$2) on conflict(key) do nothing`, [String(row.id), row]);
        }
        console.log('Initialized', table, rows.length, 'configuration rows');
      }
    } else console.log('Preserved existing production learning configuration:', existing, 'lessons');
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
