let tracks=[],current=0,token=localStorage.fa200_token||"",isRegister=false;
const audio=document.querySelector("#audio"),q=document.querySelector("#q");
const api=async(url,opt={})=>{opt.headers={...(opt.headers||{}),...(token?{Authorization:"Bearer "+token}:{})};const r=await fetch(url,opt);const d=await r.json();if(!r.ok)throw Error(d.error||"Erreur");return d};
const fmt=t=>`${Math.floor((t||0)/60)}:${String(Math.floor((t||0)%60)).padStart(2,"0")}`;
function card(t){return `<article class="card" onclick="play(${t.id})"><div class="art">${t.cover?`<img src="${t.cover}">`:"<span>FA200</span>"}</div><b>${esc(t.title)}</b><small>${esc(t.artist)} · ${esc(t.genre||"Music")}</small></article>`}
const esc=x=>String(x).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function load(qs=""){tracks=await api("/api/tracks"+qs);document.querySelector("#tracks").innerHTML=tracks.map(card).join("");}
async function genre(g){view("search");q.value=g;const x=await api("/api/tracks?genre="+encodeURIComponent(g));document.querySelector("#results").innerHTML=x.map(card).join("")}
q.addEventListener("input",async()=>{view("search");const x=await api("/api/tracks?q="+encodeURIComponent(q.value));document.querySelector("#results").innerHTML=x.map(card).join("")});
async function play(id){const t=(await api("/api/tracks?q="+encodeURIComponent(id))).find(x=>x.id===id)||await api("/api/tracks/"+id);current=id;audio.src=t.audio;document.querySelector("#nt").textContent=t.title;document.querySelector("#na").textContent=t.artist;document.querySelector("#pb").textContent="Ⅱ";audio.play().catch(()=>{});api("/api/tracks/"+id+"/play",{method:"POST"}).catch(()=>{})}
async function toggle(){if(!audio.src){if(tracks[0])play(tracks[0].id);return}if(audio.paused){audio.play();pb.textContent="Ⅱ"}else{audio.pause();pb.textContent="▶"}}
function next(){const i=tracks.findIndex(x=>x.id===current);play((tracks[(i+1)%tracks.length]||tracks[0]).id)}
function prev(){const i=tracks.findIndex(x=>x.id===current);play((tracks[(i-1+tracks.length)%tracks.length]||tracks[0]).id)}
audio.addEventListener("timeupdate",()=>{seek.value=audio.duration?audio.currentTime/audio.duration*100:0;ct.textContent=fmt(audio.currentTime);dt.textContent=fmt(audio.duration)});
seek.oninput=()=>{if(audio.duration)audio.currentTime=seek.value/100*audio.duration};vol.oninput=()=>audio.volume=vol.value;audio.volume=.8;audio.onended=next;
function view(id){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));document.querySelector("#"+id).classList.remove("hidden");if(id==="favorites")favorites();if(id==="library")library()}
function openAuth(){modal.classList.remove("hidden");authMsg.textContent=""}
function closeAuth(){modal.classList.add("hidden")}
function toggleAuth(){isRegister=!isRegister;authTitle.textContent=isRegister?"Créer un compte":"Connexion";document.querySelectorAll(".registerOnly").forEach(x=>x.style.display=isRegister?"block":"none")}
async function submitAuth(){try{const body={email:authEmail.value,password:authPass.value};if(isRegister)body.name=authName.value;const d=await api("/api/auth/"+(isRegister?"register":"login"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});token=d.token;localStorage.fa200_token=token;account.textContent=(d.user.name||"A")[0].toUpperCase();closeAuth();load()}catch(e){authMsg.textContent=e.message}}
async function favorites(){if(!token){openAuth();return}const x=await api("/api/favorites");favContent.innerHTML=x.length?x.map(card).join(""):"<p style='color:#777'>Aucun favori pour le moment.</p>"}
async function favoriteCurrent(){if(!token){openAuth();return}if(current)await api("/api/favorites/"+current,{method:"POST"})}
async function createPlaylist(){if(!token){openAuth();return}const name=prompt("Nom de la playlist ?");if(!name)return;await api("/api/playlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});playlists()}
async function playlists(){if(!token)return;const x=await api("/api/playlists");sidePlaylists.innerHTML=x.map(p=>`<button onclick="playlist(${p.id})">♫ ${esc(p.name)}</button>`).join("")}
async function playlist(id){view("library");const x=await api("/api/playlists/"+id+"/tracks");libraryContent.innerHTML=`<h2>Playlist</h2><div class="grid">${x.map(card).join("")}</div>`}
async function library(){if(!token){libraryContent.innerHTML="<p style='color:#777'>Connecte-toi pour retrouver tes playlists et favoris.</p>";return}await playlists();const x=await api("/api/favorites");libraryContent.innerHTML=`<h2>Tes favoris</h2><div class="grid">${x.map(card).join("")}</div>`}
(async()=>{if(token){try{const u=await api("/api/me");account.textContent=(u.name||"A")[0].toUpperCase()}catch{token="";localStorage.removeItem("fa200_token")}}await load();await playlists()})();