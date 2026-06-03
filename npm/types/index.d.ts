/**
 * Повертає version пакета з його package.json.
 * @returns {string} версія пакета
 */
export function version(): string
/**
 * Будує привітання.
 * @param {string} [name] - ім'я для привітання
 * @returns {string} рядок привітання
 */
export function greet(name?: string): string
/**
 * Точка входу CLI.
 * @param {string[]} argv - аргументи без `node <script>`
 * @param {{ log?: (message: string) => void, getw?: () => Promise<number>, pull?: (branch?: string) => Promise<number>, push?: (branch?: string) => Promise<number> }} [io] - інжектиться у тестах
 * @returns {Promise<number>} exit code
 */
export function run(
  argv: string[],
  io?: {
    log?: (message: string) => void
    getw?: () => Promise<number>
    pull?: (branch?: string) => Promise<number>
    push?: (branch?: string) => Promise<number>
  }
): Promise<number>
