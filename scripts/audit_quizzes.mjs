import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const app = initializeApp({ credential: cert(cred) });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('quizzes').get();
  const all = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));
  console.log(`Total quiz docs: ${snap.size}`);

  // Pull courses
  const csnap = await db.collection('courses').get();
  const courses = [];
  csnap.forEach(d => courses.push({ id: d.id, ...d.data() }));

  // Build course structure map
  const courseUnits = {};
  for (const c of courses) {
    const units = (c.units || []).map(u => ({
      unitId: u.unitId || u.id,
      title: u.title,
      order: u.order,
      lessons: (u.lessons || []).map(l => ({
        id: l.lessonId, title: l.title, type: l.type, order: l.order
      }))
    }));
    courseUnits[c.id] = units;
  }

  console.log('\n=== COURSE STRUCTURE ===');
  for (const [code, units] of Object.entries(courseUnits)) {
    console.log(`${code}:`);
    for (const u of units) {
      console.log(`  U${u.order} (${u.unitId}): ${u.title} [${u.lessons.length} lessons]`);
      for (const l of u.lessons) {
        console.log(`    L${l.order} ${l.type}: ${l.title}`);
      }
    }
  }

  // Normalize CHEM-NSI -> chem-ns1
  const normCode = (sc) => {
    const m = sc.match(/^([A-Z]+)-NS(IV|III|II|I)$/);
    if (!m) return sc.toLowerCase();
    const subj = m[1].toLowerCase();
    const lvl = m[2] === 'I' ? '1' : m[2] === 'II' ? '2' : m[2] === 'III' ? '3' : '4';
    return `${subj}-ns${lvl}`;
  };

  // Group quizzes
  const bySubjChap = {};
  for (const q of all) {
    const key = `${q.subject_code}|Ch${q.Chapter_Number}`;
    if (!bySubjChap[key]) bySubjChap[key] = { questions: [], unit: q.unit, videoTitles: new Set(), subchapters: new Set() };
    bySubjChap[key].questions.push(q);
    if (q.video_title) bySubjChap[key].videoTitles.add(q.video_title);
    bySubjChap[key].subchapters.add(String(q.Subchapter_Number || '?'));
  }

  console.log('\n=== QUIZ vs COURSE ALIGNMENT ===');
  const issues = [];
  for (const [key, data] of Object.entries(bySubjChap)) {
    const [sc, chStr] = key.split('|');
    const chNum = parseInt(chStr.replace('Ch', ''));
    const courseId = normCode(sc);
    const units = courseUnits[courseId] || [];
    const matchUnit = units.find(u => u.order === chNum);
    const courseTitle = matchUnit ? matchUnit.title : '(NOT FOUND)';
    const quizUnit = data.unit || '(no unit field)';
    const status = matchUnit ? 'OK' : 'MISSING';

    // Check if quiz unit name is semantically related to course title
    const quizN = quizUnit.toLowerCase().replace(/[^a-z0-9]/g, '');
    const courseN = courseTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nameMatch = quizN === courseN || courseN.includes(quizN) || quizN.includes(courseN) ? 'MATCH' : 'MISMATCH';

    if (!matchUnit || nameMatch === 'MISMATCH') {
      issues.push({ key, quizUnit, courseTitle, chNum, courseId, status, nameMatch, count: data.questions.length });
    }

    console.log(`${key} → quiz: "${quizUnit}" | course: "${courseTitle}" [${status}] [names: ${nameMatch}] (${data.questions.length} Qs, subchaps: ${[...data.subchapters].join(',')})`);
  }

  console.log(`\n=== ISSUES (${issues.length}) ===`);
  for (const i of issues) {
    console.log(`  ❌ ${i.key}: quiz="${i.quizUnit}" vs course="${i.courseTitle}" [${i.status}/${i.nameMatch}] (${i.count} Qs)`);
  }

  // Pedagogical quality audit: sample random questions from each subject
  console.log('\n=== PEDAGOGICAL SPOT CHECK ===');
  const subjectSamples = {};
  for (const q of all) {
    const sk = q.subject_code;
    if (!subjectSamples[sk]) subjectSamples[sk] = [];
    subjectSamples[sk].push(q);
  }

  const qualityIssues = [];
  for (const [subj, qs] of Object.entries(subjectSamples)) {
    // Check every question for structural issues
    for (const q of qs) {
      const problems = [];
      // 1. Missing or empty question
      if (!q.question || q.question.trim().length < 10) problems.push('question too short/empty');
      // 2. MCQ without options
      if (q.question_type === 'MCQ' || q.question_type === 'mcq') {
        let opts = [];
        try { opts = JSON.parse(q.options || '[]'); } catch {}
        if (opts.length < 2) problems.push('MCQ has <2 options');
        if (!q.correct_answer) problems.push('MCQ missing correct_answer');
        // Check if correct answer is actually among options
        if (q.correct_answer && opts.length > 0 && !opts.map(o => o.toLowerCase().trim()).includes(q.correct_answer.toLowerCase().trim())) {
          problems.push(`correct_answer "${q.correct_answer}" not in options ${JSON.stringify(opts)}`);
        }
      }
      // 3. TrueFalse without True/False answer
      if (q.question_type === 'TrueFalse') {
        const ca = (q.correct_answer || '').toLowerCase();
        if (!ca.startsWith('true') && !ca.startsWith('false')) problems.push(`TF answer not true/false: "${q.correct_answer}"`);
      }
      // 4. ShortAnswer without correct_answer
      if ((q.question_type === 'ShortAnswer' || q.question_type === 'shortanswer') && !q.correct_answer) {
        problems.push('ShortAnswer missing correct_answer');
      }
      // 5. Missing hint
      if (!q.hint && !q.good_response) problems.push('no hint or good_response');
      // 6. Question contains the answer (trivial)
      if (q.question && q.correct_answer && q.question.toLowerCase().includes(q.correct_answer.toLowerCase()) && q.correct_answer.length > 3) {
        problems.push('question contains the answer');
      }

      if (problems.length > 0) {
        qualityIssues.push({ id: q.id, subject_code: q.subject_code, chapter: q.Chapter_Number, type: q.question_type, problems });
      }
    }
  }

  console.log(`Quality issues found: ${qualityIssues.length} / ${all.length}`);

  // Summarize by problem type
  const problemCounts = {};
  for (const qi of qualityIssues) {
    for (const p of qi.problems) {
      const key = p.split(':')[0].split('"')[0].trim();
      problemCounts[key] = (problemCounts[key] || 0) + 1;
    }
  }
  console.log('Problem type breakdown:', JSON.stringify(problemCounts, null, 2));

  // Show first 20 quality issues in detail
  console.log('\nFirst 20 quality issues:');
  for (const qi of qualityIssues.slice(0, 20)) {
    console.log(`  ${qi.id} [${qi.subject_code} Ch${qi.chapter} ${qi.type}]: ${qi.problems.join('; ')}`);
  }

  // Question type distribution
  const typeDistrib = {};
  for (const q of all) {
    typeDistrib[q.question_type] = (typeDistrib[q.question_type] || 0) + 1;
  }
  console.log('\nQuestion type distribution:', JSON.stringify(typeDistrib, null, 2));

  // Difficulty distribution
  const diffDistrib = {};
  for (const q of all) {
    diffDistrib[q.difficulty || 'unset'] = (diffDistrib[q.difficulty || 'unset'] || 0) + 1;
  }
  console.log('Difficulty distribution:', JSON.stringify(diffDistrib, null, 2));

  // Language distribution
  const langDistrib = {};
  for (const q of all) {
    langDistrib[q.language || 'unset'] = (langDistrib[q.language || 'unset'] || 0) + 1;
  }
  console.log('Language distribution:', JSON.stringify(langDistrib, null, 2));

  // Sample 2 random questions per subject for manual review
  console.log('\n=== RANDOM SAMPLES PER SUBJECT (2 each) ===');
  for (const [subj, qs] of Object.entries(subjectSamples)) {
    const shuffled = qs.sort(() => Math.random() - 0.5);
    for (const q of shuffled.slice(0, 2)) {
      console.log(`\n[${q.id}] ${q.subject_code} Ch${q.Chapter_Number}.${q.Subchapter_Number} (${q.question_type}, ${q.difficulty})`);
      console.log(`  Q: ${q.question}`);
      console.log(`  A: ${q.correct_answer}`);
      if (q.options && q.options !== '[]') console.log(`  Options: ${q.options}`);
      console.log(`  Unit: ${q.unit} | Video: ${q.video_title}`);
      console.log(`  Hint: ${q.hint || '(none)'}`);
    }
  }
}

main().catch(console.error);
