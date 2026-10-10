// Prove queued cancellation and cleanup of active, detached browser children.
// These workers do not load the MTG engine or a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
const wrapper=fileURLToPath(new URL('../tests/browser/run-second-audit-browser.sh',import.meta.url));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const started=Date.now();while(Date.now()-started<5000){if(predicate())return;await wait(20);}assert.fail('The process lifecycle condition was not reached');}
function live(pid){try{return readFileSync(`/proc/${pid}/stat`,'utf8').split(' ')[2]!=='Z';}catch{return false;}}
function stopGroup(child){try{process.kill(-child.pid,'SIGTERM');}catch{}}

test('canceling a waiting no-fork browser lock cannot launch its worker after release',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mtg-browser-wait-')),lock=join(dir,'job.lock'),ready=join(dir,'holder-ready'),marker=join(dir,'worker-started');
  const script=join(dir,'worker.mjs');writeFileSync(script,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`);
  const holder=spawn('flock',['--no-fork',lock,'node','-e',`require('fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);`],{detached:true,stdio:'ignore'});
  let runner;
  try{
    await until(()=>existsSync(ready));
    runner=spawn('bash',[wrapper,script],{detached:true,stdio:'ignore',env:{...process.env,AUDIT_LOCK_PATH:lock,AUDIT_NATIVE_TIMEOUT_SECONDS:'20'}});
    const exited=once(runner,'exit');
    await until(()=>{try{return readFileSync(`/proc/${runner.pid}/comm`,'utf8').trim().match(/^(flock|python3)$/);}catch{return false;}});
    assert.equal(existsSync(marker),false);
    runner.kill('SIGTERM');const exit=await exited;assert.ok(exit[1]==='SIGTERM'||exit[0]===143,'The queued supervisor acknowledges cancellation');
    stopGroup(holder);await until(()=>!live(holder.pid));await wait(100);
    assert.equal(existsSync(marker),false,'The canceled queued launch never began its worker');
  }finally{if(runner)stopGroup(runner);stopGroup(holder);rmSync(dir,{recursive:true,force:true});}
});

test('terminating an active browser wrapper reaches its worker and descendant',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mtg-browser-group-')),lock=join(dir,'job.lock'),marker=join(dir,'pids.json'),ack=join(dir,'worker-TERM'),grandAck=join(dir,'descendant-TERM'),grandReady=join(dir,'descendant-ready');
  const grand=join(dir,'grand.mjs'),script=join(dir,'worker.mjs');
  writeFileSync(grand,`import {writeFileSync} from 'node:fs';process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(grandAck)},'received');process.exit(0);});writeFileSync(${JSON.stringify(grandReady)},'ready');setInterval(()=>{},1000);`);
  writeFileSync(script,`import {spawn} from 'node:child_process';import {writeFileSync,existsSync} from 'node:fs';const child=spawn(process.execPath,[${JSON.stringify(grand)}],{stdio:'ignore'});process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(ack)},'received');process.exit(0);});const ready=setInterval(()=>{if(existsSync(${JSON.stringify(grandReady)})){clearInterval(ready);writeFileSync(${JSON.stringify(marker)},JSON.stringify({worker:process.pid,descendant:child.pid}));}},10);setInterval(()=>{},1000);`);
  const runner=spawn('bash',[wrapper,script],{detached:true,stdio:'ignore',env:{...process.env,AUDIT_LOCK_PATH:lock,AUDIT_NATIVE_TIMEOUT_SECONDS:'20'}});
  try{
    const exited=once(runner,'exit');await until(()=>existsSync(marker));const pids=JSON.parse(readFileSync(marker,'utf8'));
    assert.ok(live(pids.worker));assert.ok(live(pids.descendant));runner.kill('SIGTERM');await exited;
    await until(()=>existsSync(ack)&&existsSync(grandAck));await until(()=>!live(pids.worker)&&!live(pids.descendant));
    assert.equal(live(pids.worker)||live(pids.descendant),false,'No active worker survives wrapper termination');
  }finally{stopGroup(runner);rmSync(dir,{recursive:true,force:true});}
});

test('canceling the surrounding shell process group leaves no detached browser worker',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mtg-browser-outer-group-')),lock=join(dir,'job.lock'),marker=join(dir,'pids.json'),ack=join(dir,'worker-TERM'),grandAck=join(dir,'descendant-TERM'),grandReady=join(dir,'descendant-ready');
  const grand=join(dir,'grand.mjs'),script=join(dir,'worker.mjs');
  writeFileSync(grand,`import {writeFileSync} from 'node:fs';process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(grandAck)},'received');process.exit(0);});writeFileSync(${JSON.stringify(grandReady)},'ready');setInterval(()=>{},1000);`);
  writeFileSync(script,`import {spawn} from 'node:child_process';import {writeFileSync,existsSync} from 'node:fs';const child=spawn(process.execPath,[${JSON.stringify(grand)}],{stdio:'ignore'});process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(ack)},'received');process.exit(0);});const ready=setInterval(()=>{if(existsSync(${JSON.stringify(grandReady)})){clearInterval(ready);writeFileSync(${JSON.stringify(marker)},JSON.stringify({worker:process.pid,descendant:child.pid,supervisor:process.ppid}));}},10);setInterval(()=>{},1000);`);
  const runner=spawn('bash',['-c','bash "$1" "$2" & browser_wrapper_pid=$!; wait "$browser_wrapper_pid"','audit-parent',wrapper,script],{detached:true,stdio:'ignore',env:{...process.env,AUDIT_LOCK_PATH:lock,AUDIT_NATIVE_TIMEOUT_SECONDS:'20'}});
  let pids;
  try{
    const exited=once(runner,'exit');await until(()=>existsSync(marker));pids=JSON.parse(readFileSync(marker,'utf8'));
    assert.ok(live(pids.worker));assert.ok(live(pids.descendant));stopGroup(runner);await exited;
    await until(()=>existsSync(ack)&&existsSync(grandAck));await until(()=>!live(pids.worker)&&!live(pids.descendant));
    assert.equal(live(pids.worker)||live(pids.descendant),false,'The surrounding shell cancellation reaches the active audit job');
  }finally{stopGroup(runner);if(pids){try{process.kill(-pids.supervisor,'SIGTERM');}catch{}try{process.kill(-pids.worker,'SIGTERM');}catch{}}await wait(100);rmSync(dir,{recursive:true,force:true});}
});

for(const mode of ['timeout','normal exit'])test(`a ${mode} cleans up worker descendants without reaching unrelated groups`,async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mtg-browser-exit-group-')),lock=join(dir,'job.lock'),marker=join(dir,'pids.json'),ack=join(dir,'worker-TERM'),grandAck=join(dir,'descendant-TERM'),grandReady=join(dir,'descendant-ready');
  const grand=join(dir,'grand.mjs'),script=join(dir,'worker.mjs');
  writeFileSync(grand,`import {writeFileSync} from 'node:fs';process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(grandAck)},'received');process.exit(0);});writeFileSync(${JSON.stringify(grandReady)},'ready');setInterval(()=>{},1000);`);
  writeFileSync(script,`import {spawn} from 'node:child_process';import {writeFileSync,existsSync} from 'node:fs';const child=spawn(process.execPath,[${JSON.stringify(grand)}],{stdio:'ignore'});process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(ack)},'received');process.exit(0);});const ready=setInterval(()=>{if(existsSync(${JSON.stringify(grandReady)})){clearInterval(ready);writeFileSync(${JSON.stringify(marker)},JSON.stringify({worker:process.pid,descendant:child.pid}));${mode==='normal exit'?'setTimeout(()=>process.exit(0),30);':''}}},10);setInterval(()=>{},1000);`);
  const runner=spawn('bash',[wrapper,script],{detached:true,stdio:'ignore',env:{...process.env,AUDIT_LOCK_PATH:lock,AUDIT_NATIVE_TIMEOUT_SECONDS:mode==='timeout'?'1':'20'}});
  let pids;
  try{
    const exited=once(runner,'exit');await until(()=>existsSync(marker));pids=JSON.parse(readFileSync(marker,'utf8'));const [code,sig]=await exited;
    assert.equal(sig,null);assert.equal(code,mode==='timeout'?124:0);assert.equal(existsSync(ack),mode==='timeout');assert.equal(existsSync(grandAck),true);assert.equal(live(pids.worker),false);assert.equal(live(pids.descendant),false);assert.equal(live(process.pid),true);
  }finally{stopGroup(runner);if(pids)try{process.kill(-pids.worker,'SIGTERM');}catch{}rmSync(dir,{recursive:true,force:true});}
});

for(const mode of ['normal exit','timeout','outer group cancellation'])test(`${mode} also cleans a descendant that creates its own process group`,async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mtg-browser-detached-child-')),lock=join(dir,'job.lock'),marker=join(dir,'pids.json'),ack=join(dir,'descendant-TERM'),ready=join(dir,'descendant-ready');
  const grand=join(dir,'grand.mjs'),script=join(dir,'worker.mjs');
  writeFileSync(grand,`import {writeFileSync} from 'node:fs';process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(ack)},'received');process.exit(0);});writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);`);
  writeFileSync(script,`import {spawn} from 'node:child_process';import {writeFileSync,existsSync} from 'node:fs';const child=spawn(process.execPath,[${JSON.stringify(grand)}],{detached:true,stdio:'ignore'});const waiting=setInterval(()=>{if(existsSync(${JSON.stringify(ready)})){clearInterval(waiting);writeFileSync(${JSON.stringify(marker)},JSON.stringify({worker:process.pid,descendant:child.pid}));${mode==='normal exit'?'setTimeout(()=>process.exit(0),150);':'setInterval(()=>{},1000);'}}},10);`);
  const args=mode==='outer group cancellation'?['-c','bash "$1" "$2" & browser_wrapper_pid=$!; wait "$browser_wrapper_pid"','audit-parent',wrapper,script]:[wrapper,script];
  const runner=spawn('bash',args,{detached:true,stdio:'ignore',env:{...process.env,AUDIT_LOCK_PATH:lock,AUDIT_NATIVE_TIMEOUT_SECONDS:mode==='timeout'?'1':'20'}});let pids;
  try{const exited=once(runner,'exit');await until(()=>existsSync(marker));pids=JSON.parse(readFileSync(marker,'utf8'));if(mode==='outer group cancellation')stopGroup(runner);const outcome=await exited;if(mode==='normal exit')assert.deepEqual(outcome,[0,null]);if(mode==='timeout')assert.deepEqual(outcome,[124,null]);await until(()=>existsSync(ack)&&!live(pids.descendant));assert.equal(existsSync(ack),true,'A detached browser process is still an owned descendant');assert.equal(live(pids.descendant),false);assert.equal(live(process.pid),true);}
  finally{stopGroup(runner);if(pids){try{process.kill(-pids.descendant,'SIGTERM');}catch{}}await wait(100);rmSync(dir,{recursive:true,force:true});}
});
