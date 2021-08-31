import { ExecCore } from '../exec';
import delegation from './autogen/delegation';



class DynamicLoader {

    core: ExecCore

    dylibTable?: DynamicLibrary.Table

    constructor(core: ExecCore) {
        this.core = core;
    }

    preload(path: string, uri: string, reloc?: DynamicLibrary.Relocations) {
        if (!this.dylibTable)
            this.dylibTable = new DynamicLibrary.Table();

        if (this.dylibTable.def.has(path)) return;

        return this.core.fetchCompile(uri).then(w => {
            this.dylibTable.def.set(path, new DynamicLibrary.Def(w, reloc, {path, uri}));
        });
    }

    get import() {
        return bindAll(this, ['dlopen', 'dlsym', 'dlclose']);
    }

    get extlib() {
        return bindAll(this, ['dlerror_get']);
    }

    // -----------
    // Loader Part
    // -----------

    dlopen(path: i32, flags: i32) {
        var path_str = this.userGetCString(path).toString('utf-8');
        this.core.trace.syscalls(`dlopen("${path_str}", ${flags})`);
        if (!this.dylibTable) return 0;
        var def = this.dylibTable.def.get(path_str);
        if (def) {
            var instance = def.instantiate(this.core),
                handle = this.dylibTable.ref.size + 1;
            this.dylibTable.ref.set(handle, {def, instance});
            return handle;
        }
        else {
            return 0;  // @todo set error message in dlerror
        }
    }

    dlsym(handle: i32, symbol: i32) {
        var symbol_str = this.userGetCString(symbol).toString('utf-8');
        this.core.trace.syscalls(`dlsym(${handle}, "${symbol_str}")`);
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
        var ret = 'not found\0';  // @todo
        return this.userCStringMalloc(ret, pbuf);        
    }

    allocateFunc(func: Function) {
        var h = this.core.proc.funcTable.grow(1);
        this.core.proc.funcTable.set(h, func);
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

    // - some helpers from Proc

    userGetCString(addr: i32) {
        return this.core.proc.userGetCString(addr);
    }

    userCStringMalloc(s: string, pbuf: i32) {
        return this.core.proc.userCStringMalloc(s, pbuf);
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

        instantiate(core: ExecCore) {
            var stack_base = core.wasi.memory.buffer.byteLength,
                mem_base = stack_base + this.stackSize,
                tbl_base = core.proc.funcTable.length;

            core.wasi.memory.grow(this.memBlocks);
            core.proc.funcTable.grow(this.tblSize);

            var globals = this.globals(this.module, core.wasm.instance);
            var instance = new WebAssembly.Instance(this.module, {
                env: { 
                    memory: core.wasi.memory,
                    table: core.proc.funcTable,         // <--- Emscripten
                    __indirect_function_table: core.proc.funcTable,
                    __memory_base: mem_base,
                    __table_base: tbl_base,
                    __stack_pointer: this._mkglobal(mem_base), // stack grows down?
                    stackSave: () => mem_base,          // <--- Emscripten
                    stackRestore: () => {},
                    ...this.relocTable(this.module, core.wasm.instance, core.proc.import),
                    ...this.emglobals(this.module, mem_base, core.wasm.instance, () => instance),
                },
                ...globals,
                wasik_ext: core.proc.extlib
            });
            this.globalsInit(instance, mem_base, globals['GOT.mem'] || {});

            var init = instance.exports.__post_instantiate;     // <--- Emscripten
            if (init instanceof Function) init();
            var ctors = instance.exports.__wasm_call_ctors;     // <--- Clang
            if (ctors instanceof Function) ctors();

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

        globals(module: WebAssembly.Module, main: WebAssembly.Instance) {
            var imports = WebAssembly.Module.imports(module),
                g: Globals = {};
            for (let imp of imports) {
                if (imp.kind === 'global' && imp.module.match(EM_GLOBAL_NS)) {
                    var exp = main.exports[imp.name];
                    g[imp.module] ??= {};
                    g[imp.module][imp.name] = this._mkglobal(
                        exp instanceof WebAssembly.Global ? exp.value : undefined);
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
