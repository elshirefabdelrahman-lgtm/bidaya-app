import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const name of readdirSync('src').filter(x=>x.endsWith('.js')))execFileSync(process.execPath,['--check','src/'+name],{stdio:'inherit'});
execFileSync(process.execPath,['--check','scripts/serve.js'],{stdio:'inherit'});
console.log('All source JavaScript syntax checks passed.');
