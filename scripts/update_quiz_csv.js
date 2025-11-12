const fs = require('fs');
const path = require('path');

// Read the current quiz CSV
const csvPath = path.join(__dirname, '../public/data/edlight_quizzes.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

// Parse CSV (simple parser for this specific format)
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Parse header
const headers = parseCSVLine(lines[0]);
console.log('Current headers:', headers);

// New headers with required columns
const newHeaders = [
  'id',
  'subject_code',
  'Chapter_Number',
  'Subchapter_Number',
  'video_id',
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_option',
  'explanation'
];

// Transform each row
const newLines = [newHeaders.join(',')];

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  
  const fields = parseCSVLine(lines[i]);
  const quiz_id = fields[0] || '';
  const video_id = fields[1] || '';
  
  // Extract subject_code, chapter, and subchapter from video_id
  // Example: CHEM-NSI-U1-L1 -> subject_code: CHEM-NSI, Chapter_Number: 1, Subchapter_Number: 1
  let subject_code = '';
  let chapter_number = '';
  let subchapter_number = '';
  
  const match = video_id.match(/^([A-Z]+-[A-Z]+)-U(\d+)-L(\d+)$/i);
  if (match) {
    subject_code = match[1];
    chapter_number = match[2];
    subchapter_number = match[3];
  }
  
  // Build new row
  const newRow = [
    quiz_id,                    // id
    subject_code,               // subject_code
    chapter_number,             // Chapter_Number
    subchapter_number,          // Subchapter_Number
    video_id,                   // video_id
    fields[2] || '',           // question
    fields[3] || '',           // option_a
    fields[4] || '',           // option_b
    fields[5] || '',           // option_c
    fields[6] || '',           // option_d
    fields[7] || '',           // correct_option
    fields[8] || ''            // explanation
  ];
  
  // Escape fields that contain commas or quotes
  const escapedRow = newRow.map(field => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  });
  
  newLines.push(escapedRow.join(','));
}

// Write new CSV
const newCSVContent = newLines.join('\n');
fs.writeFileSync(csvPath, newCSVContent, 'utf-8');

console.log(`✅ Updated quiz CSV with ${newLines.length - 1} rows`);
console.log('New headers:', newHeaders.join(', '));
