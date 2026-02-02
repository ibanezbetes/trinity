"use strict";
/**
 * Test Utilities for TMDB Client Tests
 *
 * Common utilities and helpers for testing TMDB client functionality
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_GENRE_IDS = void 0;
exports.createMockResponse = createMockResponse;
exports.createMockErrorResponse = createMockErrorResponse;
exports.createMockDiscoverResponse = createMockDiscoverResponse;
exports.createMockMovie = createMockMovie;
exports.createMockTVShow = createMockTVShow;
exports.createMockGenreResponse = createMockGenreResponse;
exports.mockMultipleSuccessResponses = mockMultipleSuccessResponses;
exports.mockErrorResponse = mockErrorResponse;
exports.mockRateLimitThenSuccess = mockRateLimitThenSuccess;
exports.mockNetworkError = mockNetworkError;
exports.assertEndpointCalled = assertEndpointCalled;
exports.assertQueryParams = assertQueryParams;
exports.assertQueryParamsNotPresent = assertQueryParamsNotPresent;
exports.generateMoviesWithGenres = generateMoviesWithGenres;
exports.generateTVShowsWithGenres = generateTVShowsWithGenres;
exports.generateTMDBContent = generateTMDBContent;
exports.generateFilterCriteria = generateFilterCriteria;
exports.generateTMDBContentWithGenres = generateTMDBContentWithGenres;
exports.generateFilterCriteriaWithConstraints = generateFilterCriteriaWithConstraints;
exports.generateRoomId = generateRoomId;
exports.generateContentIds = generateContentIds;
exports.createMockTMDBClient = createMockTMDBClient;
exports.generateMockContent = generateMockContent;
const globals_1 = require("@jest/globals");
// ============================================================================
// Mock Response Helpers
// ============================================================================
/**
 * Creates a mock successful Response object for fetch
 */
function createMockResponse(data, status = 200) {
    const headers = new Headers();
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: async () => data,
        text: async () => JSON.stringify(data),
        headers,
        url: 'https://api.themoviedb.org/3/test',
        redirected: false,
        type: 'basic',
        clone: globals_1.jest.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: globals_1.jest.fn(),
        blob: globals_1.jest.fn(),
        formData: globals_1.jest.fn(),
        bytes: globals_1.jest.fn()
    };
}
/**
 * Creates a mock error Response object for fetch
 */
function createMockErrorResponse(status, statusText, headerEntries) {
    const headers = new Headers();
    if (headerEntries) {
        headerEntries.forEach(([key, value]) => headers.set(key, value));
    }
    return {
        ok: false,
        status,
        statusText,
        json: async () => { throw new Error('Response not ok'); },
        text: async () => statusText,
        headers,
        url: 'https://api.themoviedb.org/3/test',
        redirected: false,
        type: 'basic',
        clone: globals_1.jest.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: globals_1.jest.fn(),
        blob: globals_1.jest.fn(),
        formData: globals_1.jest.fn(),
        bytes: globals_1.jest.fn()
    };
}
/**
 * Creates a mock TMDB discover response
 */
function createMockDiscoverResponse(results = [], page = 1) {
    return {
        page,
        results,
        total_pages: Math.ceil(results.length / 20),
        total_results: results.length
    };
}
/**
 * Creates a mock TMDB movie object (transformed format)
 */
function createMockMovie(id, overrides = {}) {
    return {
        id: id.toString(), // Convert to string like the transformer does
        title: `Test Movie ${id}`,
        overview: 'Test overview',
        genre_ids: [28, 12],
        vote_average: 7.5,
        release_date: '2023-01-01',
        poster_path: '/test-poster.jpg',
        ...overrides
    };
}
/**
 * Creates a mock TMDB TV show object (transformed format)
 */
function createMockTVShow(id, overrides = {}) {
    return {
        id: id.toString(), // Convert to string like the transformer does
        name: `Test TV Show ${id}`,
        overview: 'Test TV overview',
        genre_ids: [35, 18],
        vote_average: 8.2,
        first_air_date: '2023-01-01',
        poster_path: '/test-tv-poster.jpg',
        ...overrides
    };
}
/**
 * Creates a mock TMDB genre response
 */
function createMockGenreResponse(genres = []) {
    return {
        genres
    };
}
// ============================================================================
// Mock Setup Helpers
// ============================================================================
/**
 * Sets up fetch mock with multiple successful responses
 */
function mockMultipleSuccessResponses(mockFetch, responses) {
    responses.forEach(response => {
        mockFetch.mockResolvedValueOnce(createMockResponse(response));
    });
}
/**
 * Sets up fetch mock with error response
 */
function mockErrorResponse(mockFetch, status, statusText) {
    mockFetch.mockResolvedValueOnce(createMockErrorResponse(status, statusText));
}
/**
 * Sets up fetch mock with rate limit response followed by success
 */
function mockRateLimitThenSuccess(mockFetch, retryAfter, successData) {
    mockFetch.mockResolvedValueOnce(createMockErrorResponse(429, 'Too Many Requests', [['Retry-After', retryAfter.toString()]]));
    mockFetch.mockResolvedValueOnce(createMockResponse(successData));
}
/**
 * Sets up fetch mock with network error
 */
function mockNetworkError(mockFetch, errorMessage = 'Network error') {
    mockFetch.mockRejectedValueOnce(new Error(errorMessage));
}
// ============================================================================
// Assertion Helpers
// ============================================================================
/**
 * Asserts that a URL contains the expected endpoint
 */
function assertEndpointCalled(mockFetch, expectedEndpoint, callIndex = 0) {
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[callIndex][0];
    expect(calledUrl).toContain(expectedEndpoint);
}
/**
 * Asserts that a URL contains the expected query parameters
 */
function assertQueryParams(mockFetch, expectedParams, callIndex = 0) {
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[callIndex][0];
    Object.entries(expectedParams).forEach(([key, value]) => {
        const encodedValue = encodeURIComponent(value);
        expect(calledUrl).toContain(`${key}=${encodedValue}`);
    });
}
/**
 * Asserts that a URL does NOT contain specific parameters
 */
function assertQueryParamsNotPresent(mockFetch, forbiddenParams, callIndex = 0) {
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[callIndex][0];
    forbiddenParams.forEach(param => {
        expect(calledUrl).not.toContain(param);
    });
}
// ============================================================================
// Test Data Generators
// ============================================================================
/**
 * Generates test genre IDs for different scenarios
 */
exports.TEST_GENRE_IDS = {
    SINGLE: [28], // Action
    DOUBLE: [28, 12], // Action, Adventure
    TRIPLE: [28, 12, 16], // Action, Adventure, Animation
    COMEDY_DRAMA: [35, 18], // Comedy, Drama
    FANTASY_ROMANCE: [14, 10749] // Fantasy, Romance
};
/**
 * Generates test movie data with specific genre combinations
 */
function generateMoviesWithGenres(count, genreIds) {
    return Array.from({ length: count }, (_, index) => createMockMovie(100 + index, { genre_ids: genreIds }));
}
/**
 * Generates test TV show data with specific genre combinations
 */
function generateTVShowsWithGenres(count, genreIds) {
    return Array.from({ length: count }, (_, index) => createMockTVShow(200 + index, { genre_ids: genreIds }));
}
// ============================================================================
// Fast-Check Generators for Property-Based Testing
// ============================================================================
const fc = __importStar(require("fast-check"));
const content_filtering_1 = require("../types/content-filtering");
/**
 * Generates a random TMDBContent object for property-based testing
 */
function generateTMDBContent() {
    return fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        poster_path: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        overview: fc.string({ minLength: 0, maxLength: 500 }),
        genre_ids: fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 0, maxLength: 10 }),
        vote_average: fc.float({ min: 0, max: 10 }),
        release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 })) // YYYY-MM-DD format
    });
}
/**
 * Generates a random FilterCriteria object for property-based testing
 */
function generateFilterCriteria() {
    return fc.record({
        mediaType: fc.constantFrom(content_filtering_1.MediaType.MOVIE, content_filtering_1.MediaType.TV),
        genreIds: fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 0, maxLength: content_filtering_1.CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM }),
        roomId: fc.string({ minLength: 1, maxLength: 50 })
    });
}
/**
 * Generates a TMDBContent object with specific genre IDs
 */
function generateTMDBContentWithGenres(genreIds) {
    return fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        poster_path: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        overview: fc.string({ minLength: 0, maxLength: 500 }),
        genre_ids: fc.constant(genreIds),
        vote_average: fc.float({ min: 0, max: 10 }),
        release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 }))
    });
}
/**
 * Generates a FilterCriteria with specific constraints
 */
function generateFilterCriteriaWithConstraints(mediaType, maxGenres) {
    return fc.record({
        mediaType: mediaType ? fc.constant(mediaType) : fc.constantFrom(content_filtering_1.MediaType.MOVIE, content_filtering_1.MediaType.TV),
        genreIds: fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 0, maxLength: maxGenres || content_filtering_1.CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM }),
        roomId: fc.string({ minLength: 1, maxLength: 50 })
    });
}
/**
 * Generates a room ID string for testing
 */
function generateRoomId() {
    return fc.string({ minLength: 1, maxLength: 50 });
}
/**
 * Generates an array of content IDs for exclusion testing
 */
function generateContentIds(minLength = 0, maxLength = 20) {
    return fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength, maxLength });
}
// ============================================================================
// Mock TMDB Client for Testing
// ============================================================================
/**
 * Creates a mock TMDB client for testing
 */
function createMockTMDBClient() {
    return {
        discoverMovies: globals_1.jest.fn(),
        discoverTV: globals_1.jest.fn(),
        discover: globals_1.jest.fn(),
        getMovieGenres: globals_1.jest.fn(),
        getTVGenres: globals_1.jest.fn(),
        getGenres: globals_1.jest.fn(),
        getMovieDetails: globals_1.jest.fn(),
        getTVDetails: globals_1.jest.fn(),
        discoverMultiplePages: globals_1.jest.fn(),
        getContentWithAllGenres: globals_1.jest.fn(),
        getContentWithAnyGenre: globals_1.jest.fn(),
        getPopularContent: globals_1.jest.fn()
    };
}
/**
 * Generates mock content for testing
 */
function generateMockContent(count, mediaType, genreIds = []) {
    return Array.from({ length: count }, (_, index) => {
        const baseGenres = genreIds.length > 0 ? genreIds : [28, 12]; // Default to Action, Adventure
        // Add some variety in genre combinations
        const contentGenres = index % 3 === 0
            ? baseGenres // Some content has all requested genres
            : index % 2 === 0
                ? [baseGenres[0]] // Some content has partial genres
                : [35, 18]; // Some content has different genres (Comedy, Drama)
        return {
            id: (1000 + index).toString(),
            title: mediaType === content_filtering_1.MediaType.MOVIE
                ? `Test Movie ${index + 1}`
                : `Test TV Show ${index + 1}`,
            poster_path: `/test-poster-${index}.jpg`,
            overview: `Test overview for content ${index + 1}`,
            genre_ids: contentGenres,
            vote_average: 5.0 + (index % 5), // Vary ratings from 5.0 to 9.0
            release_date: `202${(index % 4)}-01-01`
        };
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRlc3QtdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVdILGdEQXFCQztBQUtELDBEQXdCQztBQUtELGdFQU9DO0FBS0QsMENBV0M7QUFLRCw0Q0FXQztBQUtELDBEQUlDO0FBU0Qsb0VBSUM7QUFLRCw4Q0FFQztBQUtELDREQVNDO0FBS0QsNENBRUM7QUFTRCxvREFJQztBQUtELDhDQVFDO0FBS0Qsa0VBT0M7QUFvQkQsNERBSUM7QUFLRCw4REFJQztBQVlELGtEQVVDO0FBS0Qsd0RBU0M7QUFLRCxzRUFVQztBQUtELHNGQVlDO0FBS0Qsd0NBRUM7QUFLRCxnREFLQztBQVNELG9EQWVDO0FBS0Qsa0RBMkJDO0FBN1dELDJDQUFxQztBQUVyQywrRUFBK0U7QUFDL0Usd0JBQXdCO0FBQ3hCLCtFQUErRTtBQUUvRTs7R0FFRztBQUNILFNBQWdCLGtCQUFrQixDQUFDLElBQVMsRUFBRSxTQUFpQixHQUFHO0lBQ2hFLE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7SUFFOUIsT0FBTztRQUNMLEVBQUUsRUFBRSxNQUFNLElBQUksR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHO1FBQ2pDLE1BQU07UUFDTixVQUFVLEVBQUUsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPO1FBQzNDLElBQUksRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLElBQUk7UUFDdEIsSUFBSSxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7UUFDdEMsT0FBTztRQUNQLEdBQUcsRUFBRSxtQ0FBbUM7UUFDeEMsVUFBVSxFQUFFLEtBQUs7UUFDakIsSUFBSSxFQUFFLE9BQU87UUFDYixLQUFLLEVBQUUsY0FB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QUU7UUFDaEQsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQywrQkFBK0I7UUFFN0YseUNBQXlDO1FBQ3pDLE1BQU0sYUFBYSxHQUFHLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQztZQUNuQyxDQUFDLENBQUMsVUFBVSxDQUFDLHdDQUF3QztZQUNyRCxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDO2dCQUNmLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGtDQUFrQztnQkFDcEQsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsb0RBQW9EO1FBRXBFLE9BQU87WUFDTCxFQUFFLEVBQUUsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsUUFBUSxFQUFFO1lBQzdCLEtBQUssRUFBRSxTQUFTLEtBQUssNkJBQVMsQ0FBQyxLQUFLO2dCQUNsQyxDQUFDLENBQUMsY0FBYyxLQUFLLEdBQUcsQ0FBQyxFQUFFO2dCQUMzQixDQUFDLENBQUMsZ0JBQWdCLEtBQUssR0FBRyxDQUFDLEVBQUU7WUFDL0IsV0FBVyxFQUFFLGdCQUFnQixLQUFLLE1BQU07WUFDeEMsUUFBUSxFQUFFLDZCQUE2QixLQUFLLEdBQUcsQ0FBQyxFQUFFO1lBQ2xELFNBQVMsRUFBRSxhQUFhO1lBQ3hCLFlBQVksRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUUsK0JBQStCO1lBQ2hFLFlBQVksRUFBRSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxRQUFRO1NBQ3hDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVGVzdCBVdGlsaXRpZXMgZm9yIFRNREIgQ2xpZW50IFRlc3RzXHJcbiAqIFxyXG4gKiBDb21tb24gdXRpbGl0aWVzIGFuZCBoZWxwZXJzIGZvciB0ZXN0aW5nIFRNREIgY2xpZW50IGZ1bmN0aW9uYWxpdHlcclxuICovXHJcblxyXG5pbXBvcnQgeyBqZXN0IH0gZnJvbSAnQGplc3QvZ2xvYmFscyc7XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIE1vY2sgUmVzcG9uc2UgSGVscGVyc1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBhIG1vY2sgc3VjY2Vzc2Z1bCBSZXNwb25zZSBvYmplY3QgZm9yIGZldGNoXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9ja1Jlc3BvbnNlKGRhdGE6IGFueSwgc3RhdHVzOiBudW1iZXIgPSAyMDApOiBSZXNwb25zZSB7XHJcbiAgY29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKCk7XHJcbiAgXHJcbiAgcmV0dXJuIHtcclxuICAgIG9rOiBzdGF0dXMgPj0gMjAwICYmIHN0YXR1cyA8IDMwMCxcclxuICAgIHN0YXR1cyxcclxuICAgIHN0YXR1c1RleHQ6IHN0YXR1cyA9PT0gMjAwID8gJ09LJyA6ICdFcnJvcicsXHJcbiAgICBqc29uOiBhc3luYyAoKSA9PiBkYXRhLFxyXG4gICAgdGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZGF0YSksXHJcbiAgICBoZWFkZXJzLFxyXG4gICAgdXJsOiAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy90ZXN0JyxcclxuICAgIHJlZGlyZWN0ZWQ6IGZhbHNlLFxyXG4gICAgdHlwZTogJ2Jhc2ljJyxcclxuICAgIGNsb25lOiBqZXN0LmZuKCksXHJcbiAgICBib2R5OiBudWxsLFxyXG4gICAgYm9keVVzZWQ6IGZhbHNlLFxyXG4gICAgYXJyYXlCdWZmZXI6IGplc3QuZm4oKSxcclxuICAgIGJsb2I6IGplc3QuZm4oKSxcclxuICAgIGZvcm1EYXRhOiBqZXN0LmZuKCksXHJcbiAgICBieXRlczogamVzdC5mbigpXHJcbiAgfSBhcyBSZXNwb25zZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZXMgYSBtb2NrIGVycm9yIFJlc3BvbnNlIG9iamVjdCBmb3IgZmV0Y2hcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2NrRXJyb3JSZXNwb25zZShzdGF0dXM6IG51bWJlciwgc3RhdHVzVGV4dDogc3RyaW5nLCBoZWFkZXJFbnRyaWVzPzogW3N0cmluZywgc3RyaW5nXVtdKTogUmVzcG9uc2Uge1xyXG4gIGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycygpO1xyXG4gIGlmIChoZWFkZXJFbnRyaWVzKSB7XHJcbiAgICBoZWFkZXJFbnRyaWVzLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4gaGVhZGVycy5zZXQoa2V5LCB2YWx1ZSkpO1xyXG4gIH1cclxuICBcclxuICByZXR1cm4ge1xyXG4gICAgb2s6IGZhbHNlLFxyXG4gICAgc3RhdHVzLFxyXG4gICAgc3RhdHVzVGV4dCxcclxuICAgIGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdSZXNwb25zZSBub3Qgb2snKTsgfSxcclxuICAgIHRleHQ6IGFzeW5jICgpID0+IHN0YXR1c1RleHQsXHJcbiAgICBoZWFkZXJzLFxyXG4gICAgdXJsOiAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy90ZXN0JyxcclxuICAgIHJlZGlyZWN0ZWQ6IGZhbHNlLFxyXG4gICAgdHlwZTogJ2Jhc2ljJyxcclxuICAgIGNsb25lOiBqZXN0LmZuKCksXHJcbiAgICBib2R5OiBudWxsLFxyXG4gICAgYm9keVVzZWQ6IGZhbHNlLFxyXG4gICAgYXJyYXlCdWZmZXI6IGplc3QuZm4oKSxcclxuICAgIGJsb2I6IGplc3QuZm4oKSxcclxuICAgIGZvcm1EYXRhOiBqZXN0LmZuKCksXHJcbiAgICBieXRlczogamVzdC5mbigpXHJcbiAgfSBhcyBSZXNwb25zZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZXMgYSBtb2NrIFRNREIgZGlzY292ZXIgcmVzcG9uc2VcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2NrRGlzY292ZXJSZXNwb25zZShyZXN1bHRzOiBhbnlbXSA9IFtdLCBwYWdlOiBudW1iZXIgPSAxKTogYW55IHtcclxuICByZXR1cm4ge1xyXG4gICAgcGFnZSxcclxuICAgIHJlc3VsdHMsXHJcbiAgICB0b3RhbF9wYWdlczogTWF0aC5jZWlsKHJlc3VsdHMubGVuZ3RoIC8gMjApLFxyXG4gICAgdG90YWxfcmVzdWx0czogcmVzdWx0cy5sZW5ndGhcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBhIG1vY2sgVE1EQiBtb3ZpZSBvYmplY3QgKHRyYW5zZm9ybWVkIGZvcm1hdClcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2NrTW92aWUoaWQ6IG51bWJlciwgb3ZlcnJpZGVzOiBQYXJ0aWFsPGFueT4gPSB7fSk6IGFueSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGlkOiBpZC50b1N0cmluZygpLCAvLyBDb252ZXJ0IHRvIHN0cmluZyBsaWtlIHRoZSB0cmFuc2Zvcm1lciBkb2VzXHJcbiAgICB0aXRsZTogYFRlc3QgTW92aWUgJHtpZH1gLFxyXG4gICAgb3ZlcnZpZXc6ICdUZXN0IG92ZXJ2aWV3JyxcclxuICAgIGdlbnJlX2lkczogWzI4LCAxMl0sXHJcbiAgICB2b3RlX2F2ZXJhZ2U6IDcuNSxcclxuICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgcG9zdGVyX3BhdGg6ICcvdGVzdC1wb3N0ZXIuanBnJyxcclxuICAgIC4uLm92ZXJyaWRlc1xyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIGEgbW9jayBUTURCIFRWIHNob3cgb2JqZWN0ICh0cmFuc2Zvcm1lZCBmb3JtYXQpXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9ja1RWU2hvdyhpZDogbnVtYmVyLCBvdmVycmlkZXM6IFBhcnRpYWw8YW55PiA9IHt9KTogYW55IHtcclxuICByZXR1cm4ge1xyXG4gICAgaWQ6IGlkLnRvU3RyaW5nKCksIC8vIENvbnZlcnQgdG8gc3RyaW5nIGxpa2UgdGhlIHRyYW5zZm9ybWVyIGRvZXNcclxuICAgIG5hbWU6IGBUZXN0IFRWIFNob3cgJHtpZH1gLFxyXG4gICAgb3ZlcnZpZXc6ICdUZXN0IFRWIG92ZXJ2aWV3JyxcclxuICAgIGdlbnJlX2lkczogWzM1LCAxOF0sXHJcbiAgICB2b3RlX2F2ZXJhZ2U6IDguMixcclxuICAgIGZpcnN0X2Fpcl9kYXRlOiAnMjAyMy0wMS0wMScsXHJcbiAgICBwb3N0ZXJfcGF0aDogJy90ZXN0LXR2LXBvc3Rlci5qcGcnLFxyXG4gICAgLi4ub3ZlcnJpZGVzXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZXMgYSBtb2NrIFRNREIgZ2VucmUgcmVzcG9uc2VcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2NrR2VucmVSZXNwb25zZShnZW5yZXM6IEFycmF5PHsgaWQ6IG51bWJlcjsgbmFtZTogc3RyaW5nIH0+ID0gW10pOiBhbnkge1xyXG4gIHJldHVybiB7XHJcbiAgICBnZW5yZXNcclxuICB9O1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIE1vY2sgU2V0dXAgSGVscGVyc1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogU2V0cyB1cCBmZXRjaCBtb2NrIHdpdGggbXVsdGlwbGUgc3VjY2Vzc2Z1bCByZXNwb25zZXNcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBtb2NrTXVsdGlwbGVTdWNjZXNzUmVzcG9uc2VzKG1vY2tGZXRjaDogamVzdC5Nb2NrZWRGdW5jdGlvbjx0eXBlb2YgZmV0Y2g+LCByZXNwb25zZXM6IGFueVtdKTogdm9pZCB7XHJcbiAgcmVzcG9uc2VzLmZvckVhY2gocmVzcG9uc2UgPT4ge1xyXG4gICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZShjcmVhdGVNb2NrUmVzcG9uc2UocmVzcG9uc2UpKTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNldHMgdXAgZmV0Y2ggbW9jayB3aXRoIGVycm9yIHJlc3BvbnNlXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbW9ja0Vycm9yUmVzcG9uc2UobW9ja0ZldGNoOiBqZXN0Lk1vY2tlZEZ1bmN0aW9uPHR5cGVvZiBmZXRjaD4sIHN0YXR1czogbnVtYmVyLCBzdGF0dXNUZXh0OiBzdHJpbmcpOiB2b2lkIHtcclxuICBtb2NrRmV0Y2gubW9ja1Jlc29sdmVkVmFsdWVPbmNlKGNyZWF0ZU1vY2tFcnJvclJlc3BvbnNlKHN0YXR1cywgc3RhdHVzVGV4dCkpO1xyXG59XHJcblxyXG4vKipcclxuICogU2V0cyB1cCBmZXRjaCBtb2NrIHdpdGggcmF0ZSBsaW1pdCByZXNwb25zZSBmb2xsb3dlZCBieSBzdWNjZXNzXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbW9ja1JhdGVMaW1pdFRoZW5TdWNjZXNzKFxyXG4gIG1vY2tGZXRjaDogamVzdC5Nb2NrZWRGdW5jdGlvbjx0eXBlb2YgZmV0Y2g+LCBcclxuICByZXRyeUFmdGVyOiBudW1iZXIsIFxyXG4gIHN1Y2Nlc3NEYXRhOiBhbnlcclxuKTogdm9pZCB7XHJcbiAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZShcclxuICAgIGNyZWF0ZU1vY2tFcnJvclJlc3BvbnNlKDQyOSwgJ1RvbyBNYW55IFJlcXVlc3RzJywgW1snUmV0cnktQWZ0ZXInLCByZXRyeUFmdGVyLnRvU3RyaW5nKCldXSlcclxuICApO1xyXG4gIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoY3JlYXRlTW9ja1Jlc3BvbnNlKHN1Y2Nlc3NEYXRhKSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXRzIHVwIGZldGNoIG1vY2sgd2l0aCBuZXR3b3JrIGVycm9yXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbW9ja05ldHdvcmtFcnJvcihtb2NrRmV0Y2g6IGplc3QuTW9ja2VkRnVuY3Rpb248dHlwZW9mIGZldGNoPiwgZXJyb3JNZXNzYWdlOiBzdHJpbmcgPSAnTmV0d29yayBlcnJvcicpOiB2b2lkIHtcclxuICBtb2NrRmV0Y2gubW9ja1JlamVjdGVkVmFsdWVPbmNlKG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpKTtcclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBBc3NlcnRpb24gSGVscGVyc1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogQXNzZXJ0cyB0aGF0IGEgVVJMIGNvbnRhaW5zIHRoZSBleHBlY3RlZCBlbmRwb2ludFxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydEVuZHBvaW50Q2FsbGVkKG1vY2tGZXRjaDogamVzdC5Nb2NrZWRGdW5jdGlvbjx0eXBlb2YgZmV0Y2g+LCBleHBlY3RlZEVuZHBvaW50OiBzdHJpbmcsIGNhbGxJbmRleDogbnVtYmVyID0gMCk6IHZvaWQge1xyXG4gIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuICBjb25zdCBjYWxsZWRVcmwgPSBtb2NrRmV0Y2gubW9jay5jYWxsc1tjYWxsSW5kZXhdWzBdIGFzIHN0cmluZztcclxuICBleHBlY3QoY2FsbGVkVXJsKS50b0NvbnRhaW4oZXhwZWN0ZWRFbmRwb2ludCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBc3NlcnRzIHRoYXQgYSBVUkwgY29udGFpbnMgdGhlIGV4cGVjdGVkIHF1ZXJ5IHBhcmFtZXRlcnNcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRRdWVyeVBhcmFtcyhtb2NrRmV0Y2g6IGplc3QuTW9ja2VkRnVuY3Rpb248dHlwZW9mIGZldGNoPiwgZXhwZWN0ZWRQYXJhbXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIGNhbGxJbmRleDogbnVtYmVyID0gMCk6IHZvaWQge1xyXG4gIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuICBjb25zdCBjYWxsZWRVcmwgPSBtb2NrRmV0Y2gubW9jay5jYWxsc1tjYWxsSW5kZXhdWzBdIGFzIHN0cmluZztcclxuICBcclxuICBPYmplY3QuZW50cmllcyhleHBlY3RlZFBhcmFtcykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XHJcbiAgICBjb25zdCBlbmNvZGVkVmFsdWUgPSBlbmNvZGVVUklDb21wb25lbnQodmFsdWUpO1xyXG4gICAgZXhwZWN0KGNhbGxlZFVybCkudG9Db250YWluKGAke2tleX09JHtlbmNvZGVkVmFsdWV9YCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBc3NlcnRzIHRoYXQgYSBVUkwgZG9lcyBOT1QgY29udGFpbiBzcGVjaWZpYyBwYXJhbWV0ZXJzXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0UXVlcnlQYXJhbXNOb3RQcmVzZW50KG1vY2tGZXRjaDogamVzdC5Nb2NrZWRGdW5jdGlvbjx0eXBlb2YgZmV0Y2g+LCBmb3JiaWRkZW5QYXJhbXM6IHN0cmluZ1tdLCBjYWxsSW5kZXg6IG51bWJlciA9IDApOiB2b2lkIHtcclxuICBleHBlY3QobW9ja0ZldGNoKS50b0hhdmVCZWVuQ2FsbGVkKCk7XHJcbiAgY29uc3QgY2FsbGVkVXJsID0gbW9ja0ZldGNoLm1vY2suY2FsbHNbY2FsbEluZGV4XVswXSBhcyBzdHJpbmc7XHJcbiAgXHJcbiAgZm9yYmlkZGVuUGFyYW1zLmZvckVhY2gocGFyYW0gPT4ge1xyXG4gICAgZXhwZWN0KGNhbGxlZFVybCkubm90LnRvQ29udGFpbihwYXJhbSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gVGVzdCBEYXRhIEdlbmVyYXRvcnNcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIEdlbmVyYXRlcyB0ZXN0IGdlbnJlIElEcyBmb3IgZGlmZmVyZW50IHNjZW5hcmlvc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IFRFU1RfR0VOUkVfSURTID0ge1xyXG4gIFNJTkdMRTogWzI4XSwgLy8gQWN0aW9uXHJcbiAgRE9VQkxFOiBbMjgsIDEyXSwgLy8gQWN0aW9uLCBBZHZlbnR1cmVcclxuICBUUklQTEU6IFsyOCwgMTIsIDE2XSwgLy8gQWN0aW9uLCBBZHZlbnR1cmUsIEFuaW1hdGlvblxyXG4gIENPTUVEWV9EUkFNQTogWzM1LCAxOF0sIC8vIENvbWVkeSwgRHJhbWFcclxuICBGQU5UQVNZX1JPTUFOQ0U6IFsxNCwgMTA3NDldIC8vIEZhbnRhc3ksIFJvbWFuY2VcclxufSBhcyBjb25zdDtcclxuXHJcbi8qKlxyXG4gKiBHZW5lcmF0ZXMgdGVzdCBtb3ZpZSBkYXRhIHdpdGggc3BlY2lmaWMgZ2VucmUgY29tYmluYXRpb25zXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVNb3ZpZXNXaXRoR2VucmVzKGNvdW50OiBudW1iZXIsIGdlbnJlSWRzOiBudW1iZXJbXSk6IGFueVtdIHtcclxuICByZXR1cm4gQXJyYXkuZnJvbSh7IGxlbmd0aDogY291bnQgfSwgKF8sIGluZGV4KSA9PiBcclxuICAgIGNyZWF0ZU1vY2tNb3ZpZSgxMDAgKyBpbmRleCwgeyBnZW5yZV9pZHM6IGdlbnJlSWRzIH0pXHJcbiAgKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdlbmVyYXRlcyB0ZXN0IFRWIHNob3cgZGF0YSB3aXRoIHNwZWNpZmljIGdlbnJlIGNvbWJpbmF0aW9uc1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlVFZTaG93c1dpdGhHZW5yZXMoY291bnQ6IG51bWJlciwgZ2VucmVJZHM6IG51bWJlcltdKTogYW55W10ge1xyXG4gIHJldHVybiBBcnJheS5mcm9tKHsgbGVuZ3RoOiBjb3VudCB9LCAoXywgaW5kZXgpID0+IFxyXG4gICAgY3JlYXRlTW9ja1RWU2hvdygyMDAgKyBpbmRleCwgeyBnZW5yZV9pZHM6IGdlbnJlSWRzIH0pXHJcbiAgKTtcclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBGYXN0LUNoZWNrIEdlbmVyYXRvcnMgZm9yIFByb3BlcnR5LUJhc2VkIFRlc3RpbmdcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuaW1wb3J0ICogYXMgZmMgZnJvbSAnZmFzdC1jaGVjayc7XHJcbmltcG9ydCB7IE1lZGlhVHlwZSwgRmlsdGVyQ3JpdGVyaWEsIFRNREJDb250ZW50LCBDT05URU5UX0ZJTFRFUklOR19DT05TVEFOVFMgfSBmcm9tICcuLi90eXBlcy9jb250ZW50LWZpbHRlcmluZyc7XHJcblxyXG4vKipcclxuICogR2VuZXJhdGVzIGEgcmFuZG9tIFRNREJDb250ZW50IG9iamVjdCBmb3IgcHJvcGVydHktYmFzZWQgdGVzdGluZ1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlVE1EQkNvbnRlbnQoKTogZmMuQXJiaXRyYXJ5PFRNREJDb250ZW50PiB7XHJcbiAgcmV0dXJuIGZjLnJlY29yZCh7XHJcbiAgICBpZDogZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxLCBtYXhMZW5ndGg6IDIwIH0pLFxyXG4gICAgdGl0bGU6IGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiAxMDAgfSksXHJcbiAgICBwb3N0ZXJfcGF0aDogZmMub3B0aW9uKGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiA1MCB9KSksXHJcbiAgICBvdmVydmlldzogZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAwLCBtYXhMZW5ndGg6IDUwMCB9KSxcclxuICAgIGdlbnJlX2lkczogZmMuYXJyYXkoZmMuaW50ZWdlcih7IG1pbjogMSwgbWF4OiA5OTkgfSksIHsgbWluTGVuZ3RoOiAwLCBtYXhMZW5ndGg6IDEwIH0pLFxyXG4gICAgdm90ZV9hdmVyYWdlOiBmYy5mbG9hdCh7IG1pbjogMCwgbWF4OiAxMCB9KSxcclxuICAgIHJlbGVhc2VfZGF0ZTogZmMub3B0aW9uKGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMTAsIG1heExlbmd0aDogMTAgfSkpIC8vIFlZWVktTU0tREQgZm9ybWF0XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmF0ZXMgYSByYW5kb20gRmlsdGVyQ3JpdGVyaWEgb2JqZWN0IGZvciBwcm9wZXJ0eS1iYXNlZCB0ZXN0aW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVGaWx0ZXJDcml0ZXJpYSgpOiBmYy5BcmJpdHJhcnk8RmlsdGVyQ3JpdGVyaWE+IHtcclxuICByZXR1cm4gZmMucmVjb3JkKHtcclxuICAgIG1lZGlhVHlwZTogZmMuY29uc3RhbnRGcm9tKE1lZGlhVHlwZS5NT1ZJRSwgTWVkaWFUeXBlLlRWKSxcclxuICAgIGdlbnJlSWRzOiBmYy5hcnJheShcclxuICAgICAgZmMuaW50ZWdlcih7IG1pbjogMSwgbWF4OiA5OTkgfSksXHJcbiAgICAgIHsgbWluTGVuZ3RoOiAwLCBtYXhMZW5ndGg6IENPTlRFTlRfRklMVEVSSU5HX0NPTlNUQU5UUy5NQVhfR0VOUkVTX1BFUl9ST09NIH1cclxuICAgICksXHJcbiAgICByb29tSWQ6IGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiA1MCB9KVxyXG4gIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogR2VuZXJhdGVzIGEgVE1EQkNvbnRlbnQgb2JqZWN0IHdpdGggc3BlY2lmaWMgZ2VucmUgSURzXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVUTURCQ29udGVudFdpdGhHZW5yZXMoZ2VucmVJZHM6IG51bWJlcltdKTogZmMuQXJiaXRyYXJ5PFRNREJDb250ZW50PiB7XHJcbiAgcmV0dXJuIGZjLnJlY29yZCh7XHJcbiAgICBpZDogZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxLCBtYXhMZW5ndGg6IDIwIH0pLFxyXG4gICAgdGl0bGU6IGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiAxMDAgfSksXHJcbiAgICBwb3N0ZXJfcGF0aDogZmMub3B0aW9uKGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiA1MCB9KSksXHJcbiAgICBvdmVydmlldzogZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAwLCBtYXhMZW5ndGg6IDUwMCB9KSxcclxuICAgIGdlbnJlX2lkczogZmMuY29uc3RhbnQoZ2VucmVJZHMpLFxyXG4gICAgdm90ZV9hdmVyYWdlOiBmYy5mbG9hdCh7IG1pbjogMCwgbWF4OiAxMCB9KSxcclxuICAgIHJlbGVhc2VfZGF0ZTogZmMub3B0aW9uKGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMTAsIG1heExlbmd0aDogMTAgfSkpXHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmF0ZXMgYSBGaWx0ZXJDcml0ZXJpYSB3aXRoIHNwZWNpZmljIGNvbnN0cmFpbnRzXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVGaWx0ZXJDcml0ZXJpYVdpdGhDb25zdHJhaW50cyhcclxuICBtZWRpYVR5cGU/OiBNZWRpYVR5cGUsXHJcbiAgbWF4R2VucmVzPzogbnVtYmVyXHJcbik6IGZjLkFyYml0cmFyeTxGaWx0ZXJDcml0ZXJpYT4ge1xyXG4gIHJldHVybiBmYy5yZWNvcmQoe1xyXG4gICAgbWVkaWFUeXBlOiBtZWRpYVR5cGUgPyBmYy5jb25zdGFudChtZWRpYVR5cGUpIDogZmMuY29uc3RhbnRGcm9tKE1lZGlhVHlwZS5NT1ZJRSwgTWVkaWFUeXBlLlRWKSxcclxuICAgIGdlbnJlSWRzOiBmYy5hcnJheShcclxuICAgICAgZmMuaW50ZWdlcih7IG1pbjogMSwgbWF4OiA5OTkgfSksXHJcbiAgICAgIHsgbWluTGVuZ3RoOiAwLCBtYXhMZW5ndGg6IG1heEdlbnJlcyB8fCBDT05URU5UX0ZJTFRFUklOR19DT05TVEFOVFMuTUFYX0dFTlJFU19QRVJfUk9PTSB9XHJcbiAgICApLFxyXG4gICAgcm9vbUlkOiBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogNTAgfSlcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdlbmVyYXRlcyBhIHJvb20gSUQgc3RyaW5nIGZvciB0ZXN0aW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVSb29tSWQoKTogZmMuQXJiaXRyYXJ5PHN0cmluZz4ge1xyXG4gIHJldHVybiBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogNTAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmF0ZXMgYW4gYXJyYXkgb2YgY29udGVudCBJRHMgZm9yIGV4Y2x1c2lvbiB0ZXN0aW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDb250ZW50SWRzKG1pbkxlbmd0aDogbnVtYmVyID0gMCwgbWF4TGVuZ3RoOiBudW1iZXIgPSAyMCk6IGZjLkFyYml0cmFyeTxzdHJpbmdbXT4ge1xyXG4gIHJldHVybiBmYy5hcnJheShcclxuICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiAyMCB9KSxcclxuICAgIHsgbWluTGVuZ3RoLCBtYXhMZW5ndGggfVxyXG4gICk7XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gTW9jayBUTURCIENsaWVudCBmb3IgVGVzdGluZ1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBhIG1vY2sgVE1EQiBjbGllbnQgZm9yIHRlc3RpbmdcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2NrVE1EQkNsaWVudCgpOiBhbnkge1xyXG4gIHJldHVybiB7XHJcbiAgICBkaXNjb3Zlck1vdmllczogamVzdC5mbigpLFxyXG4gICAgZGlzY292ZXJUVjogamVzdC5mbigpLFxyXG4gICAgZGlzY292ZXI6IGplc3QuZm4oKSxcclxuICAgIGdldE1vdmllR2VucmVzOiBqZXN0LmZuKCksXHJcbiAgICBnZXRUVkdlbnJlczogamVzdC5mbigpLFxyXG4gICAgZ2V0R2VucmVzOiBqZXN0LmZuKCksXHJcbiAgICBnZXRNb3ZpZURldGFpbHM6IGplc3QuZm4oKSxcclxuICAgIGdldFRWRGV0YWlsczogamVzdC5mbigpLFxyXG4gICAgZGlzY292ZXJNdWx0aXBsZVBhZ2VzOiBqZXN0LmZuKCksXHJcbiAgICBnZXRDb250ZW50V2l0aEFsbEdlbnJlczogamVzdC5mbigpLFxyXG4gICAgZ2V0Q29udGVudFdpdGhBbnlHZW5yZTogamVzdC5mbigpLFxyXG4gICAgZ2V0UG9wdWxhckNvbnRlbnQ6IGplc3QuZm4oKVxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmF0ZXMgbW9jayBjb250ZW50IGZvciB0ZXN0aW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVNb2NrQ29udGVudChcclxuICBjb3VudDogbnVtYmVyLCBcclxuICBtZWRpYVR5cGU6IE1lZGlhVHlwZSwgXHJcbiAgZ2VucmVJZHM6IG51bWJlcltdID0gW11cclxuKTogVE1EQkNvbnRlbnRbXSB7XHJcbiAgcmV0dXJuIEFycmF5LmZyb20oeyBsZW5ndGg6IGNvdW50IH0sIChfLCBpbmRleCkgPT4ge1xyXG4gICAgY29uc3QgYmFzZUdlbnJlcyA9IGdlbnJlSWRzLmxlbmd0aCA+IDAgPyBnZW5yZUlkcyA6IFsyOCwgMTJdOyAvLyBEZWZhdWx0IHRvIEFjdGlvbiwgQWR2ZW50dXJlXHJcbiAgICBcclxuICAgIC8vIEFkZCBzb21lIHZhcmlldHkgaW4gZ2VucmUgY29tYmluYXRpb25zXHJcbiAgICBjb25zdCBjb250ZW50R2VucmVzID0gaW5kZXggJSAzID09PSAwIFxyXG4gICAgICA/IGJhc2VHZW5yZXMgLy8gU29tZSBjb250ZW50IGhhcyBhbGwgcmVxdWVzdGVkIGdlbnJlc1xyXG4gICAgICA6IGluZGV4ICUgMiA9PT0gMCBcclxuICAgICAgICA/IFtiYXNlR2VucmVzWzBdXSAvLyBTb21lIGNvbnRlbnQgaGFzIHBhcnRpYWwgZ2VucmVzXHJcbiAgICAgICAgOiBbMzUsIDE4XTsgLy8gU29tZSBjb250ZW50IGhhcyBkaWZmZXJlbnQgZ2VucmVzIChDb21lZHksIERyYW1hKVxyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpZDogKDEwMDAgKyBpbmRleCkudG9TdHJpbmcoKSxcclxuICAgICAgdGl0bGU6IG1lZGlhVHlwZSA9PT0gTWVkaWFUeXBlLk1PVklFIFxyXG4gICAgICAgID8gYFRlc3QgTW92aWUgJHtpbmRleCArIDF9YCBcclxuICAgICAgICA6IGBUZXN0IFRWIFNob3cgJHtpbmRleCArIDF9YCxcclxuICAgICAgcG9zdGVyX3BhdGg6IGAvdGVzdC1wb3N0ZXItJHtpbmRleH0uanBnYCxcclxuICAgICAgb3ZlcnZpZXc6IGBUZXN0IG92ZXJ2aWV3IGZvciBjb250ZW50ICR7aW5kZXggKyAxfWAsXHJcbiAgICAgIGdlbnJlX2lkczogY29udGVudEdlbnJlcyxcclxuICAgICAgdm90ZV9hdmVyYWdlOiA1LjAgKyAoaW5kZXggJSA1KSwgLy8gVmFyeSByYXRpbmdzIGZyb20gNS4wIHRvIDkuMFxyXG4gICAgICByZWxlYXNlX2RhdGU6IGAyMDIkeyhpbmRleCAlIDQpfS0wMS0wMWBcclxuICAgIH07XHJcbiAgfSk7XHJcbn0iXX0=