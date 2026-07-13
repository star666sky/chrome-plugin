const test = require('node:test');
const assert = require('node:assert/strict');

const { isPullRequestPageUrl } = require('../src/pr-url-match');

test('detects Bitbucket pull request detail pages', () => {
  assert.equal(
    isPullRequestPageUrl('https://code.fineres.com/projects/CPXREPORT/repos/complex-report-webui/pull-requests/2415/overview'),
    true
  );
  assert.equal(
    isPullRequestPageUrl('https://code.fineres.com/projects/CPXREPORT/repos/complex-report-webui/pull-requests/2415/diff'),
    true
  );
  assert.equal(
    isPullRequestPageUrl('https://code.fineres.com/projects/CPXREPORT/repos/complex-report-webui/pull-requests/2415'),
    true
  );
});

test('rejects pages that are not a specific pull request', () => {
  assert.equal(isPullRequestPageUrl('https://code.fineres.com/projects/CPXREPORT/repos/complex-report-webui/pull-requests'), false);
  assert.equal(isPullRequestPageUrl('https://code.fineres.com/projects/CPXREPORT/repos/complex-report-webui/browse'), false);
  assert.equal(isPullRequestPageUrl('https://code.fineres.com/dashboard/pull-requests'), false);
  assert.equal(
    isPullRequestPageUrl('https://code.fineres.com/projects/CPXREPORT/repos/complex-report-webui/pull-requests/new/overview'),
    false
  );
  assert.equal(isPullRequestPageUrl('not a url'), false);
});
