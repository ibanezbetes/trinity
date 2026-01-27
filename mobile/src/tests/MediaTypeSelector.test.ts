/**
 * Unit Tests: MediaTypeSelector Component
 * 
 * **Feature: advanced-content-filtering, Property 1: Media Type Selection Flow**
 * **Validates: Requirements 1.2, 1.4**
 * 
 * Tests the MediaTypeSelector component functionality including selection storage,
 * callback triggering, and visual state management.
 */

import { render, fireEvent } from '@testing-library/react-native';
import React from 'react';
import MediaTypeSelector, { MediaType } from '../components/MediaTypeSelector';

describe('MediaTypeSelector Component', () => {
  
  test('should render both media type options', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} />
    );
    
    expect(getByTestId('media-type-movie')).toBeTruthy();
    expect(getByTestId('media-type-tv')).toBeTruthy();
  });
  
  test('should trigger callback when MOVIE is selected', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} />
    );
    
    fireEvent.press(getByTestId('media-type-movie'));
    
    expect(mockOnSelect).toHaveBeenCalledWith('MOVIE');
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });
  
  test('should trigger callback when TV is selected', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} />
    );
    
    fireEvent.press(getByTestId('media-type-tv'));
    
    expect(mockOnSelect).toHaveBeenCalledWith('TV');
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });
  
  test('should not trigger callback when disabled', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} disabled={true} />
    );
    
    fireEvent.press(getByTestId('media-type-movie'));
    fireEvent.press(getByTestId('media-type-tv'));
    
    expect(mockOnSelect).not.toHaveBeenCalled();
  });
  
  test('should handle multiple selections of the same type', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} />
    );
    
    const movieButton = getByTestId('media-type-movie');
    
    fireEvent.press(movieButton);
    fireEvent.press(movieButton);
    fireEvent.press(movieButton);
    
    expect(mockOnSelect).toHaveBeenCalledTimes(3);
    expect(mockOnSelect).toHaveBeenNthCalledWith(1, 'MOVIE');
    expect(mockOnSelect).toHaveBeenNthCalledWith(2, 'MOVIE');
    expect(mockOnSelect).toHaveBeenNthCalledWith(3, 'MOVIE');
  });
  
  test('should handle alternating selections between types', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} />
    );
    
    const movieButton = getByTestId('media-type-movie');
    const tvButton = getByTestId('media-type-tv');
    
    fireEvent.press(movieButton);
    fireEvent.press(tvButton);
    fireEvent.press(movieButton);
    
    expect(mockOnSelect).toHaveBeenCalledTimes(3);
    expect(mockOnSelect).toHaveBeenNthCalledWith(1, 'MOVIE');
    expect(mockOnSelect).toHaveBeenNthCalledWith(2, 'TV');
    expect(mockOnSelect).toHaveBeenNthCalledWith(3, 'MOVIE');
  });
  
  test('should render with pre-selected type', () => {
    const mockOnSelect = jest.fn();
    
    const { getByTestId } = render(
      <MediaTypeSelector 
        selectedType="MOVIE" 
        onSelect={mockOnSelect} 
      />
    );
    
    // Component should render without errors with pre-selected type
    expect(getByTestId('media-type-movie')).toBeTruthy();
    expect(getByTestId('media-type-tv')).toBeTruthy();
  });
  
  test('Property 1: Media Type Selection Flow - Complete Flow Test', () => {
    // Test the complete flow: selection -> storage -> callback triggering
    let storedSelection: MediaType | undefined;
    let callbackTriggered = false;
    
    const mockOnSelect = jest.fn((type: MediaType) => {
      callbackTriggered = true;
      storedSelection = type;
    });
    
    const { getByTestId } = render(
      <MediaTypeSelector onSelect={mockOnSelect} />
    );
    
    // Simulate media type selection
    fireEvent.press(getByTestId('media-type-movie'));
    
    // Verify the complete flow
    expect(callbackTriggered).toBe(true);
    expect(storedSelection).toBe('MOVIE');
    expect(mockOnSelect).toHaveBeenCalledWith('MOVIE');
    
    // Reset for TV selection
    callbackTriggered = false;
    storedSelection = undefined;
    mockOnSelect.mockClear();
    
    // Test TV selection
    fireEvent.press(getByTestId('media-type-tv'));
    
    expect(callbackTriggered).toBe(true);
    expect(storedSelection).toBe('TV');
    expect(mockOnSelect).toHaveBeenCalledWith('TV');
  });
});