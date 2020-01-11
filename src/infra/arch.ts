declare var window: any;

const isNode = global.process && global.process.versions && global.process.versions.node;

const isBrowser = typeof window === 'object' || typeof DedicatedWorkerGlobalScope === 'function';


export { isNode, isBrowser }