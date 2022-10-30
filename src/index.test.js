import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { hastFromNoddity } from './index.js'

test('init', () => {
	assert.equal(typeof hastFromNoddity, 'function')
})

test.run()
