# ADR-001: Adopt Clean Architecture Pattern

## Status
Accepted

## Context

The Trinity project requires a complete refactoring to improve maintainability, testability, and scalability. The existing codebase has grown organically and suffers from:

- Tight coupling between business logic and infrastructure
- Difficulty in testing business rules in isolation
- Hard to understand and modify codebase
- Inconsistent patterns across modules
- Challenges in implementing new features without breaking existing functionality

We need an architectural pattern that:
- Separates business logic from infrastructure concerns
- Makes the system testable and maintainable
- Provides clear boundaries between different layers
- Supports the migration from legacy systems
- Enables independent development of different components

## Decision

We will adopt the Clean Architecture pattern (also known as Hexagonal Architecture or Ports and Adapters) for the Trinity Backend Refactored project.

The architecture will consist of four main layers:

### 1. Domain Layer (Innermost)
- **Entities**: Core business objects (User, Room, Vote, Movie)
- **Value Objects**: Immutable objects representing concepts
- **Domain Services**: Complex business logic that doesn't belong to a single entity
- **Repository Interfaces**: Contracts for data access (ports)

### 2. Application Layer
- **Use Cases**: Application-specific business rules
- **Application Services**: Orchestrate domain objects and use cases
- **DTOs**: Data Transfer Objects for external communication
- **Ports**: Interfaces for external services

### 3. Infrastructure Layer (Outermost)
- **Repository Implementations**: Concrete implementations of repository interfaces
- **External Service Adapters**: Implementations of external service ports
- **Database Access**: DynamoDB, Redis implementations
- **Web Framework**: NestJS controllers and middleware

### 4. Presentation Layer
- **Controllers**: HTTP request/response handling
- **WebSocket Gateways**: Real-time communication
- **GraphQL Resolvers**: GraphQL API implementation
- **Middleware**: Authentication, validation, logging

### Dependency Rule
Dependencies point inward only:
- Domain layer has no dependencies on outer layers
- Application layer depends only on Domain layer
- Infrastructure layer can depend on Application and Domain layers
- Presentation layer can depend on all inner layers

## Consequences

### Positive
- **Testability**: Business logic can be tested in isolation without external dependencies
- **Maintainability**: Clear separation of concerns makes code easier to understand and modify
- **Flexibility**: Easy to swap implementations (e.g., change from DynamoDB to PostgreSQL)
- **Independence**: Business logic is independent of frameworks, databases, and external services
- **Migration Support**: Clean boundaries make it easier to migrate from legacy systems
- **Team Productivity**: Different teams can work on different layers independently

### Negative
- **Initial Complexity**: More complex initial setup compared to simple layered architecture
- **Learning Curve**: Team needs to understand Clean Architecture principles
- **More Files**: More interfaces and abstractions lead to more files to maintain
- **Potential Over-engineering**: Risk of creating unnecessary abstractions for simple operations

### Neutral
- **Performance**: No significant performance impact, abstractions are compile-time only
- **Code Volume**: Slightly more code due to interfaces and abstractions

## Implementation Guidelines

### Domain Layer Rules
```typescript
// ✅ Good: Domain entity with business logic
export class Room {
  constructor(
    private readonly id: RoomId,
    private readonly name: string,
    private readonly hostId: UserId,
    private participants: UserId[] = [],
  ) {}

  public addParticipant(userId: UserId): Room {
    if (this.participants.length >= 10) {
      throw new DomainError('Room is full');
    }
    // Business rule: Host cannot be added as participant
    if (userId.equals(this.hostId)) {
      throw new DomainError('Host cannot be added as participant');
    }
    return new Room(this.id, this.name, this.hostId, [...this.participants, userId]);
  }
}

// ❌ Bad: Domain entity depending on infrastructure
export class Room {
  async save(): Promise<void> {
    await this.dynamoRepository.save(this); // Infrastructure dependency!
  }
}
```

### Application Layer Rules
```typescript
// ✅ Good: Use case orchestrating domain objects
export class CreateRoomUseCase {
  constructor(
    private readonly roomRepository: IRoomRepository, // Port
    private readonly userRepository: IUserRepository, // Port
  ) {}

  async execute(command: CreateRoomCommand): Promise<RoomDto> {
    const host = await this.userRepository.findById(command.hostId);
    if (!host) {
      throw new ApplicationError('Host not found');
    }

    const room = Room.create(command.name, host.id);
    await this.roomRepository.save(room);
    
    return RoomDto.fromDomain(room);
  }
}
```

### Infrastructure Layer Rules
```typescript
// ✅ Good: Repository implementation
export class DynamoRoomRepository implements IRoomRepository {
  constructor(private readonly dynamoClient: DynamoDBClient) {}

  async save(room: Room): Promise<void> {
    const item = this.toDynamoItem(room);
    await this.dynamoClient.putItem(item);
  }

  async findById(id: RoomId): Promise<Room | null> {
    const item = await this.dynamoClient.getItem({ Key: { id: id.value } });
    return item ? this.toDomain(item) : null;
  }
}
```

## Monitoring and Success Criteria

We will measure the success of this decision by:

1. **Test Coverage**: Achieve >80% test coverage with fast unit tests
2. **Maintainability**: Reduce time to implement new features by 40%
3. **Bug Reduction**: Reduce production bugs by 60% through better testing
4. **Team Velocity**: Increase team velocity after initial learning period
5. **Code Quality**: Maintain high code quality scores in automated analysis

## Related Decisions

- [ADR-007: Property-Based Testing Strategy](./007-property-based-testing.md) - Supports testing of business rules
- [ADR-008: Migration System Design](./008-migration-system-design.md) - Clean boundaries support migration
- [ADR-009: Quality Gates Enforcement](./009-quality-gates-enforcement.md) - Quality gates enforce architectural rules

## References

- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal Architecture by Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- [NestJS Clean Architecture Example](https://github.com/nestjs/nest/tree/master/sample/23-type-graphql)