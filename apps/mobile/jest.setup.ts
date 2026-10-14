// Mock react-native-mmkv so tests don't require native modules
jest.mock('react-native-mmkv', () => ({
  createMMKV: jest.fn(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  })),
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('mock-encryption-key'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock storage initStorage so stores work in tests
jest.mock('@/storage', () => {
  const mockStorage = {
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  };
  return {
    storage: mockStorage,
    initStorage: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
});

// Silence noisy console.log in test output
jest.spyOn(console, 'log').mockImplementation(() => {});
