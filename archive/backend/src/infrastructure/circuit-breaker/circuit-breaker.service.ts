import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Circuit is open, calls fail fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service is back
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  timeoutMs: number; // Timeout for operations
  resetTimeoutMs: number; // Time to wait before trying again
  monitoringPeriodMs: number; // Period to monitor failures
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitBreakerStats>();
  private readonly config: CircuitBreakerConfig;

  constructor(private configService: ConfigService) {
    this.config = {
      failureThreshold: this.configService.get(
        'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
        5,
      ),
      timeoutMs: this.configService.get('CIRCUIT_BREAKER_TIMEOUT_MS', 60000),
      resetTimeoutMs: this.configService.get(
        'CIRCUIT_BREAKER_RESET_TIMEOUT_MS',
        30000,
      ),
      monitoringPeriodMs: this.configService.get(
        'CIRCUIT_BREAKER_MONITORING_PERIOD_MS',
        60000,
      ),
    };
  }

  /**
   * Ejecutar operación con Circuit Breaker
   */
  async execute<T>(
    circuitName: string,
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    const circuit = this.getOrCreateCircuit(circuitName);

    // Si el circuito está abierto, verificar si podemos intentar de nuevo
    if (circuit.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset(circuit)) {
        circuit.state = CircuitState.HALF_OPEN;
        this.logger.log(`Circuit ${circuitName} moved to HALF_OPEN state`);
      } else {
        this.logger.warn(`Circuit ${circuitName} is OPEN, using fallback`);
        return fallback();
      }
    }

    try {
      // Ejecutar operación con timeout
      const result = await this.executeWithTimeout(
        operation,
        this.config.timeoutMs,
      );

      // Operación exitosa
      this.onSuccess(circuitName, circuit);
      return result;
    } catch (error) {
      // Operación falló
      this.onFailure(circuitName, circuit, error);

      this.logger.warn(
        `Circuit ${circuitName} operation failed, using fallback: ${error.message}`,
      );
      return fallback();
    }
  }

  /**
   * Obtener estadísticas del circuito
   */
  getCircuitStats(circuitName: string): CircuitBreakerStats | null {
    return this.circuits.get(circuitName) || null;
  }

  /**
   * Resetear circuito manualmente
   */
  resetCircuit(circuitName: string): void {
    const circuit = this.circuits.get(circuitName);
    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.failureCount = 0;
      circuit.lastFailureTime = undefined;
      circuit.nextAttemptTime = undefined;
      this.logger.log(`Circuit ${circuitName} manually reset to CLOSED state`);
    }
  }

  /**
   * Obtener o crear circuito
   */
  private getOrCreateCircuit(circuitName: string): CircuitBreakerStats {
    if (!this.circuits.has(circuitName)) {
      this.circuits.set(circuitName, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
      });
    }
    return this.circuits.get(circuitName)!;
  }

  /**
   * Manejar éxito de operación
   */
  private onSuccess(circuitName: string, circuit: CircuitBreakerStats): void {
    circuit.successCount++;

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Si estábamos en HALF_OPEN y la operación fue exitosa, cerrar el circuito
      circuit.state = CircuitState.CLOSED;
      circuit.failureCount = 0;
      circuit.lastFailureTime = undefined;
      circuit.nextAttemptTime = undefined;
      this.logger.log(
        `Circuit ${circuitName} recovered, moved to CLOSED state`,
      );
    }
  }

  /**
   * Manejar fallo de operación
   */
  private onFailure(
    circuitName: string,
    circuit: CircuitBreakerStats,
    error: Error,
  ): void {
    circuit.failureCount++;
    circuit.lastFailureTime = new Date();

    // Si alcanzamos el umbral de fallos, abrir el circuito
    if (circuit.failureCount >= this.config.failureThreshold) {
      circuit.state = CircuitState.OPEN;
      circuit.nextAttemptTime = new Date(
        Date.now() + this.config.resetTimeoutMs,
      );

      this.logger.error(
        `Circuit ${circuitName} opened due to ${circuit.failureCount} failures. ` +
          `Next attempt at ${circuit.nextAttemptTime.toISOString()}`,
      );
    }

    this.logger.warn(
      `Circuit ${circuitName} failure ${circuit.failureCount}/${this.config.failureThreshold}: ${error.message}`,
    );
  }

  /**
   * Verificar si debemos intentar resetear el circuito
   */
  private shouldAttemptReset(circuit: CircuitBreakerStats): boolean {
    if (!circuit.nextAttemptTime) {
      return true;
    }
    return Date.now() >= circuit.nextAttemptTime.getTime();
  }

  /**
   * Ejecutar operación con timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Obtener todas las estadísticas de circuitos
   */
  getAllCircuitStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    this.circuits.forEach((circuit, name) => {
      stats[name] = { ...circuit };
    });
    return stats;
  }

  /**
   * Limpiar circuitos antiguos (para evitar memory leaks)
   */
  cleanupOldCircuits(): void {
    const now = Date.now();
    const maxAge = this.config.monitoringPeriodMs * 10; // 10 veces el período de monitoreo

    this.circuits.forEach((circuit, name) => {
      if (circuit.lastFailureTime) {
        const age = now - circuit.lastFailureTime.getTime();
        if (age > maxAge && circuit.state === CircuitState.CLOSED) {
          this.circuits.delete(name);
          this.logger.debug(`Cleaned up old circuit: ${name}`);
        }
      }
    });
  }
}
