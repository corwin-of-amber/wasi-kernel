
import main from './tut-hello.ts';
// @ts-ignore
import './shell.css';


if (typeof window !== 'undefined') {
    main();
}