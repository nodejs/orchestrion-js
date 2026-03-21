/* tslint:disable */
/* eslint-disable */
import type { Node } from 'estree';
/**
 * Create a new instrumentation matcher from an array of instrumentation configs.
 */
export function create(configs: InstrumentationConfig[], dc_module?: string | null): InstrumentationMatcher;
/**
 * Output of a transformation operation
 */
export interface TransformOutput {
    /**
     * The transformed JavaScript code
     */
    code: string;
    /**
     * The sourcemap for the transformation (if generated)
     */
    map: string | undefined;
}

/**
 * The kind of function
 */
export type FunctionKind = "Sync" | "Async" | "Callback";

/**
 * Describes which function to instrument
 */
export type FunctionQuery = { className: string; methodName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean } | { className: string; privateMethodName: string; kind: FunctionKind; index?: number | null } | { className: string; index?: number | null; isExportAlias?: boolean } | { methodName: string; kind: FunctionKind; index?: number | null } | { functionName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean } | { expressionName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean };

/**
 * A custom transform function registered via `addTransform`.
 * Receives the instrumentation state and the matched AST node.
 */
export type CustomTransform = (state: unknown, node: Node, parent: Node, ancestry: Node[]) => void;

/**
 * Configuration for injecting instrumentation code
 */
export interface InstrumentationConfig {
    /**
     * The name of the diagnostics channel to publish to
     */
    channelName: string;
    /**
     * The module matcher to identify the module and file to instrument
     */
    module: ModuleMatcher;
    /**
     * The function query to identify the function to instrument
     */
    functionQuery: FunctionQuery;
    /**
     * The name of a custom transform registered via `addTransform`.
     * When set, takes precedence over `functionQuery.kind`.
     */
    transform?: string;
}

/**
 * Describes the module and file path you would like to match
 */
export interface ModuleMatcher {
    /**
     * The name of the module you want to match
     */
    name: string;
    /**
     * The semver range that you want to match
     */
    versionRange: string;
    /**
     * The path of the file you want to match from the module root
     */
    filePath: string;
}

/**
 * The type of module being passed - ESM, CJS or unknown
 */
export type ModuleType = "esm" | "cjs" | "unknown";

/**
 * The InstrumentationMatcher is responsible for matching specific modules
 */
export class InstrumentationMatcher {
  private constructor();
  free(): void;
  /**
   * Get a transformer for the given module name, version and file path.
   * Returns `undefined` if no matching instrumentations are found.
   */
  getTransformer(moduleName: string, version: string, filePath: string): Transformer | undefined;
  /**
   * Register a custom transform function under the given name.
   * The name can then be referenced via the `transform` option in an `InstrumentationConfig`.
   */
  addTransform(name: string, fn: CustomTransform): void;
}
/**
 * The Transformer is responsible for transforming JavaScript code.
 */
export class Transformer {
  private constructor();
  free(): void;
  /**
   * Transform JavaScript code and optionally sourcemap.
   *
   * # Errors
   * Returns an error if the transformation fails to find injection points.
   */
  transform(code: string | Buffer, moduleType: ModuleType, sourcemap?: string | null): TransformOutput;
}
