import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(new URL('./firebase-blueprint.json', import.meta.url), 'utf8'));

test('firestore.rules enforces Eight Pillars and covers all blueprint paths', () => {
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match\s*\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;/);
  assert.match(rules, /request\.auth\.token\.email_verified\s*==\s*true/);
  assert.match(rules, /isValidId\(/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(/);
  assert.match(rules, /resource\.data\.uid\s*==\s*request\.auth\.uid/);
  assert.ok(blueprint.firestore['/users/{userId}/public/profile']);
  assert.ok(blueprint.firestore['/users/{userId}/private/info']);
  assert.ok(blueprint.firestore['/user_preferences/{userId}']);
  assert.ok(blueprint.firestore['/admins/{adminId}']);
});
