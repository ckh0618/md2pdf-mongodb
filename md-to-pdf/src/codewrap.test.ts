import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { displayWidth, wrapCode } from './codewrap.js';

const maxWidth = (text: string): number => Math.max(...text.split('\n').map((l) => displayWidth(l)));

test('leaves lines that already fit untouched', () => {
  const code = 'db.orders.find({ status: "A" })\n  .sort({ _id: 1 })';
  const result = wrapCode(code, 'javascript', 80);
  assert.equal(result.text, code);
  assert.equal(result.wrappedLines, 0);
});

test('counts wide CJK characters as two columns and tabs to the next stop', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('한글'), 4);
  assert.equal(displayWidth('中文'), 4);
  assert.equal(displayWidth('\tx'), 5);
});

test('breaks shell commands at argument boundaries with a backslash continuation', () => {
  const line = 'mongosh "mongodb+srv://cluster0.example.mongodb.net/admin" --username admin --password "$MONGO_PASSWORD" --eval \'db.adminCommand({ ping: 1 })\'';
  const result = wrapCode(line, 'bash', 60);
  assert.ok(maxWidth(result.text) <= 60, result.text);
  const lines = result.text.split('\n');
  for (const l of lines.slice(0, -1)) assert.match(l, / \\$/);
  // Removing "\\\n" yields the same shell words.
  const joined = result.text.replaceAll('\\\n', '');
  assert.deepEqual(joined.split(/\s+/), line.split(/\s+/));
  assert.deepEqual(result.unsafe, []);
});

test('hard-breaks an unbreakable shell token without indentation so bash rejoins it', () => {
  const token = `echo ${'x'.repeat(120)}`;
  const result = wrapCode(token, 'bash', 50);
  assert.ok(maxWidth(result.text) <= 50);
  assert.equal(result.text.replaceAll('\\\n', '').replace(/ {2,}/g, ' ').replace(' \\', ''), token);
});

test('wrapped shell commands still run identically in bash', { skip: !hasBash() }, () => {
  const line = `printf '%s|' alpha "beta gamma" ${'delta'.repeat(12)} "epsilon zeta eta theta" iota kappa lambda mu nu xi omicron pi rho`;
  const result = wrapCode(line, 'bash', 40);
  assert.ok(result.text.includes('\n'));
  const run = (script: string): string => execFileSync('bash', ['-c', script], { encoding: 'utf-8' });
  assert.equal(run(result.text), run(line));
});

test('breaks inside brackets for JSON and JavaScript without continuation markers', () => {
  const json = '{"name": "prod-cluster", "clusterType": "REPLICASET", "replicationSpecs": [{"numShards": 1, "regionName": "AP_NORTHEAST_2"}]}';
  const result = wrapCode(json, 'json', 50);
  assert.ok(maxWidth(result.text) <= 50, result.text);
  assert.deepEqual(JSON.parse(result.text), JSON.parse(json));
  assert.deepEqual(result.unsafe, []);
});

test('uses implicit continuation inside brackets and a backslash outside for Python', () => {
  const code = 'result = collection.aggregate([{"$match": {"status": "ACTIVE"}}, {"$group": {"_id": "$customer", "total": {"$sum": "$amount"}}}])\n'
    + 'if very_long_condition_name_number_one and very_long_condition_name_number_two or another_condition_three:\n    pass';
  const result = wrapCode(code, 'python', 60);
  assert.ok(maxWidth(result.text) <= 60, result.text);
  const lines = result.text.split('\n');
  const ifIndex = lines.findIndex((l) => l.startsWith('if '));
  assert.match(lines[ifIndex]!, / \\$/);
  assert.equal(lines[lines.length - 1], '    pass');
});

test('reports breaks that land inside a string literal as unsafe', () => {
  const code = `const message = "${'a'.repeat(100)}";`;
  const result = wrapCode(code, 'javascript', 40);
  assert.ok(maxWidth(result.text) <= 40);
  assert.equal(result.unsafe.length, 1);
});

test('continues line comments with the comment marker', () => {
  const code = `# ${'word '.repeat(30)}`.trimEnd();
  const result = wrapCode(code, 'bash', 40);
  for (const l of result.text.split('\n')) assert.match(l, /^# /);
});

test('wrapped Python has the same AST as the original', { skip: !hasPython() }, () => {
  const code = 'result = collection.aggregate([{"$match": {"status": "ACTIVE"}}, {"$group": {"_id": "$customer", "total": {"$sum": "$amount"}}}])\n'
    + 'if very_long_condition_name_number_one and very_long_condition_name_number_two or another_condition_three:\n    pass\n';
  const wrapped = wrapCode(code, 'python', 50).text;
  const dump = (src: string): string => execFileSync('python3', ['-c', 'import ast,sys; print(ast.dump(ast.parse(sys.stdin.read())))'], { input: src, encoding: 'utf-8' });
  assert.equal(dump(wrapped), dump(code));
});

test('wrapped JavaScript still parses', () => {
  const code = 'db.orders.find({ status: "ACTIVE", region: "KR", createdAt: { $gte: ISODate("2026-01-01T00:00:00Z") } }).sort({ updatedAt: -1 }).limit(100);\n'
    + 'const ok = someVeryLongFunctionName(argumentNumberOne) && anotherVeryLongFunctionName(argumentNumberTwo);';
  const wrapped = wrapCode(code, 'javascript', 45).text;
  assert.ok(maxWidth(wrapped) <= 45, wrapped);
  assert.doesNotThrow(() => new Function(wrapped));
});

function hasPython(): boolean {
  try {
    execFileSync('python3', ['-c', 'pass']);
    return true;
  } catch {
    return false;
  }
}

function hasBash(): boolean {
  try {
    execFileSync('bash', ['-c', 'true']);
    return true;
  } catch {
    return false;
  }
}
