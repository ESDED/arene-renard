// ARÈNE RENARD — serveur de jeu (aucune dépendance, Node 16+ suffit)
// Lancement :  node server.js     (ou double-clic sur lancer-serveur.bat)
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
// Cherche un fichier dans le dossier du serveur, puis dans le dossier du dessus et ses sous-dossiers (le rangement du dossier peut changer)
const FIND_DIRS = [__dirname, path.join(__dirname, '..')];
for (const base of [path.join(__dirname, '..'), __dirname]) for (const d of ['Admin', 'admin', 'pem', 'exe', 'bloc-notes', 'bat', 'jeu']) FIND_DIRS.push(path.join(base, d));
const findFile = n => { for (const d of FIND_DIRS) { const p = path.join(d, n); try { if (fs.statSync(p).isFile()) return p; } catch (e) { /* ok */ } } return path.join(__dirname, n); };

const PORT = +process.env.PORT || 3000;
const ADMIN_ACTIF = false; // false = plus personne ne peut être admin ; mets true pour le réactiver
const ADMIN_NOM = 'Benjamin'; // nom affiché dans l'annonce « L'ADMIN … EST CONNECTÉ » (change-le ici)
let KILL_LIMIT = +process.env.KILL_LIMIT || 25;
// Rôles : chaque mot de passe donne une interface (et des droits) différents. Seules les empreintes sont gardées.
const ROLES = {
  mod:  { nom: 'Modérateur', h: process.env.HASH_MOD || '-', acts: ['list', 'kick', 'ban', 'frzp', 'mutep', 'healp', 'say', 'freezeall', 'thawall', 'unban', 'ghost', 'pm', 'chatmute', 'bans', 'unbanp', 'alog'] },
  anim: { nom: 'Animateur', h: process.env.HASH_ANIM || '-', acts: ['list', 'map', 'restart', 'limit', 'chaos', 'say', 'healall', 'ghost', 'season', 'bonus', 'tpc', 'chaosp', 'sched_add', 'sched_del'] },
  junior: { nom: 'Junior', h: process.env.HASH_JUNIOR || '-', acts: ['list', 'map', 'restart', 'chaos', 'say', 'healall', 'healp', 'ghost', 'season', 'bonus', 'tpc', 'chaosp', 'sched_add', 'sched_del', 'pm'] },
  gift: { nom: 'Cadeaux', h: process.env.HASH_GIFT || '-', acts: ['list', 'giftp', 'ghost'] },
};
const ADMIN_HASH = process.env.HASH_FULL || '-'; // mot de passe admin principal : empreinte dans la variable HASH_FULL (voir README) // le mot de passe n'est écrit nulle part, seulement son empreinte
const admSlow = pw => { const cr = require('crypto'), sh = x => cr.createHash('sha256').update(x).digest('hex'); let h = sh('rv-adm-salt|' + pw); for (let i = 0; i < 3000; i++) h = sh(h + pw); return h; };
const RESPAWN_MS = 3000;
const NEXT_MATCH_MS = 9000;

// Mêmes armes que dans le jeu (index = numéro de l'arme - 1)
const WEAP = [
  { dmg: 24, hs: 2.0, rps: 5,   range: 80,  pellets: 1 },  // 0 Pistolet
  { dmg: 12, hs: 1.5, rps: 16,  range: 55,  pellets: 1 },  // 1 Uzi
  { dmg: 22, hs: 2.0, rps: 9,   range: 100, pellets: 1 },  // 2 Fusil d'assaut
  { dmg: 20, hs: 2.0, rps: 12,  range: 110, pellets: 1 },  // 3 Fusil à rafale (3 balles très rapprochées)
  { dmg: 55, hs: 2.0, rps: 2,   range: 120, pellets: 1 },  // 4 Revolver
  { dmg: 11, hs: 1.5, rps: 1.2, range: 30,  pellets: 9 },  // 5 Shotgun
  { dmg: 90, hs: 2.0, rps: 0.9, range: 300, pellets: 1 },  // 6 Sniper
  { dmg: 0,  hs: 1.0, rps: 0.6, range: 200, pellets: 1, ex: { r: 4.5, dmg: 95 } }, // 7 Lance-roquettes (explosion)
  { dmg: 5,  hs: 1.0, rps: 18,  range: 11,  pellets: 1 },  // 8 Lance-flammes
  { dmg: 50, hs: 1.4, rps: 2.2, range: 3.2, pellets: 1 },  // 9 Couteau
  { dmg: 40, hs: 2, rps: 1.6, range: 150, pellets: 1 },  // 10 Arc
  { dmg: 58, hs: 2, rps: 1.1, range: 200, pellets: 1 },  // 11 Arbalète
  { dmg: 18, hs: 2, rps: 7, range: 90, pellets: 1 },  // 12 Fusil-épée
  { dmg: 0, hs: 1, rps: 1.6, range: 120, pellets: 1, ex: { r: 3.5, dmg: 70 } },  // 13 Lance-grenades
  { dmg: 8, hs: 1.4, rps: 22, range: 70, pellets: 1 },  // 14 Minigun
  { dmg: 19, hs: 1.6, rps: 6.5, range: 80, pellets: 1 },  // 15 Paintball
  { dmg: 11, hs: 1.6, rps: 13, range: 60, pellets: 1 },  // 16 Panthère
  { dmg: 20, hs: 2, rps: 8.5, range: 110, pellets: 1 },  // 17 Fusil à énergie
  { dmg: 22, hs: 1.8, rps: 6, range: 90, pellets: 1 },  // 18 Pistolet givré
  { dmg: 0, hs: 1, rps: 0.8, range: 120, pellets: 1, ex: { r: 5.5, dmg: 75 } },  // 19 Aspire-vent
  { dmg: 0, hs: 1, rps: 2.5, range: 120, pellets: 1, ex: { r: 2.5, dmg: 38 } },  // 20 Bâton magique
  { dmg: 6, hs: 1.4, rps: 3, range: 22, pellets: 10 },  // 21 Canon court
  { dmg: 45, hs: 1.5, rps: 2, range: 90, pellets: 1 },  // 22 Pistolet fusée
  { dmg: 7, hs: 1.5, rps: 14, range: 35, pellets: 1 },  // 23 Bombe de peinture
  { dmg: 22, hs: 2, rps: 3.5, range: 45, pellets: 1 },  // 24 Poignards
  { dmg: 28, hs: 1.8, rps: 3.5, range: 100, pellets: 1 },  // 25 Canon lourd
  { dmg: 9, hs: 1.6, rps: 10, range: 55, pellets: 1 },  // 26 Fronde
  { dmg: 14, hs: 1.8, rps: 8, range: 70, pellets: 1 },  // 27 Duo laser
  { dmg: 10, hs: 1.5, rps: 1.5, range: 35, pellets: 1 },  // 28 Sauteur
  { dmg: 120, hs: 1.5, rps: 0.8, range: 200, pellets: 1 },  // 29 Canon cristal
  { dmg: 25, hs: 1.2, rps: 2.8, range: 2.6, pellets: 1 },  // 30 Poings
  { dmg: 14, hs: 1, rps: 8, range: 2.8, pellets: 1 },  // 31 Tronçonneuse
  { dmg: 50, hs: 1.3, rps: 1.4, range: 3.6, pellets: 1 },  // 32 Faux
  { dmg: 45, hs: 1.3, rps: 1.5, range: 3.3, pellets: 1 },  // 33 Katana
  { dmg: 20, hs: 1, rps: 1.5, range: 2.5, pellets: 1 },  // 34 Bouclier anti-émeute
  { dmg: 65, hs: 1.3, rps: 1.1, range: 3.3, pellets: 1 },  // 35 Hache de bataille
  { dmg: 40, hs: 1.3, rps: 1.6, range: 2.8, pellets: 1 },  // 36 Spatule
  { dmg: 90, hs: 1.2, rps: 0.7, range: 3.5, pellets: 1 },  // 37 Marteau géant
  { dmg: 55, hs: 1.3, rps: 1.4, range: 4.6, pellets: 1 },  // 38 Lance
  { dmg: 42, hs: 1.5, rps: 2.4, range: 3, pellets: 1 },  // 39 Tesson
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1, ex: { r: 5, dmg: 75 } },  // 40 Grenade
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 41 Grenade fumigène
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 42 Grenade flash
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1, ex: { r: 3.5, dmg: 40 } },  // 43 Molotov
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 44 Cor de guerre
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1, ex: { r: 5, dmg: 70 } },  // 45 Sac piégé
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 46 Rayon givre
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1, ex: { r: 6, dmg: 140 } },  // 47 Mine éclair
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 48 Trousse de soins
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 49 Pierre bond
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 50 Tremplin
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 51 Grappin
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1, ex: { r: 4, dmg: 40 } },  // 52 Potion
  { dmg: 0, hs: 1, rps: 1, range: 120, pellets: 1 },  // 53 Dé chance
  { dmg: 40, hs: 1, rps: 1.2, range: 110, pellets: 1, ex: { r: 3.5, dmg: 65 } },  // 54 Lance-citrouilles
  { dmg: 20, hs: 2, rps: 8, range: 90, pellets: 1 },  // 55 Pistolet fantôme
  { dmg: 42, hs: 2, rps: 1.6, range: 160, pellets: 1 },  // 56 Arc des chauves-souris
  { dmg: 17, hs: 2, rps: 11, range: 100, pellets: 1 },  // 57 Fusil toile d'araignée
  { dmg: 26, hs: 1, rps: 3, range: 120, pellets: 1, ex: { r: 2.2, dmg: 30 } },  // 58 Baguette de sorcière
  { dmg: 9, hs: 1.5, rps: 20, range: 70, pellets: 1 },  // 59 Mitrailleuse squelette
  { dmg: 35, hs: 1, rps: 1.4, range: 110, pellets: 1, ex: { r: 3, dmg: 55 } },  // 60 Lance-boules de neige
  { dmg: 22, hs: 2, rps: 7, range: 90, pellets: 1 },  // 61 Pistolet de glace
  { dmg: 15, hs: 1.5, rps: 12, range: 80, pellets: 1 },  // 62 Fusil sucre d'orge
  { dmg: 14, hs: 1.5, rps: 10, range: 60, pellets: 1 },  // 63 Pistolet à eau
  { dmg: 44, hs: 2, rps: 1.6, range: 160, pellets: 1 },  // 64 Arc du soleil
  { dmg: 38, hs: 1, rps: 1.3, range: 110, pellets: 1, ex: { r: 3.2, dmg: 60 } },  // 65 Lance-ballons
  { dmg: 18, hs: 2, rps: 10, range: 100, pellets: 1 },  // 66 Fusil de feuilles
  { dmg: 30, hs: 1.6, rps: 2.5, range: 90, pellets: 1 },  // 67 Lance-glands
  { dmg: 52, hs: 1.3, rps: 1.4, range: 3.6, pellets: 1 },  // 68 Faux de récolte
  { dmg: 16, hs: 2, rps: 11, range: 100, pellets: 1 },  // 69 Fusil à pétales
  { dmg: 24, hs: 1, rps: 3, range: 120, pellets: 1, ex: { r: 2.2, dmg: 30 } },  // 70 Baguette fleurie
  { dmg: 21, hs: 2, rps: 8, range: 90, pellets: 1 },  // 71 Pistolet abeille
];
WEAP.forEach((w, i) => { const f = 0.9 + ((i * 7) % 5) * 0.05; if (w.dmg) w.dmg = Math.round(w.dmg * f); if (w.ex && w.ex.dmg) w.ex.dmg = Math.round(w.ex.dmg * f); });
const MAP_CX = [0, 400, 800, 1200, 1600];
let curMap = 0;
const votes = new Map(); // id joueur -> carte
const counts = () => { const c = [0, 0, 0, 0, 0]; for (const v of votes.values()) c[v]++; return c; };
const leader = () => { const c = counts(), mx = Math.max(...c); if (mx <= 0) return -1; const t = c.map((n, i) => n === mx ? i : -1).filter(i => i >= 0); return t[Math.floor(Math.random() * t.length)]; };
const SPAWNS = [[0, 12], [-35, -35], [35, -35], [35, 35], [-35, 35], [0, -35], [-35, 5], [35, 10]];

// ---------- HTTP (sert le jeu) ----------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/jeu-de-tir.html') {
    fs.readFile(findFile('jeu-de-tir.html'), (e, d) => {
      if (e) { res.writeHead(500); return res.end('jeu-de-tir.html introuvable'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(d);
    });
  } else if (url === '/admin' || url === '/admin.html') {
    fs.readFile(findFile('admin.html'), (e, d) => {
      if (e) { res.writeHead(404); return res.end('admin.html introuvable'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(d);
    });
  } else if (url === '/qr' || url === '/qr.html') {
    fs.readFile(findFile('qr.html'), 'utf8', (e, d) => {
      if (e) { res.writeHead(404); return res.end('qr.html introuvable'); }
      const lan = []; for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) lan.push('http://' + i.address + ':' + PORT + '/');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(d.replace('__LAN__', lan.join(',')));
    });
  } else { res.writeHead(404); res.end('404'); }
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return sock.destroy();
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true);
  onConnect(sock);
});

// ---------- WebSocket minimal ----------
function parseFrame(b) {
  if (b.length < 2) return null;
  const op = b[0] & 15;
  let len = b[1] & 127, off = 2;
  const masked = b[1] & 128;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  const mlen = masked ? 4 : 0;
  if (b.length < off + mlen + len) return null;
  const payload = Buffer.from(b.subarray(off + mlen, off + mlen + len));
  if (masked) { const m = b.subarray(off, off + 4); for (let i = 0; i < len; i++) payload[i] ^= m[i & 3]; }
  return { op, payload, len: off + mlen + len };
}
function sendRaw(sock, op, payload) {
  const n = payload.length; let h;
  if (n < 126) h = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  if (!sock.destroyed) sock.write(Buffer.concat([h, payload]));
}
const send = (c, o) => sendRaw(c.sock, 1, Buffer.from(JSON.stringify(o)));
// ---------- Canaux vocaux privés (sur demande / invitation) ----------
const vch = new Map(); let vchN = 1; const VC_MAX = 8;
const cById = id => { for (const x of clients) if (x.p && x.p.id === id) return x; return null; };
const cByName = n => { n = String(n || '').toLowerCase(); for (const x of clients) if (x.p && String(x.p.n).toLowerCase() === n) return x; return null; };
function vcList() { const l = [...vch.values()].map(h => { const o = cById(h.owner); return { id: h.id, o: o ? o.p.n : '?', n: h.m.size }; }); for (const x of clients) if (x.p) send(x, { t: 'vcl', l }); }
function vcState(h) { const o = cById(h.owner); const m = [...h.m].map(id => { const x = cById(id); return { id, n: x ? x.p.n : '?' }; }); for (const id of h.m) { const x = cById(id); if (x) send(x, { t: 'vcs', ch: { id: h.id, o: o ? o.p.n : '?', own: h.owner, m } }); } }
function vcLeave(c) {
  const p = c.p; if (!p || !p.vc) return; const h = vch.get(p.vc); p.vc = 0; p.mic = 0; try { send(c, { t: 'vcs', ch: null }); } catch (e) { /* ok */ }
  if (h) { h.m.delete(p.id); if (!h.m.size) vch.delete(h.id); else { if (h.owner === p.id) h.owner = [...h.m][0]; vcState(h); } }
  vcList();
}
function vcJoin(c, h) { if (!c.p || h.m.size >= VC_MAX) return false; if (c.p.vc) vcLeave(c); h.m.add(c.p.id); c.p.vc = h.id; h.req.delete(c.p.id); h.inv.delete(c.p.id); vcState(h); vcList(); return true; }
const clients = new Set();
let nextId = 1;
const bcast = (o, except) => { for (const c of clients) if (c.p && c !== except) send(c, o); };

function onConnect(sock) {
  const c = { sock, buf: Buffer.alloc(0), id: nextId++, p: null };
  clients.add(c);
  sock.on('data', d => {
    c.buf = Buffer.concat([c.buf, d]);
    for (;;) {
      const f = parseFrame(c.buf);
      if (!f) break;
      c.buf = c.buf.subarray(f.len);
      if (f.op === 8) { sock.end(); return; }
      if (f.op === 9) { sendRaw(sock, 10, f.payload); continue; }
      if (f.op === 1) {
        const nR = Date.now(); if (nR - (c.rt || 0) > 1000) { c.rt = nR; c.rn = 0; }
        if (++c.rn > 200) { if (c.p) flag(c, 0.3, 'trop de messages'); continue; } // anti-flood
        if (f.payload.length > 4096) { if (c.p) flag(c, 2, 'message énorme'); continue; }
        if (c.kicked) continue;
        try { handle(c, JSON.parse(f.payload.toString())); } catch (e) { /* ignore */ }
      }
    }
    if (c.buf.length > 1e6) sock.destroy();
  });
  const drop = () => { if (!clients.has(c)) return; try { vcLeave(c); } catch (e) { /* ok */ } clients.delete(c); if (votes.delete(c.id)) bcast({ t: 'votes', c: counts() }); if (c.p) log('-', c.p.n, 'est parti'); };
  sock.on('close', drop); sock.on('error', drop);
}

// ---------- Jeu ----------
let ended = false;
const hall = new Map(); // meilleurs joueurs (depuis le démarrage du serveur)
const num = (v, lo, hi, def = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
const pickSpawn = () => {
  const cx = MAP_CX[curMap];
  const alive = [...clients].filter(c => c.p && c.p.al && !c.p.lob).map(c => c.p);
  let best = SPAWNS[0], bd = -1;
  for (const s of SPAWNS.slice().sort(() => Math.random() - 0.5)) { // le plus loin des autres
    const d = alive.length ? Math.min(...alive.map(a => Math.hypot(a.x - (cx + s[0]), a.z - s[1]))) : 99;
    if (d > bd) { bd = d; best = s; }
  }
  return [cx + best[0], 0, best[1]];
};
function log(...a) { console.log(new Date().toLocaleTimeString(), ...a); }

const BAD = /(merde|putain|connard|connasse|salope|encul|nique|ntm|fdp|pute|bite\b|fuck|shit|bitch|asshole|dick|cunt|nigg)/gi;
// ---------- ANTI-TRICHE ----------
const bans = new Map(); // nom -> fin du bannissement
const ANTITRICHE = false; // mets true pour réactiver l'anti-triche
function flag(c, pts, why) {
  if (!ANTITRICHE) return;
  const p = c.p; if (!p || c.kicked) return;
  const now = Date.now();
  p.sx = Math.max(0, (p.sx || 0) - (now - (p.sxT || now)) / 10000) + pts; p.sxT = now;
  log('⚠ anti-triche', p.n, '-', why, '(' + p.sx.toFixed(1) + ')');
  if (p.sx >= 12) {
    c.kicked = true; bans.set(p.n.toLowerCase(), now + 120000);
    send(c, { t: 'kick', msg: '🚫 Expulsé par l\'anti-triche (revient dans 2 min)' }); log('🚫', p.n, 'expulsé');
    p.al = false; p.lob = true;
    setTimeout(() => { try { c.sock.end(); } catch (e) { /* ok */ } }, 400);
  } else if (p.sx >= 6 && now - (p.warnT || 0) > 10000) { p.warnT = now; send(c, { t: 'warn', msg: '⚠️ Anti-triche : mouvement ou tirs suspects !' }); }
}

function handle(c, m) {
  if (m.t === 'join') {
    if (c.p) return;
    if (maint && String(m.name) !== 'Admin') { send(c, { t: 'kick', msg: '🔧 Le jeu est en maintenance, reviens plus tard.' }); c.kicked = true; setTimeout(() => { try { c.sock.end(); } catch (e) { /* ok */ } }, 400); return; }
    { const nm = String(m.name || 'Joueur').toLowerCase().slice(0, 16), until = bans.get(nm) || 0;
      if (until > Date.now()) { send(c, { t: 'kick', msg: '🚫 Tu es banni encore ' + Math.ceil((until - Date.now()) / 1000) + ' s (anti-triche)' }); c.kicked = true; setTimeout(() => { try { c.sock.end(); } catch (e) { /* ok */ } }, 400); return; } }
    const sp = pickSpawn();
    c.p = { id: c.id, n: String(m.name || 'Joueur').replace(/[<>&]/g, '').slice(0, 16) || 'Joueur',
      x: 0, y: 0, z: -287, yw: 0, pt: 0, w: 0, sk: 0, hp: 100, al: true, sl: 0, cr: 0, k: 0, d: 0, last: 0, inv: Date.now() + 1500, lob: true, bud: 70, mt: Date.now(), lv: Math.max(1, Math.min(999, m.lv | 0 || 1)) }; // commence dans la salle d'accueil (même point que le client)
    send(c, { t: 'welcome', ver: 5, id: c.id, pos: sp, limit: KILL_LIMIT, map: curMap, c: counts() }); vcList(); if (season.k) send(c, { t: 'season', k: season.k, left: seasonInfo().left }); if (bonus.m > 1) send(c, { t: 'bonus', m: bonus.m, left: bonusInfo().left });
    if (c.p.n !== 'Admin') stat.joins++;
    log('+', c.p.n, 'a rejoint (' + [...clients].filter(x => x.p).length + ' joueurs)');
    return;
  }
  const p = c.p;
  if (!p) return;
  if (m.t === 'adm') { adminCmd(c, m); return; }
  if (m.t === 'rename') { // changer son pseudo sans quitter
    const nowR = Date.now(); if (nowR - (p.rnT || 0) < 5000) { send(c, { t: 'rename_no', msg: 'Attends quelques secondes avant de rechanger.' }); return; } p.rnT = nowR;
    const nn = String(m.name || '').replace(/[<>&]/g, '').trim().slice(0, 16).replace(BAD, '***');
    if (!nn || nn.includes('***')) { send(c, { t: 'rename_no', msg: 'Nom pas accepté.' }); return; }
    if ((bans.get(nn.toLowerCase()) || 0) > Date.now()) { send(c, { t: 'rename_no', msg: 'Nom pas disponible.' }); return; }
    for (const x of clients) if (x !== c && x.p && String(x.p.n).toLowerCase() === nn.toLowerCase()) { send(c, { t: 'rename_no', msg: 'Ce nom est déjà pris.' }); return; }
    log('✏️', p.n, '→', nn); p.n = nn; send(c, { t: 'renamed', n: nn }); vcList(); return;
  }
  if (m.t === 'resp') { // bouton « Réapparaître » : repart d'un point de départ, sans compter une mort
    if (p.lob || !p.al || Date.now() - (p.respT || 0) < 4000) return; p.respT = Date.now();
    const sp = pickSpawn(); p.x = sp[0]; p.y = 0; p.z = sp[2]; p.inv = Date.now() + 1500; p.bud = 70; p.mt = Date.now();
    send(c, { t: 'respawn', pos: sp, hp: p.hp }); return;
  }
  if (m.t === 'vsig') { // relais de la voix (l'audio ne passe PAS par le serveur)
    const t = [...clients].find(x => x.p && x.p.id === (m.to | 0)); if (t && t !== c && p.vc && t.p.vc === p.vc && m.d && typeof m.d === 'object') send(t, { t: 'vsig', from: p.id, d: m.d }); return;
  }
  if (m.t === 'freq' || m.t === 'facc' || m.t === 'fno') { // demandes d'ami (relayées, jamais automatiques)
    const nowF = Date.now(); if (nowF - (p.frT || 0) < 2500) return; p.frT = nowF; if (p.muted && m.t === 'freq') return;
    const want = String(m.to || '').toLowerCase(); const t = [...clients].find(x => x.p && x !== c && String(x.p.n).toLowerCase() === want);
    if (!t) { send(c, { t: 'fmiss' }); return; }
    send(t, { t: m.t, from: p.n }); return;
  }
  if (typeof m.t === 'string' && m.t.startsWith('vc_')) {
    const nowV = Date.now(); if (nowV - (p.vcT || 0) < 800) return; p.vcT = nowV;
    const mine = p.vc ? vch.get(p.vc) : null;
    if (m.t === 'vc_new') { if (p.muted) return; const h = { id: vchN++, owner: p.id, m: new Set(), req: new Set(), inv: new Set() }; vch.set(h.id, h); vcJoin(c, h); return; }
    if (m.t === 'vc_leave') { vcLeave(c); return; }
    if (m.t === 'vc_ask') { const h = vch.get(m.ch | 0); if (!h || h === mine || p.muted) return; const o = cById(h.owner); if (!o) return; h.req.add(p.id); send(o, { t: 'vcq', from: p.n, ch: h.id }); return; }
    if (m.t === 'vc_inv') { if (!mine || mine.owner !== p.id) return; const t = cByName(m.to); if (!t || t === c || (t.p.vc === mine.id)) return; mine.inv.add(t.p.id); send(t, { t: 'vci', from: p.n, ch: mine.id }); return; }
    if (m.t === 'vc_ok') { const h = vch.get(m.ch | 0); if (h && h.inv.has(p.id)) { if (!vcJoin(c, h)) send(c, { t: 'vcfull' }); } return; }
    if (m.t === 'vc_yes' || m.t === 'vc_no') { if (!mine || mine.owner !== p.id) return; const t = cByName(m.name); if (!t || !mine.req.has(t.p.id)) return; mine.req.delete(t.p.id); if (m.t === 'vc_yes') { if (!vcJoin(t, mine)) send(c, { t: 'vcfull' }); } else send(t, { t: 'vcn', from: p.n }); return; }
    return;
  }
  if (m.t === 'vmic') { if (m.on && !p.vc) { send(c, { t: 'vstop' }); return; } if (p.muted && m.on) { send(c, { t: 'vstop' }); return; } p.mic = m.on ? 1 : 0; return; }
  if (m.t === 'chat') {
    const nowC = Date.now(); if (nowC - (p.chatT || 0) < 800) { flag(c, 0.4, 'spam du chat'); return; } if (p.muted) return;
    if (chatOff && !c.adm) return; p.chatT = nowC; const msg = String(m.msg || '').replace(/[<>]/g, '').trim().slice(0, 100).replace(BAD, '***'); if (!msg) return;
    bcast({ t: 'chat', id: p.id, n: p.n, msg }); log('💬', p.n + ':', msg); return;
  }
  if (m.t === 'm') {
    if (!p.al) return;
    if (p.frz) { send(c, { t: 'snap', pos: [p.x, p.y, p.z] }); return; }
    const nx = num(m.x, -2500, 2500), ny = num(m.y, -5, 30), nz = num(m.z, -2500, 2500), tM = Date.now();
    const dtM = Math.min(1, Math.max(0, (tM - (p.mt || tM)) / 1000)); p.mt = tM;
    p.bud = Math.min(70, (p.bud == null ? 70 : p.bud) + 18 * dtM); // budget de déplacement : ~18 m/s en continu + réserve pour grappin/warper
    const dM = Math.hypot(nx - p.x, nz - p.z);
    if (ANTITRICHE && !c.adm && dM > p.bud) { flag(c, 1, 'vitesse/téléportation ' + dM.toFixed(0) + ' m'); send(c, { t: 'snap', pos: [p.x, p.y, p.z] }); return; }
    p.bud -= dM;
    p.x = nx; p.y = ny; p.z = nz;
    p.yw = num(m.yw, -1e3, 1e3); p.pt = num(m.pt, -1.6, 1.6);
    p.w = num(m.w | 0, 0, WEAP.length - 1); p.sk = num(m.sk | 0, 0, 20);
    p.sl = m.sl ? 1 : 0; p.cr = m.cr ? 1 : 0; p.dv = num(m.dv | 0, 0, 2);
  } else if (m.t === 'heal') {
    const nowH = Date.now(); if (!p.al || nowH - (p.lastHeal || 0) < 8000) return; p.lastHeal = nowH; p.hp = Math.min(100, p.hp + 75);
  } else if (m.t === 'zone') {
    p.lob = m.z !== 'arena';
    if (p.lob) { p.x = 0; p.y = 0; p.z = -287; p.bud = 70; p.mt = Date.now(); } // retour à la salle d'accueil
    if (!p.lob) {
      // premier joueur dans l'arène (personne d'autre en jeu): la carte votée s'applique tout de suite
      const others = [...clients].filter(x => x.p && x !== c && !x.p.lob).length;
      if (!others && !ended) { const l = leader(); if (l >= 0 && l !== curMap) { curMap = l; votes.clear(); bcast({ t: 'map', id: curMap, c: counts() }); } }
      const sp = pickSpawn();
      p.x = sp[0]; p.y = 0; p.z = sp[2]; p.inv = Date.now() + 1500; p.hp = 100; p.al = true; p.bud = 70; p.mt = Date.now();
      send(c, { t: 'enter', map: curMap, pos: sp });
    }
  } else if (m.t === 'vote') {
    const v = m.m | 0; if (v < 0 || v > 4) return;
    votes.set(c.id, v); bcast({ t: 'votes', c: counts() });
  } else if (m.t === 'shoot') {
    if (!p.al || ended || p.lob || p.frz) return;
    const w = WEAP[num(m.w | 0, 0, WEAP.length - 1)];
    const now = Date.now();
    if (!c.adm && now - p.last < (1000 / w.rps) * 0.4) flag(c, 0.6, 'tir trop rapide');
    if (now - p.last < (1000 / w.rps) * 0.7) return;
    p.last = now;
    if (!Array.isArray(m.o) || !Array.isArray(m.ds)) return;
    if (m.ds.length > w.pellets) { flag(c, 1.5, 'trop de plombs'); return; }
    const o = [num(+m.o[0], -2500, 2500), num(+m.o[1], -5, 40), num(+m.o[2], -400, 400)];
    if (Math.hypot(o[0] - p.x, o[2] - p.z) > 6) { flag(c, 1, 'tir loin du joueur'); return; } // triche : tir trop loin du joueur
    const ends = [];
    const dmgBy = new Map();
    m.ds.slice(0, w.pellets).forEach((d, i) => {
      let dx = +d[0], dy = +d[1], dz = +d[2];
      const l = Math.hypot(dx, dy, dz);
      if (!(l > 0)) return;
      dx /= l; dy /= l; dz /= l;
      const wd = num(+(m.wd && m.wd[i]), 0, w.range, w.range);
      let best = wd, victim = null, head = false;
      for (const oc of clients) {
        const q = oc.p;
        if (!q || q === p || !q.al || q.lob || now < q.inv) continue;
        const h = q.cr || q.sl ? 1.2 : 1.8;
        const t = rayBox(o, [dx, dy, dz], [q.x - 0.45, q.y, q.z - 0.45], [q.x + 0.45, q.y + h, q.z + 0.45]);
        if (t !== null && t < best) {
          best = t; victim = q;
          head = (o[1] + dy * t) > q.y + h - 0.4;
        }
      }
      if (zomb) for (const z of zomb.list) {
        if (z.hp <= 0) continue; const zh = 1.9 * z.s, zr = 0.5 * z.s;
        const t = rayBox(o, [dx, dy, dz], [z.x - zr, 0, z.z - zr], [z.x + zr, zh, z.z + zr]);
        if (t !== null && t < best) { best = t; victim = z; head = (o[1] + dy * t) > zh - 0.4; }
      }
      ends.push([o[0] + dx * best, o[1] + dy * best, o[2] + dz * best]);
      if (victim) {
        const e = dmgBy.get(victim) || { dmg: 0, hs: false };
        e.dmg += w.dmg * (head ? w.hs : 1); e.hs = e.hs || head;
        dmgBy.set(victim, e);
      }
    });
    bcast({ t: 'shot', id: p.id, w: p.w, o, e: ends }, c);
    if (w.ex && ends[0]) { // explosion : dégâts autour du point d'impact
      const c0 = ends[0];
      for (const oc of clients) {
        const q = oc.p;
        if (!q || q === p || !q.al || q.lob || now < q.inv) continue;
        const dd = Math.hypot(q.x - c0[0], q.y + 0.9 - c0[1], q.z - c0[2]);
        if (dd <= w.ex.r) { const e = dmgBy.get(q) || { dmg: 0, hs: false }; e.dmg = w.ex.dmg * (1 - 0.6 * dd / w.ex.r); dmgBy.set(q, e); }
      }
      if (zomb) for (const z of zomb.list) { if (z.hp <= 0) continue; const dd = Math.hypot(z.x - c0[0], 0.9 - c0[1], z.z - c0[2]); if (dd <= w.ex.r) { const e = dmgBy.get(z) || { dmg: 0, hs: false }; e.dmg = w.ex.dmg * (1 - 0.6 * dd / w.ex.r); dmgBy.set(z, e); } }
    }
    for (const [q, e] of dmgBy) { if (q.zz) zombieHit(c, q, Math.round(e.dmg), e.hs); else applyDamage(c, q, Math.round(e.dmg), e.hs, m.w | 0); }
  }
}

function rayBox(o, d, mn, mx) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
    let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

function applyDamage(sc, q, dmg, hs, wi) {
  const p = sc.p;
  if (q.god && dmg < 9000) return;
  q.hp -= dmg;
  const vc = [...clients].find(x => x.p === q);
  send(sc, { t: 'hit', hs, dmg, kill: q.hp <= 0 });
  if (vc) send(vc, { t: 'hurt', hp: Math.max(0, q.hp), x: p.x, z: p.z });
  if (q.hp > 0) return;
  q.hp = 0; q.al = false; q.d++; p.k++; stat.kills++;
  { const tk = Date.now(); p.kt = (p.kt || []).filter(x => tk - x < 5000); p.kt.push(tk); if (p.kt.length >= 7) flag(sc, 3, 'trop d\'éliminations en 5 s'); }
  hall.set(p.n, (hall.get(p.n) || 0) + 1);
  bcast({ t: 'kill', k: p.n, kid: p.id, v: q.n, vid: q.id, w: wi, hs });
  if (vc) send(vc, { t: 'died', by: p.n });
  log('☠', p.n, '→', q.n);
  if (p.k >= KILL_LIMIT && !ended) return endMatch(p);
  setTimeout(() => {
    if (ended || !clients.has(vc)) return;
    const sp = pickSpawn();
    q.x = sp[0]; q.y = 0; q.z = sp[2]; q.hp = 100; q.al = true; q.inv = Date.now() + 1500; q.bud = 70; q.mt = Date.now();
    send(vc, { t: 'respawn', pos: sp, hp: 100 });
  }, RESPAWN_MS);
}

// ---------- ADMIN ----------
function restartMatch(map) {
  ended = false; if (map != null) curMap = map; votes.clear(); bcast({ t: 'map', id: curMap, c: counts() });
  for (const c of clients) {
    if (!c.p) continue;
    Object.assign(c.p, { k: 0, d: 0 });
    if (c.p.lob) continue;
    const sp = pickSpawn();
    Object.assign(c.p, { hp: 100, al: true, x: sp[0], y: 0, z: sp[2], inv: Date.now() + 2000, bud: 70, mt: Date.now() });
    send(c, { t: 'respawn', pos: sp, hp: 100, fresh: true, map: curMap });
  }
}
// ---------- Saisons / événements à durée (admin) ----------
const SEASONS = { halloween: '🎃 Halloween', hiver: '❄️ Hiver / Noël', ete: '☀️ Été', automne: '🍁 Automne', printemps: '🌸 Printemps' };
const SEASON_FILE = path.join(__dirname, 'saison.json');
let season = { k: '', until: 0 };
try { const sv = JSON.parse(fs.readFileSync(SEASON_FILE, 'utf8')); if (SEASONS[sv.k] && (!sv.until || sv.until > Date.now())) season = { k: sv.k, until: +sv.until || 0 }; } catch (e) { /* pas de fichier */ }
const seasonSave = () => { try { fs.writeFileSync(SEASON_FILE, JSON.stringify(season)); } catch (e) { /* ok */ } };
const seasonInfo = () => ({ k: season.k, left: season.k && season.until ? Math.max(1, Math.ceil((season.until - Date.now()) / 60000)) : 0 });
function seasonSet(k, mins) {
  if (!SEASONS[k]) { season = { k: '', until: 0 }; seasonSave(); bcast({ t: 'season', k: '', left: 0 }); bcast({ t: 'ann', big: 1, msg: '🎪 L\'événement est terminé !', sub: 'Merci d\'avoir joué' }); log('🎪 saison terminée'); return; }
  mins = Math.max(0, Math.min(90 * 1440, mins | 0)); season = { k, until: mins ? Date.now() + mins * 60000 : 0 }; seasonSave();
  bcast({ t: 'season', k, left: seasonInfo().left }); bcast({ t: 'ann', big: 1, msg: SEASONS[k].toUpperCase() + ' !', sub: mins ? 'Événement pendant ' + (mins >= 1440 ? Math.round(mins / 1440) + ' jour(s)' : mins >= 60 ? Math.round(mins / 60) + ' h' : mins + ' min') : 'Événement en cours' }); log('🎪 saison', k, mins + ' min');
}
setInterval(() => { if (season.k && season.until && Date.now() >= season.until) seasonSet('', 0); }, 15000);
// ---------- Statistiques + calendrier d'événements ----------
const stat = { t0: Date.now(), joins: 0, kills: 0 };
const SCHED_FILE = path.join(__dirname, 'calendrier.json');
let sched = []; try { sched = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')); if (!Array.isArray(sched)) sched = []; } catch (e) { sched = []; }
const schedSave = () => { try { fs.writeFileSync(SCHED_FILE, JSON.stringify(sched)); } catch (e) { /* ok */ } };
function schedTick() {
  const now = Date.now(); let ch = false;
  for (const e of sched) {
    if (e.done || now < e.at) continue;
    if (e.at + 6 * 3600000 < now) { e.done = 1; ch = true; continue; } // trop vieux (serveur éteint) : on saute
    e.done = 1; ch = true; log('📅 calendrier :', e.type, e.k || e.m);
    try { if (e.type === 'season' && SEASONS[e.k]) seasonSet(e.k, e.mins | 0); else if (e.type === 'bonus') bonusSet(e.m | 0, e.mins | 0 || 30); else if (e.type === 'chaos' && CHAOS_OK.includes(e.k)) wildEvent(null, e.k); } catch (er) { /* ok */ }
  }
  const lim = now - 7 * 86400000; const n0 = sched.length; sched = sched.filter(e => !(e.done && e.at < lim)); if (sched.length !== n0) ch = true;
  if (ch) schedSave();
}
setInterval(schedTick, 15000);
// ---------- Outils admin : bonus, maintenance, journal ----------
let bonus = { m: 1, until: 0 }, maint = false, chatOff = false; const alog = [];
const bonusInfo = () => ({ m: bonus.m, left: bonus.m > 1 && bonus.until ? Math.max(1, Math.ceil((bonus.until - Date.now()) / 60000)) : 0 });
function bonusSet(mult, mins) {
  mult = Math.max(1, Math.min(5, mult | 0)); mins = Math.max(1, Math.min(1440, mins | 0 || 30)); bonus = mult > 1 ? { m: mult, until: Date.now() + mins * 60000 } : { m: 1, until: 0 };
  bcast({ t: 'bonus', m: bonus.m, left: bonusInfo().left }); bcast({ t: 'ann', big: 1, msg: mult > 1 ? '⭐ BONUS ×' + mult + ' !' : 'Bonus terminé', sub: mult > 1 ? 'Argent et XP multipliés pendant ' + mins + ' min' : '' });
}
setInterval(() => { if (bonus.m > 1 && Date.now() >= bonus.until) bonusSet(1, 0); }, 15000);
function alogPush(role, a, m, c) { const t = m.id ? (cById(m.id | 0) || {}).p : null; alog.push((new Date()).toLocaleTimeString('fr-CA') + ' — ' + (role === 'full' ? 'Admin' : ROLES[role].nom) + ' : ' + a + (t ? ' → ' + t.n : '') + (m.k ? ' ' + m.k : '')); if (alog.length > 60) alog.shift(); }
// ---------- Événements de fou (admin) ----------
const CHAOS_OK = ['lowgrav', 'zerograv', 'superjump', 'speed', 'party', 'reset', 'rain', 'meteor', 'meteorx', 'koth', 'tpswap', 'tprand', 'fireworks', 'launch', 'bombs', 'mines', 'treasure', 'zombies', 'boss', 'fog', 'storm', 'blizzard'];
let koth = null;
const SCHED_CHAOS = ['bombs', 'mines', 'treasure', 'zombies', 'boss', 'fog', 'storm', 'blizzard', 'koth', 'rain', 'meteor', 'tpswap', 'tprand', 'party', 'lowgrav', 'speed', 'fireworks'];
const arenaPlayers = () => [...clients].filter(x => x.p && x.p.al && !x.p.lob && !x.p.ghost);
function kothStart() {
  if (koth) return; const sp = pickSpawn();
  koth = { x: sp[0], z: sp[2], r: 7, end: Date.now() + 60000, sc: new Map() };
  bcast({ t: 'ann', big: 1, msg: '👑 ROI DE LA COLLINE !', sub: 'Reste dans la zone dorée pendant 60 secondes' });
  const K = koth;
  K.timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((K.end - Date.now()) / 1000));
    for (const v of arenaPlayers()) if (Math.hypot(v.p.x - K.x, v.p.z - K.z) <= K.r) { const o = K.sc.get(v.p.id) || { pt: 0 }; o.pt++; o.n = v.p.n; o.c = v; K.sc.set(v.p.id, o); }
    const all = [...K.sc.values()].sort((a, b) => b.pt - a.pt);
    if (left <= 0) {
      clearInterval(K.timer); koth = null; bcast({ t: 'koth', end: 1 });
      if (all.length) {
        bcast({ t: 'ann', big: 1, msg: '👑 ' + all[0].n + ' EST LE ROI !', sub: all[0].pt + ' secondes dans la zone' });
        try { send(all[0].c, { t: 'gift', g: 'm', n: 500 }); send(all[0].c, { t: 'gift', g: 'k', n: 3 }); } catch (e) { /* ok */ }
        for (const o of all.slice(1)) try { send(o.c, { t: 'gift', g: 'm', n: 100 }); } catch (e) { /* ok */ }
      } else bcast({ t: 'ann', msg: '👑 Personne dans la zone…' });
      return;
    }
    bcast({ t: 'koth', x: K.x, z: K.z, r: K.r, left, top: all.slice(0, 3).map(o => [o.n, o.pt]) });
  }, 1000);
}
// ---------- Nouveaux événements : bombes, mines, trésor, zombies/boss, météo ----------
const envBusy = {};
function envHurt(q, dmg, by) {
  if (!q.al || q.god || Date.now() < q.inv) return;
  q.hp -= dmg; const vc = [...clients].find(x => x.p === q);
  if (vc) send(vc, { t: 'hurt', hp: Math.max(0, q.hp), x: q.x, z: q.z });
  if (q.hp > 0) return;
  q.hp = 0; q.al = false; q.d++;
  bcast({ t: 'kill', k: by, kid: -1, v: q.n, vid: q.id, w: 0, hs: false });
  if (vc) send(vc, { t: 'died', by });
  setTimeout(() => {
    if (ended || !vc || !clients.has(vc)) return;
    const sp = pickSpawn(); q.x = sp[0]; q.y = 0; q.z = sp[2]; q.hp = 100; q.al = true; q.inv = Date.now() + 1500; q.bud = 70; q.mt = Date.now();
    send(vc, { t: 'respawn', pos: sp, hp: 100 });
  }, RESPAWN_MS);
}
function bombsStart() {
  if (envBusy.bombs) return; envBusy.bombs = 1; let n = 0;
  bcast({ t: 'ann', big: 1, msg: '💣 PLUIE DE BOMBES !', sub: 'Cours loin des cercles rouges' });
  const iv = setInterval(() => {
    if (n++ >= 18) { clearInterval(iv); envBusy.bombs = 0; return; }
    const ap = arenaPlayers(); let x, z;
    if (ap.length) { const t = ap[Math.random() * ap.length | 0].p; x = t.x + (Math.random() - 0.5) * 12; z = t.z + (Math.random() - 0.5) * 12; } else { const sp = pickSpawn(); x = sp[0]; z = sp[2]; }
    bcast({ t: 'bomb', x, z });
    setTimeout(() => { for (const v of arenaPlayers()) { const d = Math.hypot(v.p.x - x, v.p.z - z); if (d < 6) envHurt(v.p, Math.round(65 * (1 - d / 7)), '💣 Bombe'); } }, 1700);
  }, 1300);
}
let mines = null;
function minesStart() {
  if (mines) return; const list = []; for (let i = 0; i < 16; i++) { const sp = pickSpawn(); list.push({ x: sp[0], z: sp[2] }); }
  const M = mines = { list, end: Date.now() + 90000 };
  bcast({ t: 'ann', big: 1, msg: '💥 CHAMP DE MINES !', sub: 'Des mines sont cachées dans l\'arène (90 s)' });
  bcast({ t: 'mines', m: list.map(a => [+a.x.toFixed(1), +a.z.toFixed(1)]) });
  M.timer = setInterval(() => {
    const fin = () => { clearInterval(M.timer); mines = null; bcast({ t: 'mines', end: 1 }); };
    if (Date.now() > M.end || !M.list.length) { fin(); return; }
    const ap = arenaPlayers();
    for (let i = M.list.length - 1; i >= 0; i--) {
      const a = M.list[i]; if (!ap.some(v => Math.hypot(v.p.x - a.x, v.p.z - a.z) < 2)) continue;
      M.list.splice(i, 1); bcast({ t: 'mineboom', x: a.x, z: a.z });
      for (const v of ap) { const d = Math.hypot(v.p.x - a.x, v.p.z - a.z); if (d < 5) envHurt(v.p, Math.round(70 * (1 - d / 6)), '💥 Mine'); }
    }
  }, 150);
}
let tre = null;
function treasureStart() {
  if (tre) return; const sp = pickSpawn(); const T = tre = { x: sp[0], z: sp[2], end: Date.now() + 120000 };
  bcast({ t: 'ann', big: 1, msg: '🎯 CHASSE AU TRÉSOR !', sub: 'Le premier arrivé au coffre gagne gros' });
  T.timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((T.end - Date.now()) / 1000));
    const w = arenaPlayers().find(v => Math.hypot(v.p.x - T.x, v.p.z - T.z) < 2.6);
    if (w) {
      clearInterval(T.timer); tre = null; bcast({ t: 'tre', end: 1 });
      bcast({ t: 'ann', big: 1, msg: '🏆 ' + w.p.n + ' A TROUVÉ LE TRÉSOR !', sub: '+300 $ et 1 clé' });
      try { send(w, { t: 'gift', g: 'm', n: 300 }); send(w, { t: 'gift', g: 'k', n: 1 }); send(w, { t: 'gift', g: 'xp', n: 100 }); } catch (e) { /* ok */ }
      return;
    }
    if (left <= 0) { clearInterval(T.timer); tre = null; bcast({ t: 'tre', end: 1 }); bcast({ t: 'ann', msg: '🎯 Personne n\'a trouvé le trésor…' }); return; }
    bcast({ t: 'tre', x: T.x, z: T.z, left });
  }, 1000);
}
let zomb = null, zid = 1;
function zombieSpawn(boss) {
  const sp = pickSpawn(), np = Math.max(1, arenaPlayers().length);
  const z = { zz: 1, id: zid++, x: sp[0], z: sp[2], hp: boss ? 2500 + 1000 * np : 60, boss: boss ? 1 : 0, cd: 0, yaw: 0, s: boss ? 2 : 1 };
  zomb.list.push(z); return z;
}
function zombiesStart(boss) {
  if (zomb) return;
  const Z = zomb = { list: [], end: Date.now() + (boss ? 150000 : 90000), boss: !!boss, n: 0 };
  if (boss) { zombieSpawn(true); for (let i = 0; i < 5; i++) zombieSpawn(false); }
  else for (let i = 0; i < 8; i++) zombieSpawn(false);
  bcast({ t: 'ann', big: 1, msg: boss ? '👹 UN BOSS ARRIVE !' : '🧟 INVASION DE ZOMBIES !', sub: boss ? 'Tuez-le tous ensemble !' : 'Survis 90 secondes et tire sur les zombies' });
  Z.timer = setInterval(() => {
    const now = Date.now(), ap = arenaPlayers(), alive = Z.list.filter(z => z.hp > 0);
    const over = now > Z.end || (boss && !alive.some(z => z.boss));
    if (over) {
      clearInterval(Z.timer); zomb = null; bcast({ t: 'zb', end: 1 });
      if (boss && !alive.some(z => z.boss)) { bcast({ t: 'ann', big: 1, msg: '🏆 BOSS VAINCU !', sub: 'Bravo à tout le monde !' }); for (const v of ap) { try { send(v, { t: 'gift', g: 'm', n: 100 }); send(v, { t: 'gift', g: 'k', n: 1 }); } catch (e) { /* ok */ } } }
      else if (!boss) { bcast({ t: 'ann', big: 1, msg: '🧟 L\'INVASION EST FINIE !', sub: 'Vous avez survécu' }); for (const v of ap) { try { send(v, { t: 'gift', g: 'm', n: 50 }); } catch (e) { /* ok */ } } }
      else bcast({ t: 'ann', msg: '👹 Le boss s\'est enfui…' });
      return;
    }
    if (++Z.n % 80 === 0 && alive.filter(z => !z.boss).length < 22) for (let i = 0; i < 4; i++) zombieSpawn(false); // +4 toutes les 8 s
    for (const z of alive) {
      let best = null, bd = 1e9; for (const v of ap) { const d = Math.hypot(v.p.x - z.x, v.p.z - z.z); if (d < bd) { bd = d; best = v.p; } }
      if (!best) continue;
      z.yaw = Math.atan2(best.x - z.x, best.z - z.z);
      const reach = z.boss ? 2.3 : 1.5;
      if (bd > reach) { const sp = (z.boss ? 3.2 : 4.2) * 0.1; z.x += (best.x - z.x) / bd * sp; z.z += (best.z - z.z) / bd * sp; }
      else if (now > z.cd) { z.cd = now + 900; envHurt(best, z.boss ? 22 : 7, z.boss ? '👹 Boss' : '🧟 Zombie'); }
    }
    Z.list = Z.list.filter(z => z.hp > 0 || (z.gone = (z.gone | 0) + 1) < 4);
    bcast({ t: 'zb', z: Z.list.map(z => [z.id, +z.x.toFixed(1), +z.z.toFixed(1), z.hp > 0 ? Math.max(1, Math.round(z.hp)) : 0, z.boss, +z.yaw.toFixed(2)]) });
  }, 100);
}
function zombieHit(sc, z, dmg, hs) {
  if (z.hp <= 0) return; z.hp -= dmg; const kill = z.hp <= 0;
  send(sc, { t: 'hit', hs, dmg, kill });
  if (kill) { try { send(sc, { t: 'gift', g: 'm', n: z.boss ? 150 : 10 }); if (z.boss) send(sc, { t: 'gift', g: 'k', n: 1 }); } catch (e) { /* ok */ } }
}
const WX_OK = { fog: '🌫️ BROUILLARD ÉPAIS', storm: '⛈️ ORAGE', blizzard: '🌨️ TEMPÊTE DE NEIGE' };
function wildEvent(c, k) {
  log('👑 admin : événement', k);
  if (k === 'meteor' || k === 'meteorx') {
    const ap = arenaPlayers(); let x, z;
    if (ap.length) { const t = ap[Math.random() * ap.length | 0].p; x = t.x + (Math.random() - 0.5) * 10; z = t.z + (Math.random() - 0.5) * 10; } else { const sp = pickSpawn(); x = sp[0]; z = sp[2]; }
    bcast({ t: 'meteor', x, z });
    if (k === 'meteorx') setTimeout(() => { for (const v of arenaPlayers()) { if (v.p.god) continue; const d = Math.hypot(v.p.x - x, v.p.z - z); if (d < 12) applyDamage(c, v.p, Math.round(70 * (1 - d / 14)), false, 0); } }, 2300);
    return;
  }
  if (k === 'tpswap') {
    const ap = arenaPlayers(); if (ap.length < 2) return;
    const pos = ap.map(v => [v.p.x, v.p.y, v.p.z]);
    for (let i = pos.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [pos[i], pos[j]] = [pos[j], pos[i]]; }
    ap.forEach((v, i) => { Object.assign(v.p, { x: pos[i][0], y: pos[i][1], z: pos[i][2], bud: 70, mt: Date.now() }); send(v, { t: 'snap', pos: pos[i] }); });
    bcast({ t: 'ann', big: 1, msg: '🔀 TOUT LE MONDE A ÉCHANGÉ SA PLACE !' }); return;
  }
  if (k === 'tprand') {
    arenaPlayers().forEach(v => { const sp = pickSpawn(); Object.assign(v.p, { x: sp[0], y: 0, z: sp[2], bud: 70, mt: Date.now() }); send(v, { t: 'snap', pos: [sp[0], 0, sp[2]] }); });
    bcast({ t: 'ann', big: 1, msg: '🎲 TÉLÉPORTATION AU HASARD !' }); return;
  }
  if (k === 'koth') { kothStart(); return; }
  if (k === 'bombs') { bombsStart(); return; }
  if (k === 'mines') { minesStart(); return; }
  if (k === 'treasure') { treasureStart(); return; }
  if (k === 'zombies') { zombiesStart(false); return; }
  if (k === 'boss') { zombiesStart(true); return; }
  if (WX_OK[k]) { bcast({ t: 'wx', k, secs: 60 }); bcast({ t: 'ann', big: 1, msg: WX_OK[k] + ' !', sub: 'Pendant 60 secondes' }); return; }
  bcast({ t: 'chaos', k });
}
function adminCmd(c, m) {
  if (!ADMIN_ACTIF) { send(c, { t: 'admno' }); return; } // admin désactivé pour tout le monde
  if (typeof m.pw !== 'string' || m.pw.length > 64) { send(c, { t: 'admno' }); return; }
  const hh = admSlow(m.pw); let role = hh === ADMIN_HASH ? 'full' : null;
  if (!role) for (const k of Object.keys(ROLES)) if (hh === ROLES[k].h) role = k;
  if (!role) { flag(c, 4, 'mauvais mot de passe admin'); send(c, { t: 'admno' }); return; }
  if (role !== 'full') {
    if (!ROLES[role].acts.includes(m.a)) { send(c, { t: 'admno', msg: 'Ce rôle n\'a pas le droit de faire ça.' }); return; }
    if (!c.role) { c.role = role; log('🛡️ rôle connecté :', ROLES[role].nom, c.p ? c.p.n : ''); }
  }
  if (role === 'full' && !c.adm && c.p && !m.quiet) { for (const x of clients) if (x !== c && x.p) send(x, { t: 'ann', big: 1, msg: '👑 L\'ADMIN ' + ADMIN_NOM + ' EST CONNECTÉ !', sub: 'Les règles du jeu sont surveillées 👀' }); log('👑 admin connecté :', c.p.n); }
  if (role === 'full') c.adm = true;
  c.admRole = role; if (m.a !== 'list' && m.a !== 'bans' && m.a !== 'alog') alogPush(role, m.a, m, c);
  const find = id => [...clients].find(x => x.p && x.p.id === (m.id | 0));
  if (m.a === 'list') {
    send(c, { t: 'admlist', ps: [...clients].filter(x => x.p).map(x => ({ id: x.p.id, n: x.p.n, k: x.p.k, d: x.p.d, dv: x.p.dv | 0, lob: x.p.lob ? 1 : 0, sx: +(x.p.sx || 0).toFixed(1), frz: x.p.frz | 0, mut: x.p.muted | 0, god: x.p.god | 0 })), map: curMap, limit: KILL_LIMIT, sched: sched.filter(e => !e.done).sort((a, b) => a.at - b.at), stats: { up: Math.floor((Date.now() - stat.t0) / 1000), joins: stat.joins, kills: stat.kills }, season: seasonInfo(), maint, chatOff, bonus: bonusInfo(), role, rnom: role === 'full' ? 'Admin complet' : ROLES[role].nom, acts: role === 'full' ? '*' : ROLES[role].acts });
  } else if (m.a === 'kick' || m.a === 'ban') {
    const t = find(); if (!t || t === c) return;
    t.kicked = true; if (m.a === 'ban') bans.set(t.p.n.toLowerCase(), Date.now() + 600000);
    send(t, { t: 'kick', msg: m.a === 'ban' ? '🚫 Banni par l\'admin (10 min)' : '👢 Expulsé par l\'admin' }); log('👑 admin :', m.a, t.p.n);
    setTimeout(() => { try { t.sock.end(); } catch (e) { /* ok */ } }, 400);
  } else if (m.a === 'map') {
    const mp = m.m | 0; if (mp < 0 || mp > 4) return; restartMatch(mp); log('👑 admin : carte', mp);
  } else if (m.a === 'restart') { restartMatch(null); log('👑 admin : nouvelle partie'); }
  else if (m.a === 'limit') { KILL_LIMIT = Math.max(1, Math.min(200, m.n | 0)); log('👑 admin : limite', KILL_LIMIT); }
  else if (m.a === 'chaos' && CHAOS_OK.includes(m.k)) { wildEvent(c, m.k); }
  else if (m.a === 'ghost') { c.p.ghost = m.v ? true : false; log('👑 admin : fantôme', c.p.ghost ? 'ON' : 'OFF'); }
  else if (m.a === 'sched_add') {
    const at = +m.at; const type = m.type === 'bonus' ? 'bonus' : m.type === 'chaos' ? 'chaos' : 'season'; if (!(at > Date.now() - 60000) || at > Date.now() + 400 * 86400000 || sched.length >= 60) return;
    const e = { id: Date.now().toString(36) + Math.floor(Math.random() * 99), type, at, mins: Math.max(1, Math.min(90 * 1440, m.mins | 0 || 60)), done: 0 };
    if (type === 'chaos') { if (!SCHED_CHAOS.includes(String(m.k))) return; e.k = String(m.k); e.mins = 1; } else if (type === 'season') { if (!SEASONS[String(m.k)]) return; e.k = String(m.k); } else e.m = Math.max(2, Math.min(5, m.m | 0 || 2));
    sched.push(e); schedSave(); log('📅 calendrier : ajouté', type);
  }
  else if (m.a === 'sched_del') { sched = sched.filter(e => e.id !== String(m.id)); schedSave(); }
  else if (m.a === 'season') { seasonSet(String(m.k || ''), m.mins | 0); }
  else if (m.a === 'pm') { const t = find(); if (t) send(t, { t: 'ann', msg: '✉️ ' + String(m.msg || '').replace(/[<>]/g, '').slice(0, 100) }); }
  else if (m.a === 'chaosp') { const t = find(); if (t && CHAOS_OK.includes(m.k) && !['koth', 'tpswap', 'tprand', 'bombs', 'mines', 'treasure', 'zombies', 'boss'].includes(m.k)) send(t, { t: 'chaos', k: m.k }); }
  else if (m.a === 'tpc') { const t = find(); if (t && t.p.al && !t.p.lob) { const sp = pickSpawn(); Object.assign(t.p, { x: sp[0], y: 0, z: sp[2], bud: 70, mt: Date.now() }); send(t, { t: 'snap', pos: [sp[0], 0, sp[2]] }); } }
  else if (m.a === 'bonus') { bonusSet(m.m | 0, m.mins | 0); }
  else if (m.a === 'maint') { maint = !!m.v; log('🔧 maintenance', maint ? 'ON' : 'OFF'); bcast({ t: 'ann', msg: maint ? '🔧 Maintenance : personne ne peut plus entrer' : '✅ Le jeu est rouvert' }); }
  else if (m.a === 'chatmute') { chatOff = !!m.v; bcast({ t: 'ann', msg: chatOff ? '🔇 Le chat est coupé' : '💬 Le chat est réactivé' }); }
  else if (m.a === 'bans') { send(c, { t: 'admbans', l: [...bans.entries()].filter(e => e[1] > Date.now()).map(e => [e[0], Math.ceil((e[1] - Date.now()) / 1000)]) }); }
  else if (m.a === 'unbanp') { bans.delete(String(m.n || '').toLowerCase()); send(c, { t: 'admbans', l: [...bans.entries()].filter(e => e[1] > Date.now()).map(e => [e[0], Math.ceil((e[1] - Date.now()) / 1000)]) }); }
  else if (m.a === 'alog') { send(c, { t: 'admlog', l: alog.slice(-30) }); }
  else if (m.a === 'say') { bcast({ t: 'ann', msg: String(m.msg || '').replace(/[<>]/g, '').slice(0, 120) }); }
  else if (m.a === 'unban') { bans.clear(); }
  else if (m.a === 'god') { c.p.god = m.v ? 1 : 0; }
  else if (m.a === 'healme') { c.p.hp = 100; }
  else if (m.a === 'healall') { for (const x of clients) if (x.p && x.p.al) { x.p.hp = 100; send(x, { t: 'hurt', hp: 100, x: x.p.x, z: x.p.z }); } }
  else if (m.a === 'killall') { for (const x of clients) if (x !== c && x.p && x.p.al && !x.p.lob && !x.p.god) applyDamage(c, x.p, 9999, false, 0); }
  else if (m.a === 'bringall') { for (const x of clients) if (x !== c && x.p) { Object.assign(x.p, { x: c.p.x + (Math.random() - 0.5) * 4, y: c.p.y, z: c.p.z + (Math.random() - 0.5) * 4, bud: 70, mt: Date.now() }); send(x, { t: 'snap', pos: [x.p.x, x.p.y, x.p.z] }); } }
  else if (m.a === 'freezeall' || m.a === 'thawall') { for (const x of clients) if (x !== c && x.p) { x.p.frz = m.a === 'freezeall' ? 1 : 0; send(x, { t: 'frz', v: x.p.frz }); } }
  else if (m.a === 'healp') { const t = find(); if (t) { t.p.hp = 100; send(t, { t: 'hurt', hp: 100, x: t.p.x, z: t.p.z }); } }
  else if (m.a === 'giftp') {
    const t = find(); if (t) {
      if (m.w != null) { const w = m.w | 0; if (w >= 0 && w < WEAP.length) send(t, { t: 'gift', g: 'w', w }); }
      else if (m.g === 'sk' && /^[a-z0-9_]{1,24}$/.test(String(m.s))) send(t, { t: 'gift', g: 'sk', s: m.s });
      else if (['k', 'm', 'xp', 'lv', 'bp', 'bpl', 'rk', 'ev', 'tk', 'allw', 'alls', 'full'].includes(m.g)) send(t, { t: 'gift', g: m.g, n: Math.max(0, Math.min(10000000, m.n | 0)) });
      log('👑 admin : cadeau →', t.p.n, m.g || 'arme');
    }
  }
  else if (m.a === 'mutep') { const t = find(); if (t) { t.p.muted = t.p.muted ? 0 : 1; if (t.p.muted) { t.p.mic = 0; send(t, { t: 'vstop' }); } } }
  else if (m.a === 'godp') { const t = find(); if (t) t.p.god = t.p.god ? 0 : 1; }
  else if (m.a === 'frzp') { const t = find(); if (t) { t.p.frz = t.p.frz ? 0 : 1; send(t, { t: 'frz', v: t.p.frz }); } }
  else if (m.a === 'tpto') { const t = find(); if (t) { send(c, { t: 'snap', pos: [t.p.x, t.p.y + 0.2, t.p.z + 1.5] }); Object.assign(c.p, { x: t.p.x, y: t.p.y, z: t.p.z + 1.5, bud: 70, mt: Date.now() }); } }
  else if (m.a === 'bring') { const t = find(); if (t) { Object.assign(t.p, { x: c.p.x + 1.5, y: c.p.y, z: c.p.z, bud: 70, mt: Date.now() }); send(t, { t: 'snap', pos: [t.p.x, t.p.y, t.p.z] }); } }
  else if (m.a === 'killp') { const t = find(); if (t && t.p.al && !t.p.lob) applyDamage(c, t.p, 9999, false, 0); }
  if (m.a !== 'list') adminCmd(c, { pw: m.pw, a: 'list' });
}

function board() {
  return [...clients].filter(c => c.p).map(c => ({ n: c.p.n, k: c.p.k, d: c.p.d, id: c.p.id })).sort((a, b) => b.k - a.k);
}
function endMatch(winner) {
  ended = true;
  let nm = leader();
  if (nm < 0) { do nm = Math.floor(Math.random() * 5); while (nm === curMap); }
  bcast({ t: 'end', winner: winner.n, wid: winner.id, board: board(), next: NEXT_MATCH_MS, nextMap: nm });
  log('🏆 Fin de partie, gagnant :', winner.n);
  setTimeout(() => {
    ended = false;
    curMap = nm; votes.clear(); bcast({ t: 'map', id: curMap, c: counts() });
    for (const c of clients) {
      if (!c.p) continue;
      Object.assign(c.p, { k: 0, d: 0 });
      if (c.p.lob) continue;
      const sp = pickSpawn();
      Object.assign(c.p, { hp: 100, al: true, x: sp[0], y: 0, z: sp[2], inv: Date.now() + 2000 });
      send(c, { t: 'respawn', pos: sp, hp: 100, fresh: true, map: curMap });
    }
  }, NEXT_MATCH_MS);
}

setInterval(() => {
  const ps = [];
  for (const c of clients) if (c.p) {
    const q = c.p; if (q.ghost) continue; // admin invisible
    ps.push({ id: q.id, n: q.n, x: q.x, y: q.y, z: q.z, yw: q.yw, pt: q.pt, w: q.w, sk: q.sk, hp: q.hp, al: q.al ? 1 : 0, sl: q.sl, cr: q.cr, k: q.k, d: q.d, dv: q.dv | 0, mic: q.mic | 0, lv: q.lv | 0, vc: q.vc | 0 });
  }
  const msg = Buffer.from(JSON.stringify({ t: 's', ps, limit: KILL_LIMIT }));
  for (const c of clients) if (c.p) sendRaw(c.sock, 1, msg);
}, 50);

setInterval(() => {
  const rows = [...hall.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const msg = Buffer.from(JSON.stringify({ t: 'hall', rows }));
  for (const c of clients) if (c.p) sendRaw(c.sock, 1, msg);
}, 3000);

// ---------- HTTPS (pour que le micro marche sur les autres PC) ----------
const HPORT = +process.env.HPORT || (PORT + 443);
let hsrv = null;
try {
  hsrv = require('https').createServer({ key: fs.readFileSync(findFile('key.pem')), cert: fs.readFileSync(findFile('cert.pem')) }, server.listeners('request')[0]);
  hsrv.on('upgrade', server.listeners('upgrade')[0]);
  hsrv.on('error', e => console.log('(https indisponible : ' + e.code + ')'));
  hsrv.listen(HPORT, '0.0.0.0');
} catch (e) { hsrv = null; }

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=== ARÈNE RENARD — serveur démarré ===');
  console.log('Toi (sur cet ordinateur) :  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log('Amis (même réseau Wi-Fi)  :  http://' + i.address + ':' + PORT);
  if (hsrv) { console.log('\n🎤 POUR LE MICRO sur un autre PC, utilise plutôt ces adresses (https) :'); for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log('   https://' + i.address + ':' + HPORT + '   (le navigateur dit "non sécurisé" : clique Avancé → Continuer)'); }
  console.log('Laisse cette fenêtre ouverte pendant que vous jouez. Ctrl+C pour arrêter.\n');
});
