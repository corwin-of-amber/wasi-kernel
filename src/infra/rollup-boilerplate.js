
const sourcemapOption = process.env.PROD ? undefined : "inline";

const globals = {};

const out = (x, type) => ({ file: `dist/${x}`, format: type, sourcemap: sourcemapOption }),
      iife = (fn, name) => Object.assign(out(fn, 'iife'), {name}),
      esm =  fn => Object.assign(out(fn, 'esm'), {globals}),
      cjs =  fn => Object.assign(out(fn, 'cjs'), {globals});


function targets(list) {
    var filtered = targets.selected == 'all'
        ? list : list.filter(x => x.output.some(out => targets.selected.includes(out.file)));

    if (filtered.length == 0)
        throw `No targets found matching ${targets}`;
    
    return filtered;
}

targets.selected = process.env.ONLY ? process.env.ONLY.split('+') : 'all';


export { out, iife, esm, cjs, globals, targets }
