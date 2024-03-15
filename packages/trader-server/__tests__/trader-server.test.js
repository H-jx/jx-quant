'use strict';

const traderServer = require('..');
const assert = require('assert').strict;

assert.strictEqual(traderServer(), 'Hello from traderServer');
console.info('traderServer tests passed');
