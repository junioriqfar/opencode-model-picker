import test from 'node:test'
import assert from 'node:assert/strict'
import { sortByScore, sortByName } from '../src/scoring.js'

test('sortByName sorts A-Z without mutating the input', () => {
  const models = [{ id: 'zeta' }, { id: 'alpha' }, { id: 'mike' }]
  assert.deepEqual(sortByName(models).map((m) => m.id), ['alpha', 'mike', 'zeta'])
  assert.deepEqual(models.map((m) => m.id), ['zeta', 'alpha', 'mike'])
})

test('sortByScore sorts descending and breaks ties by id', () => {
  const models = [
    { id: 'a', _score: 10 },
    { id: 'c', _score: 30 },
    { id: 'b', _score: 30 },
  ]
  assert.deepEqual(sortByScore(models).map((m) => m.id), ['b', 'c', 'a'])
})
