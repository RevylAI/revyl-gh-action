// Mock the main module before requiring index
jest.mock('../src/main')

const main = require('../src/main')

describe('index', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    main.run.mockResolvedValue(true)
  })

  test('should call run function', () => {
    // Import index to trigger execution
    require('../src/index')

    expect(main.run).toHaveBeenCalled()
  })

  test('should export run function from main', () => {
    expect(main.run).toBeDefined()
    expect(typeof main.run).toBe('function')
  })
})
