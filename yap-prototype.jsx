import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home as HomeIcon,
  Search as SearchIcon,
  MessageSquare,
  User as UserIcon,
  Megaphone,
  Repeat2,
  Send,
  Volume2,
  VolumeX,
  ArrowLeft,
  Check,
  Plus,
  Play,
  Settings as SettingsIcon,
  MoreVertical,
  Flag,
  Ban,
  BadgeCheck,
  Camera,
  Image as ImageIcon,
  Bell,
  Lock,
  FileText,
  Trash2,
  ChevronRight,
  X,
  MessageCircle,
  Eye,
  LogOut,
  Info,
} from "lucide-react";

/* ---------------------------------------------------------------------
   YAP — full prototype build
   Vertical video feed, DMs, search, profile with avatar + banner,
   verification request flow, comments, posting, moderation tools,
   settings, and legal documents.
   Everything persists locally via window.storage.
--------------------------------------------------------------------- */

const APP_VERSION = "0.9.0 (beta)";

const FONT_LINK_ID = "yap-fonts";
function ensureFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

const V = (name) =>
  `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`;

const SEED_VIDEOS = [
  { id: "v1", author: "kaiden.exe", caption: "ranked lobby at 2am hits different", src: V("ForBiggerBlazes"), yaps: 842, reyaps: 41 },
  { id: "v2", author: "mira_plays", caption: "con floor walk, front row the whole time", src: V("ForBiggerEscapes"), yaps: 2310, reyaps: 302 },
  { id: "v3", author: "lowkeyluca", caption: "4am voice memo turned into a whole track", src: V("ForBiggerFun"), yaps: 690, reyaps: 77 },
  { id: "v4", author: "quiet.static", caption: "group chats are modern campfires and I stand on that", src: V("ForBiggerJoyrides"), yaps: 5602, reyaps: 812 },
  { id: "v5", author: "glitchgremlin", caption: "filmed this at 1% battery as a public service", src: V("ForBiggerMeltdowns"), yaps: 4109, reyaps: 690 },
  { id: "v6", author: "benchwarmr", caption: "watch it again, that pass was illegal", src: V("BigBuckBunny"), yaps: 940, reyaps: 133 },
  { id: "v7", author: "reelrunner", caption: "the sequel is quieter but it's the better film", src: V("ElephantsDream"), yaps: 512, reyaps: 40 },
  { id: "v8", author: "north.codes", caption: "shipped it at 3am, somehow nothing broke", src: V("TearsOfSteel"), yaps: 240, reyaps: 12 },
];

const PEOPLE = ["mira_plays", "quiet.static", "north.codes", "benchwarmr", "lowkeyluca", "kaiden.exe", "glitchgremlin", "reelrunner"];
const VERIFIED_PEOPLE = ["mira_plays", "lowkeyluca"];

const SEED_COMMENTS = {
  v1: [
    { id: "c1", author: "north.codes", text: "my aim is just gone this week", ts: Date.now() - 400000 },
    { id: "c2", author: "glitchgremlin", text: "skill issue (affectionate)", ts: Date.now() - 120000 },
  ],
  v2: [{ id: "c1", author: "quiet.static", text: "front row is elite behavior", ts: Date.now() - 900000 }],
  v4: [{ id: "c1", author: "reelrunner", text: "this is unreasonably true", ts: Date.now() - 300000 }],
};

const DEFAULT_SETTINGS = {
  privateAccount: false,
  dmsFrom: "everyone", // everyone | following
  showActivity: true,
  pushYaps: true,
  pushComments: true,
  pushFollows: true,
  pushMessages: true,
  autoplay: true,
  startMuted: true,
  dataSaver: false,
  reduceMotion: false,
};

const GREYS = ["#3A3A3A", "#4B4B4B", "#5E5E5E", "#454545", "#6B6B6B", "#525252"];
function greyFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GREYS[h % GREYS.length];
}
function nice(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
function timeAgo(ts) {
  const d = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

// Downscale an uploaded image to a data URL so it can be stored and survive refresh.
function fileToDataUrl(file, maxDim = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------- storage ---------------------------- */

const KEYS = {
  profile: "yap:profile",
  videos: "yap:videos",
  myVideos: "yap:my-videos",
  following: "yap:following",
  dms: "yap:dms",
  comments: "yap:comments",
  settings: "yap:settings",
  moderation: "yap:moderation",
  notifications: "yap:notifications",
  legal: "yap:legal-accepted",
};

function useStore() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [videoState, setVideoState] = useState({});
  const [myVideos, setMyVideos] = useState([]);
  const [following, setFollowing] = useState([]);
  const [dms, setDms] = useState({});
  const [comments, setComments] = useState(SEED_COMMENTS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [moderation, setModeration] = useState({ blocked: [], muted: [], hidden: [], reports: [] });
  const [notifications, setNotifications] = useState([]);
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const get = async (k) => {
        try { return (await window.storage.get(k)).value; } catch (e) { return null; }
      };
      const [p, vs, mv, f, d, c, s, m, n, l] = await Promise.all([
        get(KEYS.profile), get(KEYS.videos), get(KEYS.myVideos), get(KEYS.following),
        get(KEYS.dms), get(KEYS.comments), get(KEYS.settings), get(KEYS.moderation),
        get(KEYS.notifications), get(KEYS.legal),
      ]);
      if (dead) return;
      setProfile(p ? JSON.parse(p) : null);
      setVideoState(vs ? JSON.parse(vs) : {});
      setMyVideos(mv ? JSON.parse(mv) : []);
      setFollowing(f ? JSON.parse(f) : []);
      setDms(d ? JSON.parse(d) : {});
      setComments(c ? JSON.parse(c) : SEED_COMMENTS);
      setSettings(s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS);
      setModeration(m ? JSON.parse(m) : { blocked: [], muted: [], hidden: [], reports: [] });
      setNotifications(n ? JSON.parse(n) : []);
      setLegalAccepted(l === "true");
      setReady(true);
    })();
    return () => { dead = true; };
  }, []);

  const mk = (key, setter) =>
    useCallback(async (next) => {
      setter(next);
      try { await window.storage.set(key, typeof next === "string" ? next : JSON.stringify(next)); } catch (e) {}
    }, []);

  return {
    ready,
    profile, saveProfile: mk(KEYS.profile, setProfile),
    videoState, saveVideoState: mk(KEYS.videos, setVideoState),
    myVideos, saveMyVideos: mk(KEYS.myVideos, setMyVideos),
    following, saveFollowing: mk(KEYS.following, setFollowing),
    dms, saveDms: mk(KEYS.dms, setDms),
    comments, saveComments: mk(KEYS.comments, setComments),
    settings, saveSettings: mk(KEYS.settings, setSettings),
    moderation, saveModeration: mk(KEYS.moderation, setModeration),
    notifications, saveNotifications: mk(KEYS.notifications, setNotifications),
    legalAccepted, saveLegalAccepted: mk(KEYS.legal, setLegalAccepted),
  };
}

/* ---------------------------- atoms ---------------------------- */

function Avatar({ name, src, size = 40, verified }) {
  return (
    <div className="yp-avwrap" style={{ width: size, height: size }}>
      {src ? (
        <img className="yp-avatar yp-avatar-img" src={src} alt="" style={{ width: size, height: size }} />
      ) : (
        <div className="yp-avatar" style={{ width: size, height: size, background: greyFor(name || "?"), fontSize: size * 0.4 }}>
          {(name || "?")[0].toUpperCase()}
        </div>
      )}
      {verified && <BadgeCheck className="yp-verifydot" size={Math.max(13, size * 0.33)} fill="#EDEDED" color="#0A0A0A" />}
    </div>
  );
}

function Count({ value }) {
  const [shift, setShift] = useState("");
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    setShift(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setShift(""), 300);
    return () => clearTimeout(t);
  }, [value]);
  return <span className={`yp-count ${shift ? "yp-count-" + shift : ""}`}>{typeof value === "number" ? nice(value) : value}</span>;
}

function Toggle({ on, onChange }) {
  return (
    <button className={`yp-toggle ${on ? "is-on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="yp-toggle-knob" />
    </button>
  );
}

function Row({ icon: Icon, label, sub, right, onClick, danger }) {
  return (
    <button className={`yp-row ${danger ? "is-danger" : ""}`} onClick={onClick} disabled={!onClick && !right}>
      {Icon && <Icon size={18} className="yp-row-icon" />}
      <span className="yp-row-text">
        <span className="yp-row-label">{label}</span>
        {sub && <span className="yp-row-sub">{sub}</span>}
      </span>
      {right !== undefined ? right : onClick ? <ChevronRight size={16} className="yp-row-chev" /> : null}
    </button>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="yp-toast">{message}</div>;
}

/* ---------------------------- video card ---------------------------- */

function VideoCard({ video, state, isFollowing, verified, avatarSrc, onYap, onReyap, onFollow, onSend, onComment, onMore, commentCount, muted, onToggleMute, reduceMotion }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pulse, setPulse] = useState(null);
  const [bigPop, setBigPop] = useState(false);
  const yapped = !!state.yapped;
  const reyapped = !!state.reyapped;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          el.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          el.pause();
          setPlaying(false);
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const togglePlay = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => {});
    else { el.pause(); setPlaying(false); }
  };

  const ping = (w) => { if (reduceMotion) return; setPulse(w); setTimeout(() => setPulse(null), 420); };

  const doYap = (fromTap) => {
    onYap(video.id);
    if (!yapped) {
      ping("yap");
      if (fromTap && !reduceMotion) { setBigPop(true); setTimeout(() => setBigPop(false), 700); }
    }
  };

  return (
    <section className="yp-slide">
      <div className="yp-videowrap">
        <video
          ref={ref}
          src={video.src}
          loop
          muted={muted}
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onDoubleClick={() => { if (!yapped) doYap(true); }}
        />
        <div className="yp-scrim" />
      </div>

      {bigPop && <div className="yp-bigyap"><Megaphone size={92} fill="#fff" color="#fff" /></div>}
      {!playing && (
        <button className="yp-playoverlay" onClick={togglePlay} aria-label="Play"><Play size={30} fill="#fff" color="#fff" /></button>
      )}

      <button className="yp-bubble yp-mute" onClick={onToggleMute} aria-label="Mute">
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button className="yp-bubble yp-more" onClick={() => onMore(video)} aria-label="More"><MoreVertical size={16} /></button>

      <div className="yp-rail">
        <div className="yp-rail-avatar">
          <Avatar name={video.author} src={avatarSrc} size={46} verified={verified} />
          <button className={`yp-followdot ${isFollowing ? "is-on" : ""}`} onClick={() => onFollow(video.author)} aria-label="Follow">
            {isFollowing ? <Check size={12} /> : <Plus size={12} />}
          </button>
        </div>

        <button className="yp-railbtn" onClick={() => doYap(false)}>
          <span className={`yp-bubble yp-railbubble ${yapped ? "is-on" : ""} ${pulse === "yap" ? "yp-pop" : ""}`}>
            <Megaphone size={24} fill={yapped ? "#0A0A0A" : "none"} />
          </span>
          <Count value={video.yaps + (yapped ? 1 : 0)} />
        </button>

        <button className="yp-railbtn" onClick={() => onComment(video)}>
          <span className="yp-bubble yp-railbubble"><MessageCircle size={23} /></span>
          <Count value={commentCount} />
        </button>

        <button className="yp-railbtn" onClick={() => { onReyap(video.id); if (!reyapped) ping("reyap"); }}>
          <span className={`yp-bubble yp-railbubble ${reyapped ? "is-on" : ""} ${pulse === "reyap" ? "yp-spin" : ""}`}>
            <Repeat2 size={24} />
          </span>
          <Count value={video.reyaps + (reyapped ? 1 : 0)} />
        </button>

        <button className="yp-railbtn" onClick={() => { ping("send"); onSend(video); }}>
          <span className={`yp-bubble yp-railbubble ${pulse === "send" ? "yp-nudge" : ""}`}><Send size={22} /></span>
          <span className="yp-count">Send</span>
        </button>
      </div>

      <div className="yp-caption">
        <div className="yp-caption-row">
          <span className="yp-handle">@{video.author}</span>
          {verified && <BadgeCheck size={14} fill="#EDEDED" color="#0A0A0A" />}
          {!isFollowing && <button className="yp-followbtn" onClick={() => onFollow(video.author)}>Follow</button>}
        </div>
        <p>{video.caption}</p>
      </div>
    </section>
  );
}

/* ---------------------------- sheets ---------------------------- */

function Sheet({ title, onClose, children, tall }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 220); };
  return (
    <div className={`yp-sheet-back ${closing ? "is-closing" : ""}`} onClick={close}>
      <div className={`yp-sheet ${tall ? "is-tall" : ""} ${closing ? "is-closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="yp-sheet-grip" />
        {title && (
          <div className="yp-sheet-head">
            <span className="yp-sheet-title">{title}</span>
            <button className="yp-iconbtn" onClick={close}><X size={17} /></button>
          </div>
        )}
        <div className="yp-sheet-body">{children}</div>
      </div>
    </div>
  );
}

function SendSheet({ video, onClose, onSendTo, avatars }) {
  const [sent, setSent] = useState([]);
  return (
    <Sheet title="Send this Yap" onClose={onClose}>
      {PEOPLE.filter((p) => p !== video.author).map((p, i) => {
        const done = sent.includes(p);
        return (
          <div className="yp-sheet-row" key={p} style={{ animationDelay: `${i * 26}ms` }}>
            <Avatar name={p} src={avatars[p]} size={40} verified={VERIFIED_PEOPLE.includes(p)} />
            <span className="yp-sheet-name">@{p}</span>
            <button className={`yp-sendbtn ${done ? "is-done" : ""}`} onClick={() => { if (!done) { onSendTo(p, video); setSent((s) => [...s, p]); } }}>
              {done ? <><Check size={13} /> Sent</> : "Send"}
            </button>
          </div>
        );
      })}
    </Sheet>
  );
}

function CommentSheet({ video, comments, profile, onAdd, onClose, avatars }) {
  const [text, setText] = useState("");
  return (
    <Sheet title={`${comments.length} ${comments.length === 1 ? "comment" : "comments"}`} onClose={onClose} tall>
      <div className="yp-comments">
        {comments.length === 0 && <p className="yp-empty">No comments yet. Say the first thing.</p>}
        {comments.map((c) => (
          <div className="yp-comment" key={c.id}>
            <Avatar name={c.author} src={c.author === profile.username ? profile.avatar : avatars[c.author]} size={32} verified={VERIFIED_PEOPLE.includes(c.author)} />
            <div>
              <div className="yp-comment-head">@{c.author} <span className="yp-thread-time">· {timeAgo(c.ts)}</span></div>
              <div className="yp-comment-text">{c.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="yp-composer">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment..."
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(video.id, text.trim()); setText(""); } }} />
        <button className="yp-sendcircle" disabled={!text.trim()} onClick={() => { if (text.trim()) { onAdd(video.id, text.trim()); setText(""); } }}>
          <Send size={17} />
        </button>
      </div>
    </Sheet>
  );
}

function MoreSheet({ video, moderation, onClose, onReport, onBlock, onMute, onHide, toast }) {
  const isMuted = moderation.muted.includes(video.author);
  const isBlocked = moderation.blocked.includes(video.author);
  return (
    <Sheet title={`@${video.author}`} onClose={onClose}>
      <Row icon={Eye} label="Not interested" sub="Hide this Yap from your feed" onClick={() => { onHide(video.id); toast("Hidden from your feed"); onClose(); }} />
      <Row icon={VolumeX} label={isMuted ? "Unmute account" : "Mute account"} sub="Stop seeing their Yaps, stay following" onClick={() => { onMute(video.author); toast(isMuted ? "Unmuted" : "Muted"); onClose(); }} />
      <Row icon={Ban} label={isBlocked ? "Unblock account" : "Block account"} sub="They can't message or find you" danger onClick={() => { onBlock(video.author); toast(isBlocked ? "Unblocked" : "Blocked"); onClose(); }} />
      <Row icon={Flag} label="Report" sub="Tell moderation what's wrong" danger onClick={() => onReport(video)} />
    </Sheet>
  );
}

const REPORT_REASONS = [
  "Spam or scam",
  "Harassment or bullying",
  "Hate speech",
  "Violence or dangerous acts",
  "Nudity or sexual content",
  "Self-harm or suicide",
  "Misinformation",
  "Intellectual property",
  "Something else",
];

function ReportSheet({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState("");
  return (
    <Sheet title="Report" onClose={onClose} tall>
      <p className="yp-note">Reports are reviewed by moderation. We'll never tell the account who reported them.</p>
      {REPORT_REASONS.map((r) => (
        <button key={r} className={`yp-choice ${reason === r ? "is-on" : ""}`} onClick={() => setReason(r)}>
          {r}{reason === r && <Check size={15} />}
        </button>
      ))}
      <textarea className="yp-textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Add details (optional)" />
      <button className="yp-primary" disabled={!reason} onClick={() => onSubmit({ target, reason, details })}>Submit report</button>
    </Sheet>
  );
}

function PostSheet({ profile, onClose, onPost }) {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const inputRef = useRef(null);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video")) return;
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };

  return (
    <Sheet title="New Yap" onClose={onClose} tall>
      <input ref={inputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pick} />
      {url ? (
        <div className="yp-postpreview">
          <video src={url} muted loop autoPlay playsInline />
          <button className="yp-bubble yp-postremove" onClick={() => { setUrl(null); setFile(null); }}><X size={15} /></button>
        </div>
      ) : (
        <button className="yp-picker" onClick={() => inputRef.current?.click()}>
          <Camera size={26} />
          <span>Choose a video</span>
          <small>MP4 or MOV from your device</small>
        </button>
      )}
      <textarea className="yp-textarea" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something about it..." />
      <p className="yp-note">Heads up: videos you pick here play for this session only. Real uploads need server storage, which isn't wired up in this beta.</p>
      <button className="yp-primary" disabled={!url} onClick={() => { onPost({ src: url, caption: caption.trim() }); onClose(); }}>Post Yap</button>
    </Sheet>
  );
}

/* ---------------------------- edit profile ---------------------------- */

function EditProfile({ profile, onSave, onClose, toast }) {
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || "");
  const [link, setLink] = useState(profile.link || "");
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [banner, setBanner] = useState(profile.banner || null);
  const [busy, setBusy] = useState(false);
  const avatarRef = useRef(null);
  const bannerRef = useRef(null);

  const handle = async (e, setter, maxDim) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image")) { toast("Pick an image file"); return; }
    setBusy(true);
    try { setter(await fileToDataUrl(f, maxDim)); }
    catch { toast("Couldn't read that image"); }
    setBusy(false);
  };

  return (
    <Sheet title="Edit profile" onClose={onClose} tall>
      <input ref={avatarRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handle(e, setAvatar, 400)} />
      <input ref={bannerRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handle(e, setBanner, 1000)} />

      <div className="yp-editbanner" onClick={() => bannerRef.current?.click()}>
        {banner ? <img src={banner} alt="" /> : <div className="yp-editbanner-empty"><ImageIcon size={20} /> Add banner</div>}
        <span className="yp-editbanner-tag"><Camera size={13} /> Change banner</span>
      </div>

      <div className="yp-editavatar">
        <button className="yp-avbtn" onClick={() => avatarRef.current?.click()}>
          <Avatar name={username} src={avatar} size={78} />
          <span className="yp-avbtn-badge"><Camera size={13} /></span>
        </button>
        <button className="yp-ghost" onClick={() => avatarRef.current?.click()}>Change photo</button>
        {avatar && <button className="yp-ghost yp-ghost-danger" onClick={() => setAvatar(null)}>Remove</button>}
      </div>

      <label className="yp-label">Display name</label>
      <input className="yp-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={40} />

      <label className="yp-label">Username</label>
      <div className="yp-field"><span>@</span>
        <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())} maxLength={24} />
      </div>

      <label className="yp-label">Bio</label>
      <textarea className="yp-textarea" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people what you're about" maxLength={160} />
      <div className="yp-counter">{bio.length}/160</div>

      <label className="yp-label">Link</label>
      <input className="yp-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="yoursite.com" />

      <button className="yp-primary" disabled={busy || username.trim().length < 3}
        onClick={() => { onSave({ ...profile, displayName: displayName.trim(), username: username.trim(), bio: bio.trim(), link: link.trim(), avatar, banner }); toast("Profile updated"); onClose(); }}>
        {busy ? "Processing image..." : "Save changes"}
      </button>
    </Sheet>
  );
}

/* ---------------------------- verification ---------------------------- */

const VERIFY_CATEGORIES = ["Creator", "Musician", "Athlete", "Journalist", "Brand or business", "Public figure", "Other"];

function VerifyPage({ profile, onSave, onBack, toast }) {
  const status = profile.verification?.status || "none";
  const [legalName, setLegalName] = useState(profile.verification?.legalName || "");
  const [category, setCategory] = useState(profile.verification?.category || null);
  const [why, setWhy] = useState(profile.verification?.why || "");
  const [idFile, setIdFile] = useState(profile.verification?.idAttached || false);
  const idRef = useRef(null);

  if (status === "pending") {
    return (
      <SubPage title="Verification" onBack={onBack}>
        <div className="yp-statuscard">
          <BadgeCheck size={34} />
          <h3>Review in progress</h3>
          <p>We've got your request. Reviews usually take a few days — you'll get a notification either way.</p>
          <button className="yp-ghost" onClick={() => { onSave({ ...profile, verification: { ...profile.verification, status: "approved", decidedAt: Date.now() } }); toast("You're verified"); }}>
            Simulate approval (demo)
          </button>
          <button className="yp-ghost yp-ghost-danger" onClick={() => { onSave({ ...profile, verification: { ...profile.verification, status: "none" } }); toast("Request withdrawn"); }}>
            Withdraw request
          </button>
        </div>
      </SubPage>
    );
  }

  if (status === "approved") {
    return (
      <SubPage title="Verification" onBack={onBack}>
        <div className="yp-statuscard">
          <BadgeCheck size={34} fill="#EDEDED" color="#0A0A0A" />
          <h3>You're verified</h3>
          <p>Your badge shows on your profile, your Yaps, and anywhere your handle appears.</p>
          <button className="yp-ghost yp-ghost-danger" onClick={() => { onSave({ ...profile, verification: { status: "none" } }); toast("Badge removed"); }}>
            Remove badge
          </button>
        </div>
      </SubPage>
    );
  }

  return (
    <SubPage title="Get verified" onBack={onBack}>
      <div className="yp-verifybanner">
        <BadgeCheck size={26} />
        <div>
          <strong>Verification</strong>
          <span>Confirms you're the real account behind your name.</span>
        </div>
      </div>

      <p className="yp-note">You'll need a name that matches your ID, a category, and a government ID photo. We only use it to confirm identity.</p>

      <label className="yp-label">Full legal name</label>
      <input className="yp-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As it appears on your ID" />

      <label className="yp-label">Category</label>
      <div className="yp-chips">
        {VERIFY_CATEGORIES.map((c) => (
          <button key={c} className={`yp-chip ${category === c ? "is-on" : ""}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <label className="yp-label">Why should you be verified?</label>
      <textarea className="yp-textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Links, press, anything that shows you're notable" maxLength={300} />

      <input ref={idRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setIdFile(!!e.target.files?.[0])} />
      <button className={`yp-picker yp-picker-sm ${idFile ? "is-done" : ""}`} onClick={() => idRef.current?.click()}>
        {idFile ? <><Check size={18} /> ID attached</> : <><Camera size={18} /> Attach photo ID</>}
      </button>

      <button className="yp-primary" disabled={!legalName.trim() || !category || !idFile}
        onClick={() => {
          onSave({ ...profile, verification: { status: "pending", legalName: legalName.trim(), category, why: why.trim(), idAttached: true, submittedAt: Date.now() } });
          toast("Request submitted");
        }}>
        Submit for review
      </button>
      <p className="yp-note">This beta simulates review locally — nothing is sent anywhere.</p>
    </SubPage>
  );
}

/* ---------------------------- legal ---------------------------- */

const TOS = `Last updated: ${new Date().getFullYear()}

1. ACCEPTING THESE TERMS
By creating an account or using YAP, you agree to these Terms. If you don't agree, don't use YAP.

2. WHO CAN USE YAP
You must be at least 13 years old (or the minimum age in your country). If you're under 18, you need a parent or guardian's permission. You must not be barred from using the service under applicable law, and you must not have been previously removed for violating these Terms.

3. YOUR ACCOUNT
You're responsible for your account and anything that happens through it. Keep your login credentials private and tell us immediately if you think someone else has access.

4. YOUR CONTENT
You keep ownership of everything you post. By posting, you give YAP a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, display, and distribute that content for the purpose of operating and promoting the service. That licence ends when you delete the content, except for copies already shared by others or retained in backups for a reasonable period.

5. WHAT YOU CAN'T DO
Don't post content that is illegal, sexually explicit, violent or graphic, hateful, harassing, or that promotes self-harm. Don't impersonate others, infringe intellectual property, sell or buy accounts, scrape the service, run automated bots, or attempt to bypass security or rate limits. Don't use YAP to spam or defraud anyone.

6. MODERATION AND ENFORCEMENT
We may remove content and suspend or terminate accounts that break these Terms or our Community Guidelines. Where practical, we'll tell you why and how to appeal, but we may act immediately without notice where there's risk of serious harm or legal exposure.

7. TERMINATION
You can delete your account at any time in Settings. We may suspend or terminate your access if you violate these Terms, if required by law, or if continuing to provide the service to you is not commercially viable.

8. DISCLAIMERS
YAP is provided "as is" and "as available." We don't warrant that it will be uninterrupted, secure, or error-free, or that content on it is accurate or appropriate.

9. LIMITATION OF LIABILITY
To the maximum extent permitted by law, YAP is not liable for indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill.

10. CHANGES
We may update these Terms. If the changes are material, we'll give you notice in the app before they take effect. Continuing to use YAP after that means you accept the updated Terms.

11. CONTACT
Questions about these Terms: legal@yap.example`;

const PRIVACY = `Last updated: ${new Date().getFullYear()}

WHAT WE COLLECT
Account information: your username, display name, email or phone, profile photo, banner, and bio.
Content: the videos, captions, comments, and messages you create.
Usage data: which Yaps you view, Yap and Re-Yap, how long you watch, and general interaction patterns.
Device data: device type, operating system, app version, approximate location derived from IP address, and crash logs.
Verification data: if you request verification, the legal name, category, and identity document you submit.

HOW WE USE IT
To run the service and show you your feed; to personalise recommendations; to keep YAP safe through moderation and abuse detection; to communicate with you about your account; and to meet legal obligations.

HOW WE SHARE IT
With service providers who host, store, or process data on our behalf under contract. With law enforcement when we receive a valid legal request or where there's a risk of serious harm. With other users, for anything you post publicly. We do not sell your personal information.

YOUR CONTROLS
You can edit or delete your content, make your account private, restrict who can message you, download a copy of your data, and delete your account entirely from Settings. Deleting your account removes your content from the service within 30 days, except where we're required to keep it.

RETENTION
We keep account data while your account is active. Verification documents are deleted within 30 days of a decision. Backups are cycled out on a rolling basis.

CHILDREN
YAP isn't for anyone under 13. If we learn an account belongs to someone under 13, we'll remove it.

INTERNATIONAL TRANSFERS
Your information may be processed in countries other than your own, with safeguards required by applicable law.

CONTACT
Privacy questions or data requests: privacy@yap.example`;

const GUIDELINES = `YAP is for talking to people. These rules keep it that way.

BE A PERSON, NOT A PROBLEM
No harassment, targeted abuse, or pile-ons. Disagreeing is fine. Making someone's life worse on purpose isn't.

NO HATE
No attacks on people based on race, ethnicity, national origin, caste, religion, disability, disease, age, sex, gender identity, or sexual orientation.

KEEP IT SAFE
No content promoting self-harm, suicide, or eating disorders. No glorifying violence or dangerous challenges. If you're struggling, we'd rather point you to help than take your post down quietly.

NO SEXUAL CONTENT
No nudity or sexually explicit material. Absolutely no content sexualising minors — that gets reported to authorities, permanently, with no appeal.

DON'T LIE ABOUT WHO YOU ARE
No impersonating people or organisations. Parody is fine if it's clearly labelled.

DON'T SPAM
No bots, engagement farming, scams, fake giveaways, or bulk unsolicited messages.

RESPECT OTHER PEOPLE'S WORK
Don't repost someone else's video as your own. Re-Yap exists for a reason.

IF SOMEONE BREAKS THESE RULES
Report it. Reports are anonymous to the person reported. We review everything, and repeat or severe violations mean removal.`;

function LegalPage({ title, body, onBack }) {
  return (
    <SubPage title={title} onBack={onBack}>
      <pre className="yp-legal">{body}</pre>
      <p className="yp-note">Template text for the beta. Have a lawyer review and adapt these before launching publicly — App Store review requires working, accurate policy links.</p>
    </SubPage>
  );
}

/* ---------------------------- settings ---------------------------- */

function SubPage({ title, onBack, children }) {
  return (
    <div className="yp-page">
      <header className="yp-pagehead yp-pagehead-row">
        <button className="yp-iconbtn" onClick={onBack}><ArrowLeft size={18} /></button>
        <span>{title}</span>
      </header>
      <div className="yp-subbody">{children}</div>
    </div>
  );
}

function SettingsPage({ profile, settings, saveSettings, moderation, saveModeration, onNav, onBack, onResetAll, toast, notifications }) {
  const set = (k, v) => saveSettings({ ...settings, [k]: v });
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SubPage title="Settings" onBack={onBack}>
      <div className="yp-sectionhead">Account</div>
      <Row icon={UserIcon} label="Edit profile" sub="Photo, banner, name, bio" onClick={() => onNav("edit")} />
      <Row icon={BadgeCheck} label="Verification"
        sub={profile.verification?.status === "approved" ? "Verified" : profile.verification?.status === "pending" ? "Under review" : "Not verified"}
        onClick={() => onNav("verify")} />
      <Row icon={Bell} label="Notifications" sub={unreadCount ? `${unreadCount} unread` : "All caught up"} onClick={() => onNav("notifications")} />

      <div className="yp-sectionhead">Privacy</div>
      <Row icon={Lock} label="Private account" sub="Only approved followers see your Yaps" right={<Toggle on={settings.privateAccount} onChange={(v) => set("privateAccount", v)} />} />
      <Row label="Show activity status" sub="Let people see when you're online" right={<Toggle on={settings.showActivity} onChange={(v) => set("showActivity", v)} />} />
      <div className="yp-inlinechoice">
        <span className="yp-row-label">Who can message you</span>
        <div className="yp-segment">
          {["everyone", "following"].map((o) => (
            <button key={o} className={settings.dmsFrom === o ? "is-on" : ""} onClick={() => set("dmsFrom", o)}>
              {o === "everyone" ? "Everyone" : "People I follow"}
            </button>
          ))}
        </div>
      </div>
      <Row icon={Ban} label="Blocked accounts" sub={`${moderation.blocked.length} blocked`} onClick={() => onNav("blocked")} />
      <Row icon={VolumeX} label="Muted accounts" sub={`${moderation.muted.length} muted`} onClick={() => onNav("muted")} />

      <div className="yp-sectionhead">Push notifications</div>
      <Row label="Yaps on your posts" right={<Toggle on={settings.pushYaps} onChange={(v) => set("pushYaps", v)} />} />
      <Row label="Comments" right={<Toggle on={settings.pushComments} onChange={(v) => set("pushComments", v)} />} />
      <Row label="New followers" right={<Toggle on={settings.pushFollows} onChange={(v) => set("pushFollows", v)} />} />
      <Row label="Direct messages" right={<Toggle on={settings.pushMessages} onChange={(v) => set("pushMessages", v)} />} />

      <div className="yp-sectionhead">Playback</div>
      <Row label="Autoplay videos" right={<Toggle on={settings.autoplay} onChange={(v) => set("autoplay", v)} />} />
      <Row label="Start muted" right={<Toggle on={settings.startMuted} onChange={(v) => set("startMuted", v)} />} />
      <Row label="Data saver" sub="Lower quality on cellular" right={<Toggle on={settings.dataSaver} onChange={(v) => set("dataSaver", v)} />} />
      <Row label="Reduce motion" sub="Turn off bouncy animations" right={<Toggle on={settings.reduceMotion} onChange={(v) => set("reduceMotion", v)} />} />

      <div className="yp-sectionhead">About</div>
      <Row icon={FileText} label="Terms of Service" onClick={() => onNav("tos")} />
      <Row icon={FileText} label="Privacy Policy" onClick={() => onNav("privacy")} />
      <Row icon={FileText} label="Community Guidelines" onClick={() => onNav("guidelines")} />
      <Row icon={Flag} label="Your reports" sub={`${moderation.reports.length} submitted`} onClick={() => onNav("reports")} />
      <Row icon={Info} label="Version" right={<span className="yp-row-sub">{APP_VERSION}</span>} />

      <div className="yp-sectionhead">Danger zone</div>
      <Row icon={LogOut} label="Log out" onClick={() => toast("Log out needs a real auth backend")} />
      <Row icon={Trash2} label="Delete account and data" sub="Wipes everything on this device, permanently" danger onClick={onResetAll} />
      <div style={{ height: 30 }} />
    </SubPage>
  );
}

function ListManagePage({ title, items, emptyText, actionLabel, onAction, onBack, avatars }) {
  return (
    <SubPage title={title} onBack={onBack}>
      {items.length === 0 && <p className="yp-empty">{emptyText}</p>}
      {items.map((u) => (
        <div className="yp-thread" key={u}>
          <Avatar name={u} src={avatars[u]} size={42} />
          <div className="yp-thread-info"><div className="yp-thread-name">@{u}</div></div>
          <button className="yp-followbtn yp-followbtn-solid" onClick={() => onAction(u)}>{actionLabel}</button>
        </div>
      ))}
    </SubPage>
  );
}

function ReportsPage({ reports, onBack }) {
  return (
    <SubPage title="Your reports" onBack={onBack}>
      {reports.length === 0 && <p className="yp-empty">You haven't reported anything.</p>}
      {reports.map((r, i) => (
        <div className="yp-reportcard" key={i}>
          <div className="yp-reportcard-top">
            <span className="yp-thread-name">@{r.author}</span>
            <span className="yp-badge">{r.status}</span>
          </div>
          <div className="yp-thread-last">{r.reason}</div>
          {r.details && <p className="yp-reportdetail">{r.details}</p>}
          <span className="yp-thread-time">{timeAgo(r.ts)} ago</span>
        </div>
      ))}
    </SubPage>
  );
}

function NotificationsPage({ notifications, onBack, avatars, onRead }) {
  useEffect(() => { onRead(); }, []);
  const icons = { yap: Megaphone, follow: UserIcon, comment: MessageCircle, system: Info, verify: BadgeCheck };
  return (
    <SubPage title="Notifications" onBack={onBack}>
      {notifications.length === 0 && <p className="yp-empty">Nothing yet. Yaps, follows, and comments show up here.</p>}
      {notifications.slice().reverse().map((n, i) => {
        const Icon = icons[n.type] || Info;
        return (
          <div className="yp-notif" key={i}>
            <span className="yp-notif-icon"><Icon size={16} /></span>
            <div className="yp-thread-info">
              <div className="yp-thread-name">{n.title}</div>
              <div className="yp-thread-last">{n.body}</div>
            </div>
            <span className="yp-thread-time">{timeAgo(n.ts)}</span>
          </div>
        );
      })}
    </SubPage>
  );
}

/* ---------------------------- DMs ---------------------------- */

function DmList({ dms, onOpen, moderation, avatars }) {
  const active = PEOPLE.filter((p) => (dms[p] || []).length > 0 && !moderation.blocked.includes(p));
  const rest = PEOPLE.filter((p) => !(dms[p] || []).length && !moderation.blocked.includes(p)).slice(0, 5);
  const rows = [...active, ...rest];
  return (
    <div className="yp-page">
      <header className="yp-pagehead">Messages</header>
      <div className="yp-threads">
        {rows.map((p, i) => {
          const t = dms[p] || [];
          const last = t[t.length - 1];
          return (
            <button className="yp-thread yp-risein" key={p} style={{ animationDelay: `${i * 30}ms` }} onClick={() => onOpen(p)}>
              <Avatar name={p} src={avatars[p]} size={48} verified={VERIFIED_PEOPLE.includes(p)} />
              <div className="yp-thread-info">
                <div className="yp-thread-name">@{p}</div>
                <div className="yp-thread-last">{last ? (last.kind === "video" ? "Sent a Yap" : last.text) : "Say something"}</div>
              </div>
              {last && <span className="yp-thread-time">{timeAgo(last.ts)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DmThread({ who, messages, onSend, onClose, avatars, onBlock, blocked }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length]);
  return (
    <div className="yp-page">
      <header className="yp-pagehead yp-pagehead-row">
        <button className="yp-iconbtn" onClick={onClose}><ArrowLeft size={18} /></button>
        <Avatar name={who} src={avatars[who]} size={30} verified={VERIFIED_PEOPLE.includes(who)} />
        <span>@{who}</span>
        <button className="yp-iconbtn" style={{ marginLeft: "auto" }} onClick={() => onBlock(who)} title="Block">
          <Ban size={16} />
        </button>
      </header>
      <div className="yp-msgs">
        {messages.map((m, i) => (
          <div key={i} className={`yp-msgrow yp-msgin ${m.mine ? "is-mine" : ""}`}>
            {m.kind === "video" ? (
              <div className="yp-msgvideo">
                <video src={m.src} muted playsInline preload="metadata" />
                <span>Yap from @{m.author}</span>
              </div>
            ) : (
              <div className="yp-msg">{m.text}</div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {blocked ? (
        <div className="yp-blockedbar">You blocked @{who}.</div>
      ) : (
        <div className="yp-composer">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message..."
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSend(text.trim()); setText(""); } }} />
          <button className="yp-sendcircle" disabled={!text.trim()} onClick={() => { if (text.trim()) { onSend(text.trim()); setText(""); } }}>
            <Send size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- search ---------------------------- */

function SearchPage({ videos, following, onFollow, avatars, videoState }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("Top");
  const needle = q.trim().toLowerCase();
  const people = PEOPLE.filter((p) => !needle || p.includes(needle));
  const clips = videos.filter((v) => !needle || v.caption.toLowerCase().includes(needle) || v.author.includes(needle));
  return (
    <div className="yp-page">
      <header className="yp-pagehead">Search</header>
      <div className="yp-searchbar">
        <SearchIcon size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or Yaps" />
        {q && <button className="yp-iconbtn" onClick={() => setQ("")}><X size={15} /></button>}
      </div>
      <div className="yp-tabs">
        {["Top", "People", "Yaps"].map((t) => (
          <button key={t} className={`yp-tab ${tab === t ? "is-on" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {(tab === "Top" || tab === "People") && (
        <>
          <div className="yp-sub">People</div>
          <div className="yp-threads">
            {people.slice(0, tab === "People" ? 99 : 4).map((p, i) => {
              const f = following.includes(p);
              return (
                <div className="yp-thread yp-risein" key={p} style={{ animationDelay: `${i * 26}ms` }}>
                  <Avatar name={p} src={avatars[p]} size={44} verified={VERIFIED_PEOPLE.includes(p)} />
                  <div className="yp-thread-info"><div className="yp-thread-name">@{p}</div></div>
                  <button className={`yp-followbtn yp-followbtn-solid ${f ? "is-on" : ""}`} onClick={() => onFollow(p)}>{f ? "Following" : "Follow"}</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {(tab === "Top" || tab === "Yaps") && (
        <>
          <div className="yp-sub">Yaps</div>
          <div className="yp-grid">
            {clips.map((v, i) => (
              <div className="yp-tile yp-risein" key={v.id} style={{ animationDelay: `${i * 24}ms` }}>
                <video src={v.src} muted playsInline preload="metadata" />
                <span className="yp-tile-count"><Megaphone size={11} fill="#fff" /> {nice(v.yaps + (videoState[v.id]?.yapped ? 1 : 0))}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------- profile ---------------------------- */

function ProfilePage({ profile, videos, videoState, myVideos, following, onEdit, onSettings }) {
  const yapped = videos.filter((v) => videoState[v.id]?.yapped);
  const reyapped = videos.filter((v) => videoState[v.id]?.reyapped);
  const [tab, setTab] = useState("Yaps");
  const list = tab === "Yaps" ? myVideos : tab === "Yapped" ? yapped : reyapped;
  const verified = profile.verification?.status === "approved";

  return (
    <div className="yp-page">
      <div className="yp-profbanner">
        {profile.banner ? <img src={profile.banner} alt="" /> : <div className="yp-profbanner-blank" />}
        <button className="yp-bubble yp-profsettings" onClick={onSettings}><SettingsIcon size={17} /></button>
      </div>

      <div className="yp-prof">
        <Avatar name={profile.username} src={profile.avatar} size={84} verified={verified} />
        <div className="yp-prof-name">
          {profile.displayName || profile.username}
          {verified && <BadgeCheck size={17} fill="#EDEDED" color="#0A0A0A" />}
        </div>
        <div className="yp-prof-handle">@{profile.username}</div>
        {profile.bio && <p className="yp-prof-bio">{profile.bio}</p>}
        {profile.link && <span className="yp-prof-link">{profile.link}</span>}
        <div className="yp-prof-stats">
          <span><b>{myVideos.length}</b> Yaps</span>
          <span><b>{following.length}</b> Following</span>
          <span><b>{12 + following.length}</b> Followers</span>
        </div>
        <div className="yp-prof-actions">
          <button className="yp-primary yp-primary-sm" onClick={onEdit}>Edit profile</button>
          {!verified && profile.verification?.status !== "pending" && (
            <button className="yp-ghostbtn" onClick={onSettings}><BadgeCheck size={15} /> Get verified</button>
          )}
          {profile.verification?.status === "pending" && <span className="yp-badge">Verification pending</span>}
        </div>
      </div>

      <div className="yp-tabs">
        {["Yaps", "Yapped", "Re-Yapped"].map((t) => (
          <button key={t} className={`yp-tab ${tab === t ? "is-on" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="yp-empty">{tab === "Yaps" ? "You haven't posted yet. Tap + on the feed to post one." : "Nothing here yet."}</p>
      ) : (
        <div className="yp-grid">
          {list.map((v, i) => (
            <div className="yp-tile yp-risein" key={v.id} style={{ animationDelay: `${i * 24}ms` }}>
              <video src={v.src} muted playsInline preload="metadata" />
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}

/* ---------------------------- onboarding ---------------------------- */

function Onboarding({ onDone, onOpenLegal }) {
  const [step, setStep] = useState(0);
  const [u, setU] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const avRef = useRef(null);

  const pickAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image")) return;
    setBusy(true);
    try { setAvatar(await fileToDataUrl(f, 400)); } catch {}
    setBusy(false);
  };

  return (
    <div className="yp-onboard">
      <div className="yp-logo"><Megaphone size={26} /> YAP</div>

      {step === 0 && (
        <>
          <p className="yp-onboard-sub">Pick a handle to get started.</p>
          <div className="yp-field"><span>@</span>
            <input autoFocus value={u} onChange={(e) => setU(e.target.value.replace(/\s/g, "").toLowerCase())} placeholder="yourname" maxLength={24} />
          </div>
          <input className="yp-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (optional)" maxLength={40} />
          <button className="yp-primary" disabled={u.trim().length < 3} onClick={() => setStep(1)}>Continue</button>
        </>
      )}

      {step === 1 && (
        <>
          <p className="yp-onboard-sub">Add a profile photo.</p>
          <input ref={avRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickAvatar} />
          <button className="yp-avbtn yp-avbtn-lg" onClick={() => avRef.current?.click()}>
            <Avatar name={u} src={avatar} size={110} />
            <span className="yp-avbtn-badge"><Camera size={15} /></span>
          </button>
          <button className="yp-ghost" onClick={() => avRef.current?.click()}>{avatar ? "Change photo" : "Choose photo"}</button>
          <button className="yp-primary" disabled={busy} onClick={() => setStep(2)}>{busy ? "Processing..." : avatar ? "Continue" : "Skip for now"}</button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="yp-onboard-sub">One last thing.</p>
          <div className="yp-agreecard">
            <label className="yp-agree">
              <button className={`yp-check ${agreed ? "is-on" : ""}`} onClick={() => setAgreed((a) => !a)}>{agreed && <Check size={13} />}</button>
              <span>
                I'm 13 or older and I agree to the{" "}
                <button className="yp-inlinelink" onClick={() => onOpenLegal("tos")}>Terms of Service</button>,{" "}
                <button className="yp-inlinelink" onClick={() => onOpenLegal("privacy")}>Privacy Policy</button>, and{" "}
                <button className="yp-inlinelink" onClick={() => onOpenLegal("guidelines")}>Community Guidelines</button>.
              </span>
            </label>
          </div>
          <button className="yp-primary" disabled={!agreed}
            onClick={() => onDone({ username: u.trim(), displayName: displayName.trim(), avatar, banner: null, bio: "", link: "", verification: { status: "none" }, joined: Date.now() })}>
            Enter YAP
          </button>
        </>
      )}

      <div className="yp-dots">{[0, 1, 2].map((i) => <span key={i} className={i <= step ? "is-on" : ""} />)}</div>
    </div>
  );
}

/* ---------------------------- app ---------------------------- */

const NAV = [
  { id: "home", icon: HomeIcon, label: "Home" },
  { id: "search", icon: SearchIcon, label: "Search" },
  { id: "dm", icon: MessageSquare, label: "DMs" },
  { id: "profile", icon: UserIcon, label: "Profile" },
];

export default function YapApp() {
  useEffect(() => { ensureFonts(); }, []);
  const s = useStore();
  const [tab, setTab] = useState("home");
  const [sub, setSub] = useState(null); // settings subpage
  const [muted, setMuted] = useState(true);
  const [sendFor, setSendFor] = useState(null);
  const [commentFor, setCommentFor] = useState(null);
  const [moreFor, setMoreFor] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [openThread, setOpenThread] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [legalFromOnboard, setLegalFromOnboard] = useState(null);

  const toast = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(""), 1900); };

  useEffect(() => { if (s.ready) setMuted(s.settings.startMuted); }, [s.ready]);

  // stable pseudo-avatars for seeded people (none uploaded; initials are used)
  const avatars = {};

  if (!s.ready) return <div className="yp-root"><style>{CSS}</style><div className="yp-loading">Loading YAP…</div></div>;

  if (!s.profile) {
    if (legalFromOnboard) {
      const map = { tos: ["Terms of Service", TOS], privacy: ["Privacy Policy", PRIVACY], guidelines: ["Community Guidelines", GUIDELINES] };
      const [t, b] = map[legalFromOnboard];
      return <div className="yp-root"><style>{CSS}</style><LegalPage title={t} body={b} onBack={() => setLegalFromOnboard(null)} /></div>;
    }
    return (
      <div className="yp-root">
        <style>{CSS}</style>
        <Onboarding onOpenLegal={setLegalFromOnboard} onDone={(p) => { s.saveProfile(p); s.saveLegalAccepted("true"); s.saveNotifications([{ type: "system", title: "Welcome to YAP", body: "Follow a few people to fill out your feed.", ts: Date.now(), read: false }]); }} />
      </div>
    );
  }

  const profile = s.profile;
  const reduceMotion = s.settings.reduceMotion;
  const allVideos = [...s.myVideos, ...SEED_VIDEOS];
  const feed = allVideos.filter(
    (v) => !s.moderation.hidden.includes(v.id) && !s.moderation.muted.includes(v.author) && !s.moderation.blocked.includes(v.author)
  );

  const notify = (n) => s.saveNotifications([...s.notifications, { ...n, ts: Date.now(), read: false }]);

  const patchVideo = (id, fn) => {
    const cur = s.videoState[id] || {};
    s.saveVideoState({ ...s.videoState, [id]: { ...cur, ...fn(cur) } });
  };
  const onYap = (id) => patchVideo(id, (c) => ({ yapped: !c.yapped }));
  const onReyap = (id) => patchVideo(id, (c) => ({ reyapped: !c.reyapped }));

  const onFollow = (who) => {
    const isF = s.following.includes(who);
    s.saveFollowing(isF ? s.following.filter((f) => f !== who) : [...s.following, who]);
    if (!isF) notify({ type: "follow", title: `You followed @${who}`, body: "Their Yaps will show up in your feed." });
  };

  const pushMsg = (who, msg) => s.saveDms({ ...s.dms, [who]: [...(s.dms[who] || []), msg] });
  const onSendTo = (who, video) => { pushMsg(who, { kind: "video", src: video.src, author: video.author, mine: true, ts: Date.now() }); toast(`Sent to @${who}`); };
  const onSendText = (who, text) => pushMsg(who, { kind: "text", text, mine: true, ts: Date.now() });

  const addComment = (vid, text) => {
    const next = { ...s.comments, [vid]: [...(s.comments[vid] || []), { id: `c-${Date.now()}`, author: profile.username, text, ts: Date.now() }] };
    s.saveComments(next);
  };

  const toggleIn = (listName, value) => {
    const list = s.moderation[listName];
    s.saveModeration({ ...s.moderation, [listName]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };

  const submitReport = ({ target, reason, details }) => {
    s.saveModeration({ ...s.moderation, reports: [...s.moderation.reports, { author: target.author, videoId: target.id, reason, details, status: "Under review", ts: Date.now() }] });
    setReportFor(null);
    setMoreFor(null);
    toast("Report submitted");
    notify({ type: "system", title: "Report received", body: `We're reviewing your report about @${target.author}.` });
  };

  const resetAll = async () => {
    if (!window.confirm("Delete your account and all data on this device? This can't be undone.")) return;
    for (const k of Object.values(KEYS)) {
      try { await window.storage.delete(k); } catch (e) {}
    }
    window.location.reload();
  };

  const postVideo = ({ src, caption }) => {
    const v = { id: `mine-${Date.now()}`, author: profile.username, caption, src, yaps: 0, reyaps: 0, mine: true };
    s.saveMyVideos([v, ...s.myVideos]);
    toast("Posted");
    notify({ type: "yap", title: "Your Yap is live", body: caption || "No caption" });
    setTab("profile");
  };

  const legalMap = { tos: ["Terms of Service", TOS], privacy: ["Privacy Policy", PRIVACY], guidelines: ["Community Guidelines", GUIDELINES] };

  const navSettings = (dest) => { if (dest === "edit") { setShowEdit(true); return; } setSub(dest); };

  let subContent = null;
  if (sub === "settings") {
    subContent = <SettingsPage profile={profile} settings={s.settings} saveSettings={s.saveSettings} moderation={s.moderation}
      saveModeration={s.saveModeration} notifications={s.notifications} onNav={navSettings} onBack={() => setSub(null)} onResetAll={resetAll} toast={toast} />;
  } else if (sub === "verify") {
    subContent = <VerifyPage profile={profile} onSave={s.saveProfile} onBack={() => setSub("settings")} toast={toast} />;
  } else if (sub === "blocked") {
    subContent = <ListManagePage title="Blocked accounts" items={s.moderation.blocked} emptyText="You haven't blocked anyone." actionLabel="Unblock" avatars={avatars} onAction={(u) => toggleIn("blocked", u)} onBack={() => setSub("settings")} />;
  } else if (sub === "muted") {
    subContent = <ListManagePage title="Muted accounts" items={s.moderation.muted} emptyText="You haven't muted anyone." actionLabel="Unmute" avatars={avatars} onAction={(u) => toggleIn("muted", u)} onBack={() => setSub("settings")} />;
  } else if (sub === "reports") {
    subContent = <ReportsPage reports={s.moderation.reports} onBack={() => setSub("settings")} />;
  } else if (sub === "notifications") {
    subContent = <NotificationsPage notifications={s.notifications} avatars={avatars} onBack={() => setSub("settings")}
      onRead={() => s.saveNotifications(s.notifications.map((n) => ({ ...n, read: true })))} />;
  } else if (legalMap[sub]) {
    const [t, b] = legalMap[sub];
    subContent = <LegalPage title={t} body={b} onBack={() => setSub("settings")} />;
  }

  return (
    <div className={`yp-root ${reduceMotion ? "no-motion" : ""}`}>
      <style>{CSS}</style>

      {subContent ? subContent : (
        <div className="yp-stage" key={tab}>
          {tab === "home" && (
            <>
              <div className="yp-feedhead">
                <span className="yp-feedlogo"><Megaphone size={17} /> YAP</span>
                <button className="yp-bubble yp-postbtn" onClick={() => setShowPost(true)} aria-label="Post"><Plus size={18} /></button>
              </div>
              <div className="yp-feed">
                {feed.length === 0 && <p className="yp-empty" style={{ paddingTop: 60 }}>Your feed is empty — you've hidden or muted everything. Adjust that in Settings.</p>}
                {feed.map((v) => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    state={s.videoState[v.id] || {}}
                    isFollowing={s.following.includes(v.author)}
                    verified={VERIFIED_PEOPLE.includes(v.author) || (v.author === profile.username && profile.verification?.status === "approved")}
                    avatarSrc={v.author === profile.username ? profile.avatar : avatars[v.author]}
                    commentCount={(s.comments[v.id] || []).length}
                    onYap={onYap} onReyap={onReyap} onFollow={onFollow}
                    onSend={setSendFor} onComment={setCommentFor} onMore={setMoreFor}
                    muted={muted} onToggleMute={() => setMuted((m) => !m)}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </div>
            </>
          )}

          {tab === "search" && <SearchPage videos={feed} videoState={s.videoState} following={s.following} onFollow={onFollow} avatars={avatars} />}

          {tab === "dm" && (
            openThread ? (
              <DmThread who={openThread} messages={s.dms[openThread] || []} avatars={avatars}
                blocked={s.moderation.blocked.includes(openThread)}
                onBlock={(u) => { toggleIn("blocked", u); toast(s.moderation.blocked.includes(u) ? "Unblocked" : "Blocked"); }}
                onSend={(t) => onSendText(openThread, t)} onClose={() => setOpenThread(null)} />
            ) : (
              <DmList dms={s.dms} moderation={s.moderation} avatars={avatars} onOpen={setOpenThread} />
            )
          )}

          {tab === "profile" && (
            <ProfilePage profile={profile} videos={SEED_VIDEOS} videoState={s.videoState} myVideos={s.myVideos}
              following={s.following} onEdit={() => setShowEdit(true)} onSettings={() => setSub("settings")} />
          )}
        </div>
      )}

      {!subContent && (
        <nav className="yp-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`yp-navbtn ${tab === n.id ? "is-on" : ""}`} onClick={() => { setOpenThread(null); setTab(n.id); }}>
              <span className="yp-navbubble"><n.icon size={21} /></span>
              <span className="yp-navlabel">{n.label}</span>
            </button>
          ))}
        </nav>
      )}

      {sendFor && <SendSheet video={sendFor} avatars={avatars} onClose={() => setSendFor(null)} onSendTo={onSendTo} />}
      {commentFor && <CommentSheet video={commentFor} comments={s.comments[commentFor.id] || []} profile={profile} avatars={avatars} onAdd={addComment} onClose={() => setCommentFor(null)} />}
      {moreFor && !reportFor && (
        <MoreSheet video={moreFor} moderation={s.moderation} toast={toast} onClose={() => setMoreFor(null)}
          onReport={(v) => setReportFor(v)} onBlock={(u) => toggleIn("blocked", u)} onMute={(u) => toggleIn("muted", u)} onHide={(id) => toggleIn("hidden", id)} />
      )}
      {reportFor && <ReportSheet target={reportFor} onClose={() => { setReportFor(null); setMoreFor(null); }} onSubmit={submitReport} />}
      {showPost && <PostSheet profile={profile} onClose={() => setShowPost(false)} onPost={postVideo} />}
      {showEdit && <EditProfile profile={profile} toast={toast} onSave={s.saveProfile} onClose={() => setShowEdit(false)} />}

      <Toast message={toastMsg} />
    </div>
  );
}

/* ---------------------------- styles ---------------------------- */

const CSS = `
:root {
  --bg: #000000;
  --panel: #0D0D0D;
  --grey: #1C1C1C;
  --grey-2: #2B2B2B;
  --line: rgba(255,255,255,0.10);
  --text: #F2F2F2;
  --dim: #8A8A8A;
  --danger: #E06A5C;
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
* { box-sizing: border-box; }
.yp-root {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background: var(--bg); color: var(--text);
  height: 100%; width: 100%; max-width: 480px; margin: 0 auto;
  position: relative; overflow: hidden; -webkit-tap-highlight-color: transparent;
}
.yp-root.no-motion *, .yp-root.no-motion *::before { animation: none !important; transition: none !important; }
.yp-loading { display:flex; align-items:center; justify-content:center; height: 70vh; color: var(--dim); }

.yp-avwrap { position: relative; flex-shrink: 0; }
.yp-avatar { border-radius: 50%; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk',sans-serif; font-weight:600; color:#EDEDED; object-fit: cover; }
.yp-avatar-img { display: block; }
.yp-verifydot { position: absolute; bottom: -2px; right: -2px; }

.yp-stage { animation: stageIn 0.32s var(--ease); height: 100%; }
@keyframes stageIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* feed */
.yp-feedhead { position: absolute; top: 0; left: 0; right: 0; z-index: 12; display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; pointer-events: none; }
.yp-feedlogo { display: flex; align-items: center; gap: 6px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; text-shadow: 0 1px 6px rgba(0,0,0,0.8); }
.yp-postbtn { width: 36px; height: 36px; pointer-events: auto; }
.yp-feed { height: calc(100vh - 62px); max-height: 780px; overflow-y: scroll; scroll-snap-type: y mandatory; scroll-behavior: smooth; overscroll-behavior-y: contain; scrollbar-width: none; padding: 6px; }
.yp-feed::-webkit-scrollbar { display: none; }
.yp-slide { position: relative; height: calc(100vh - 74px); max-height: 768px; scroll-snap-align: center; scroll-snap-stop: always; margin-bottom: 6px; }
.yp-videowrap { position: absolute; inset: 0; border-radius: 26px; overflow: hidden; background: #000; }
.yp-videowrap video { width: 100%; height: 100%; object-fit: cover; display: block; }
.yp-scrim { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 38%), linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 18%); }
.yp-bigyap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; animation: bigYap 0.7s var(--spring) forwards; }
@keyframes bigYap { 0%{opacity:0;transform:scale(0.4) rotate(-12deg)} 35%{opacity:0.95;transform:scale(1.06) rotate(4deg)} 70%{opacity:0.9;transform:scale(1)} 100%{opacity:0;transform:scale(1.18)} }
.yp-playoverlay { position: absolute; inset: 0; margin: auto; width: 70px; height: 70px; background: rgba(0,0,0,0.42); backdrop-filter: blur(3px); border: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; animation: popIn 0.3s var(--spring); }
@keyframes popIn { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
.yp-bubble { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.14); backdrop-filter: blur(8px); border: none; border-radius: 50%; color: #fff; cursor: pointer; transition: transform 0.28s var(--spring), background 0.22s var(--ease); }
.yp-bubble:active { transform: scale(0.86); }
.yp-mute { position: absolute; top: 60px; right: 18px; width: 36px; height: 36px; }
.yp-more { position: absolute; top: 104px; right: 18px; width: 36px; height: 36px; }

.yp-rail { position: absolute; right: 14px; bottom: 104px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.yp-rail-avatar { position: relative; margin-bottom: 6px; animation: popIn 0.4s var(--spring); }
.yp-followdot { position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%); width: 21px; height: 21px; border-radius: 50%; border: 2.5px solid #000; background: #EDEDED; color: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.3s var(--spring), background 0.22s var(--ease); }
.yp-followdot:active { transform: translateX(-50%) scale(0.82); }
.yp-followdot.is-on { background: var(--grey-2); color: var(--text); animation: dotFlip 0.42s var(--spring); }
@keyframes dotFlip { 0%{transform:translateX(-50%) rotate(0) scale(1)} 50%{transform:translateX(-50%) rotate(180deg) scale(1.3)} 100%{transform:translateX(-50%) rotate(360deg) scale(1)} }
.yp-railbtn { background: none; border: none; color: #fff; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; font-family: inherit; padding: 0; }
.yp-railbubble { width: 46px; height: 46px; }
.yp-railbubble.is-on { background: #EDEDED; color: #0A0A0A; }
.yp-count { font-size: 11.5px; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,0.7); display: inline-block; }
.yp-count-up { animation: countUp 0.3s var(--spring); }
.yp-count-down { animation: countDown 0.3s var(--spring); }
@keyframes countUp { 0%{transform:translateY(6px);opacity:0.3} 100%{transform:none;opacity:1} }
@keyframes countDown { 0%{transform:translateY(-6px);opacity:0.3} 100%{transform:none;opacity:1} }
.yp-pop { animation: railPop 0.42s var(--spring); }
@keyframes railPop { 0%{transform:scale(1)} 40%{transform:scale(1.28)} 100%{transform:scale(1)} }
.yp-spin { animation: railSpin 0.45s var(--ease); }
@keyframes railSpin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
.yp-nudge { animation: railNudge 0.42s var(--spring); }
@keyframes railNudge { 0%{transform:translateX(0)} 40%{transform:translateX(6px) scale(1.12)} 100%{transform:translateX(0)} }

.yp-caption { position: absolute; left: 20px; right: 82px; bottom: 28px; text-shadow: 0 1px 6px rgba(0,0,0,0.85); animation: capIn 0.4s var(--ease); }
@keyframes capIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
.yp-caption-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.yp-handle { font-weight: 700; font-size: 14.5px; }
.yp-caption p { margin: 0; font-size: 13.5px; line-height: 1.45; }
.yp-followbtn { background: rgba(255,255,255,0.16); backdrop-filter: blur(6px); border: none; color: #fff; font-family: inherit; font-weight: 700; font-size: 11.5px; padding: 6px 14px; border-radius: 999px; cursor: pointer; transition: transform 0.28s var(--spring), background 0.22s var(--ease); }
.yp-followbtn:active { transform: scale(0.9); }
.yp-followbtn-solid { background: #EDEDED; color: #0A0A0A; }
.yp-followbtn-solid.is-on { background: var(--grey-2); color: var(--text); }

/* pages */
.yp-page { height: calc(100vh - 62px); max-height: 780px; overflow-y: auto; scroll-behavior: smooth; padding-bottom: 22px; }
.yp-pagehead { position: sticky; top: 0; z-index: 6; background: rgba(0,0,0,0.9); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); padding: 15px 18px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; }
.yp-pagehead-row { display: flex; align-items: center; gap: 10px; }
.yp-subbody { padding-bottom: 40px; }
.yp-empty { color: var(--dim); font-size: 13.5px; padding: 20px 18px; line-height: 1.5; text-align: center; }
.yp-sub { color: var(--dim); font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 18px 18px 8px; }
.yp-note { color: var(--dim); font-size: 12px; line-height: 1.55; padding: 10px 18px; }
.yp-risein { animation: riseIn 0.4s var(--ease) both; }
@keyframes riseIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }

.yp-searchbar { display: flex; align-items: center; gap: 10px; margin: 14px 14px 0; background: var(--grey); border-radius: 999px; padding: 11px 16px; color: var(--dim); transition: background 0.22s var(--ease); }
.yp-searchbar:focus-within { background: var(--grey-2); }
.yp-searchbar input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-family: inherit; font-size: 14px; }

.yp-threads { display: flex; flex-direction: column; gap: 6px; padding: 6px 10px; }
.yp-thread { display: flex; align-items: center; gap: 13px; padding: 11px 13px; background: var(--panel); border: none; border-radius: 20px; cursor: pointer; text-align: left; font-family: inherit; color: var(--text); width: 100%; transition: transform 0.26s var(--spring), background 0.22s var(--ease); }
.yp-thread:hover { background: var(--grey); }
.yp-thread:active { transform: scale(0.975); }
.yp-thread-info { flex: 1; min-width: 0; }
.yp-thread-name { font-weight: 700; font-size: 14px; }
.yp-thread-last { color: var(--dim); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.yp-thread-time { color: var(--dim); font-size: 11.5px; }

.yp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding: 6px 10px; }
.yp-tile { position: relative; aspect-ratio: 9/14; background: var(--panel); overflow: hidden; border-radius: 16px; transition: transform 0.26s var(--spring); }
.yp-tile:active { transform: scale(0.96); }
.yp-tile video { width: 100%; height: 100%; object-fit: cover; }
.yp-tile-count { position: absolute; bottom: 7px; left: 8px; display: flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,0.85); }

/* dm */
.yp-msgs { display: flex; flex-direction: column; gap: 8px; padding: 16px; }
.yp-msgrow { display: flex; }
.yp-msgrow.is-mine { justify-content: flex-end; }
.yp-msgin { animation: msgIn 0.34s var(--spring) both; }
@keyframes msgIn { from{opacity:0;transform:translateY(10px) scale(0.94)} to{opacity:1;transform:none} }
.yp-msg { max-width: 76%; background: var(--grey); padding: 11px 15px; border-radius: 20px; font-size: 13.5px; line-height: 1.45; }
.yp-msgrow.is-mine .yp-msg { background: #EDEDED; color: #0A0A0A; }
.yp-msgvideo { width: 152px; border-radius: 18px; overflow: hidden; background: var(--panel); }
.yp-msgvideo video { width: 100%; aspect-ratio: 9/14; object-fit: cover; display: block; }
.yp-msgvideo span { display: block; padding: 8px 11px; font-size: 11.5px; color: var(--dim); }
.yp-composer { position: sticky; bottom: 0; display: flex; align-items: center; gap: 9px; padding: 11px 14px; background: var(--bg); }
.yp-composer input { flex: 1; background: var(--grey); border: none; border-radius: 999px; padding: 12px 17px; color: var(--text); font-family: inherit; font-size: 13.5px; outline: none; transition: background 0.22s var(--ease); }
.yp-composer input:focus { background: var(--grey-2); }
.yp-sendcircle { width: 38px; height: 38px; border-radius: 50%; border: none; background: #EDEDED; color: #0A0A0A; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform 0.28s var(--spring), opacity 0.2s var(--ease); }
.yp-sendcircle:active { transform: scale(0.85); }
.yp-sendcircle:disabled { opacity: 0.28; cursor: not-allowed; }
.yp-iconbtn { background: none; border: none; color: var(--text); cursor: pointer; padding: 7px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: transform 0.26s var(--spring), background 0.2s var(--ease); }
.yp-iconbtn:hover { background: var(--grey); }
.yp-iconbtn:active { transform: scale(0.86); }
.yp-blockedbar { text-align: center; color: var(--dim); font-size: 12.5px; padding: 16px; border-top: 1px solid var(--line); }

/* profile */
.yp-profbanner { position: relative; height: 132px; background: var(--panel); }
.yp-profbanner img { width: 100%; height: 100%; object-fit: cover; display: block; }
.yp-profbanner-blank { width: 100%; height: 100%; background: linear-gradient(160deg, #191919, #0B0B0B); }
.yp-profsettings { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; }
.yp-prof { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 0 18px 16px; margin-top: -42px; animation: riseIn 0.42s var(--ease); }
.yp-prof-name { display: flex; align-items: center; gap: 6px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 19px; margin-top: 6px; }
.yp-prof-handle { color: var(--dim); font-size: 13px; }
.yp-prof-bio { font-size: 13.5px; line-height: 1.5; text-align: center; margin: 4px 0 0; }
.yp-prof-link { font-size: 13px; color: var(--dim); text-decoration: underline; }
.yp-prof-stats { display: flex; gap: 22px; color: var(--dim); font-size: 13px; margin-top: 6px; }
.yp-prof-stats b { color: var(--text); }
.yp-prof-actions { display: flex; align-items: center; gap: 9px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }
.yp-ghostbtn { display: flex; align-items: center; gap: 6px; background: var(--grey); border: none; color: var(--text); font-family: inherit; font-weight: 700; font-size: 12.5px; padding: 10px 16px; border-radius: 999px; cursor: pointer; transition: transform 0.26s var(--spring); }
.yp-ghostbtn:active { transform: scale(0.94); }
.yp-badge { background: var(--grey-2); color: var(--dim); font-size: 11.5px; font-weight: 700; padding: 7px 13px; border-radius: 999px; }

.yp-tabs { display: flex; gap: 8px; padding: 4px 12px 10px; }
.yp-tab { flex: 1; background: var(--panel); border: none; border-radius: 999px; color: var(--dim); font-family: inherit; font-weight: 700; font-size: 12.5px; padding: 11px 0; cursor: pointer; transition: transform 0.26s var(--spring), background 0.22s var(--ease), color 0.22s var(--ease); }
.yp-tab:active { transform: scale(0.95); }
.yp-tab.is-on { background: #EDEDED; color: #0A0A0A; }

/* settings rows */
.yp-sectionhead { color: var(--dim); font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 22px 18px 8px; }
.yp-row { display: flex; align-items: center; gap: 13px; width: 100%; background: var(--panel); border: none; border-radius: 18px; margin: 0 0 5px; padding: 14px 15px; color: var(--text); font-family: inherit; text-align: left; cursor: pointer; transition: transform 0.24s var(--spring), background 0.2s var(--ease); }
.yp-row:disabled { cursor: default; }
.yp-row:not(:disabled):hover { background: var(--grey); }
.yp-row:not(:disabled):active { transform: scale(0.98); }
.yp-subbody .yp-row { width: calc(100% - 24px); margin-left: 12px; margin-right: 12px; }
.yp-row-icon { color: var(--dim); flex-shrink: 0; }
.yp-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.yp-row-label { font-size: 14px; font-weight: 600; }
.yp-row-sub { font-size: 12px; color: var(--dim); }
.yp-row-chev { color: var(--dim); flex-shrink: 0; }
.yp-row.is-danger .yp-row-label, .yp-row.is-danger .yp-row-icon { color: var(--danger); }

.yp-toggle { width: 46px; height: 27px; border-radius: 999px; background: var(--grey-2); border: none; cursor: pointer; padding: 3px; display: flex; transition: background 0.24s var(--ease); flex-shrink: 0; }
.yp-toggle.is-on { background: #EDEDED; }
.yp-toggle-knob { width: 21px; height: 21px; border-radius: 50%; background: #6E6E6E; transition: transform 0.3s var(--spring), background 0.24s var(--ease); }
.yp-toggle.is-on .yp-toggle-knob { transform: translateX(19px); background: #0A0A0A; }

.yp-inlinechoice { margin: 0 12px 5px; background: var(--panel); border-radius: 18px; padding: 14px 15px; }
.yp-segment { display: flex; gap: 6px; margin-top: 10px; }
.yp-segment button { flex: 1; background: var(--grey); border: none; border-radius: 999px; color: var(--dim); font-family: inherit; font-weight: 600; font-size: 12.5px; padding: 9px 0; cursor: pointer; transition: background 0.2s var(--ease), color 0.2s var(--ease); }
.yp-segment button.is-on { background: #EDEDED; color: #0A0A0A; }

/* forms */
.yp-label { display: block; color: var(--dim); font-size: 12px; font-weight: 700; padding: 14px 18px 6px; }
.yp-input, .yp-textarea { width: calc(100% - 36px); margin: 0 18px; background: var(--grey); border: none; border-radius: 16px; padding: 13px 16px; color: var(--text); font-family: inherit; font-size: 14px; outline: none; resize: none; transition: background 0.2s var(--ease); }
.yp-input:focus, .yp-textarea:focus { background: var(--grey-2); }
.yp-counter { text-align: right; padding: 5px 20px 0; font-size: 11px; color: var(--dim); }
.yp-field { display: flex; align-items: center; gap: 5px; width: calc(100% - 36px); margin: 0 18px; background: var(--grey); border-radius: 16px; padding: 13px 16px; color: var(--dim); transition: background 0.2s var(--ease); }
.yp-field:focus-within { background: var(--grey-2); }
.yp-field input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-family: inherit; font-size: 14.5px; }
.yp-primary { width: calc(100% - 36px); margin: 18px; background: #EDEDED; color: #0A0A0A; border: none; font-family: inherit; font-weight: 700; font-size: 14.5px; padding: 15px; border-radius: 999px; cursor: pointer; transition: transform 0.28s var(--spring), opacity 0.2s var(--ease); }
.yp-primary:active { transform: scale(0.97); }
.yp-primary:disabled { opacity: 0.3; cursor: not-allowed; }
.yp-primary-sm { width: auto; margin: 0; padding: 10px 22px; font-size: 12.5px; }
.yp-ghost { background: none; border: none; color: var(--dim); font-family: inherit; font-weight: 600; font-size: 13px; cursor: pointer; padding: 8px 12px; }
.yp-ghost-danger { color: var(--danger); }
.yp-chips { display: flex; flex-wrap: wrap; gap: 7px; padding: 4px 18px; }
.yp-chip { background: var(--grey); border: none; border-radius: 999px; color: var(--dim); font-family: inherit; font-weight: 600; font-size: 12.5px; padding: 9px 15px; cursor: pointer; transition: transform 0.24s var(--spring), background 0.2s var(--ease), color 0.2s var(--ease); }
.yp-chip:active { transform: scale(0.93); }
.yp-chip.is-on { background: #EDEDED; color: #0A0A0A; }
.yp-choice { display: flex; align-items: center; justify-content: space-between; width: calc(100% - 36px); margin: 0 18px 6px; background: var(--grey); border: none; border-radius: 16px; padding: 13px 16px; color: var(--text); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; text-align: left; transition: background 0.2s var(--ease); }
.yp-choice.is-on { background: #EDEDED; color: #0A0A0A; }

/* pickers */
.yp-picker { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: calc(100% - 36px); margin: 12px 18px; background: var(--grey); border: 1.5px dashed var(--grey-2); border-radius: 20px; padding: 32px 16px; color: var(--dim); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background 0.2s var(--ease); }
.yp-picker small { font-size: 11.5px; font-weight: 400; }
.yp-picker:hover { background: var(--grey-2); }
.yp-picker-sm { flex-direction: row; padding: 15px; gap: 8px; }
.yp-picker-sm.is-done { color: var(--text); border-style: solid; }
.yp-postpreview { position: relative; width: calc(100% - 36px); margin: 12px 18px; border-radius: 20px; overflow: hidden; background: #000; }
.yp-postpreview video { width: 100%; aspect-ratio: 9/14; object-fit: cover; display: block; }
.yp-postremove { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; }

.yp-editbanner { position: relative; height: 112px; margin: 6px 18px 0; border-radius: 20px; overflow: hidden; background: var(--grey); cursor: pointer; }
.yp-editbanner img { width: 100%; height: 100%; object-fit: cover; }
.yp-editbanner-empty { display: flex; align-items: center; justify-content: center; gap: 8px; height: 100%; color: var(--dim); font-size: 13px; font-weight: 600; }
.yp-editbanner-tag { position: absolute; bottom: 10px; right: 10px; display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); font-size: 11px; font-weight: 700; padding: 6px 11px; border-radius: 999px; }
.yp-editavatar { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: -34px; }
.yp-avbtn { position: relative; background: none; border: none; cursor: pointer; padding: 0; border-radius: 50%; transition: transform 0.26s var(--spring); }
.yp-avbtn:active { transform: scale(0.94); }
.yp-avbtn-lg { margin: 8px 0; }
.yp-avbtn-badge { position: absolute; bottom: 2px; right: 2px; width: 26px; height: 26px; border-radius: 50%; background: #EDEDED; color: #0A0A0A; display: flex; align-items: center; justify-content: center; border: 3px solid #000; }

/* verification */
.yp-verifybanner { display: flex; align-items: center; gap: 13px; margin: 14px 18px 4px; background: var(--panel); border-radius: 20px; padding: 17px; }
.yp-verifybanner div { display: flex; flex-direction: column; gap: 3px; }
.yp-verifybanner strong { font-size: 14.5px; }
.yp-verifybanner span { font-size: 12.5px; color: var(--dim); line-height: 1.4; }
.yp-statuscard { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 9px; margin: 22px 18px; background: var(--panel); border-radius: 24px; padding: 34px 22px; }
.yp-statuscard h3 { font-family: 'Space Grotesk', sans-serif; margin: 4px 0 0; font-size: 17px; }
.yp-statuscard p { color: var(--dim); font-size: 13px; line-height: 1.55; margin: 0 0 6px; }

/* reports & notifications */
.yp-reportcard { margin: 0 12px 6px; background: var(--panel); border-radius: 18px; padding: 14px 15px; display: flex; flex-direction: column; gap: 5px; }
.yp-reportcard-top { display: flex; align-items: center; justify-content: space-between; }
.yp-reportdetail { font-size: 12.5px; color: var(--dim); margin: 2px 0 0; line-height: 1.45; }
.yp-notif { display: flex; align-items: center; gap: 12px; margin: 0 12px 5px; background: var(--panel); border-radius: 18px; padding: 13px 15px; }
.yp-notif-icon { width: 34px; height: 34px; border-radius: 50%; background: var(--grey-2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

/* legal */
.yp-legal { white-space: pre-wrap; font-family: inherit; font-size: 12.5px; line-height: 1.7; color: #CFCFCF; padding: 16px 18px; margin: 0; }

/* comments */
.yp-comments { max-height: 46vh; overflow-y: auto; padding: 4px 0; }
.yp-comment { display: flex; gap: 11px; padding: 9px 18px; }
.yp-comment-head { font-size: 12.5px; font-weight: 700; }
.yp-comment-text { font-size: 13.5px; line-height: 1.45; margin-top: 2px; }

/* sheets */
.yp-sheet-back { position: absolute; inset: 0; background: rgba(0,0,0,0.62); z-index: 40; display: flex; align-items: flex-end; animation: fadeIn 0.22s var(--ease); }
.yp-sheet-back.is-closing { animation: fadeOut 0.2s var(--ease) forwards; }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes fadeOut { to{opacity:0} }
.yp-sheet { width: 100%; background: var(--panel); border-radius: 28px 28px 0 0; padding: 10px 0 20px; max-height: 76%; display: flex; flex-direction: column; animation: sheetUp 0.36s var(--spring); }
.yp-sheet.is-tall { height: 86%; max-height: 86%; }
.yp-sheet.is-closing { animation: sheetDown 0.22s var(--ease) forwards; }
@keyframes sheetUp { from{transform:translateY(100%)} to{transform:none} }
@keyframes sheetDown { to{transform:translateY(100%)} }
.yp-sheet-grip { width: 40px; height: 4px; border-radius: 2px; background: var(--grey-2); margin: 5px auto 12px; }
.yp-sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 0 16px 10px; }
.yp-sheet-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14.5px; }
.yp-sheet-body { overflow-y: auto; flex: 1; }
.yp-sheet-row { display: flex; align-items: center; gap: 13px; padding: 9px 18px; animation: riseIn 0.34s var(--ease) both; }
.yp-sheet-name { flex: 1; font-size: 13.5px; font-weight: 600; }
.yp-sendbtn { display: flex; align-items: center; gap: 5px; background: #EDEDED; color: #0A0A0A; border: none; font-family: inherit; font-weight: 700; font-size: 12px; padding: 8px 17px; border-radius: 999px; cursor: pointer; transition: transform 0.28s var(--spring), background 0.22s var(--ease); }
.yp-sendbtn:active { transform: scale(0.9); }
.yp-sendbtn.is-done { background: var(--grey-2); color: var(--dim); animation: railPop 0.4s var(--spring); }
.yp-sheet-body .yp-row { width: calc(100% - 24px); margin-left: 12px; margin-right: 12px; }

/* onboarding */
.yp-onboard { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 13px; padding: 0 22px; animation: riseIn 0.45s var(--ease); position: relative; }
.yp-logo { display: flex; align-items: center; gap: 9px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 27px; margin-bottom: 4px; }
.yp-onboard-sub { color: var(--dim); font-size: 13.5px; margin: 0; }
.yp-onboard .yp-input, .yp-onboard .yp-field, .yp-onboard .yp-primary { width: 100%; margin-left: 0; margin-right: 0; }
.yp-onboard .yp-primary { margin: 8px 0 0; }
.yp-agreecard { background: var(--panel); border-radius: 20px; padding: 17px; width: 100%; }
.yp-agree { display: flex; gap: 11px; align-items: flex-start; font-size: 12.5px; line-height: 1.6; color: var(--dim); }
.yp-check { width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid var(--grey-2); background: transparent; color: #0A0A0A; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: background 0.2s var(--ease), transform 0.24s var(--spring); }
.yp-check.is-on { background: #EDEDED; border-color: #EDEDED; }
.yp-check:active { transform: scale(0.88); }
.yp-inlinelink { background: none; border: none; color: var(--text); font-family: inherit; font-size: 12.5px; text-decoration: underline; padding: 0; cursor: pointer; }
.yp-dots { position: absolute; bottom: 26px; display: flex; gap: 6px; }
.yp-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--grey-2); transition: background 0.2s var(--ease); }
.yp-dots span.is-on { background: #EDEDED; }

/* toast */
.yp-toast { position: absolute; bottom: 78px; left: 50%; transform: translateX(-50%); background: #EDEDED; color: #0A0A0A; font-size: 12.5px; font-weight: 700; padding: 10px 18px; border-radius: 999px; z-index: 60; animation: toastIn 0.3s var(--spring); white-space: nowrap; }
@keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

/* nav */
.yp-nav { position: absolute; bottom: 0; left: 0; right: 0; height: 62px; display: flex; background: rgba(0,0,0,0.94); backdrop-filter: blur(14px); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom, 0px); z-index: 30; }
.yp-navbtn { flex: 1; background: none; border: none; color: var(--dim); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-family: inherit; }
.yp-navbubble { display: flex; align-items: center; justify-content: center; width: 42px; height: 30px; border-radius: 999px; background: transparent; transition: background 0.26s var(--ease), transform 0.3s var(--spring); }
.yp-navbtn:active .yp-navbubble { transform: scale(0.86); }
.yp-navbtn.is-on { color: var(--text); }
.yp-navbtn.is-on .yp-navbubble { background: var(--grey-2); animation: navPop 0.38s var(--spring); }
@keyframes navPop { 0%{transform:scale(0.8)} 55%{transform:scale(1.12)} 100%{transform:scale(1)} }
.yp-navlabel { font-size: 9.5px; font-weight: 600; }
`;
