async function run() {
  try {
    const db = await import('./database.js');
    
    // Check acronyms
    const aRows = await db.dbQuery.all("SELECT value FROM app_session WHERE key = 'formula_acronyms'");
    if (aRows.length > 0) {
      const parsed = JSON.parse(aRows[0].value);
      const items = parsed.formulaAcronyms || [];
      console.log('Formula Acronyms in DB:');
      items.forEach(a => {
        if (a.title.includes('영향권')) {
          console.log(` - Acronym Card: Title="${a.title}", Content="${a.content}"`);
        }
      });
    } else {
      console.log('No formula_acronyms in DB.');
    }
    
    // Check images
    const iRows = await db.dbQuery.all("SELECT value FROM app_session WHERE key = 'formula_images'");
    if (iRows.length > 0) {
      const parsed = JSON.parse(iRows[0].value);
      const items = parsed.formulaImages || [];
      console.log('Formula Images in DB:');
      items.forEach(img => {
        if (img.title.includes('영향권')) {
          console.log(` - Image Card: Title="${img.title}"`);
        }
      });
    } else {
      console.log('No formula_images in DB.');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
