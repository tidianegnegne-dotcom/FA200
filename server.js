import express from "express";
import path from "path";
import {fileURLToPath} from "url";
import fs from "fs";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(), PORT=process.env.PORT||3000;
const SECRET=process.env.JWT_SECRET||"change-this-secret-in-production";
const dataDir=path.join(__dirname,"data"), uploadDir=path.join(__dirname,"uploads");
fs.mkdirSync(dataDir,{recursive:true}); fs.mkdirSync(uploadDir,{recursive:true});
const db=new Database(path.join(dataDir,"fa200.db"));
db.pragma("journal_mode = WAL");
for (const sql of [
 "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'listener'",
 "ALTER TABLE users ADD COLUMN artist_status TEXT DEFAULT 'none'",
 "ALTER TABLE users ADD COLUMN artist_name TEXT DEFAULT ''",
 "ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''",
 "ALTER TABLE tracks ADD COLUMN owner_id INTEGER",
 "ALTER TABLE tracks ADD COLUMN rights_confirmed INTEGER DEFAULT 0",
 "ALTER TABLE tracks ADD COLUMN status TEXT DEFAULT 'approved'"
]) { try { db.exec(sql); } catch {} }

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT DEFAULT 'listener',artist_status TEXT DEFAULT 'none',artist_name TEXT DEFAULT '',bio TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,artist TEXT NOT NULL,album TEXT DEFAULT '',genre TEXT DEFAULT '',cover TEXT DEFAULT '',audio TEXT NOT NULL,plays INTEGER DEFAULT 0,owner_id INTEGER,rights_confirmed INTEGER DEFAULT 0,status TEXT DEFAULT 'approved',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS playlists(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id INTEGER NOT NULL,track_id INTEGER NOT NULL,UNIQUE(playlist_id,track_id));
CREATE TABLE IF NOT EXISTS favorites(user_id INTEGER NOT NULL,track_id INTEGER NOT NULL,UNIQUE(user_id,track_id));
CREATE TABLE IF NOT EXISTS artist_applications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE NOT NULL,artist_name TEXT NOT NULL,bio TEXT DEFAULT '',status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT,track_id INTEGER NOT NULL,user_id INTEGER,reason TEXT NOT NULL,status TEXT DEFAULT 'open',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
if(db.prepare("SELECT COUNT(*) c FROM tracks").get().c===0){
 const add=db.prepare("INSERT INTO tracks(title,artist,album,genre,audio) VALUES(?,?,?,?,?)");
 [
  ["Afterglow","Nova","FA200 Sessions","Chill","https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"],
  ["Midnight Drive","Luna","Night Drive","Night","https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"],
  ["Velvet Sky","Aeris","Velvet","Love","https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"],
  ["Neon Hearts","Kairo","Neon","Focus","https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"]
 ].forEach(x=>add.run(...x));
}
app.use(express.json()); app.use(express.urlencoded({extended:true}));
app.use("/uploads",express.static(uploadDir)); app.use(express.static(path.join(__dirname,"public")));

function token(user){return jwt.sign({id:user.id,email:user.email,name:user.name},SECRET,{expiresIn:"7d"})}
function auth(req,res,next){try{req.user=jwt.verify((req.headers.authorization||"").replace("Bearer ",""),SECRET);next()}catch{res.status(401).json({error:"Connexion requise"})}}
const upload=multer({dest:uploadDir});

app.post("/api/auth/register",(req,res)=>{
 const {name,email,password}=req.body;
 if(!name||!email||!password||password.length<6)return res.status(400).json({error:"Nom, email et mot de passe (6 caractères minimum) requis."});
 try{const hash=bcrypt.hashSync(password,10); const r=db.prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)").run(name,email.toLowerCase(),hash); const u={id:r.lastInsertRowid,name,email:email.toLowerCase()}; res.json({token:token(u),user:u})}
 catch{res.status(409).json({error:"Cet email est déjà utilisé."})}
});
app.post("/api/auth/login",(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE email=?").get((req.body.email||"").toLowerCase());
 if(!u||!bcrypt.compareSync(req.body.password||"",u.password))return res.status(401).json({error:"Email ou mot de passe incorrect."});
 res.json({token:token(u),user:{id:u.id,name:u.name,email:u.email}});
});
app.get("/api/me",auth,(req,res)=>{const u=db.prepare("SELECT id,name,email,role,artist_status,artist_name,bio FROM users WHERE id=?").get(req.user.id);res.json(u)});

app.post("/api/artists/apply",auth,(req,res)=>{
 const name=(req.body.artist_name||"").trim(), bio=(req.body.bio||"").trim();
 if(!name)return res.status(400).json({error:"Nom d'artiste requis"});
 const u=db.prepare("SELECT artist_status FROM users WHERE id=?").get(req.user.id);
 if(u.artist_status==="approved")return res.status(400).json({error:"Ton profil artiste est déjà approuvé."});
 db.prepare("INSERT INTO artist_applications(user_id,artist_name,bio,status) VALUES(?,?,?,'pending') ON CONFLICT(user_id) DO UPDATE SET artist_name=excluded.artist_name,bio=excluded.bio,status='pending'").run(req.user.id,name,bio);
 db.prepare("UPDATE users SET artist_name=?,bio=?,artist_status='pending' WHERE id=?").run(name,bio,req.user.id);
 res.json({ok:true,status:"pending"});
});
app.get("/api/artists/me",auth,(req,res)=>res.json(db.prepare("SELECT id,name,email,role,artist_status,artist_name,bio FROM users WHERE id=?").get(req.user.id)));
app.post("/api/artists/tracks",auth,upload.fields([{name:"audio",maxCount:1},{name:"cover",maxCount:1}]),(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
 if(!u || u.artist_status!=="approved")return res.status(403).json({error:"Ton profil artiste doit être approuvé avant de publier."});
 const {title,album="",genre=""}=req.body;
 if(!title||!req.files?.audio?.[0])return res.status(400).json({error:"Titre et fichier audio requis"});
 if(String(req.body.rights_confirmed)!=="1")return res.status(400).json({error:"Tu dois confirmer que tu as les droits nécessaires sur ce morceau."});
 const audio="/uploads/"+req.files.audio[0].filename, cover=req.files.cover?.[0]?"/uploads/"+req.files.cover[0].filename:"";
 const r=db.prepare("INSERT INTO tracks(title,artist,album,genre,cover,audio,owner_id,rights_confirmed,status) VALUES(?,?,?,?,?,?,?,?,?)").run(title,u.artist_name||u.name,album,genre,cover,audio,u.id,1,"pending");
 res.json({ok:true,track:db.prepare("SELECT * FROM tracks WHERE id=?").get(r.lastInsertRowid)});
});
app.get("/api/artists/my-tracks",auth,(req,res)=>res.json(db.prepare("SELECT * FROM tracks WHERE owner_id=? ORDER BY id DESC").all(req.user.id)));
app.post("/api/tracks/:id/report",auth,(req,res)=>{
 const reason=(req.body.reason||"").trim(); if(!reason)return res.status(400).json({error:"Motif requis"});
 db.prepare("INSERT INTO reports(track_id,user_id,reason) VALUES(?,?,?)").run(req.params.id,req.user.id,reason); res.json({ok:true});
});
app.get("/api/admin/artist-applications",auth,(req,res)=>{if(!process.env.ADMIN_EMAIL||req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});res.json(db.prepare("SELECT a.*,u.email FROM artist_applications a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC").all())});
app.post("/api/admin/artist-applications/:id/approve",auth,(req,res)=>{if(!process.env.ADMIN_EMAIL||req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});const a=db.prepare("SELECT * FROM artist_applications WHERE id=?").get(req.params.id);if(!a)return res.status(404).json({error:"Demande introuvable"});db.prepare("UPDATE artist_applications SET status='approved' WHERE id=?").run(a.id);db.prepare("UPDATE users SET role='artist',artist_status='approved',artist_name=?,bio=? WHERE id=?").run(a.artist_name,a.bio,a.user_id);res.json({ok:true})});
app.post("/api/admin/artist-applications/:id/reject",auth,(req,res)=>{if(!process.env.ADMIN_EMAIL||req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});const a=db.prepare("SELECT * FROM artist_applications WHERE id=?").get(req.params.id);if(!a)return res.status(404).json({error:"Demande introuvable"});db.prepare("UPDATE artist_applications SET status='rejected' WHERE id=?").run(a.id);db.prepare("UPDATE users SET artist_status='rejected' WHERE id=?").run(a.user_id);res.json({ok:true})});
app.get("/api/admin/pending-tracks",auth,(req,res)=>{if(!process.env.ADMIN_EMAIL||req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});res.json(db.prepare("SELECT t.*,u.email FROM tracks t LEFT JOIN users u ON u.id=t.owner_id WHERE t.status='pending' ORDER BY t.id DESC").all())});
app.post("/api/admin/tracks/:id/approve",auth,(req,res)=>{if(!process.env.ADMIN_EMAIL||req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});db.prepare("UPDATE tracks SET status='approved' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/tracks/:id/reject",auth,(req,res)=>{if(!process.env.ADMIN_EMAIL||req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});db.prepare("UPDATE tracks SET status='rejected' WHERE id=?").run(req.params.id);res.json({ok:true})});

app.get("/api/tracks",(req,res)=>{
 const q=(req.query.q||"").trim(), genre=req.query.genre;
 let sql="SELECT * FROM tracks WHERE status='approved'", args=[];
 if(q){sql+=" AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)"; const x=`%${q}%`;args.push(x,x,x)}
 if(genre){sql+=" AND genre=?";args.push(genre)}
 sql+=" ORDER BY plays DESC,id DESC";
 res.json(db.prepare(sql).all(...args));
});
app.post("/api/tracks/:id/play",(req,res)=>{db.prepare("UPDATE tracks SET plays=plays+1 WHERE id=?").run(req.params.id);res.json({ok:true})});

app.get("/api/favorites",auth,(req,res)=>res.json(db.prepare("SELECT t.* FROM favorites f JOIN tracks t ON t.id=f.track_id WHERE f.user_id=?").all(req.user.id)));
app.post("/api/favorites/:id",auth,(req,res)=>{
 const exists=db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND track_id=?").get(req.user.id,req.params.id);
 if(exists)db.prepare("DELETE FROM favorites WHERE user_id=? AND track_id=?").run(req.user.id,req.params.id);
 else db.prepare("INSERT OR IGNORE INTO favorites VALUES(?,?)").run(req.user.id,req.params.id);
 res.json({favorite:!exists});
});

app.get("/api/playlists",auth,(req,res)=>res.json(db.prepare("SELECT * FROM playlists WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.post("/api/playlists",auth,(req,res)=>{
 const name=(req.body.name||"").trim(); if(!name)return res.status(400).json({error:"Nom requis"});
 const r=db.prepare("INSERT INTO playlists(user_id,name) VALUES(?,?)").run(req.user.id,name);res.json(db.prepare("SELECT * FROM playlists WHERE id=?").get(r.lastInsertRowid));
});
app.get("/api/playlists/:id/tracks",auth,(req,res)=>{
 const p=db.prepare("SELECT * FROM playlists WHERE id=? AND user_id=?").get(req.params.id,req.user.id); if(!p)return res.status(404).json({error:"Playlist introuvable"});
 res.json(db.prepare("SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=?").all(req.params.id));
});
app.post("/api/playlists/:id/tracks/:trackId",auth,(req,res)=>{
 const p=db.prepare("SELECT 1 FROM playlists WHERE id=? AND user_id=?").get(req.params.id,req.user.id); if(!p)return res.status(404).json({error:"Playlist introuvable"});
 db.prepare("INSERT OR IGNORE INTO playlist_tracks VALUES(?,?)").run(req.params.id,req.params.trackId);res.json({ok:true});
});
app.delete("/api/playlists/:id",auth,(req,res)=>{db.prepare("DELETE FROM playlist_tracks WHERE playlist_id=?").run(req.params.id);db.prepare("DELETE FROM playlists WHERE id=? AND user_id=?").run(req.params.id,req.user.id);res.json({ok:true})});

app.post("/api/admin/tracks",auth,upload.fields([{name:"audio",maxCount:1},{name:"cover",maxCount:1}]),(req,res)=>{
 // Simple MVP admin gate: email listed in ADMIN_EMAIL.
 if(!process.env.ADMIN_EMAIL || req.user.email!==process.env.ADMIN_EMAIL)return res.status(403).json({error:"Accès admin refusé"});
 const {title,artist,album="",genre=""}=req.body;
 if(!title||!artist||!req.files?.audio?.[0])return res.status(400).json({error:"Titre, artiste et fichier audio requis"});
 const audio="/uploads/"+req.files.audio[0].filename, cover=req.files.cover?.[0]?"/uploads/"+req.files.cover[0].filename:"";
 const r=db.prepare("INSERT INTO tracks(title,artist,album,genre,cover,audio) VALUES(?,?,?,?,?,?)").run(title,artist,album,genre,cover,audio);
 res.json(db.prepare("SELECT * FROM tracks WHERE id=?").get(r.lastInsertRowid));
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`FA200 Music running on http://localhost:${PORT}`));
