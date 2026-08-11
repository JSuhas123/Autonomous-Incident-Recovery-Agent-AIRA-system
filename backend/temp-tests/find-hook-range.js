'use strict';
const fs = require('fs');
const path = 'c:/Users/J SUHAS/OneDrive/Desktop/AIRA/backend/tests/unit/runbookSchema.test.js';
const src = fs.readFileSync(path, 'utf8');
const lines = src.split('\n');

const startIdx = lines.findIndex(l => l.includes('Lifecycle sync hook'));
let endIdx = startIdx;
let depth = 0;
let inBlock = false;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('describe(')) inBlock = true;
  if (inBlock) {
    depth += (lines[i].match(/{/g) || []).length;
    depth -= (lines[i].match(/}/g) || []).length;
    if (depth === 0) { endIdx = i; break; }
  }
}
console.log('start:', startIdx + 1, 'end:', endIdx + 1);
// Print the 3 lines around start and end for context
console.log('START:', JSON.stringify(lines[startIdx]));
console.log('END:  ', JSON.stringify(lines[endIdx]));
