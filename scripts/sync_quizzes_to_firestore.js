/**
 * Script to sync quiz CSV to Firestore with proper column structure
 * Run this to upload the quizzes with subject_code, Chapter_Number, Subchapter_Number
 */

const fs = require('fs');
const path = require('path');

// Read the quiz CSV
const csvPath = path.join(__dirname, '../private_data/edlight_quizzes.csv');

if (!fs.existsSync(csvPath)) {
  console.error('❌ Quiz CSV not found at:', csvPath);
  console.log('💡 Make sure you have the quiz CSV in private_data/edlight_quizzes.csv');
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, 'utf-8');
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

const headers = parseCSVLine(lines[0]);
console.log('📋 CSV Headers:', headers);
console.log('');

// Parse all rows
const quizzes = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  
  const fields = parseCSVLine(lines[i]);
  const quiz = {};
  
  headers.forEach((header, index) => {
    quiz[header] = fields[index] || '';
  });
  
  quizzes.push(quiz);
}

console.log(`✅ Parsed ${quizzes.length} quizzes from CSV`);
console.log('');
console.log('Sample quiz:');
console.log(JSON.stringify(quizzes[0], null, 2));
console.log('');
console.log('🔥 To upload to Firestore:');
console.log('1. Go to the Admin panel in your app');
console.log('2. Navigate to the Quizzes section');
console.log('3. Click "Load current" to load from Firestore');
console.log('4. Click "Upload File" and select private_data/edlight_quizzes.csv');
console.log('5. Click "Sync to Firebase" to upload');
console.log('');
console.log('⚠️  Make sure to check that these fields are present:');
console.log('   - subject_code (e.g., "CHEM-NSI")');
console.log('   - Chapter_Number (e.g., "1")');
console.log('   - Subchapter_Number (e.g., "1")');
