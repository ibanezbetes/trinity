/**
 * Unit Tests: GenreSelector Component
 * 
 * **Feature: advanced-content-filtering, Property 3: Genre Selection Limits**
 * **Validates: Requirements 2.1, 2.2, 2.3, 8.2, 8.3**
 * 
 * Tests the GenreSelector component functionality including genre selection limits,
 * validation feedback, and UI state management.
 */

import { render, fireEvent } from '@testing-library/react-native';
import React from 'react';
import GenreSelector, { Genre } from '../components/GenreSelector';

const mockGenres: Genre[] = [
  { id: 28, name: 'Action', icon: '💥' },
  { id: 12, name: 'Adventure', icon: '🗺️' },
  { id: 35, name: 'Comedy', icon: '😂' },
  { id: 18, name: 'Drama', icon: '🎭' },
  { id: 27, name: 'Horror', icon: '👻' },
  { id: 53, name: 'Thriller', icon: '😱' },
];

describe('GenreSelector Component', () => {
  
  test('should render all provided genres', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[]}
        onSelectionChange={mockOnSelectionChange}
      />
    );
    
    mockGenres.forEach(genre => {
      expect(getByTestId(`genre-${genre.id}`)).toBeTruthy();
    });
  });
  
  test('should allow selection of genres up to maximum limit', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[]}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    // Select first genre
    fireEvent.press(getByTestId('genre-28'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([28]);
    
    // Reset mock and test with first genre already selected
    mockOnSelectionChange.mockClear();
    const { getByTestId: getByTestId2 } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28]}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    fireEvent.press(getByTestId2('genre-12'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([28, 12]);
    
    // Reset mock and test with two genres already selected
    mockOnSelectionChange.mockClear();
    const { getByTestId: getByTestId3 } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12]}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    fireEvent.press(getByTestId3('genre-35'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([28, 12, 35]);
  });
  
  test('should prevent selection beyond maximum limit', () => {
    const mockOnSelectionChange = jest.fn();
    const { Alert } = require('react-native');
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12, 35]} // Already at max (3)
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    // Try to select fourth genre
    fireEvent.press(getByTestId('genre-18'));
    
    // Should not trigger selection change
    expect(mockOnSelectionChange).not.toHaveBeenCalled();
    
    // Should show alert
    expect(Alert.alert).toHaveBeenCalledWith(
      'Límite alcanzado',
      'Puedes seleccionar máximo 3 géneros'
    );
  });
  
  test('should allow deselection of already selected genres', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12]}
        onSelectionChange={mockOnSelectionChange}
      />
    );
    
    // Deselect first genre
    fireEvent.press(getByTestId('genre-28'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([12]);
    
    // Reset mock and test with only second genre selected
    mockOnSelectionChange.mockClear();
    const { getByTestId: getByTestId2 } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[12]}
        onSelectionChange={mockOnSelectionChange}
      />
    );
    
    fireEvent.press(getByTestId2('genre-12'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
  });
  
  test('should disable unselected genres when maximum is reached', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12, 35]} // At maximum
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    // Unselected genres should be disabled
    const unselectedGenre = getByTestId('genre-18');
    expect(unselectedGenre.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opacity: 0.4 })
      ])
    );
  });
  
  test('should not disable selected genres even when maximum is reached', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12, 35]} // At maximum
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    // Selected genres should still be pressable for deselection
    fireEvent.press(getByTestId('genre-28'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([12, 35]);
  });
  
  test('should show selection counter when genres are selected', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByText } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12]}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    expect(getByText('2 de 3 seleccionados')).toBeTruthy();
  });
  
  test('should handle disabled state correctly', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[]}
        onSelectionChange={mockOnSelectionChange}
        disabled={true}
      />
    );
    
    // Try to select a genre while disabled
    fireEvent.press(getByTestId('genre-28'));
    
    // Should not trigger selection change
    expect(mockOnSelectionChange).not.toHaveBeenCalled();
  });
  
  test('should show loading state', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByText } = render(
      <GenreSelector
        genres={[]}
        selectedGenres={[]}
        onSelectionChange={mockOnSelectionChange}
        loading={true}
      />
    );
    
    expect(getByText('Cargando géneros...')).toBeTruthy();
  });
  
  test('should show empty state when no genres available', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByText } = render(
      <GenreSelector
        genres={[]}
        selectedGenres={[]}
        onSelectionChange={mockOnSelectionChange}
        mediaType="MOVIE"
      />
    );
    
    expect(getByText('No hay géneros disponibles para películas')).toBeTruthy();
  });
  
  test('Property 3: Genre Selection Limits - Complete Flow Test', () => {
    // Test the complete genre selection flow with limits
    let currentSelection: number[] = [];
    let validationTriggered = false;
    
    const mockOnSelectionChange = jest.fn((selection: number[]) => {
      currentSelection = selection;
    });
    
    const { Alert } = require('react-native');
    Alert.alert.mockImplementation(() => {
      validationTriggered = true;
    });
    
    const { getByTestId, rerender } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={currentSelection}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    // Select genres up to limit
    fireEvent.press(getByTestId('genre-28'));
    currentSelection = [28];
    
    rerender(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={currentSelection}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    fireEvent.press(getByTestId('genre-12'));
    currentSelection = [28, 12];
    
    rerender(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={currentSelection}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    fireEvent.press(getByTestId('genre-35'));
    currentSelection = [28, 12, 35];
    
    rerender(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={currentSelection}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={3}
      />
    );
    
    // Try to select beyond limit
    fireEvent.press(getByTestId('genre-18'));
    
    // Verify limit enforcement
    expect(currentSelection).toEqual([28, 12, 35]);
    expect(validationTriggered).toBe(true);
    expect(mockOnSelectionChange).toHaveBeenCalledTimes(3); // Only 3 successful selections
  });
  
  test('should handle custom maximum selection limits', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28]}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={2} // Custom limit
      />
    );
    
    // Select second genre (should work)
    fireEvent.press(getByTestId('genre-12'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([28, 12]);
    
    // Reset mock and test with max selection reached
    mockOnSelectionChange.mockClear();
    const { getByTestId: getByTestId2 } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28, 12]}
        onSelectionChange={mockOnSelectionChange}
        maxSelection={2} // Custom limit
      />
    );
    
    // Try to select third genre (should be prevented)
    fireEvent.press(getByTestId2('genre-35'));
    expect(mockOnSelectionChange).not.toHaveBeenCalled();
  });
  
  test('should allow zero genre selection', () => {
    const mockOnSelectionChange = jest.fn();
    
    const { getByTestId } = render(
      <GenreSelector
        genres={mockGenres}
        selectedGenres={[28]}
        onSelectionChange={mockOnSelectionChange}
      />
    );
    
    // Deselect the only selected genre
    fireEvent.press(getByTestId('genre-28'));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
  });
});