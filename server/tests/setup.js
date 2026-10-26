import { useHashParams } from '../src/utils/password.js';

// Cheap hashing keeps the suite fast and light on memory. The real cost is still tested
// in password.test.js, and production never calls this.
useHashParams({ N: 2 ** 10, r: 8, p: 1 });
