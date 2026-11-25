import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, INDIAN_LANGUAGES, VIDEO_CATEGORIES } from './domain.ts';
import { DATA_DIR, ensureMediaDirs } from './media.ts';

ensureMediaDirs();

const DB_PATH = path.join(DATA_DIR, 'doptube.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'creator',
    preferred_language TEXT NOT NULL DEFAULT 'Hindi',
    restricted_mode INTEGER NOT NULL DEFAULT 0,
    history_paused INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    banner_color TEXT NOT NULL DEFAULT '#1f1f23',
    verified INTEGER NOT NULL DEFAULT 0,
    subscriber_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS languages (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    language TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    thumbnail_url TEXT NOT NULL,
    video_url TEXT NOT NULL,
    hls_url TEXT,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'public',
    status TEXT NOT NULL DEFAULT 'published',
    source_type TEXT NOT NULL DEFAULT 'native',
    external_ref TEXT,
    is_short INTEGER NOT NULL DEFAULT 0,
    is_live INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    dislikes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
  CREATE INDEX IF NOT EXISTS idx_videos_language ON videos(language);
  CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

  CREATE TABLE IF NOT EXISTS video_variants (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    quality TEXT NOT NULL,
    resolution TEXT NOT NULL,
    bitrate_kbps INTEGER NOT NULL,
    playlist_path TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comment_replies (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_reactions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL CHECK(reaction IN ('like', 'dislike')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    notify_all INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_videos (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (playlist_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS watch_later (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    progress_sec INTEGER NOT NULL DEFAULT 0,
    watched_at TEXT NOT NULL,
    PRIMARY KEY (user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    preview_thumb TEXT NOT NULL DEFAULT '',
    searched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_video_id TEXT,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('video', 'comment')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS copyright_claims (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    claimant_name TEXT NOT NULL,
    claimant_email TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
`);

export function seedDatabaseIfEmpty() {
  for (const cat of VIDEO_CATEGORIES) {
    db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(cat);
  }
  for (const lang of INDIAN_LANGUAGES) {
    db.prepare('INSERT OR IGNORE INTO languages (name) VALUES (?)').run(lang);
  }

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const now = new Date('2026-11-25T07:00:00Z');
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

  const demoPasswordHash = hashPassword('doptube123');
  const adminPasswordHash = hashPassword('admin123');

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, avatar_url, role, preferred_language, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChannel = db.prepare(`
    INSERT INTO channels (id, user_id, name, handle, description, avatar_url, banner_color, verified, subscriber_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedCreators = [
    {
      userId: 'u_demo',
      name: 'Aditya Choudhary',
      email: 'demo@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Hindi',
      channelId: 'ch_aditya',
      channelName: 'Aditya Learning Lab',
      handle: '@AdityaJeeAir1',
      desc: 'JEE Advanced preparation, Physics notes, and student tech setups from Kota & Delhi.',
      verified: 1,
      subs: 148000,
      banner: '#1c1917',
    },
    {
      userId: 'u_admin',
      name: 'Meera Nair',
      email: 'admin@doptube.in',
      passwordHash: adminPasswordHash,
      role: 'admin',
      lang: 'Malayalam',
      channelId: 'ch_doptube_hq',
      channelName: 'DopTube Creators India',
      handle: '@DopTubeIndia',
      desc: 'Official creator spotlight, platform updates, and Indian language storytelling.',
      verified: 1,
      subs: 2450000,
      banner: '#18181b',
    },
    {
      userId: 'u_physics',
      name: 'Dr. Arvind Verma',
      email: 'physics@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Hindi',
      channelId: 'ch_physics',
      channelName: 'Physics Pathshala',
      handle: '@PhysicsPathshala',
      desc: 'Crystal-clear JEE Advanced, NEET & Board Exam Physics lectures in Hindi and English.',
      verified: 1,
      subs: 3820000,
      banner: '#0f172a',
    },
    {
      userId: 'u_music',
      name: 'Rohan Kulkarni',
      email: 'music@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Hindi',
      channelId: 'ch_music',
      channelName: 'Rhythm Mumbai',
      handle: '@RhythmMumbai',
      desc: 'Acoustic indie sessions, classical fusion, and late-night unplugged mixes from Mumbai.',
      verified: 1,
      subs: 940000,
      banner: '#271a14',
    },
    {
      userId: 'u_food',
      name: 'Kavita Deshmukh',
      email: 'rasoi@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Marathi',
      channelId: 'ch_rasoi',
      channelName: 'Indie Rasoi',
      handle: '@IndieRasoi',
      desc: 'Authentic regional Indian street food, home recipes, and spice journeys across Bharat.',
      verified: 1,
      subs: 1620000,
      banner: '#291711',
    },
    {
      userId: 'u_tech',
      name: 'Siddharth Rao',
      email: 'tech@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'English',
      channelId: 'ch_tech',
      channelName: 'TechVarta India',
      handle: '@TechVartaIN',
      desc: 'Honest smartphone reviews, Bengaluru developer desks, and open-source engineering.',
      verified: 1,
      subs: 2140000,
      banner: '#111827',
    },
    {
      userId: 'u_travel',
      name: 'Vikram Singh',
      email: 'trails@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Punjabi',
      channelId: 'ch_trails',
      channelName: 'Ladakh Trails',
      handle: '@LadakhTrails',
      desc: 'Motorcycle expeditions through Spiti, Leh-Ladakh, and Northeast India.',
      verified: 1,
      subs: 780000,
      banner: '#172554',
    },
    {
      userId: 'u_cricket',
      name: 'Harsha Menon',
      email: 'cricket@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Tamil',
      channelId: 'ch_cricket',
      channelName: 'Cricket Pulse IN',
      handle: '@CricketPulseIN',
      desc: 'Live match tactical breakdowns, domestic Ranji spotlights, and stadium atmosphere.',
      verified: 1,
      subs: 1950000,
      banner: '#052e16',
    },
    {
      userId: 'u_dance',
      name: 'Ananya Chatterjee',
      email: 'nritya@doptube.in',
      passwordHash: demoPasswordHash,
      role: 'creator',
      lang: 'Bengali',
      channelId: 'ch_nritya',
      channelName: 'Nritya Kala Studio',
      handle: '@NrityaKala',
      desc: 'Classical Kathak, Bharatanatyam, and contemporary Indian stage choreography.',
      verified: 1,
      subs: 615000,
      banner: '#3b0764',
    },
  ];

  for (const c of seedCreators) {
    const avatarUrl = `/api/avatars/${c.channelId}.svg`;
    insertUser.run(c.userId, c.name, c.email, c.passwordHash, avatarUrl, c.role, c.lang, ago(720));
    insertChannel.run(c.channelId, c.userId, c.channelName, c.handle, c.desc, avatarUrl, c.banner, c.verified, c.subs, ago(720));
  }

  const insertVideo = db.prepare(`
    INSERT INTO videos (
      id, channel_id, title, description, category, language, tags_json,
      thumbnail_url, video_url, hls_url, duration_sec, visibility, status,
      source_type, is_short, is_live, views, likes, dislikes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 'published', 'native', ?, ?, ?, ?, ?, ?)
  `);

  const seedVideos = [
    {
      id: 'vid_physics_em',
      channelId: 'ch_physics',
      title: 'Maxwell Equations & Electromagnetic Waves in One Shot | JEE Advanced Physics',
      description: 'Complete visual derivation of Maxwell’s four equations, displacement current, and wave propagation speed in vacuum and dielectrics. Includes PYQs from 2019-2025.',
      category: 'Education',
      language: 'Hindi',
      tags: ['Physics', 'JEE Advanced', 'Board examinations', 'Electromagnetism'],
      thumb: '/src/assets/images/thumb_jee_physics_1795622008621.jpg',
      duration: 2286,
      isShort: 0,
      isLive: 0,
      views: 1420000,
      likes: 86400,
      hoursAgo: 14,
    },
    {
      id: 'vid_indie_rooftop',
      channelId: 'ch_music',
      title: 'Shaam E Mumbai — Acoustic Guitar & Vocal Session (Unplugged Live Studio)',
      description: 'Recorded live in our Bandra analog room with a single condenser mic and vintage acoustic guitar. Listen with headphones for full studio warmth.',
      category: 'Music',
      language: 'Hindi',
      tags: ['Music', 'Indie', 'Acoustic', 'Mixes'],
      thumb: '/src/assets/images/thumb_indie_music_1795622010003.jpg',
      duration: 342,
      isShort: 0,
      isLive: 0,
      views: 845000,
      likes: 52300,
      hoursAgo: 22,
    },
    {
      id: 'vid_cricket_tactics',
      channelId: 'ch_cricket',
      title: 'LIVE: India vs Australia Test Tactics & Powerplay Bowling Analysis',
      description: 'Live post-session breakdown of seam movement, reverse swing angles, and middle-overs field placements.',
      category: 'Cricket',
      language: 'English',
      tags: ['Cricket', 'Sports', 'Live', 'India'],
      thumb: '/api/thumbnails/card/vid_cricket_tactics.svg',
      duration: 4120,
      isShort: 0,
      isLive: 1,
      views: 1510000,
      likes: 94200,
      hoursAgo: 4,
    },
    {
      id: 'vid_street_dosa',
      channelId: 'ch_rasoi',
      title: 'Crispy Mysore Masala Dosa & Kulhad Chai — Old Evening Market Food Walk',
      description: 'Exploring the secret fermented batter ratio, red garlic chutney, and freshly crushed cardamom masala chai in a bustling evening street market.',
      category: 'Cooking',
      language: 'Marathi',
      tags: ['Cooking', 'Street Food', 'Masala Dosa', 'Chai'],
      thumb: '/src/assets/images/thumb_street_food_1795622009497.jpg',
      duration: 865,
      isShort: 0,
      isLive: 0,
      views: 690000,
      likes: 41800,
      hoursAgo: 38,
    },
    {
      id: 'vid_tech_flagship',
      channelId: 'ch_tech',
      title: '2026 Flagship Smartphone & Studio Desk Setup After 60 Days of Real Use',
      description: 'Camera low-light comparisons in Bengaluru rain, battery endurance logs, thermal throttling tests, and minimalist desk workflow.',
      category: 'Technology',
      language: 'English',
      tags: ['Technology', 'Smartphone', 'Desk Setup', 'Review'],
      thumb: '/src/assets/images/thumb_tech_review_1795622009897.jpg',
      duration: 1124,
      isShort: 0,
      isLive: 0,
      views: 530000,
      likes: 29400,
      hoursAgo: 52,
    },
    {
      id: 'vid_ladakh_sunrise',
      channelId: 'ch_trails',
      title: 'Solo Ride Across Umling La & Pangong Valley at Sunrise | Ladakh Documentary',
      description: 'Riding at 19,024 feet through golden Himalayan passes with crisp mountain air, local homestays, and zero narration pure road ambience.',
      category: 'Travel',
      language: 'Punjabi',
      tags: ['Travel', 'Ladakh', 'Himalayas', 'Motorcycle'],
      thumb: '/src/assets/images/thumb_himalayas_vlog_1795622011547.jpg',
      duration: 1640,
      isShort: 0,
      isLive: 0,
      views: 920000,
      likes: 64100,
      hoursAgo: 70,
    },
    {
      id: 'vid_board_electricity',
      channelId: 'ch_physics',
      title: 'Magnetic Effects & Electricity Class 10 Full Chapter Revision | Board Exams',
      description: 'Complete NCERT + exemplar numericals for Class 10 Science Board Examinations with circuit diagrams and Fleming rules.',
      category: 'Education',
      language: 'Hindi',
      tags: ['Board examinations', 'Class 10', 'Physics', 'Education'],
      thumb: '/api/thumbnails/card/vid_board_electricity.svg',
      duration: 1950,
      isShort: 0,
      isLive: 0,
      views: 2180000,
      likes: 112000,
      hoursAgo: 96,
    },
    {
      id: 'vid_tamil_gaming',
      channelId: 'ch_tech',
      title: 'Building a Custom Silent Gaming Rig Under ₹75,000 — Benchmarks & Thermals',
      description: 'Step-by-step PC build with airflow optimization, 1440p gaming benchmarks, and cable management guide.',
      category: 'Gaming',
      language: 'Tamil',
      tags: ['Gaming', 'Technology', 'PC Build', 'Tamil'],
      thumb: '/api/thumbnails/card/vid_tamil_gaming.svg',
      duration: 940,
      isShort: 0,
      isLive: 0,
      views: 318000,
      likes: 18500,
      hoursAgo: 120,
    },
    {
      id: 'vid_comedy_hostel',
      channelId: 'ch_doptube_hq',
      title: 'Engineering Hostel Night Before Semesters — Stand-up Comedy Special',
      description: 'Relatable Indian college hostel stories, midnight Maggi negotiations, and group study chaos.',
      category: 'Comedy',
      language: 'Hindi',
      tags: ['Comedy', 'Entertainment', 'College', 'Standup'],
      thumb: '/api/thumbnails/card/vid_comedy_hostel.svg',
      duration: 780,
      isShort: 0,
      isLive: 0,
      views: 1240000,
      likes: 79000,
      hoursAgo: 150,
    },
    {
      id: 'vid_telugu_science',
      channelId: 'ch_physics',
      title: 'How ISRO Navigates Lunar Orbit Insertion | Orbital Mechanics Explained',
      description: 'Visualizing Hohmann transfer orbits, gravity assists, and deep-space telemetry in simple Telugu & English terms.',
      category: 'Science',
      language: 'Telugu',
      tags: ['Science', 'ISRO', 'Space', 'Physics'],
      thumb: '/api/thumbnails/card/vid_telugu_science.svg',
      duration: 1080,
      isShort: 0,
      isLive: 0,
      views: 495000,
      likes: 34200,
      hoursAgo: 180,
    },
    // SHORTS
    {
      id: 'short_blore_desk',
      channelId: 'ch_tech',
      title: 'Late Night TypeScript Refactor in Bengaluru #coding #desksetup',
      description: 'Clean mechanical keyboard acoustics and dark mode monitor setup overlooking Bengaluru skyline.',
      category: 'Technology',
      language: 'English',
      tags: ['Shorts', 'Coding', 'Technology', 'Bengaluru'],
      thumb: '/src/assets/images/short_coding_desk_1795622012524.jpg',
      duration: 38,
      isShort: 1,
      isLive: 0,
      views: 412000,
      likes: 31500,
      hoursAgo: 9,
    },
    {
      id: 'short_kathak_spin',
      channelId: 'ch_nritya',
      title: '16 Chakkars on Teen Taal — Classical Kathak Stage Spotlight #dance',
      description: 'High-speed Kathak footwork and graceful spins accompanied by live sitar and tabla.',
      category: 'Entertainment',
      language: 'Bengali',
      tags: ['Shorts', 'Dance', 'Classical', 'Culture'],
      thumb: '/src/assets/images/short_classical_dance_1795622011547.jpg',
      duration: 44,
      isShort: 1,
      isLive: 0,
      views: 890000,
      likes: 74200,
      hoursAgo: 16,
    },
    {
      id: 'short_chai_pour',
      channelId: 'ch_rasoi',
      title: 'Perfect Ginger Cardamom Kulhad Chai in 45 Seconds',
      description: 'Quick monsoon chai technique with crushed green elaichi and fresh ginger.',
      category: 'Cooking',
      language: 'Hindi',
      tags: ['Shorts', 'Chai', 'Cooking'],
      thumb: '/api/thumbnails/card/short_chai_pour.svg',
      duration: 45,
      isShort: 1,
      isLive: 0,
      views: 640000,
      likes: 48900,
      hoursAgo: 28,
    },
    {
      id: 'short_jee_trick',
      channelId: 'ch_physics',
      title: '30-Second Gauss Law Symmetry Shortcut for JEE Advanced',
      description: 'Never integrate messy flux integrals again with this spherical symmetry trick.',
      category: 'Education',
      language: 'Hindi',
      tags: ['Shorts', 'JEE Advanced', 'Physics'],
      thumb: '/api/thumbnails/card/short_jee_trick.svg',
      duration: 32,
      isShort: 1,
      isLive: 0,
      views: 1120000,
      likes: 92400,
      hoursAgo: 35,
    },
    {
      id: 'short_cricket_yorker',
      channelId: 'ch_cricket',
      title: 'How Death-Over Reverse Swing Yorkers Beat the Bat',
      description: 'Seam angle breakdown in slow motion.',
      category: 'Cricket',
      language: 'English',
      tags: ['Shorts', 'Cricket', 'Sports'],
      thumb: '/api/thumbnails/card/short_cricket_yorker.svg',
      duration: 49,
      isShort: 1,
      isLive: 0,
      views: 760000,
      likes: 58300,
      hoursAgo: 40,
    },
  ];

  for (const v of seedVideos) {
    insertVideo.run(
      v.id,
      v.channelId,
      v.title,
      v.description,
      v.category,
      v.language,
      JSON.stringify(v.tags),
      v.thumb,
      `/api/stream/${v.id}`,
      null,
      v.duration,
      v.isShort,
      v.isLive,
      v.views,
      v.likes,
      Math.max(12, Math.round(v.likes * 0.02)),
      ago(v.hoursAgo)
    );
  }

  // Seed initial subscriptions & history for demo user @AdityaJeeAir1
  const subStmt = db.prepare('INSERT INTO subscriptions (user_id, channel_id, notify_all, created_at) VALUES (?, ?, 1, ?)');
  for (const cid of ['ch_physics', 'ch_music', 'ch_tech', 'ch_rasoi', 'ch_cricket']) {
    subStmt.run('u_demo', cid, ago(200));
  }

  const histStmt = db.prepare('INSERT INTO watch_history (user_id, video_id, progress_sec, watched_at) VALUES (?, ?, ?, ?)');
  histStmt.run('u_demo', 'vid_physics_em', 420, ago(3));
  histStmt.run('u_demo', 'vid_indie_rooftop', 145, ago(8));

  const searchStmt = db.prepare('INSERT INTO search_history (id, user_id, query, preview_thumb, searched_at) VALUES (?, ?, ?, ?, ?)');
  searchStmt.run('sh_1', 'u_demo', 'maxwell equations jee physics', '/src/assets/images/thumb_jee_physics_1795622008621.jpg', ago(2));
  searchStmt.run('sh_2', 'u_demo', 'acoustic indie mumbai studio', '/src/assets/images/thumb_indie_music_1795622010003.jpg', ago(6));
  searchStmt.run('sh_3', 'u_demo', 'masala dosa street food', '/src/assets/images/thumb_street_food_1795622009497.jpg', ago(12));

  const cmtStmt = db.prepare('INSERT INTO comments (id, video_id, user_id, body, likes, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  cmtStmt.run('cmt_1', 'vid_physics_em', 'u_demo', 'The glass board visualization of displacement current made Gauss + Ampere law click instantly!', 248, ago(6));
  cmtStmt.run('cmt_2', 'vid_physics_em', 'u_tech', 'Audio clarity and lighting on the equations are super crisp.', 84, ago(4));
  cmtStmt.run('cmt_3', 'vid_indie_rooftop', 'u_food', 'Listening to this while making evening chai — pure Mumbai nostalgia.', 192, ago(10));

  const replyStmt = db.prepare('INSERT INTO comment_replies (id, comment_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
  replyStmt.run('rep_1', 'cmt_1', 'u_physics', 'Glad it helped! Practice the 2023 Paper 2 problems next.', ago(5));

  const notifStmt = db.prepare('INSERT INTO notifications (id, user_id, title, message, target_video_id, thumbnail_url, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)');
  notifStmt.run('n_1', 'u_demo', 'Physics Pathshala uploaded a new lecture', 'Maxwell Equations & Electromagnetic Waves in One Shot', 'vid_physics_em', '/src/assets/images/thumb_jee_physics_1795622008621.jpg', ago(14));
  notifStmt.run('n_2', 'u_demo', 'Cricket Pulse IN is live now', 'India vs Australia Test Tactics & Powerplay Analysis', 'vid_cricket_tactics', '/api/thumbnails/card/vid_cricket_tactics.svg', ago(4));
  notifStmt.run('n_3', 'u_demo', 'Rhythm Mumbai posted an unplugged session', 'Shaam E Mumbai — Acoustic Guitar & Vocal Session', 'vid_indie_rooftop', '/src/assets/images/thumb_indie_music_1795622010003.jpg', ago(22));
}

export function getVideoThumbnailSvg(videoId: string): string {
  const row = db.prepare(`
    SELECT v.title, v.category, v.language, v.is_short, c.name as channel_name, c.banner_color
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE v.id = ?
  `).get(videoId) as {
    title: string;
    category: string;
    language: string;
    is_short: number;
    channel_name: string;
    banner_color: string;
  } | undefined;

  const title = row?.title ?? 'DopTube Video';
  const category = row?.category ?? 'Featured';
  const channel = row?.channel_name ?? 'DopTube Creator';
  const isShort = row?.is_short === 1;
  const w = isShort ? 540 : 960;
  const h = isShort ? 960 : 540;
  const palettes: Record<string, [string, string, string]> = {
    Cricket: ['#052e16', '#15803d', '#fbbf24'],
    Education: ['#0f172a', '#1d4ed8', '#38bdf8'],
    Gaming: ['#1e1b4b', '#6d28d9', '#f43f5e'],
    Comedy: ['#271710', '#c2410c', '#fde047'],
    Science: ['#090d16', '#0e7490', '#a7f3d0'],
    Cooking: ['#2a120b', '#b45309', '#fef08a'],
  };
  const [c1, c2, accent] = palettes[category] ?? ['#141417', '#27272a', '#ff0033'];

  const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = title.split(' ');
  const line1 = safe(words.slice(0, isShort ? 4 : 6).join(' '));
  const line2 = safe(words.slice(isShort ? 4 : 6, isShort ? 8 : 12).join(' '));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <circle cx="${w * 0.85}" cy="${h * 0.2}" r="${w * 0.24}" fill="${accent}" opacity="0.16"/>
    <circle cx="${w * 0.15}" cy="${h * 0.85}" r="${w * 0.2}" fill="#ffffff" opacity="0.06"/>
    <rect x="48" y="${h * 0.16}" width="110" height="32" rx="6" fill="${accent}" opacity="0.92"/>
    <text x="103" y="${h * 0.16 + 22}" fill="#0f0f0f" font-family="sans-serif" font-size="15" font-weight="700" text-anchor="middle">${safe(category.toUpperCase())}</text>
    <text x="48" y="${h * 0.44}" fill="#ffffff" font-family="sans-serif" font-size="${isShort ? 34 : 40}" font-weight="800">${line1}</text>
    <text x="48" y="${h * 0.44 + 52}" fill="#e5e7eb" font-family="sans-serif" font-size="${isShort ? 30 : 34}" font-weight="700">${line2}</text>
    <text x="48" y="${h - 56}" fill="#d4d4d8" font-family="sans-serif" font-size="22" font-weight="600">${safe(channel)}</text>
  </svg>`;
}

export function getChannelAvatarSvg(channelId: string): string {
  const row = db.prepare('SELECT name, banner_color FROM channels WHERE id = ?').get(channelId) as
    | { name: string; banner_color: string }
    | undefined;
  const name = row?.name ?? 'DT';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const palette = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
  let hash = 0;
  for (let i = 0; i < channelId.length; i++) hash = (hash * 31 + channelId.charCodeAt(i)) % palette.length;
  const bg = palette[Math.abs(hash) % palette.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="64" fill="${bg}"/>
    <text x="64" y="76" fill="#ffffff" font-family="sans-serif" font-size="46" font-weight="700" text-anchor="middle">${initials}</text>
  </svg>`;
}

export function readFileIfExists(p: string): boolean {
  return fs.existsSync(p);
}
