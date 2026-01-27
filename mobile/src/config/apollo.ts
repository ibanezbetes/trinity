/**
 * Apollo Client Configuration
 * 
 * Mock Apollo Client for testing purposes.
 * In production, this would be configured with the actual GraphQL endpoint.
 */

export const apolloClient = {
  mutate: jest.fn(),
  query: jest.fn(),
  subscribe: jest.fn(),
  watchQuery: jest.fn(),
  readQuery: jest.fn(),
  writeQuery: jest.fn(),
  resetStore: jest.fn(),
  clearStore: jest.fn()
};

export default apolloClient;