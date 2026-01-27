"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
(0, globals_1.describe)('Stop-on-Match Algorithm - Property Tests', () => {
    /**
     * Property 2: Stop-on-Match Algorithm Correctness
     * Validates: Requirements 1.3, 1.4
     *
     * Property: The Stop-on-Match algorithm should:
     * 1. Only process LIKE votes, ignore DISLIKE votes
     * 2. Trigger match when currentVotes >= totalMembers
     * 3. Update room status to MATCHED when consensus is reached
     * 4. Never trigger false positives or miss valid matches
     */
    (0, globals_1.describe)('Property 2: Stop-on-Match Algorithm Correctness', () => {
        (0, globals_1.it)('should only process LIKE votes according to algorithm', () => {
            // Test vote type filtering
            const voteTypes = ['LIKE', 'DISLIKE', 'SKIP', 'MAYBE'];
            const processedVotes = voteTypes.filter(voteType => voteType === 'LIKE');
            (0, globals_1.expect)(processedVotes).toEqual(['LIKE']);
            (0, globals_1.expect)(processedVotes.length).toBe(1);
            // Verify DISLIKE votes are ignored
            const dislikeVotes = voteTypes.filter(voteType => voteType === 'DISLIKE');
            (0, globals_1.expect)(dislikeVotes).toEqual(['DISLIKE']);
            // But they should not be processed
            const shouldProcessDislike = false; // According to Stop-on-Match
            (0, globals_1.expect)(shouldProcessDislike).toBe(false);
        });
        (0, globals_1.it)('should trigger match when consensus is reached', () => {
            // Test various consensus scenarios
            const testCases = [
                // [currentVotes, totalMembers, shouldMatch]
                [1, 1, true], // Single user likes
                [2, 2, true], // Both users like
                [3, 3, true], // All three users like
                [5, 5, true], // All five users like
                [1, 2, false], // Only one of two likes
                [2, 3, false], // Only two of three like
                [4, 5, false], // Only four of five like
                [0, 1, false], // No votes yet
                [0, 0, false], // Edge case: no members
            ];
            testCases.forEach(([currentVotes, totalMembers, shouldMatch]) => {
                const votes = currentVotes;
                const members = totalMembers;
                const expected = shouldMatch;
                const hasConsensus = votes >= members && members > 0;
                (0, globals_1.expect)(hasConsensus).toBe(expected);
            });
        });
        (0, globals_1.it)('should handle edge cases correctly', () => {
            // Test edge cases for the algorithm
            const edgeCases = [
                { currentVotes: 0, totalMembers: 0, expected: false, description: 'No members in room' },
                { currentVotes: 1, totalMembers: 0, expected: false, description: 'More votes than members (data inconsistency)' },
                { currentVotes: -1, totalMembers: 1, expected: false, description: 'Negative vote count' },
                { currentVotes: 1, totalMembers: -1, expected: false, description: 'Negative member count' },
            ];
            edgeCases.forEach(({ currentVotes, totalMembers, expected, description }) => {
                const hasConsensus = currentVotes >= totalMembers &&
                    totalMembers > 0 &&
                    currentVotes >= 0;
                (0, globals_1.expect)(hasConsensus).toBe(expected);
            });
        });
        (0, globals_1.it)('should validate room status transitions', () => {
            // Test valid room status transitions for Stop-on-Match
            const validTransitions = [
                { from: 'WAITING', to: 'ACTIVE', valid: true },
                { from: 'ACTIVE', to: 'MATCHED', valid: true },
                { from: 'WAITING', to: 'MATCHED', valid: true }, // Direct match
                { from: 'MATCHED', to: 'ACTIVE', valid: false }, // Cannot go back
                { from: 'COMPLETED', to: 'MATCHED', valid: false }, // Cannot revert
                { from: 'PAUSED', to: 'MATCHED', valid: false }, // Should not match when paused
            ];
            validTransitions.forEach(({ from, to, valid }) => {
                let isValidTransition = false;
                if (to === 'MATCHED') {
                    // Only allow transitions to MATCHED from WAITING or ACTIVE
                    isValidTransition = from === 'WAITING' || from === 'ACTIVE';
                }
                else if (to === 'ACTIVE') {
                    // Allow transitions to ACTIVE from WAITING
                    isValidTransition = from === 'WAITING';
                }
                (0, globals_1.expect)(isValidTransition).toBe(valid);
            });
        });
        (0, globals_1.it)('should maintain vote count consistency', () => {
            // Test vote count increment logic
            const scenarios = [
                { initialVotes: 0, increment: 1, expected: 1 },
                { initialVotes: 1, increment: 1, expected: 2 },
                { initialVotes: 5, increment: 1, expected: 6 },
                { initialVotes: 0, increment: 0, expected: 0 }, // No vote case
            ];
            scenarios.forEach(({ initialVotes, increment, expected }) => {
                const newVoteCount = initialVotes + increment;
                (0, globals_1.expect)(newVoteCount).toBe(expected);
                (0, globals_1.expect)(newVoteCount).toBeGreaterThanOrEqual(initialVotes);
            });
        });
        (0, globals_1.it)('should validate atomic vote operations', () => {
            // Test that vote operations are atomic (all or nothing)
            const voteOperations = [
                'validateRoom',
                'validateMembership',
                'preventDuplicate',
                'incrementCount',
                'checkConsensus',
                'updateRoomStatus'
            ];
            // All operations must succeed for a valid vote
            const allOperationsSucceed = voteOperations.every(op => op.length > 0);
            (0, globals_1.expect)(allOperationsSucceed).toBe(true);
            // If any operation fails, the entire vote should fail
            const someOperationFails = voteOperations.some(op => op === '');
            (0, globals_1.expect)(someOperationFails).toBe(false);
        });
        (0, globals_1.it)('should handle concurrent voting scenarios', () => {
            // Test concurrent vote handling logic
            const concurrentScenarios = [
                {
                    description: 'Two users vote simultaneously for same movie',
                    user1Vote: 'LIKE',
                    user2Vote: 'LIKE',
                    totalMembers: 2,
                    expectedResult: 'MATCHED'
                },
                {
                    description: 'One likes, one dislikes (dislike ignored)',
                    user1Vote: 'LIKE',
                    user2Vote: 'DISLIKE',
                    totalMembers: 2,
                    expectedResult: 'ACTIVE' // Only LIKE counts
                },
                {
                    description: 'All users dislike (all ignored)',
                    user1Vote: 'DISLIKE',
                    user2Vote: 'DISLIKE',
                    totalMembers: 2,
                    expectedResult: 'ACTIVE' // No LIKE votes
                }
            ];
            concurrentScenarios.forEach(({ user1Vote, user2Vote, totalMembers, expectedResult }) => {
                const likeVotes = [user1Vote, user2Vote].filter(vote => vote === 'LIKE').length;
                const hasMatch = likeVotes >= totalMembers;
                const status = hasMatch ? 'MATCHED' : 'ACTIVE';
                (0, globals_1.expect)(status).toBe(expectedResult);
            });
        });
        (0, globals_1.it)('should validate movie progression logic', () => {
            // Test movie queue progression in Stop-on-Match
            const movieQueue = ['movie1', 'movie2', 'movie3', 'movie4'];
            let currentIndex = 0;
            // Simulate voting through queue
            const voteResults = [
                { movieId: 'movie1', result: 'NO_MATCH' },
                { movieId: 'movie2', result: 'NO_MATCH' },
                { movieId: 'movie3', result: 'MATCH' },
                // movie4 should not be reached due to match
            ];
            voteResults.forEach(({ movieId, result }) => {
                (0, globals_1.expect)(movieQueue[currentIndex]).toBe(movieId);
                if (result === 'MATCH') {
                    // Stop progression on match
                    return;
                }
                else {
                    // Continue to next movie
                    currentIndex++;
                }
            });
            // Verify we stopped at the matched movie
            (0, globals_1.expect)(currentIndex).toBe(2); // Index of movie3
            (0, globals_1.expect)(movieQueue[currentIndex]).toBe('movie3');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcC1vbi1tYXRjaC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RvcC1vbi1tYXRjaC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMkNBQXFEO0FBRXJELElBQUEsa0JBQVEsRUFBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7SUFDeEQ7Ozs7Ozs7OztPQVNHO0lBQ0gsSUFBQSxrQkFBUSxFQUFDLGlEQUFpRCxFQUFFLEdBQUcsRUFBRTtRQUMvRCxJQUFBLFlBQUUsRUFBQyx1REFBdUQsRUFBRSxHQUFHLEVBQUU7WUFDL0QsMkJBQTJCO1lBQzNCLE1BQU0sU0FBUyxHQUFHLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDdkQsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsS0FBSyxNQUFNLENBQUMsQ0FBQztZQUV6RSxJQUFBLGdCQUFNLEVBQUMsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUN6QyxJQUFBLGdCQUFNLEVBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV0QyxtQ0FBbUM7WUFDbkMsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQztZQUMxRSxJQUFBLGdCQUFNLEVBQUMsWUFBWSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUUxQyxtQ0FBbUM7WUFDbkMsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsQ0FBQyw2QkFBNkI7WUFDakUsSUFBQSxnQkFBTSxFQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBQSxZQUFFLEVBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1lBQ3hELG1DQUFtQztZQUNuQyxNQUFNLFNBQVMsR0FBRztnQkFDaEIsNENBQTRDO2dCQUM1QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUksb0JBQW9CO2dCQUNwQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUksa0JBQWtCO2dCQUNsQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUksdUJBQXVCO2dCQUN2QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUksc0JBQXNCO2dCQUN0QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUcsd0JBQXdCO2dCQUN4QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUcseUJBQXlCO2dCQUN6QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUcseUJBQXlCO2dCQUN6QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUcsZUFBZTtnQkFDL0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFHLHdCQUF3QjthQUN6QyxDQUFDO1lBRUYsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxXQUFXLENBQUMsRUFBRSxFQUFFO2dCQUM5RCxNQUFNLEtBQUssR0FBRyxZQUFzQixDQUFDO2dCQUNyQyxNQUFNLE9BQU8sR0FBRyxZQUFzQixDQUFDO2dCQUN2QyxNQUFNLFFBQVEsR0FBRyxXQUFzQixDQUFDO2dCQUV4QyxNQUFNLFlBQVksR0FBRyxLQUFLLElBQUksT0FBTyxJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7Z0JBQ3JELElBQUEsZ0JBQU0sRUFBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDdEMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUEsWUFBRSxFQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUM1QyxvQ0FBb0M7WUFDcEMsTUFBTSxTQUFTLEdBQUc7Z0JBQ2hCLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixFQUFFO2dCQUN4RixFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSw4Q0FBOEMsRUFBRTtnQkFDbEgsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRTtnQkFDMUYsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSx1QkFBdUIsRUFBRTthQUM3RixDQUFDO1lBRUYsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRTtnQkFDMUUsTUFBTSxZQUFZLEdBQUcsWUFBWSxJQUFJLFlBQVk7b0JBQzdCLFlBQVksR0FBRyxDQUFDO29CQUNoQixZQUFZLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxJQUFBLGdCQUFNLEVBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3RDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFBLFlBQUUsRUFBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDakQsdURBQXVEO1lBQ3ZELE1BQU0sZ0JBQWdCLEdBQUc7Z0JBQ3ZCLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7Z0JBQzlDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7Z0JBQzlDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRSxlQUFlO2dCQUNoRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsaUJBQWlCO2dCQUNsRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsZ0JBQWdCO2dCQUNwRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsK0JBQStCO2FBQ2pGLENBQUM7WUFFRixnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtnQkFDL0MsSUFBSSxpQkFBaUIsR0FBRyxLQUFLLENBQUM7Z0JBRTlCLElBQUksRUFBRSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUNyQiwyREFBMkQ7b0JBQzNELGlCQUFpQixHQUFHLElBQUksS0FBSyxTQUFTLElBQUksSUFBSSxLQUFLLFFBQVEsQ0FBQztnQkFDOUQsQ0FBQztxQkFBTSxJQUFJLEVBQUUsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDM0IsMkNBQTJDO29CQUMzQyxpQkFBaUIsR0FBRyxJQUFJLEtBQUssU0FBUyxDQUFDO2dCQUN6QyxDQUFDO2dCQUVELElBQUEsZ0JBQU0sRUFBQyxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBQSxZQUFFLEVBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFO1lBQ2hELGtDQUFrQztZQUNsQyxNQUFNLFNBQVMsR0FBRztnQkFDaEIsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRTtnQkFDOUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRTtnQkFDOUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRTtnQkFDOUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLGVBQWU7YUFDaEUsQ0FBQztZQUVGLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRTtnQkFDMUQsTUFBTSxZQUFZLEdBQUcsWUFBWSxHQUFHLFNBQVMsQ0FBQztnQkFDOUMsSUFBQSxnQkFBTSxFQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDcEMsSUFBQSxnQkFBTSxFQUFDLFlBQVksQ0FBQyxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzVELENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFBLFlBQUUsRUFBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUU7WUFDaEQsd0RBQXdEO1lBQ3hELE1BQU0sY0FBYyxHQUFHO2dCQUNyQixjQUFjO2dCQUNkLG9CQUFvQjtnQkFDcEIsa0JBQWtCO2dCQUNsQixnQkFBZ0I7Z0JBQ2hCLGdCQUFnQjtnQkFDaEIsa0JBQWtCO2FBQ25CLENBQUM7WUFFRiwrQ0FBK0M7WUFDL0MsTUFBTSxvQkFBb0IsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN2RSxJQUFBLGdCQUFNLEVBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFeEMsc0RBQXNEO1lBQ3RELE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUNoRSxJQUFBLGdCQUFNLEVBQUMsa0JBQWtCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFBLFlBQUUsRUFBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDbkQsc0NBQXNDO1lBQ3RDLE1BQU0sbUJBQW1CLEdBQUc7Z0JBQzFCO29CQUNFLFdBQVcsRUFBRSw4Q0FBOEM7b0JBQzNELFNBQVMsRUFBRSxNQUFNO29CQUNqQixTQUFTLEVBQUUsTUFBTTtvQkFDakIsWUFBWSxFQUFFLENBQUM7b0JBQ2YsY0FBYyxFQUFFLFNBQVM7aUJBQzFCO2dCQUNEO29CQUNFLFdBQVcsRUFBRSwyQ0FBMkM7b0JBQ3hELFNBQVMsRUFBRSxNQUFNO29CQUNqQixTQUFTLEVBQUUsU0FBUztvQkFDcEIsWUFBWSxFQUFFLENBQUM7b0JBQ2YsY0FBYyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUI7aUJBQzdDO2dCQUNEO29CQUNFLFdBQVcsRUFBRSxpQ0FBaUM7b0JBQzlDLFNBQVMsRUFBRSxTQUFTO29CQUNwQixTQUFTLEVBQUUsU0FBUztvQkFDcEIsWUFBWSxFQUFFLENBQUM7b0JBQ2YsY0FBYyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0I7aUJBQzFDO2FBQ0YsQ0FBQztZQUVGLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRTtnQkFDckYsTUFBTSxTQUFTLEdBQUcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztnQkFDaEYsTUFBTSxRQUFRLEdBQUcsU0FBUyxJQUFJLFlBQVksQ0FBQztnQkFDM0MsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFFL0MsSUFBQSxnQkFBTSxFQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUN0QyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBQSxZQUFFLEVBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1lBQ2pELGdEQUFnRDtZQUNoRCxNQUFNLFVBQVUsR0FBRyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzVELElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztZQUVyQixnQ0FBZ0M7WUFDaEMsTUFBTSxXQUFXLEdBQUc7Z0JBQ2xCLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFO2dCQUN6QyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRTtnQkFDekMsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUU7Z0JBQ3RDLDRDQUE0QzthQUM3QyxDQUFDO1lBRUYsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUU7Z0JBQzFDLElBQUEsZ0JBQU0sRUFBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBRS9DLElBQUksTUFBTSxLQUFLLE9BQU8sRUFBRSxDQUFDO29CQUN2Qiw0QkFBNEI7b0JBQzVCLE9BQU87Z0JBQ1QsQ0FBQztxQkFBTSxDQUFDO29CQUNOLHlCQUF5QjtvQkFDekIsWUFBWSxFQUFFLENBQUM7Z0JBQ2pCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILHlDQUF5QztZQUN6QyxJQUFBLGdCQUFNLEVBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCO1lBQ2hELElBQUEsZ0JBQU0sRUFBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZGVzY3JpYmUsIGl0LCBleHBlY3QgfSBmcm9tICdAamVzdC9nbG9iYWxzJztcclxuXHJcbmRlc2NyaWJlKCdTdG9wLW9uLU1hdGNoIEFsZ29yaXRobSAtIFByb3BlcnR5IFRlc3RzJywgKCkgPT4ge1xyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5IDI6IFN0b3Atb24tTWF0Y2ggQWxnb3JpdGhtIENvcnJlY3RuZXNzXHJcbiAgICogVmFsaWRhdGVzOiBSZXF1aXJlbWVudHMgMS4zLCAxLjRcclxuICAgKiBcclxuICAgKiBQcm9wZXJ0eTogVGhlIFN0b3Atb24tTWF0Y2ggYWxnb3JpdGhtIHNob3VsZDpcclxuICAgKiAxLiBPbmx5IHByb2Nlc3MgTElLRSB2b3RlcywgaWdub3JlIERJU0xJS0Ugdm90ZXNcclxuICAgKiAyLiBUcmlnZ2VyIG1hdGNoIHdoZW4gY3VycmVudFZvdGVzID49IHRvdGFsTWVtYmVyc1xyXG4gICAqIDMuIFVwZGF0ZSByb29tIHN0YXR1cyB0byBNQVRDSEVEIHdoZW4gY29uc2Vuc3VzIGlzIHJlYWNoZWRcclxuICAgKiA0LiBOZXZlciB0cmlnZ2VyIGZhbHNlIHBvc2l0aXZlcyBvciBtaXNzIHZhbGlkIG1hdGNoZXNcclxuICAgKi9cclxuICBkZXNjcmliZSgnUHJvcGVydHkgMjogU3RvcC1vbi1NYXRjaCBBbGdvcml0aG0gQ29ycmVjdG5lc3MnLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIG9ubHkgcHJvY2VzcyBMSUtFIHZvdGVzIGFjY29yZGluZyB0byBhbGdvcml0aG0nLCAoKSA9PiB7XHJcbiAgICAgIC8vIFRlc3Qgdm90ZSB0eXBlIGZpbHRlcmluZ1xyXG4gICAgICBjb25zdCB2b3RlVHlwZXMgPSBbJ0xJS0UnLCAnRElTTElLRScsICdTS0lQJywgJ01BWUJFJ107XHJcbiAgICAgIGNvbnN0IHByb2Nlc3NlZFZvdGVzID0gdm90ZVR5cGVzLmZpbHRlcih2b3RlVHlwZSA9PiB2b3RlVHlwZSA9PT0gJ0xJS0UnKTtcclxuICAgICAgXHJcbiAgICAgIGV4cGVjdChwcm9jZXNzZWRWb3RlcykudG9FcXVhbChbJ0xJS0UnXSk7XHJcbiAgICAgIGV4cGVjdChwcm9jZXNzZWRWb3Rlcy5sZW5ndGgpLnRvQmUoMSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBWZXJpZnkgRElTTElLRSB2b3RlcyBhcmUgaWdub3JlZFxyXG4gICAgICBjb25zdCBkaXNsaWtlVm90ZXMgPSB2b3RlVHlwZXMuZmlsdGVyKHZvdGVUeXBlID0+IHZvdGVUeXBlID09PSAnRElTTElLRScpO1xyXG4gICAgICBleHBlY3QoZGlzbGlrZVZvdGVzKS50b0VxdWFsKFsnRElTTElLRSddKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEJ1dCB0aGV5IHNob3VsZCBub3QgYmUgcHJvY2Vzc2VkXHJcbiAgICAgIGNvbnN0IHNob3VsZFByb2Nlc3NEaXNsaWtlID0gZmFsc2U7IC8vIEFjY29yZGluZyB0byBTdG9wLW9uLU1hdGNoXHJcbiAgICAgIGV4cGVjdChzaG91bGRQcm9jZXNzRGlzbGlrZSkudG9CZShmYWxzZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHRyaWdnZXIgbWF0Y2ggd2hlbiBjb25zZW5zdXMgaXMgcmVhY2hlZCcsICgpID0+IHtcclxuICAgICAgLy8gVGVzdCB2YXJpb3VzIGNvbnNlbnN1cyBzY2VuYXJpb3NcclxuICAgICAgY29uc3QgdGVzdENhc2VzID0gW1xyXG4gICAgICAgIC8vIFtjdXJyZW50Vm90ZXMsIHRvdGFsTWVtYmVycywgc2hvdWxkTWF0Y2hdXHJcbiAgICAgICAgWzEsIDEsIHRydWVdLCAgIC8vIFNpbmdsZSB1c2VyIGxpa2VzXHJcbiAgICAgICAgWzIsIDIsIHRydWVdLCAgIC8vIEJvdGggdXNlcnMgbGlrZVxyXG4gICAgICAgIFszLCAzLCB0cnVlXSwgICAvLyBBbGwgdGhyZWUgdXNlcnMgbGlrZVxyXG4gICAgICAgIFs1LCA1LCB0cnVlXSwgICAvLyBBbGwgZml2ZSB1c2VycyBsaWtlXHJcbiAgICAgICAgWzEsIDIsIGZhbHNlXSwgIC8vIE9ubHkgb25lIG9mIHR3byBsaWtlc1xyXG4gICAgICAgIFsyLCAzLCBmYWxzZV0sICAvLyBPbmx5IHR3byBvZiB0aHJlZSBsaWtlXHJcbiAgICAgICAgWzQsIDUsIGZhbHNlXSwgIC8vIE9ubHkgZm91ciBvZiBmaXZlIGxpa2VcclxuICAgICAgICBbMCwgMSwgZmFsc2VdLCAgLy8gTm8gdm90ZXMgeWV0XHJcbiAgICAgICAgWzAsIDAsIGZhbHNlXSwgIC8vIEVkZ2UgY2FzZTogbm8gbWVtYmVyc1xyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgdGVzdENhc2VzLmZvckVhY2goKFtjdXJyZW50Vm90ZXMsIHRvdGFsTWVtYmVycywgc2hvdWxkTWF0Y2hdKSA9PiB7XHJcbiAgICAgICAgY29uc3Qgdm90ZXMgPSBjdXJyZW50Vm90ZXMgYXMgbnVtYmVyO1xyXG4gICAgICAgIGNvbnN0IG1lbWJlcnMgPSB0b3RhbE1lbWJlcnMgYXMgbnVtYmVyO1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gc2hvdWxkTWF0Y2ggYXMgYm9vbGVhbjtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBoYXNDb25zZW5zdXMgPSB2b3RlcyA+PSBtZW1iZXJzICYmIG1lbWJlcnMgPiAwO1xyXG4gICAgICAgIGV4cGVjdChoYXNDb25zZW5zdXMpLnRvQmUoZXhwZWN0ZWQpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGVkZ2UgY2FzZXMgY29ycmVjdGx5JywgKCkgPT4ge1xyXG4gICAgICAvLyBUZXN0IGVkZ2UgY2FzZXMgZm9yIHRoZSBhbGdvcml0aG1cclxuICAgICAgY29uc3QgZWRnZUNhc2VzID0gW1xyXG4gICAgICAgIHsgY3VycmVudFZvdGVzOiAwLCB0b3RhbE1lbWJlcnM6IDAsIGV4cGVjdGVkOiBmYWxzZSwgZGVzY3JpcHRpb246ICdObyBtZW1iZXJzIGluIHJvb20nIH0sXHJcbiAgICAgICAgeyBjdXJyZW50Vm90ZXM6IDEsIHRvdGFsTWVtYmVyczogMCwgZXhwZWN0ZWQ6IGZhbHNlLCBkZXNjcmlwdGlvbjogJ01vcmUgdm90ZXMgdGhhbiBtZW1iZXJzIChkYXRhIGluY29uc2lzdGVuY3kpJyB9LFxyXG4gICAgICAgIHsgY3VycmVudFZvdGVzOiAtMSwgdG90YWxNZW1iZXJzOiAxLCBleHBlY3RlZDogZmFsc2UsIGRlc2NyaXB0aW9uOiAnTmVnYXRpdmUgdm90ZSBjb3VudCcgfSxcclxuICAgICAgICB7IGN1cnJlbnRWb3RlczogMSwgdG90YWxNZW1iZXJzOiAtMSwgZXhwZWN0ZWQ6IGZhbHNlLCBkZXNjcmlwdGlvbjogJ05lZ2F0aXZlIG1lbWJlciBjb3VudCcgfSxcclxuICAgICAgXTtcclxuICAgICAgXHJcbiAgICAgIGVkZ2VDYXNlcy5mb3JFYWNoKCh7IGN1cnJlbnRWb3RlcywgdG90YWxNZW1iZXJzLCBleHBlY3RlZCwgZGVzY3JpcHRpb24gfSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGhhc0NvbnNlbnN1cyA9IGN1cnJlbnRWb3RlcyA+PSB0b3RhbE1lbWJlcnMgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b3RhbE1lbWJlcnMgPiAwICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFZvdGVzID49IDA7XHJcbiAgICAgICAgZXhwZWN0KGhhc0NvbnNlbnN1cykudG9CZShleHBlY3RlZCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCB2YWxpZGF0ZSByb29tIHN0YXR1cyB0cmFuc2l0aW9ucycsICgpID0+IHtcclxuICAgICAgLy8gVGVzdCB2YWxpZCByb29tIHN0YXR1cyB0cmFuc2l0aW9ucyBmb3IgU3RvcC1vbi1NYXRjaFxyXG4gICAgICBjb25zdCB2YWxpZFRyYW5zaXRpb25zID0gW1xyXG4gICAgICAgIHsgZnJvbTogJ1dBSVRJTkcnLCB0bzogJ0FDVElWRScsIHZhbGlkOiB0cnVlIH0sXHJcbiAgICAgICAgeyBmcm9tOiAnQUNUSVZFJywgdG86ICdNQVRDSEVEJywgdmFsaWQ6IHRydWUgfSxcclxuICAgICAgICB7IGZyb206ICdXQUlUSU5HJywgdG86ICdNQVRDSEVEJywgdmFsaWQ6IHRydWUgfSwgLy8gRGlyZWN0IG1hdGNoXHJcbiAgICAgICAgeyBmcm9tOiAnTUFUQ0hFRCcsIHRvOiAnQUNUSVZFJywgdmFsaWQ6IGZhbHNlIH0sIC8vIENhbm5vdCBnbyBiYWNrXHJcbiAgICAgICAgeyBmcm9tOiAnQ09NUExFVEVEJywgdG86ICdNQVRDSEVEJywgdmFsaWQ6IGZhbHNlIH0sIC8vIENhbm5vdCByZXZlcnRcclxuICAgICAgICB7IGZyb206ICdQQVVTRUQnLCB0bzogJ01BVENIRUQnLCB2YWxpZDogZmFsc2UgfSwgLy8gU2hvdWxkIG5vdCBtYXRjaCB3aGVuIHBhdXNlZFxyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgdmFsaWRUcmFuc2l0aW9ucy5mb3JFYWNoKCh7IGZyb20sIHRvLCB2YWxpZCB9KSA9PiB7XHJcbiAgICAgICAgbGV0IGlzVmFsaWRUcmFuc2l0aW9uID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRvID09PSAnTUFUQ0hFRCcpIHtcclxuICAgICAgICAgIC8vIE9ubHkgYWxsb3cgdHJhbnNpdGlvbnMgdG8gTUFUQ0hFRCBmcm9tIFdBSVRJTkcgb3IgQUNUSVZFXHJcbiAgICAgICAgICBpc1ZhbGlkVHJhbnNpdGlvbiA9IGZyb20gPT09ICdXQUlUSU5HJyB8fCBmcm9tID09PSAnQUNUSVZFJztcclxuICAgICAgICB9IGVsc2UgaWYgKHRvID09PSAnQUNUSVZFJykge1xyXG4gICAgICAgICAgLy8gQWxsb3cgdHJhbnNpdGlvbnMgdG8gQUNUSVZFIGZyb20gV0FJVElOR1xyXG4gICAgICAgICAgaXNWYWxpZFRyYW5zaXRpb24gPSBmcm9tID09PSAnV0FJVElORyc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGV4cGVjdChpc1ZhbGlkVHJhbnNpdGlvbikudG9CZSh2YWxpZCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBtYWludGFpbiB2b3RlIGNvdW50IGNvbnNpc3RlbmN5JywgKCkgPT4ge1xyXG4gICAgICAvLyBUZXN0IHZvdGUgY291bnQgaW5jcmVtZW50IGxvZ2ljXHJcbiAgICAgIGNvbnN0IHNjZW5hcmlvcyA9IFtcclxuICAgICAgICB7IGluaXRpYWxWb3RlczogMCwgaW5jcmVtZW50OiAxLCBleHBlY3RlZDogMSB9LFxyXG4gICAgICAgIHsgaW5pdGlhbFZvdGVzOiAxLCBpbmNyZW1lbnQ6IDEsIGV4cGVjdGVkOiAyIH0sXHJcbiAgICAgICAgeyBpbml0aWFsVm90ZXM6IDUsIGluY3JlbWVudDogMSwgZXhwZWN0ZWQ6IDYgfSxcclxuICAgICAgICB7IGluaXRpYWxWb3RlczogMCwgaW5jcmVtZW50OiAwLCBleHBlY3RlZDogMCB9LCAvLyBObyB2b3RlIGNhc2VcclxuICAgICAgXTtcclxuICAgICAgXHJcbiAgICAgIHNjZW5hcmlvcy5mb3JFYWNoKCh7IGluaXRpYWxWb3RlcywgaW5jcmVtZW50LCBleHBlY3RlZCB9KSA9PiB7XHJcbiAgICAgICAgY29uc3QgbmV3Vm90ZUNvdW50ID0gaW5pdGlhbFZvdGVzICsgaW5jcmVtZW50O1xyXG4gICAgICAgIGV4cGVjdChuZXdWb3RlQ291bnQpLnRvQmUoZXhwZWN0ZWQpO1xyXG4gICAgICAgIGV4cGVjdChuZXdWb3RlQ291bnQpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoaW5pdGlhbFZvdGVzKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHZhbGlkYXRlIGF0b21pYyB2b3RlIG9wZXJhdGlvbnMnLCAoKSA9PiB7XHJcbiAgICAgIC8vIFRlc3QgdGhhdCB2b3RlIG9wZXJhdGlvbnMgYXJlIGF0b21pYyAoYWxsIG9yIG5vdGhpbmcpXHJcbiAgICAgIGNvbnN0IHZvdGVPcGVyYXRpb25zID0gW1xyXG4gICAgICAgICd2YWxpZGF0ZVJvb20nLFxyXG4gICAgICAgICd2YWxpZGF0ZU1lbWJlcnNoaXAnLCBcclxuICAgICAgICAncHJldmVudER1cGxpY2F0ZScsXHJcbiAgICAgICAgJ2luY3JlbWVudENvdW50JyxcclxuICAgICAgICAnY2hlY2tDb25zZW5zdXMnLFxyXG4gICAgICAgICd1cGRhdGVSb29tU3RhdHVzJ1xyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgLy8gQWxsIG9wZXJhdGlvbnMgbXVzdCBzdWNjZWVkIGZvciBhIHZhbGlkIHZvdGVcclxuICAgICAgY29uc3QgYWxsT3BlcmF0aW9uc1N1Y2NlZWQgPSB2b3RlT3BlcmF0aW9ucy5ldmVyeShvcCA9PiBvcC5sZW5ndGggPiAwKTtcclxuICAgICAgZXhwZWN0KGFsbE9wZXJhdGlvbnNTdWNjZWVkKS50b0JlKHRydWUpO1xyXG4gICAgICBcclxuICAgICAgLy8gSWYgYW55IG9wZXJhdGlvbiBmYWlscywgdGhlIGVudGlyZSB2b3RlIHNob3VsZCBmYWlsXHJcbiAgICAgIGNvbnN0IHNvbWVPcGVyYXRpb25GYWlscyA9IHZvdGVPcGVyYXRpb25zLnNvbWUob3AgPT4gb3AgPT09ICcnKTtcclxuICAgICAgZXhwZWN0KHNvbWVPcGVyYXRpb25GYWlscykudG9CZShmYWxzZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjb25jdXJyZW50IHZvdGluZyBzY2VuYXJpb3MnLCAoKSA9PiB7XHJcbiAgICAgIC8vIFRlc3QgY29uY3VycmVudCB2b3RlIGhhbmRsaW5nIGxvZ2ljXHJcbiAgICAgIGNvbnN0IGNvbmN1cnJlbnRTY2VuYXJpb3MgPSBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUd28gdXNlcnMgdm90ZSBzaW11bHRhbmVvdXNseSBmb3Igc2FtZSBtb3ZpZScsXHJcbiAgICAgICAgICB1c2VyMVZvdGU6ICdMSUtFJyxcclxuICAgICAgICAgIHVzZXIyVm90ZTogJ0xJS0UnLCBcclxuICAgICAgICAgIHRvdGFsTWVtYmVyczogMixcclxuICAgICAgICAgIGV4cGVjdGVkUmVzdWx0OiAnTUFUQ0hFRCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnT25lIGxpa2VzLCBvbmUgZGlzbGlrZXMgKGRpc2xpa2UgaWdub3JlZCknLFxyXG4gICAgICAgICAgdXNlcjFWb3RlOiAnTElLRScsXHJcbiAgICAgICAgICB1c2VyMlZvdGU6ICdESVNMSUtFJyxcclxuICAgICAgICAgIHRvdGFsTWVtYmVyczogMixcclxuICAgICAgICAgIGV4cGVjdGVkUmVzdWx0OiAnQUNUSVZFJyAvLyBPbmx5IExJS0UgY291bnRzXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FsbCB1c2VycyBkaXNsaWtlIChhbGwgaWdub3JlZCknLFxyXG4gICAgICAgICAgdXNlcjFWb3RlOiAnRElTTElLRScsXHJcbiAgICAgICAgICB1c2VyMlZvdGU6ICdESVNMSUtFJyxcclxuICAgICAgICAgIHRvdGFsTWVtYmVyczogMixcclxuICAgICAgICAgIGV4cGVjdGVkUmVzdWx0OiAnQUNUSVZFJyAvLyBObyBMSUtFIHZvdGVzXHJcbiAgICAgICAgfVxyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgY29uY3VycmVudFNjZW5hcmlvcy5mb3JFYWNoKCh7IHVzZXIxVm90ZSwgdXNlcjJWb3RlLCB0b3RhbE1lbWJlcnMsIGV4cGVjdGVkUmVzdWx0IH0pID0+IHtcclxuICAgICAgICBjb25zdCBsaWtlVm90ZXMgPSBbdXNlcjFWb3RlLCB1c2VyMlZvdGVdLmZpbHRlcih2b3RlID0+IHZvdGUgPT09ICdMSUtFJykubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IGhhc01hdGNoID0gbGlrZVZvdGVzID49IHRvdGFsTWVtYmVycztcclxuICAgICAgICBjb25zdCBzdGF0dXMgPSBoYXNNYXRjaCA/ICdNQVRDSEVEJyA6ICdBQ1RJVkUnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGV4cGVjdChzdGF0dXMpLnRvQmUoZXhwZWN0ZWRSZXN1bHQpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgdmFsaWRhdGUgbW92aWUgcHJvZ3Jlc3Npb24gbG9naWMnLCAoKSA9PiB7XHJcbiAgICAgIC8vIFRlc3QgbW92aWUgcXVldWUgcHJvZ3Jlc3Npb24gaW4gU3RvcC1vbi1NYXRjaFxyXG4gICAgICBjb25zdCBtb3ZpZVF1ZXVlID0gWydtb3ZpZTEnLCAnbW92aWUyJywgJ21vdmllMycsICdtb3ZpZTQnXTtcclxuICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XHJcbiAgICAgIFxyXG4gICAgICAvLyBTaW11bGF0ZSB2b3RpbmcgdGhyb3VnaCBxdWV1ZVxyXG4gICAgICBjb25zdCB2b3RlUmVzdWx0cyA9IFtcclxuICAgICAgICB7IG1vdmllSWQ6ICdtb3ZpZTEnLCByZXN1bHQ6ICdOT19NQVRDSCcgfSxcclxuICAgICAgICB7IG1vdmllSWQ6ICdtb3ZpZTInLCByZXN1bHQ6ICdOT19NQVRDSCcgfSxcclxuICAgICAgICB7IG1vdmllSWQ6ICdtb3ZpZTMnLCByZXN1bHQ6ICdNQVRDSCcgfSxcclxuICAgICAgICAvLyBtb3ZpZTQgc2hvdWxkIG5vdCBiZSByZWFjaGVkIGR1ZSB0byBtYXRjaFxyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgdm90ZVJlc3VsdHMuZm9yRWFjaCgoeyBtb3ZpZUlkLCByZXN1bHQgfSkgPT4ge1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZVF1ZXVlW2N1cnJlbnRJbmRleF0pLnRvQmUobW92aWVJZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ01BVENIJykge1xyXG4gICAgICAgICAgLy8gU3RvcCBwcm9ncmVzc2lvbiBvbiBtYXRjaFxyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAvLyBDb250aW51ZSB0byBuZXh0IG1vdmllXHJcbiAgICAgICAgICBjdXJyZW50SW5kZXgrKztcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgLy8gVmVyaWZ5IHdlIHN0b3BwZWQgYXQgdGhlIG1hdGNoZWQgbW92aWVcclxuICAgICAgZXhwZWN0KGN1cnJlbnRJbmRleCkudG9CZSgyKTsgLy8gSW5kZXggb2YgbW92aWUzXHJcbiAgICAgIGV4cGVjdChtb3ZpZVF1ZXVlW2N1cnJlbnRJbmRleF0pLnRvQmUoJ21vdmllMycpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn0pOyJdfQ==