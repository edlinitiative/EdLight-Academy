import { readFileSync } from 'fs';
const cat = JSON.parse(readFileSync('public/exam_catalog.json','utf-8'));
const samples = [];
for (const e of cat) {
  const subj = (e.subject||'').toLowerCase();
  for (const s of (e.sections||[])) {
    for (const q of (s.questions||[])) {
      if (q.hints && q.hints.length > 0) {
        const key = subj + '/' + q.type;
        if (!samples.find(x => x.key === key)) {
          samples.push({key, subject: e.subject, type: q.type, q: (q.question||'').slice(0,100), hints: q.hints});
        }
      }
    }
  }
}
for (const s of samples.slice(0,25)) {
  console.log(`\n[${s.subject}] ${s.type}: ${s.q}`);
  s.hints.forEach((h,i) => console.log(`  ${i+1}. ${h}`));
}
console.log(`\nTotal unique subject/type combos: ${samples.length}`);
