import { create } from "../../index.js";
import { describe, test, expect } from "vitest";
import tsc from "typescript";
import { SourceMapConsumer } from "source-map";

describe('Orchestrion JS Transformer', () => {
    const instrumentor = create([
        {
            channelName: "up:constructor",
            module: { name: "one", versionRange: ">=1", filePath: "index.js" },
            functionQuery: { className: "Up" },
        },
        {
            channelName: "up:fetch",
            module: { name: "one", versionRange: ">=1", filePath: "index.js" },
            functionQuery: {
                className: "Up",
                methodName: "fetch",
                kind: "Sync",
            },
        },
        {
            channelName: "up:asyncFetch",
            module: { name: "one", versionRange: ">=1", filePath: "index.js" },
            functionQuery: {
                className: "Up",
                methodName: "asyncFetch",
                kind: "Async",
            },
        },
        {
            channelName: "up:asyncGet",
            module: { name: "one", versionRange: ">=1", filePath: "index.js" },
            functionQuery: {
                className: "Up",
                methodName: "get",
                kind: "Async",
            },
        },
        {
            channelName: "up:privateSend",
            module: { name: "one", versionRange: ">=1", filePath: "index.js" },
            functionQuery: {
                className: "Up",
                privateMethodName: "send",
                kind: "Async",
            },
        },
    ]);

    const matchedTransforms = instrumentor.getTransformer(
        "one",
        "1.0.0",
        "index.js",
    );

    test('should get transformer for matching module', () => {
        expect(matchedTransforms).toBeTruthy();
    });

    test('should transform ESM module correctly', () => {
        const originalEsm = `export class Up {
	constructor() {
		console.log('constructor')
	}

	fetch() {
		console.log('fetch')
	}

  async asyncFetch() {}
  get() {}
  async #send() {}
  async send() {}
}`;

        const output = matchedTransforms.transform(originalEsm, 'esm');
        expect(output).toMatchSnapshot();
    });

    test('should transform CommonJS module correctly', () => {
        const originalCjs = `module.exports = class Up {
	constructor() {
		console.log('constructor')
	}

	fetch() {
		console.log('fetch')
	}

  async asyncFetch() {}
  get() {}
  async #send() {}
  async send() {}
}

`;
        const outputCjs = matchedTransforms.transform(originalCjs, 'cjs');
        expect(outputCjs).toMatchSnapshot();
    });
    
    test('should transform TypeScript with source map correctly', async () => {
        const originalTypescript = `type Url = { href: string };

export class Up {
    constructor() {
        console.log('constructor');
    }
    fetch(url: Url): void {
        console.log('fetch');
    }
    async asyncFetch(): void {}
    get(): void {}
    async #send(): void {}
    async send(): void {}
}`;

        const { outputText: outputJavaScript, sourceMapText: originalTypescriptSourceMap } = tsc.transpileModule(originalTypescript, {
            compilerOptions: {
                module: tsc.ModuleKind.ESNext,
                target: tsc.ScriptTarget.ESNext,
                sourceMap: true,
            }
        });

        const outputTs = matchedTransforms.transform(
            outputJavaScript,
            "esm",
            originalTypescriptSourceMap,
        );

        expect(outputTs).toMatchSnapshot();

        const sourceMapConsumer = (await new SourceMapConsumer(JSON.parse(outputTs.map)));

        const originalPosition = sourceMapConsumer.originalPositionFor({
            // This is the position of the fetch function in the transformed JavaScript
            line: 36,
            column: 2,
        });

        // This is the position of the fetch function in the transpiled JavaScript
        expect(originalPosition.line).toEqual(5);
        expect(originalPosition.column).toEqual(4);

        sourceMapConsumer.destroy?.();
    });

    test('should throw error when no injection points are found', () => {
        const noMatchSource = `export class Down {
	constructor() {
		console.log('constructor')
	}

	fetch() {
		console.log('fetch')
	}
  async asyncFetch() {}
  get() {}
  async #send() {}
  async send() {}
}`;

        expect(() => {
            matchedTransforms.transform(noMatchSource, 'unknown');
        }).toThrow('Failed to find injection points for: ["constructor","fetch","asyncFetch","get","send"]');
    });
});

describe('windows style paths', () => {
    const instrumentor = create([
        {
            channelName: "up:fetch",
            module: { name: "one", versionRange: ">=1", filePath: "path/to/file.js" },
            functionQuery: {
                className: "Up",
                methodName: "fetch",
                kind: "Sync",
            },
        },
    ]);

    const matchedTransforms = instrumentor.getTransformer(
        "one",
        "1.0.0",
        "path\\to\\file.js",
    );
    
  test('should get transformer for matching module', () => {
        expect(matchedTransforms).toBeTruthy();
    });

    test('should transform ESM module correctly', () => {
        const originalEsm = `export class Up {
	constructor() {
		console.log('constructor')
	}

	fetch() {
		console.log('fetch')
	}
}`;

        const output = matchedTransforms.transform(originalEsm, 'esm');
        expect(output).toMatchSnapshot();
    });
})
