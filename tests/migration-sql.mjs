/**
 * D1 db.exec expects each complete statement on a single line.
 * Preserve trigger bodies (including their internal semicolons) as one statement.
 * Cloudflare D1 already enforces foreign keys for all queries and migrations.
 */
export function normalizeMigrationForD1(sql){
 const statements=[];let current='',trigger=false;
 for(const raw of String(sql).split(/\r?\n/)){
  const line=raw.trim();
  if(!line||line.startsWith('--'))continue;
  if(/^PRAGMA\s+foreign_keys\s*=\s*ON\s*;/i.test(line))continue;
  if(!current&&/^CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(line))trigger=true;
  current+=(current?' ':'')+line;
  const complete=trigger?(/^END\s*;\s*$/i.test(line)||(/^CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(line)&&/\bEND\s*;\s*$/i.test(line))):/;\s*$/.test(line);
  if(complete){statements.push(current);current='';trigger=false;}
 }
 if(current.trim())throw Error('Migration SQL incomplète : '+current.slice(0,120));
 return statements.join('\n');
}
