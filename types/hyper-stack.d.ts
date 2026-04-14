// Ambient type shims for Holepunch / Hyper packages, none of which ship .d.ts.
// These are typed as `any` deliberately — the trust-critical surface is the
// ajv schema layer (runtime-checked); upstream API drift is covered by the
// /pears skill at execution time, not by static types here.

declare module 'hypercore'
declare module 'autobase'
declare module 'corestore'
declare module 'hyperbee'
declare module 'hyperswarm'
declare module 'hyperdht'
declare module 'hyperdht/testnet'
declare module 'b4a'
