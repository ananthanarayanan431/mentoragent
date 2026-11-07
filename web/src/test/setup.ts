import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library's auto-cleanup only registers with a global `afterEach`,
// which this project does not enable, so unmount between tests explicitly.
afterEach(cleanup)
