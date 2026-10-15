import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
const app=express();app.use(express.static('public'));const http=createServer(app);const io=new Server(http,{cors:{origin:false}});
const rooms=new Map();
const code=()=>Array.from({length:4},(_,i)=>i).map(()=>0); // placeholder unused
const secret=()=>{let a=[0,1,2,3,4,5,6,7,8,9];for(let i=a.length-1;i>0;i--){let j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,4).join('');};
const grade=(guess,target)=>({fijas:[...guess].filter((x,i)=>x===target[i]).length,picas:[...guess].filter((x,i)=>x!==target[i]&&target.includes(x)).length});
const valid=n=>typeof n==='string'&&/^\d{4}$/.test(n)&&new Set(n).size===4;
const clean=s=>String(s||'Jugador').trim().slice(0,24).replace(/[<>]/g,'')||'Jugador';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const roomCode=()=>Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
const view=(r,s)=>({code:r.code,status:r.status,players:r.players.map(p=>({name:p.name,connected:p.connected,id:p.id===s.id?'you':'opponent'})),turn:r.players[r.turn]?.id===s.id?'you':'opponent',round:r.round,history:r.history,deadline:r.deadline,winner:r.winner,reason:r.reason});
const emit=r=>r.players.forEach(p=>{const s=io.sockets.sockets.get(p.id);if(s)s.emit('room',view(r,s));});
const reset=r=>{r.round=1;r.turn=0;r.history=[];r.secrets=[secret(),secret()];r.status='playing';r.deadline=Date.now()+120000;r.winner=null;r.reason=null;};
function finish(r,idx,reason){r.status='finished';r.winner=idx;r.reason=reason;r.deadline=null;emit(r);}
function expire(r){if(r.status!=='playing')return;if(Date.now()<r.deadline)return;const idx=r.turn;finish(r,1-idx,'Se agotó el tiempo del turno');}
io.on('connection',socket=>{
 socket.on('create',({name}={},cb=()=>{})=>{let c;do{c=roomCode()}while(rooms.has(c));const r={code:c,players:[{id:socket.id,name:clean(name),connected:true}],status:'waiting',created:Date.now(),round:1,turn:0,history:[],deadline:null,winner:null};rooms.set(c,r);socket.data.room=c;socket.join(c);cb({ok:true,code:c});emit(r);});
 socket.on('join',({code,name}={},cb=()=>{})=>{const r=rooms.get(String(code||'').toUpperCase().trim());if(!r)return cb({error:'Sala no encontrada'});if(r.players.length!==1||r.status!=='waiting')return cb({error:'La sala ya está completa'});r.players.push({id:socket.id,name:clean(name),connected:true});socket.data.room=r.code;socket.join(r.code);reset(r);cb({ok:true});emit(r);});
 socket.on('guess',({value}={},cb=()=>{})=>{const r=rooms.get(socket.data.room);if(!r||r.status!=='playing')return cb({error:'No hay partida activa'});expire(r);if(r.status!=='playing')return cb({error:'Tiempo agotado'});const idx=r.players.findIndex(p=>p.id===socket.id);if(idx!==r.turn)return cb({error:'Espera tu turno'});if(!valid(value))return cb({error:'Usa cuatro cifras diferentes'});const g=grade(value,r.secrets[1-idx]);r.history.push({player:idx,guess:value,...g,round:r.round});if(g.fijas===4){finish(r,idx,'Descifró el código');cb({ok:true});return;}r.turn=1-idx;r.deadline=Date.now()+120000;cb({ok:true});emit(r);});
 socket.on('rematch',(cb=()=>{})=>{const r=rooms.get(socket.data.room);if(!r||r.status!=='finished'||r.players.length!==2)return cb({error:'Partida no disponible'});r.votes??=new Set();r.votes.add(socket.id);if(r.votes.size===2){r.votes.clear();reset(r);}cb({ok:true});emit(r);});
 socket.on('disconnect',()=>{const r=rooms.get(socket.data.room);if(!r)return;const idx=r.players.findIndex(p=>p.id===socket.id);if(idx<0)return;r.players[idx].connected=false;if(r.status==='playing')finish(r,1-idx,'El rival se desconectó');else emit(r);});
});
setInterval(()=>{for(const [c,r] of rooms){expire(r);if(Date.now()-r.created>6*3600000||r.players.every(p=>!p.connected))rooms.delete(c);}},1000).unref();
http.listen(process.env.PORT||3000,()=>console.log('Picas y Fijas listo'));
