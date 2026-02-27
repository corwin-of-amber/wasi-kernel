import itertools from 'itertools';
import { Proc, TraceFunc, Trace } from './proc';
import delegation from './autogen/delegation';



class DynamicLoader {

    trace: TraceFunc = Trace.NOP

    dylibTable = new DynamicLibrary.Table
    extern: DynamicLibrary.Relocations

    constructor(public proc: Proc) { }

    async preload(path: string, uri: string, reloc?: DynamicLibrary.Relocations) {
        if (this.dylibTable.def.has(path)) return;

        let wasm = await WebAssembly.compileStreaming(fetch(uri));
        this.dylibTable.def.set(path, new DynamicLibrary.Def(wasm, reloc, {path, uri}));
    }

    loadSync(path: string, reloc?: DynamicLibrary.Relocations) {
        let def = this.dylibTable.def.get(path);
        if (def) return def;

        let fs = globalThis.fs_hook.fs,
            fn = path.startsWith('/') ? path : `/usr/lib/${path}`,
            wasm = new WebAssembly.Module(fs.readFileSync(fn));
            def = new DynamicLibrary.Def(wasm, reloc, {path, uri: `wasi://${fn}`});

        this.dylibTable.def.set(path, def);
        return def;
    }

    // -----------
    // Loader Part
    // -----------

    lastError = 'not found';

    dlopen(path: i32, flags: i32) {
        var path_str = this.proc.userGetCStringUTF8(path);
        this.trace(`dlopen("${path_str}", ${flags})`);
        try {
            var def = this.loadSync(path_str, this.extern);
            if (def) {
                var instance = def.instantiate(this),
                    handle = this.dylibTable.ref.size + 1;
                this.dylibTable.ref.set(handle, {def, instance});
                return handle;
            }
            else this.lastError = 'not found';
        }
        catch (e) { console.error(e); this.lastError = `${e}`; }
        return 0;
    }

    dlsym(handle: i32, symbol: i32) {
        var symbol_str = this.proc.userGetCStringUTF8(symbol);
        this.trace(`dlsym(${handle}, "${symbol_str}")`);
        var ref = this.dylibTable.ref.get(handle);
        if (ref) {
            /* search in WASM instance */
            var sym = ref.instance.exports[symbol_str];
            if (sym && sym instanceof Function) {
                return this.allocateFunc(sym);
            }
            /* search in JS imports */
            var js = ref.def.reloc?.js?.[symbol_str],
                d = js && this.allocateDelegate(js);
            if (d !== undefined) return d;
        }
        return 0;  // @todo set error message in dlerror
    }

    dlclose(handle: i32) {
        // do nothing?
    }

    dlerror_get(pbuf: i32) {
        return this.proc.userPendingCStringUTF8(this.lastError, pbuf);        
    }

    allocateFunc(func: Function) {
        var h = this.proc.funcTable.grow(1);
        this.proc.funcTable.set(h, func);
        return h;        
    }

    allocateDelegate(func: Function) {
        var bin = delegation[func.length];
        if (bin) {
            var mod = new WebAssembly.Module(new Uint8Array(bin)),
                inst = new WebAssembly.Instance(mod, {env: {delegate: func}});
            return this.allocateFunc(<Function>inst.exports['glue']);
        }
        else {
            console.warn(`cannot delegate function with ${func.length} arguments:`, func);
        }
    }
}


namespace DynamicLibrary {

    export class Table {
        def: Map<string, Def> = new Map()
        ref: Map<i32, Ref> = new Map()
    }

    export class Def {
        module: WebAssembly.Module
        reloc: Relocations
        metadata: {path?: string, uri?: string}

        stackSize: number = 1 << 16    /** @todo */
        memBlocks: number = 10         /** @todo */
        tblSize: number = 1024         /** @todo */

        constructor(module: WebAssembly.Module, reloc: Relocations = {}, 
                    metadata: {path?: string, uri?: string} = {}) {
            this.module = module;
            this.reloc = reloc;
            this.metadata = metadata;
        }

        instantiate(core: {proc: Proc}) {
            var instance = core.proc.instance,
                funcTable = core.proc.funcTable,
                memory = instance.exports.memory as WebAssembly.Memory,
                stack_base = memory.buffer.byteLength,
                mem_base = stack_base + this.stackSize,
                tbl_base = core.proc.funcTable.length;

            memory.grow(this.memBlocks);
            funcTable.grow(this.tblSize);

            var globals = this.globals(this.module, instance, funcTable);
            var instance = new WebAssembly.Instance(this.module, {
                env: { 
                    memory: memory,
                    __indirect_function_table: funcTable,
                    __memory_base: mem_base,
                    __table_base: tbl_base,
                    __stack_pointer: this._mkglobal(mem_base), // stack grows down?
                    ...this.relocTable(this.module, instance, core.proc.importsObj()['env']),
                },
                wasik: core.proc.importsObj()['wasik'],
                ...globals
            });
            this.globalsInit(instance, mem_base, globals['GOT.mem'] || {});

            const invoke = (func: WebAssembly.ExportValue) => {
                if (func instanceof Function) func();
            }
            invoke(instance.exports._initialize);     // <--- Clang
            invoke(instance.exports.__wasm_apply_data_relocs);     // <--- Clang

            return instance;
        }

        relocTable(module: WebAssembly.Module, main: WebAssembly.Instance, std: {[name: string]: any}) {
            var imports = WebAssembly.Module.imports(module),
                env = {};
            for (let imp of imports) {
                if (imp.module == 'env' && imp.kind === 'function') {
                    var exp = this.reloc.js?.[imp.name]
                              || main.exports[EM_ALIASES[imp.name] || imp.name]
                              || std[imp.name];
                    if (exp instanceof Function)
                        env[imp.name] = exp;
                    else {
                        console.warn('unresolved symbol:', imp, '\nin', this.metadata);
                        env[imp.name] = () => 0;
                    }
                }
            }
            return env;
        }

        globals(module: WebAssembly.Module, main: WebAssembly.Instance, table: WebAssembly.Table) {
            var imports = WebAssembly.Module.imports(module),
                g: Globals = {};
            for (let imp of imports) {
                if (imp.kind === 'global' && imp.module.match(EM_GLOBAL_NS)) {
                    var exp = main.exports[imp.name];
                    g[imp.module] ??= {};
                    g[imp.module][imp.name] = this._mkglobal(
                        exp instanceof WebAssembly.Global ? exp.value :
                        exp instanceof Function ? this._funcAddr(exp, table) : undefined);
                }
            }
            return g;
        }

        globalsInit(instance: WebAssembly.Instance, mem_base: number, globals: GlobalsModule) {
            for (let g in globals) {
                var exp = instance.exports[g];
                if (exp instanceof WebAssembly.Global)
                    globals[g].value = mem_base + exp.value;
            }
        }

        /**
         * [internal] creates a table of self-referenced globals.
         * Specific to Emscripten.
         */
        emglobals(module: WebAssembly.Module, mem_base: number, main: WebAssembly.Instance, instance: () => WebAssembly.Instance) {
            var imports = WebAssembly.Module.imports(module),
                exports = WebAssembly.Module.exports(module),
                resolve = (symbol: string) => (mem_base + +instance().exports[symbol]),
                g = {};
            for (let imp of imports) {
                if (imp.kind === 'function' && imp.name.startsWith('g$')) {
                    let name = imp.name.slice(2),
                        bud: WebAssembly.ExportValue | WebAssembly.ModuleExportDescriptor;
                    if (bud = main.exports[name])
                        g[imp.name] = () => bud;
                    else if (bud = exports.find((wed) => wed.name == name))
                        g[imp.name] = () => resolve(name)
                }
            }
            return g;
        }

        _funcAddr(func: Function, table: WebAssembly.Table) {
            return itertools.find(itertools.range(table.length),
                i => table.get(i) == func);
        }

        _mkglobal(initial: i32 = 0xDEADBEEF) {
            return new WebAssembly.Global({value:'i32', mutable:true}, initial);
        }
    }

    export type Ref = {
        def: Def
        instance?: WebAssembly.Instance
    };

    export type Relocations = {
        js?: {[sym: string]: Function}
    };

}


type i32 = number;

type GlobalsModule = {[name: string]: WebAssembly.Global};
type Globals = {[module: string]: GlobalsModule};

const EM_GLOBAL_NS = /^GOT[.]/,  /* GOT.mem & GOT.func */
      EM_ALIASES = {fiprintf: 'fprintf'};

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { DynamicLoader, DynamicLibrary }
