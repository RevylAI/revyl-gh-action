/**
 * The entrypoint for the action.
 */
const { run } = require('./main')

// eslint-disable-next-line github/no-then
run().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
