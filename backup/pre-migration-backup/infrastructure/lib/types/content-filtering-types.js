"use strict";
/**
 * Content Filtering Types
 *
 * Shared TypeScript interfaces and types for the advanced content filtering system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterImmutabilityError = exports.ContentLoadingError = exports.FilterValidationError = void 0;
// Error types
class FilterValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FilterValidationError';
    }
}
exports.FilterValidationError = FilterValidationError;
class ContentLoadingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContentLoadingError';
    }
}
exports.ContentLoadingError = ContentLoadingError;
class FilterImmutabilityError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FilterImmutabilityError';
    }
}
exports.FilterImmutabilityError = FilterImmutabilityError;
