import { resolve } from 'node:path'
import { validate } from './validator.ts'

const specsDir = resolve(process.argv[2] ?? 'harness/specs')
const repoRoot = resolve(process.argv[3] ?? '.')

const result = validate(specsDir, repoRoot)

if (result.warnings.length > 0) {
  console.log(`\n--- warnings (${String(result.warnings.length)}) ---`)
  for (const w of result.warnings) {
    console.log(`  [${w.code}] ${w.specId} > ${w.field}: ${w.message}`)
  }
}

if (result.errors.length > 0) {
  console.log(`\n--- errors (${String(result.errors.length)}) ---`)
  for (const e of result.errors) {
    console.log(`  [${e.code}] ${e.specId} > ${e.field}: ${e.message}`)
  }
}

console.log(
  `\n${String(result.specs.length)} spec(s), ${String(result.errors.length)} error(s), ${String(result.warnings.length)} warning(s)`
)

if (result.valid) {
  console.log('dependency order:', result.dependencyOrder.join(' -> '))
  console.log('\nvalid')
} else {
  console.log('\ninvalid')
  process.exitCode = 1
}
