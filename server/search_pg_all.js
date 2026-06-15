import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const pool = new pg.Pool({ connectionString });

async function main() {
  const tablesRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  
  console.log('Tables in database:', tablesRes.rows.map(r => r.table_name));

  for (const tableRow of tablesRes.rows) {
    const tableName = tableRow.table_name;
    const columnsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [tableName]);
    
    for (const colRow of columnsRes.rows) {
      const colName = colRow.column_name;
      const dataType = colRow.data_type;
      
      if (dataType === 'text' || dataType === 'character varying') {
        try {
          const searchRes = await pool.query(`
            SELECT * FROM ${tableName} WHERE "${colName}" LIKE '%d_{H%'
          `);
          if (searchRes.rows.length > 0) {
            console.log(`\nFound match in Table: ${tableName}, Column: ${colName}`);
            console.log(`Row count: ${searchRes.rows.length}`);
            searchRes.rows.slice(0, 3).forEach((row, i) => {
              console.log(`[Row ${i}]`, JSON.stringify(row).substring(0, 1000));
            });
          }
        } catch (e) {
          // ignore columns that fail to query
        }
      }
    }
  }
  
  await pool.end();
}

main().catch(console.error);
