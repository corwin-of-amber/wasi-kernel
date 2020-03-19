import { ExecCore } from '../exec';



class DynamicLoader {

    core: ExecCore

    dylibTable?: DynamicLibrary.Table

    constructor(core: ExecCore) {
        this.core = core;
    }

    preload(path: string, uri: string, reloc: DynamicLibrary.Relocations) {
        if (!this.dylibTable)
            this.dylibTable = new DynamicLibrary.Table();

        if (this.dylibTable.def.has(path)) return;

        return this.core.fetchCompile(uri).then(w => {
            this.dylibTable.def.set(path, new DynamicLibrary.Def(w, reloc));
        });
    }

    get import() {
        return bindAll(this, ['dlopen', 'dlsym']);
    }

    get extlib() {
        return bindAll(this, ['dlerror_get']);
    }

    // -----------
    // Loader Part
    // -----------

    dlopen(path: i32, flags: i32) {
        var path_str = this.userGetCString(path).toString('utf-8');
        this.core.debug(`dlopen("${path_str}", ${flags})`);
        if (!this.dylibTable) return 0;
        var def = this.dylibTable.def.get(path_str);
        if (def) {
            var instance = def.instantiate(this.core),
                handle = this.dylibTable.ref.size + 1;
            this.dylibTable.ref.set(handle, {instance});
            return handle;
        }
        else {
            return 0;  // @todo set error message in dlerror
        }
    }

    dlsym(handle: i32, symbol: i32) {
        var symbol_str = this.userGetCString(symbol).toString('utf-8');
        //this.core.debug(`dlsym(${handle}, "${symbol_str}")`);
        var ref = this.dylibTable.ref.get(handle);
        if (ref) {
            var sym = ref.instance.exports[symbol_str];
            if (sym && sym instanceof Function) {
                return this.allocateFunc(sym);
            }
        }
        return 0;  // @todo set error message in dlerror
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

        stackSize: number = 1 << 16    // @todo
        memBlocks: number = 10         // @todo
        tblSize: number = 1024         // @todo

        constructor(module: WebAssembly.Module, reloc: Relocations) {
            this.module = module;
            this.reloc = reloc;
        }

        instantiate(core: ExecCore) {
            var stack_base = core.wasi.memory.buffer.byteLength,
                mem_base = stack_base + this.stackSize,
                tbl_base = core.proc.funcTable.length;

            core.wasi.memory.grow(this.memBlocks);
            core.proc.funcTable.grow(this.tblSize);

            var instance = new WebAssembly.Instance(this.module, {
                env: { 
                    memory: core.wasi.memory,
                    table: core.proc.funcTable,
                    __memory_base: mem_base,
                    __table_base: tbl_base,
                    stackSave: () => mem_base, // stack grows down?
                    stackRestore: () => {},
                    ...this.relocTable(core.wasm.instance),
                    ...this.globals(this.module, mem_base, () => instance)
                },
                wasi_ext: core.proc.extlib
            });
            var init = instance.exports.__post_instantiate;     // <--- Emscripten
            if (init instanceof Function) init();

            return instance;
        }

        relocTable(instance: WebAssembly.Instance) {
            var env = {};
            for (let symbol of this.reloc.func) {
                env[symbol] = instance.exports[symbol];
            }
            for (let symbol of this.reloc.data) {
                env[`g$${symbol}`] = () => instance.exports[symbol];  // <--- Emscripten
            }
            Object.assign(env, this.reloc.js || {});
            return env;
        }

        /**
         * [internal] creates a table of self-referenced globals.
         * Specific to Emscripten.
         */
        globals(module: WebAssembly.Module, mem_base: number, instance: () => WebAssembly.Instance) {
            var imports = WebAssembly.Module.imports(module),
                exports = WebAssembly.Module.exports(module),
                resolve = (symbol: string) => (mem_base + +instance().exports[symbol]),
                g = {};
            for (let imp of imports) {
                if (imp.kind === 'function' && imp.name.startsWith('g$')) {
                    let name = imp.name.slice(2),
                        bud = exports.find((wed) => wed.name == name);
                    if (bud)
                        g[imp.name] = () => resolve(name)
                }
            }
            return g;
        }
    }

    export type Ref = {
        instance?: WebAssembly.Instance
    };

    export type Relocations = {
        data: string[]
        func: string[]
        js?: {[sym: string]: Function}
    };

}


type i32 = number;

function bindAll(instance: any, methods: string[]) {
    return methods.reduce((d, m) =>
        Object.assign(d, {[m]: instance[m].bind(instance)}), {});
}



export { DynamicLoader, DynamicLibrary }
