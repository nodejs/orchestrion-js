import type { InstrumentationConfig, InstrumentationMatcher } from './types.d.ts';
import { create as internalCreate } from './lib'

/**
 * Create a new instrumentation matcher from an array of instrumentation configs.
 */
export function create(configs: InstrumentationConfig[], dc_module?: string | null): InstrumentationMatcher {
    return internalCreate(configs, dc_module);
}

export type {
    FunctionKind,
    FunctionQuery,
    InstrumentationConfig,
    InstrumentationMatcher,
    ModuleMatcher,
    ModuleType,
    TransformOutput,
    Transformer,
} from './types.d.ts'
