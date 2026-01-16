
import main from './tut-ocaml.ts';
import './shell.css';

console.log(self);

if (typeof window !== 'undefined') {
    main();
}