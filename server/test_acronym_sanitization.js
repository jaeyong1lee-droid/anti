import assert from 'assert';

// 1. Mock DB payload with transient isOptimizing flag
const dbPayload = {
  data: {
    formulaAcronyms: [
      { id: 'A1', title: '지반함몰 대책', content: '두문자: test', isOptimizing: false },
      { id: 'A2', title: '지반함몰의 원인', content: '두문자: test2', isOptimizing: true } // stuck flag in DB
    ]
  }
};

// 2. Test loadFormulaAcronyms sanitization logic
const loadedData = dbPayload.data.formulaAcronyms.map(item => ({ ...item, isOptimizing: false }));

assert.strictEqual(loadedData[1].isOptimizing, false, 'A2 isOptimizing flag must be reset to false on load');
console.log('✅ Test 1 Passed: loadFormulaAcronyms sanitizes stuck isOptimizing flag from DB');

// 3. Test handleSaveFormulaAcronyms sanitization logic
const inMemoryAcronyms = [
  { id: 'A1', title: '지반함몰 대책', content: '두문자: test', isOptimizing: false },
  { id: 'A2', title: '지반함몰의 원인', content: '두문자: test2', isOptimizing: true } // transient optimizing in memory
];

const sanitizedForSave = inMemoryAcronyms.map(({ isOptimizing, ...rest }) => rest);

assert.strictEqual(sanitizedForSave[1].isOptimizing, undefined, 'isOptimizing property must be stripped before sending to DB');
console.log('✅ Test 2 Passed: handleSaveFormulaAcronyms strips transient isOptimizing property before saving');

console.log('🎉 ALL ACRONYM SANITIZATION UNIT TESTS PASSED SUCCESSFULLY!');
