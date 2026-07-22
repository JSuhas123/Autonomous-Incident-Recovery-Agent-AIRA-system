/**
 * One-time script: removes the orphaned sample-data dead code that was
 * accidentally left in server.js when populateSampleData() was deleted.
 * The dead code causes a top-level `await` SyntaxError in CJS mode.
 *
 * Run once from the backend/ directory:
 *   node scripts/fix-server-dead-code.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const content = fs.readFileSync(serverPath, 'utf8');

// File may use CRLF (Windows) – normalise so indexOf works
const normalised = content.replace(/\r\n/g, '\n');

// Unique anchor at the start of the dead block (first orphaned declaration)
const DEAD_START = '\nlet serverInstance;\n\n    // 1. Create sample logs';
// Unique anchor at the end of the dead block (placeholder comment + blank line)
const DEAD_END_MARKER = '// REMOVED_SAMPLE_DATA_PLACEHOLDER_END\n\n';

// Work on the normalised copy
const workContent = normalised;

const deadStart = workContent.indexOf(DEAD_START);
const deadEnd   = workContent.indexOf(DEAD_END_MARKER);

if (deadStart === -1 || deadEnd === -1) {
  console.log('[fix-server] Dead code markers not found – nothing to remove.');
  console.log('  deadStart index:', deadStart);
  console.log('  deadEnd index  :', deadEnd);
  process.exit(0);
}

const before = workContent.slice(0, deadStart);
const after   = workContent.slice(deadEnd + DEAD_END_MARKER.length);
const result  = before + '\n' + after;

fs.writeFileSync(serverPath, result, 'utf8');

const linesRemoved = content.split('\n').length - result.split('\n').length;
console.log('[fix-server] Done. Removed ' + linesRemoved + ' orphaned lines from server.js');
console.log('[fix-server] Lines before:', content.split('\n').length);
console.log('[fix-server] Lines after :', result.split('\n').length);
