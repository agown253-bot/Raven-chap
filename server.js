import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_ON_RENDER";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) console.warn("DATABASE_URL manquant. Configure une base PostgreSQL Render.");

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? {rejectUnauthorized:false} : false
}) : null;

async function q(text, params=[]){ if(!pool) throw new Error("Base de données non configurée"); return pool.query(text,params); }

async function initDb(){
 if(!pool) return;
 await q(`create table if not exists users(
  id uuid primary key,
  email text unique not null,
  password_hash text not null,
  display_name text not null default 'Raven',
  username text unique,
  avatar_url text default '',
  status_text text default '',
  is_online boolean default false,
  last_seen timestamptz,
  xp integer default 0,
  level integer default 1,
  rank text default 'E',
  created_at timestamptz default now()
 )`);
 await q(`create table if not exists rooms(
  id uuid primary key,
  kind text not null default 'private',
  name text,
  avatar text default '🐦‍⬛',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
 )`);
 await q(`create table if not exists room_members(
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text default 'member',
  joined_at timestamptz default now(),
  primary key(room_id,user_id)
 )`);
 await q(`create table if not exists messages(
  id uuid primary key,
  room_id uuid references rooms(id) on delete cascade,
  sender_id uuid references users(id) on delete cascade,
  body text default '',
  file_url text default '',
  file_name text default '',
  created_at timestamptz default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz
 )`);
 await q(`create table if not exists blocked_users(
  user_id uuid references users(id) on delete cascade,
  blocked_id uuid references users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key(user_id,blocked_id)
 )`);
 await q(`create table if not exists kingdoms(
  id uuid primary key,
  name text not null,
  description text default '',
  owner_id uuid references users(id) on delete set null,
  created_at timestamptz default now()
 )`);
 await q(`create table if not exists kingdom_members(
  kingdom_id uuid references kingdoms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text default 'member',
  primary key(kingdom_id,user_id)
 )`);
 await q(`create table if not exists games(
  id uuid primary key,
  type text not null,
  room_id uuid references rooms(id) on delete set null,
  state jsonb default '{}'::jsonb,
  status text default 'waiting',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
 )`);
 await q(`create index if not exists messages_room_idx on messages(room_id,created_at)`);
}

function tokenFor(u){ return jwt.sign({id:u.id},JWT_SECRET,{expiresIn:"30d"}); }
function auth(req,res,next){
 const h=req.headers.authorization||"";
 try{ if(!h.startsWith("Bearer ")) throw 0; req.user=jwt.verify(h.slice(7),JWT_SECRET); next(); }
 catch{res.status(401).json({error:"Non authentifié"});}
}
function uuid(){return crypto.randomUUID();}

app.get("/api/health",(req,res)=>res.json({ok:true,name:"RAVEN CHAT"}));

app.post("/api/auth/signup",async(req,res)=>{
 try{
  const {email,password,displayName}=req.body;
  if(!email||!password||password.length<6) return res.status(400).json({error:"E-mail et mot de passe (6 caractères minimum) requis."});
  const exists=await q("select id from users where lower(email)=lower($1)",[email]);
  if(exists.rowCount)return res.status(409).json({error:"Cet e-mail est déjà utilisé."});
  const id=uuid(), hash=await bcrypt.hash(password,12), username="raven_"+id.slice(0,8);
  const r=await q("insert into users(id,email,password_hash,display_name,username) values($1,$2,$3,$4,$5) returning id,email,display_name,username,avatar_url,status_text,xp,level,rank",[id,email.toLowerCase(),hash,displayName?.trim()||email.split("@")[0],username]);
  res.json({token:tokenFor(r.rows[0]),user:r.rows[0]});
 }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/auth/login",async(req,res)=>{
 try{
  const r=await q("select * from users where lower(email)=lower($1)",[req.body.email||""]);
  if(!r.rowCount||!(await bcrypt.compare(req.body.password||"",r.rows[0].password_hash))) return res.status(401).json({error:"E-mail ou mot de passe incorrect."});
  const u=r.rows[0]; await q("update users set is_online=true,last_seen=now() where id=$1",[u.id]);
  delete u.password_hash;
  res.json({token:tokenFor(u),user:u});
 }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/auth/logout",auth,async(req,res)=>{
 await q("update users set is_online=false,last_seen=now() where id=$1",[req.user.id]);res.json({ok:true});
});

app.get("/api/me",auth,async(req,res)=>{
 const r=await q("select id,email,display_name,username,avatar_url,status_text,is_online,last_seen,xp,level,rank from users where id=$1",[req.user.id]);
 res.json(r.rows[0]);
});

app.patch("/api/me",auth,async(req,res)=>{
 const allowed=["display_name","username","avatar_url","status_text"];
 const sets=[],vals=[]; for(const k of allowed){if(req.body[k]!==undefined){sets.push(`${k}=$${vals.length+1}`);vals.push(req.body[k]);}}
 if(!sets.length)return res.json({ok:true});
 vals.push(req.user.id); await q(`update users set ${sets.join(",")} where id=$${vals.length}`,[...vals]);res.json({ok:true});
});

app.get("/api/rooms",auth,async(req,res)=>{
 const r=await q(`select r.id,r.kind,r.name,r.avatar,r.created_at,
  (select m.body from messages m where m.room_id=r.id order by m.created_at desc limit 1) preview,
  (select m.created_at from messages m where m.room_id=r.id order by m.created_at desc limit 1) last_message
  from rooms r join room_members rm on rm.room_id=r.id
  where rm.user_id=$1 order by coalesce((select max(m.created_at) from messages m where m.room_id=r.id),r.created_at) desc`,[req.user.id]);
 res.json(r.rows);
});

app.post("/api/rooms/private",auth,async(req,res)=>{
 try{
  const target=await q("select id,display_name,avatar_url from users where lower(email)=lower($1)",[req.body.email||""]);
  if(!target.rowCount)return res.status(404).json({error:"Utilisateur introuvable."});
  const other=target.rows[0];
  if(other.id===req.user.id)return res.status(400).json({error:"Tu ne peux pas discuter avec toi-même."});
  const old=await q(`select r.id from rooms r
   join room_members a on a.room_id=r.id and a.user_id=$1
   join room_members b on b.room_id=r.id and b.user_id=$2
   where r.kind='private' and (select count(*) from room_members x where x.room_id=r.id)=2 limit 1`,[req.user.id,other.id]);
  if(old.rowCount)return res.json({id:old.rows[0].id});
  const id=uuid();
  await q("insert into rooms(id,kind,name,avatar,created_by) values($1,'private',$2,$3,$4)",[id,other.display_name,other.avatar_url||"🐦‍⬛",req.user.id]);
  await q("insert into room_members(room_id,user_id,role) values($1,$2,'member'),($1,$3,'member')",[id,req.user.id,other.id]);
  res.json({id});
 }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/rooms/group",auth,async(req,res)=>{
 const id=uuid(); const name=(req.body.name||"Nouveau royaume").trim();
 await q("insert into rooms(id,kind,name,avatar,created_by) values($1,'group',$2,'🏰',$3)",[id,name,req.user.id]);
 await q("insert into room_members(room_id,user_id,role) values($1,$2,'owner')",[id,req.user.id]);
 for(const email of (req.body.emails||[])){
  const u=await q("select id from users where lower(email)=lower($1)",[email]);
  if(u.rowCount) await q("insert into room_members(room_id,user_id,role) values($1,$2,'member') on conflict do nothing",[id,u.rows[0].id]);
 }
 res.json({id});
});

app.get("/api/rooms/:id/messages",auth,async(req,res)=>{
 const member=await q("select 1 from room_members where room_id=$1 and user_id=$2",[req.params.id,req.user.id]);
 if(!member.rowCount)return res.status(403).json({error:"Accès refusé"});
 const r=await q(`select m.id,m.room_id,m.sender_id,m.body,m.file_url,m.file_name,m.created_at,m.delivered_at,m.read_at,m.deleted_at,u.display_name,u.avatar_url
  from messages m join users u on u.id=m.sender_id where m.room_id=$1 order by m.created_at asc limit 500`,[req.params.id]);
 await q("update messages set delivered_at=coalesce(delivered_at,now()) where room_id=$1 and sender_id<>$2",[req.params.id,req.user.id]);
 res.json(r.rows);
});

app.post("/api/rooms/:id/messages",auth,async(req,res)=>{
 const member=await q("select 1 from room_members where room_id=$1 and user_id=$2",[req.params.id,req.user.id]);
 if(!member.rowCount)return res.status(403).json({error:"Accès refusé"});
 const id=uuid(); await q("insert into messages(id,room_id,sender_id,body,file_url,file_name) values($1,$2,$3,$4,$5,$6)",[id,req.params.id,req.user.id,req.body.body||"",req.body.fileUrl||"",req.body.fileName||""]);
 await q("update users set xp=xp+5,level=greatest(1,1+floor((xp+5)/100)) where id=$1",[req.user.id]);
 res.json({id});
});

app.patch("/api/messages/:id/read",auth,async(req,res)=>{
 await q("update messages set read_at=now() where id=$1 and sender_id<>$2",[req.params.id,req.user.id]);res.json({ok:true});
});
app.delete("/api/messages/:id",auth,async(req,res)=>{
 await q("update messages set deleted_at=now(),body='' where id=$1 and sender_id=$2",[req.params.id,req.user.id]);res.json({ok:true});
});

app.get("/api/leaderboard",auth,async(req,res)=>{
 const r=await q("select display_name,username,avatar_url,xp,level,rank from users order by xp desc limit 100");res.json(r.rows);
});

app.get("/api/kingdoms",auth,async(req,res)=>{
 const r=await q("select k.id,k.name,k.description,k.created_at,u.display_name owner from kingdoms k left join users u on u.id=k.owner_id order by k.created_at desc");res.json(r.rows);
});
app.post("/api/kingdoms",auth,async(req,res)=>{
 const id=uuid();await q("insert into kingdoms(id,name,description,owner_id) values($1,$2,$3,$4)",[id,req.body.name||"Royaume sans nom",req.body.description||"",req.user.id]);
 await q("insert into kingdom_members(kingdom_id,user_id,role) values($1,$2,'owner')",[id,req.user.id]);res.json({id});
});

app.post("/api/games",auth,async(req,res)=>{
 const id=uuid();await q("insert into games(id,type,state,created_by) values($1,$2,$3,$4)",[id,req.body.type||"quiz",JSON.stringify({}),req.user.id]);res.json({id});
});

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});
app.post("/api/upload",auth,upload.single("file"),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Fichier manquant"});
 // Stockage local simple pour la V1. Sur Render, les fichiers locaux ne sont pas persistants.
 // Pour des médias persistants, connecter plus tard un stockage objet (S3/R2/etc.).
 const name=Date.now()+"-"+req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_");
 const dir=path.join(__dirname,"uploads"); await (await import("fs/promises")).mkdir(dir,{recursive:true});
 await (await import("fs/promises")).writeFile(path.join(dir,name),req.file.buffer);
 res.json({url:"/uploads/"+name,name:req.file.originalname});
});
app.use("/uploads",express.static(path.join(__dirname,"uploads")));

app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

initDb().then(()=>app.listen(PORT,()=>console.log("RAVEN CHAT lancé sur "+PORT))).catch(e=>{console.error(e);process.exit(1)});
