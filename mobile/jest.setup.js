// AsyncStorage has no native module under Jest — use the mock the package ships.
// (https://react-native-async-storage.github.io/async-storage/docs/advanced/jest)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The ambassador badge list is a network read; suites get an empty list by default.
// A suite testing the badge itself uses jest.requireActual('./src/hooks/useAmbassadors').
jest.mock('./src/hooks/useAmbassadors', () => ({
  useAmbassadorUids: () => new Set(),
  useIsAmbassador: () => false,
  __resetAmbassadorCache: () => {},
}));
