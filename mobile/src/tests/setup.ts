/**
 * Test Setup Configuration
 * 
 * Sets up the testing environment for React Native components
 */

// Define global variables that React Native expects
(global as any).__DEV__ = true;

// Note: @testing-library/jest-native is deprecated, using built-in matchers from @testing-library/react-native

// Mock React Native modules that aren't available in test environment
jest.mock('react-native', () => {
  const Platform = {
    OS: 'ios',
    select: (options: any) => options.ios || options.default,
  };
  
  return {
    StyleSheet: {
      create: (styles: any) => styles,
      absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
      flatten: (style: any) => style,
    },
    Dimensions: {
      get: () => ({ width: 375, height: 812 }),
    },
    Platform,
    Alert: {
      alert: jest.fn(),
    },
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    ScrollView: 'ScrollView',
    TextInput: 'TextInput',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
  };
});

// Mock React Native Community modules
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

// Mock Platform specifically for services that import it directly
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  select: (options: any) => options.ios || options.default,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    dispatch: jest.fn(),
  }),
  useFocusEffect: jest.fn(),
}));

// Mock Expo modules
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => children,
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

// Mock theme utilities
jest.mock('../utils/theme', () => ({
  colors: {
    primary: '#8B5CF6',
    secondary: '#06B6D4',
    success: '#10B981',
    textPrimary: '#FFFFFF',
    textMuted: '#9CA3AF',
    surface: '#151520',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
}));

// Silence console warnings in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Warning: ReactDOM.render is no longer supported')
  ) {
    return;
  }
  originalWarn.call(console, ...args);
};