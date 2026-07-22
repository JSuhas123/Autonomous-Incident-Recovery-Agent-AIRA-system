/**
 * Standardize error handling in all route files.
 *
 * Transforms:
 *   async (req, res) => {      →   async (req, res, next) => {
 *
 * And in every catch block:
 *   console.error(...);        →   next(error);
 *   res.status(500).json(...);
 *
 * Run once from the backend/ directory:
 *   node scripts/standardize-route-errors.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const routeDir = path.join(__dirname, '..', 'routes');
const files = fs.readdirSync(routeDir).filter(f => f.endsWith('.js'));

let totalHandlers = 0;
let totalCatches = 0;

for (const file of files) {
  const filePath = path.join(routeDir, file);
  let src = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  let changed = false;

  // 1. Add `next` to route handler signatures that are missing it.
  //    Match: router.VERB(..., async (req, res) => {
  //    NOT already having: async (req, res, next)
  const beforeSig = src;
  src = src.replace(
    /\basync\s*\(\s*req\s*,\s*res\s*\)\s*=>/g,
    'async (req, res, next) =>'
  );
  if (src !== beforeSig) {
    const count = (beforeSig.match(/\basync\s*\(\s*req\s*,\s*res\s*\)\s*=>/g) || []).length;
    totalHandlers += count;
    changed = true;
    console.log(`[${file}] Added 'next' to ${count} route handler(s)`);
  }

  // 2. Replace catch blocks that end with res.status(500).json(...)
  //    Pattern: } catch (error) {\n ... res.status(500).json({...})\n  }
  //
  //    We look for the sequence:
  //      optional console.error line(s)
  //      res.status(500).json( ... );
  //    and replace the whole catch body with next(error).

  // Greedy approach: replace anything that looks like:
  //   catch (error) {
  //     <lines not containing next(>
  //     res.status(500).json({...});\n
  //   }
  // with:
  //   catch (error) {
  //     next(error);
  //   }
  const catchPattern = /(\}\s*catch\s*\(\s*\w+\s*\)\s*\{)([^}]*?res\.status\(5\d\d\)\.json\(\{[^}]*?\}\s*\)\s*;[^\}]*?)(\})/g;

  const beforeCatch = src;
  src = src.replace(catchPattern, (match, catchOpen, body, closeBlock) => {
    // Only transform if the catch body does NOT already delegate to next()
    if (/\bnext\s*\(/.test(body)) return match;
    // Only transform if we're dealing with an unhandled error path
    if (!body.includes('res.status(5')) return match;

    // Get the indentation of the catch body from the first non-empty line
    const indentMatch = body.match(/\n(\s+)/);
    const indent = indentMatch ? indentMatch[1] : '    ';

    return `${catchOpen}\n${indent}next(error);\n  ${closeBlock}`;
  });

  if (src !== beforeCatch) {
    const count = (src.match(/next\(error\);/g) || []).length -
                  (beforeCatch.match(/next\(error\);/g) || []).length;
    totalCatches += Math.max(count, 0);
    changed = true;
    console.log(`[${file}] Standardized ${Math.max(count, 0)} catch block(s)`);
  }

  if (changed) {
    fs.writeFileSync(filePath, src, 'utf8');
  }
}

console.log(`\nDone. ${totalHandlers} handler signatures updated, ${totalCatches} catch blocks standardized.`);
