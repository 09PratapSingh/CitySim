/**
 * Seeded Pseudo-Random Number Generator (PRNG) using Mulberry32.
 * 
 * WHY THIS IS CRITICAL FOR VIVA / ACADEMIC VALIDITY:
 * JavaScript's built-in `Math.random()` cannot be seeded. Without a seeded PRNG,
 * two simulation runs with identical maps will generate different vehicle arrivals,
 * making scientific "before vs. after" A/B testing invalid.
 * 
 * Mulberry32 is a 32-bit generator with a state period of 2^32 (~4.29 billion values).
 * It passes rigorous statistical randomness test batteries (PractRand, BigCrush)
 * while requiring minimal arithmetic overhead, making it ideal for real-time simulation.
 */

export class PRNG {
  private initialSeed: number;
  private state: number;

  /**
   * Initializes the PRNG with a 32-bit integer seed.
   * If seed is 0 or negative, it is normalized to an unsigned 32-bit integer.
   * @param seed Numeric seed for repeatable sequences
   */
  constructor(seed: number = 42) {
    this.initialSeed = seed;
    // Normalize to unsigned 32-bit integer
    this.state = seed >>> 0;
  }

  /**
   * Generates a deterministic pseudo-random float in the half-open interval [0, 1).
   * Uses bitwise operations and Math.imul for guaranteed 32-bit integer multiplication.
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates an integer in the inclusive range [min, max].
   * @param min Minimum integer
   * @param max Maximum integer
   */
  nextInt(min: number, max: number): number {
    if (min > max) {
      throw new Error(`min (${min}) cannot be greater than max (${max})`);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generates a float in the range [min, max).
   */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Generates an exponentially distributed interval.
   * 
   * In queueing theory and traffic engineering, if vehicle arrivals follow a
   * Poisson process with average arrival rate lambda (vehicles/second),
   * the time between consecutive arrivals (inter-arrival time) follows an
   * Exponential distribution:
   * 
   *   Inter-arrival time = -ln(1 - U) / lambda
   * 
   * where U is a uniform random variable in [0, 1).
   * 
   * @param lambda Arrival rate (vehicles per second)
   * @returns Time in seconds until the next vehicle arrival
   */
  nextExponential(lambda: number): number {
    if (lambda <= 0) {
      throw new Error(`Lambda must be positive, received: ${lambda}`);
    }
    const u = this.next();
    // Clamp u to avoid Math.log(0) which produces -Infinity
    const safeU = Math.min(Math.max(u, 1e-10), 1 - 1e-10);
    return -Math.log(1 - safeU) / lambda;
  }

  /**
   * Returns current internal state for serialization/snapshotting.
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restores internal state from a previously saved snapshot.
   */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /**
   * Returns the original seed this PRNG was instantiated with.
   */
  getSeed(): number {
    return this.initialSeed;
  }
}
