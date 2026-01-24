const db = require('../db');

async function removeDuplicates() {
  console.log('🧹 Removing duplicate cities...\n');
  
  // Find duplicates before deletion
  const duplicates = await db.query(`
    SELECT name_ar, country_id, COUNT(*) as count 
    FROM cities 
    GROUP BY name_ar, country_id 
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `);
  
  if (duplicates.rows.length > 0) {
    console.log('Found duplicates:');
    duplicates.rows.forEach(r => console.log(`  ${r.name_ar}: ${r.count} copies`));
  }
  
  // Delete duplicates keeping the first one (lowest ID)
  const result = await db.query(`
    DELETE FROM cities 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM cities 
      GROUP BY name_ar, country_id
    );
  `);
  
  console.log(`\n✅ Deleted ${result.rowCount} duplicate cities`);
  
  // Show final counts
  const counts = await db.query(`
    SELECT co.code, co.name_ar, COUNT(c.id) as count 
    FROM countries co 
    LEFT JOIN cities c ON c.country_id = co.id 
    GROUP BY co.id, co.code, co.name_ar 
    ORDER BY co.display_order
  `);
  
  console.log('\n📊 Final city counts:');
  counts.rows.forEach(r => console.log(`  ${r.name_ar} (${r.code}): ${r.count}`));
}

removeDuplicates()
  .catch(console.error)
  .finally(() => process.exit());
