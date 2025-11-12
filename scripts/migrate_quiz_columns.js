const fs = require('fs');
const path = require('path');

// Read the current quiz CSV
const currentCsvPath = path.join(__dirname, '../private_data/edlight_quizzes.csv');
const csvContent = fs.readFileSync(currentCsvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

// Parse CSV
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

// Current headers
const oldHeaders = parseCSVLine(lines[0]);
console.log('Old headers:', oldHeaders);

// New desired headers
const newHeaders = [
  'id',
  'subject_code',
  'subject',
  'level',
  'unit',
  'Chapter_Number',
  'video_title',
  'Subchapter_Number',
  'question_type',
  'question',
  'options',
  'correct_answer',
  'hint',
  'good_response',
  'wrong_response',
  'language',
  'difficulty',
  'tags',
  'source_doc',
  'created_at'
];

// Parse existing rows
const newLines = [newHeaders.join(',')];

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  
  const fields = parseCSVLine(lines[i]);
  const oldRow = {};
  oldHeaders.forEach((header, index) => {
    oldRow[header] = fields[index] || '';
  });
  
  // Map to new structure
  const newRow = [];
  newHeaders.forEach(header => {
    let value = '';
    
    switch(header) {
      case 'id':
        value = oldRow.id || oldRow.quiz_id || '';
        break;
      case 'subject_code':
        value = oldRow.subject_code || '';
        break;
      case 'subject':
        // Extract subject name from subject_code (e.g., "CHEM-NSI" -> "Chemistry")
        const subjectMap = {
          'CHEM': 'Chemistry',
          'PHYS': 'Physics',
          'MATH': 'Mathematics',
          'BIO': 'Biology'
        };
        const subjPart = (oldRow.subject_code || '').split('-')[0];
        value = subjectMap[subjPart] || subjPart || '';
        break;
      case 'level':
        // Extract level from subject_code (e.g., "CHEM-NSI" -> "NSI")
        value = (oldRow.subject_code || '').split('-')[1] || '';
        break;
      case 'unit':
        value = oldRow.Chapter_Number || '';
        break;
      case 'Chapter_Number':
        value = oldRow.Chapter_Number || '';
        break;
      case 'video_title':
        // Could extract from video_id or leave empty
        value = '';
        break;
      case 'Subchapter_Number':
        value = oldRow.Subchapter_Number || '';
        break;
      case 'question_type':
        value = 'multiple_choice'; // Default type
        break;
      case 'question':
        value = oldRow.question || '';
        break;
      case 'options':
        // Combine option_a, option_b, option_c, option_d into JSON array
        const opts = [
          oldRow.option_a || '',
          oldRow.option_b || '',
          oldRow.option_c || '',
          oldRow.option_d || ''
        ];
        value = JSON.stringify(opts);
        break;
      case 'correct_answer':
        value = oldRow.correct_option || '';
        break;
      case 'hint':
        value = oldRow.hint || '';
        break;
      case 'good_response':
        value = oldRow.explanation || '';
        break;
      case 'wrong_response':
        value = '';
        break;
      case 'language':
        value = 'Haitian Creole';
        break;
      case 'difficulty':
        value = 'medium';
        break;
      case 'tags':
        value = '';
        break;
      case 'source_doc':
        value = '';
        break;
      case 'created_at':
        value = new Date().toISOString();
        break;
      default:
        value = oldRow[header] || '';
    }
    
    // Escape fields that contain commas or quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      value = `"${value.replace(/"/g, '""')}"`;
    }
    
    newRow.push(value);
  });
  
  newLines.push(newRow.join(','));
}

// Write new CSV
const newCsvPath = path.join(__dirname, '../private_data/edlight_quizzes.csv');
fs.writeFileSync(newCsvPath, newLines.join('\n'), 'utf-8');

console.log(`✅ Updated quiz CSV with ${newLines.length - 1} rows`);
console.log('New headers:', newHeaders.join(', '));
console.log('');
console.log('📄 Sample row:');
const sample = parseCSVLine(newLines[1]);
newHeaders.forEach((h, i) => {
  console.log(`  ${h}: ${sample[i]}`);
});
