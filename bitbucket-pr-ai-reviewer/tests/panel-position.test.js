const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampDockedPosition,
  createDockedStyle,
  getDefaultDockedPosition
} = require('../src/panel-position');

test('clamps floating control vertically while staying docked to right edge', () => {
  assert.deepEqual(clampDockedPosition({ top: -100 }, 52, 800, 16), { top: 16 });
  assert.deepEqual(clampDockedPosition({ top: 900 }, 52, 800, 16), { top: 732 });
  assert.deepEqual(clampDockedPosition({ left: 123, top: 240 }, 52, 800, 16), { top: 240 });
});

test('creates right-edge style without a horizontal coordinate', () => {
  assert.deepEqual(createDockedStyle({ top: 240 }), {
    left: 'auto',
    right: '0px',
    top: '240px'
  });
});

test('defaults to a vertically clamped right-edge position', () => {
  assert.deepEqual(getDefaultDockedPosition(800, 52, 16), { top: 320 });
  assert.deepEqual(getDefaultDockedPosition(80, 52, 16), { top: 16 });
});
