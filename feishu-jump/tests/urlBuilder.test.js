const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TASK_DETAIL_URL_TEMPLATE,
  buildTaskUrl,
  normalizeTaskKey,
  validateKey,
} = require('../src/urlBuilder');

test('buildTaskUrl strips Feishu letter prefixes before opening the detail URL', () => {
  const url = buildTaskUrl(' f-7028807610 ');
  assert.equal(url, 'https://project.feishu.cn/b2rl2h/issue/detail/7028807610');
});

test('buildTaskUrl also supports m-prefixed task keys', () => {
  const url = buildTaskUrl(' m-7040569864 ');
  assert.equal(url, 'https://project.feishu.cn/b2rl2h/issue/detail/7040569864');
});

test('buildTaskUrl keeps raw numeric ids unchanged', () => {
  const url = buildTaskUrl('7028807610');
  assert.equal(url, 'https://project.feishu.cn/b2rl2h/issue/detail/7028807610');
});

test('buildTaskUrl rejects blank keys', () => {
  assert.throws(() => buildTaskUrl('   '), /请输入任务 key/);
});

test('exports the hardcoded URL template and key validator for popup use', () => {
  assert.equal(TASK_DETAIL_URL_TEMPLATE, 'https://project.feishu.cn/b2rl2h/issue/detail/{key}');
  assert.equal(normalizeTaskKey('f-7028807610'), '7028807610');
  assert.deepEqual(validateKey(''), { valid: false, message: '请输入任务 key' });
  assert.deepEqual(validateKey('m-7040569864'), { valid: true, message: '' });
});
