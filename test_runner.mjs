import https from 'https';
import http from 'http';
import { convertMarkdownToHtml } from './client/src/utils/renderingHelpers.js';

console.log('=====================================================================');
console.log(' 🤖 ANTIGRAVITY AUTOMATED MASTER REGRESSION TEST SUITE ');
console.log('=====================================================================');

const prodUrl = 'https://anti-ashy.vercel.app';
let passed = 0;
let failed = 0;

function fetchJson(path, options = {}) {
  return new Promise((resolve) => {
    const url = `${prodUrl}${path}`;
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({ status: 200, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: 200, data });
          }
        } else {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });

    req.on('error', (err) => resolve({ status: 500, error: err.message }));

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n[1/4] Testing Production API Endpoints...');
  
  const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
  const endpoints = [
    { name: 'Topics List', path: '/api/topics', check: d => Array.isArray(d) && d.length > 0 },
    { name: 'Dashboard Reviews', path: `/api/dashboard?date=${kstDate}`, check: d => d && Array.isArray(d.reviews) },
    { name: 'Lockscreen Setting', path: '/api/options/lockscreen_quiz_enabled', check: d => d && d.value !== undefined },
    { name: 'Preferred Model Setting', path: '/api/preferred-model', check: d => d && d.model !== undefined },
    { name: 'Question Feedback', path: '/api/question-feedback/all', check: d => d && d.success === true },
    { name: 'GET Other Standards', path: '/api/other-standards', check: d => d && Array.isArray(d.standards) }
  ];

  for (const ep of endpoints) {
    const res = await fetchJson(ep.path);
    if (res.status === 200 && ep.check(res.data)) {
      console.log(`  ✅ [PASS] ${ep.name} (${ep.path})`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] ${ep.name} (${ep.path}) - Status: ${res.status}`);
      failed++;
    }
  }

  console.log('\n[2/4] Testing POST /api/other-standards (Save & Sync)...');
  const getRes = await fetchJson('/api/other-standards');
  if (getRes.status === 200 && getRes.data && Array.isArray(getRes.data.standards)) {
    const currentStandards = getRes.data.standards;
    const postRes = await fetchJson('/api/other-standards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standards: currentStandards })
    });

    if (postRes.status === 200 && postRes.data && postRes.data.ok) {
      console.log('  ✅ [PASS] POST /api/other-standards (Save & Sync Successful)');
      passed++;
    } else {
      console.log(`  ❌ [FAIL] POST /api/other-standards - Status: ${postRes.status}`);
      failed++;
    }
  } else {
    console.log('  ❌ [FAIL] Skip POST /api/other-standards test due to GET failure');
    failed++;
  }

  console.log('\n[3/4] Testing SVG Graphic Rendering Engine...');
  const testSvgInput = '```xml\n$xml <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100"><defs></defs><rect width="100" height="100"/></svg>\n```';
  const renderedHtml = convertMarkdownToHtml(testSvgInput, false, false, true);

  if (renderedHtml.includes('<svg') && renderedHtml.includes('rect') && !renderedHtml.includes('ParseError')) {
    console.log('  ✅ [PASS] SVG Graphic Renderer (Clean Vector SVG output without KaTeX error)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] SVG Graphic Renderer failed to produce inline SVG container');
    failed++;
  }

  console.log('\n=====================================================================');
  console.log(` 📊 REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
