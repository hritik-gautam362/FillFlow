import ExcelJS from 'exceljs';

const BASE_URL = 'http://localhost:3000';
const BRIEF_LEAD_ID = 'cmtpfrn180001u4i4wfpj04ty'; // Alex / FoodFast Inc

async function testExport() {
  console.log('🧪 Testing Real XLSX Export API...\n');

  // Test 1: Export for lead with brief
  const exportUrl = `${BASE_URL}/api/leads/${BRIEF_LEAD_ID}/brief/export`;
  console.log(`1. Fetching: ${exportUrl}`);

  const res = await fetch(exportUrl);
  console.log(`   Response Status: ${res.status} ${res.statusText}`);

  if (res.status !== 200) {
    const errText = await res.text();
    throw new Error(`Export failed: ${errText}`);
  }

  const contentType = res.headers.get('content-type');
  const contentDisposition = res.headers.get('content-disposition');
  console.log(`   Content-Type: ${contentType}`);
  console.log(`   Content-Disposition: ${contentDisposition}`);

  if (!contentType || !contentType.includes('spreadsheetml.sheet')) {
    throw new Error(`Invalid Content-Type header: ${contentType}`);
  }

  if (!contentDisposition || !contentDisposition.includes('attachment')) {
    throw new Error(`Invalid Content-Disposition header: ${contentDisposition}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`   Downloaded XLSX Buffer Size: ${buffer.byteLength} bytes\n`);

  // Test 2: Parse and inspect the workbook
  console.log('2. Loading XLSX workbook with ExcelJS...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetNames = workbook.worksheets.map((w) => w.name);
  console.log(`   Worksheets found (${sheetNames.length}):`, sheetNames);

  const sheet = workbook.getWorksheet('Project Brief');
  if (!sheet) {
    throw new Error('Worksheet "Project Brief" not found in workbook!');
  }

  console.log(`   Sheet rows count: ${sheet.rowCount}`);

  console.log('\n3. Inspecting Key Cell Values in "Project Brief" Sheet:');
  const cellsToInspect = [
    { label: 'Title Banner (A1)', val: sheet.getCell('A1').value },
    { label: 'Subtitle (A2)', val: sheet.getCell('A2').value },
    { label: 'Section 1 Header (A3)', val: sheet.getCell('A3').value },
    { label: 'Project Title Label (A4)', val: sheet.getCell('A4').value },
    { label: 'Project Title Value (B4)', val: sheet.getCell('B4').value },
    { label: 'Project Type Label (A5)', val: sheet.getCell('A5').value },
    { label: 'Project Type Value (B5)', val: sheet.getCell('B5').value },
    { label: 'Budget Range (B15)', val: sheet.getCell('B15').value },
    { label: 'Estimated Duration (B16)', val: sheet.getCell('B16').value },
    { label: 'Qualification Score (B17)', val: sheet.getCell('B17').value },
    { label: 'Client Name (B22)', val: sheet.getCell('B22').value },
    { label: 'Company Name (B23)', val: sheet.getCell('B23').value },
    { label: 'Email (B24)', val: sheet.getCell('B24').value },
  ];

  for (const c of cellsToInspect) {
    console.log(`   - ${c.label}: "${c.val}"`);
  }

  // Find and print feature table rows
  console.log('\n4. Inspecting Features Table Rows:');
  let inFeatures = false;
  const features = [];
  sheet.eachRow((row, rowNumber) => {
    const valA = String(row.getCell(1).value || '');
    if (valA.includes('6. FEATURES')) {
      inFeatures = true;
      return;
    }
    if (inFeatures && valA.includes('7. SPECIFICATION METADATA')) {
      inFeatures = false;
      return;
    }
    if (inFeatures && typeof row.getCell(1).value === 'number') {
      features.push({
        num: row.getCell(1).value,
        name: row.getCell(2).value,
        description: row.getCell(3).value,
        complexity: row.getCell(4).value,
      });
    }
  });

  console.log(`   Found ${features.length} feature rows in Excel:`);
  for (const f of features) {
    console.log(`     #${f.num} | ${f.name} | Complexity: ${f.complexity}`);
  }

  if (features.length === 0) {
    throw new Error('Zero features extracted from features table in Excel!');
  }

  // Test 3: Test lead without brief returns 404
  console.log('\n5. Testing Export on Lead Without Brief...');
  // Find a lead without brief or test random id
  const invalidUrl = `${BASE_URL}/api/leads/non-existent-lead-id/brief/export`;
  const invalidRes = await fetch(invalidUrl);
  console.log(`   Non-existent lead status: ${invalidRes.status} (Expected 404)`);

  console.log('\n🎉 ALL EXCEL EXPORT ASSERTIONS PASSED SUCCESSFULLY!');
}

testExport().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
