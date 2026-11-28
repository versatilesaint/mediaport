// Broadcast Kit packaging (studio spec §8): turns an organisation's rendered files into the kit folder, the OBS
// scene collections (Windows + Mac), FreeShow templates and overlays, countdown.html, READMEs and four ZIPs.
// Pure: no network, no browser. kit/build.mjs calls it after rendering; tests/kit-package.test.mjs checks it.
import { createHash } from 'node:crypto';
import { FRAME_IDS, FRAME_NAME, frameLayout } from '../apps/cloud/public/assets/frames.js';
import { zip } from './zip.mjs';

/** Folder / file prefix from the organisation's short name: letters, digits and hyphens. */
export const folderName = (job) => (String(job.short || job.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'MediaPort');
export const LOCATIONS = { Windows: (F) => `C:/${F}`, Mac: (F) => `/Users/Shared/${F}` };
export const ZIPS = { 'broadcast-kit.zip': 'Broadcast-Kit', 'obs-kit.zip': 'OBS-Kit', 'freeshow-kit.zip': 'FreeShow-Kit', 'camera-frames.zip': 'Camera-Frames' };
const STILLS = ['welcome', 'lyrics', 'scripture', 'announcement', 'sermon'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const slugTitle = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const font = (f, fallback) => (!f || f === 'Default' ? fallback : f);
const rgb = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${a})`; };

/** Where each rendered file goes in the kit folder (relative to the root folder). */
export function layout(F) {
  const m = new Map([
    ['bg-standard.webm', `backgrounds/${F}-Motion-Background.webm`],
    ['bg-dark.webm', `backgrounds/${F}-Motion-Background-Dark.webm`],
    ['intro-sting.webm', `overlays/${F}-Intro-Sting.webm`],
    ['transition-stinger.webm', `overlays/${F}-Transition-Sting.webm`],
    ['corner-logo.webm', `overlays/${F}-Corner-Logo.webm`],
    ['corner-logo.png', `overlays/${F}-Corner-Logo.png`],
    ['lower-third.webm', `overlays/${F}-Lower-Third.webm`],
    ['lower-third.png', `overlays/${F}-Lower-Third.png`],
  ]);
  for (const s of STILLS) { m.set(`still-${s}.jpg`, `backgrounds/1080p/${F}-${cap(s)}.jpg`); m.set(`still-${s}-4k.jpg`, `backgrounds/4K/${F}-${cap(s)}-4K.jpg`); }
  for (const id of FRAME_IDS) for (const look of ['bold', 'flat']) m.set(`frame-${id.toLowerCase()}-${look}.png`, frameFile(F, id, look, 'png'));
  for (const look of ['bold', 'flat']) m.set(`frame-f13-${look}-animated.webm`, frameFile(F, 'F13', look, 'webm'));
  return m;
}
const frameFile = (F, id, look, ext) => `frames/${look}/${F}-Frame-${id}-${slugTitle(FRAME_NAME[id])}.${ext}`;

// ---------------------------------------------------------------- OBS (studio spec §8.1)
const ALIGN_TOP_LEFT = 5;
const abgr = (hex, a = 255) => { const n = parseInt(hex.slice(1), 16); return ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const PANEL_TEXT = {
  scripture: ['John 3:16 · KJV\nFor God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', 46],
  lyrics: ['First line of the song\nSecond line of the song', 50],
  announcement: ['ANNOUNCEMENT\nType the heading and details here', 50],
  countdown: ['SERVICE STARTS IN\n10:00', 64],
  caption: ['Caption', 34],
  guest: ['JOINING US FROM\nTown, Country', 42],
};
export const MAIN_SCENES = ['Starting Soon', 'Intro', 'Live', 'Sermon', 'Sermon Title', 'Announcements', 'Be Right Back', 'Ending'];

export function obsCollection(job, base, F) {
  const L = layout(F), path = (k) => `${base}/${L.get(k)}`;
  const uid = (name) => { const h = createHash('sha1').update(`mediaport-obs/${job.orgId}/${name}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  const head = font(job.fonts?.heading, 'Arial Black'), body = font(job.fonts?.body, 'Arial');
  const WHITE = abgr('#ffffff'), ACC = abgr(job.brand.a);
  const sources = [];
  const source = (name, id, settings, versioned) => {
    sources.push({ name, uuid: uid(name), id, versioned_id: versioned || id, settings, mixers: id === 'ffmpeg_source' || id === 'browser_source' ? 255 : 0, sync: 0, flags: 0,
      volume: 1, balance: 0.5, enabled: true, muted: id === 'ffmpeg_source', 'push-to-mute': false, 'push-to-mute-delay': 0, 'push-to-talk': false, 'push-to-talk-delay': 0,
      hotkeys: {}, deinterlace_mode: 0, deinterlace_field_order: 0, monitoring_type: 0, private_settings: {} });
    return name;
  };
  const media = (name, key, loop = true) => source(name, 'ffmpeg_source', { is_local_file: true, local_file: path(key), looping: loop, restart_on_activate: true, clear_on_media_end: false, close_when_inactive: false, hw_decode: true });
  const image = (name, key) => source(name, 'image_source', { file: path(key), unload: false });
  const text = (name, value, size, { color = WHITE, face = head, bold = false, w = 1200, h = 100, align = 'left' } = {}) => source(name, 'text_gdiplus', {
    text: value, font: { face, size, style: bold ? 'Bold' : 'Regular', flags: bold ? 1 : 0 }, color, color1: color, color2: color,
    align, valign: 'center', extents: true, extents_cx: w, extents_cy: h, extents_wrap: true, outline: false, drop_shadow: true, word_wrap: true, custom_width: w,
  }, 'text_gdiplus_v3');
  /** items: [source, x, y, {scale, visible, box:[w,h]}] */
  const scene = (name, items) => {
    source(name, 'scene', { id_counter: items.length, custom_size: false, items: items.map(([src, x, y, o = {}], i) => ({
      name: src, source_uuid: uid(src), visible: o.visible ?? true, locked: false, rot: 0, pos: { x, y }, scale: { x: o.scale ?? 1, y: o.scale ?? 1 }, align: ALIGN_TOP_LEFT,
      bounds_type: o.box ? 3 : 0, bounds_align: 0, bounds_crop: !!o.box, bounds: { x: o.box ? o.box[0] : 0, y: o.box ? o.box[1] : 0 },
      crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0, id: i + 1, group_item_backup: false, scale_filter: 'disable', blend_method: 'default', blend_type: 'normal',
      show_transition: { duration: 300 }, hide_transition: { duration: 300 }, private_settings: {},
    })) });
    return name;
  };

  media('Motion Background', 'bg-standard.webm');
  media('Motion Background (Dark)', 'bg-dark.webm');
  media('Intro Sting', 'intro-sting.webm', false);
  media('Corner Logo Loop', 'corner-logo.webm');
  media('Lower Third Bar', 'lower-third.webm');
  for (const s of ['welcome', 'announcement', 'sermon']) image(`${cap(s)} Background`, `still-${s}.jpg`);
  // Cameras: double-click each in OBS and pick the device. Names match the studio's OBS positions box.
  for (const cam of ['Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Slides', 'Guest']) source(cam, 'dshow_input', {});
  source('Studio Graphics', 'browser_source', { is_local_file: false, url: job.obsUrl || 'about:blank', width: 1920, height: 1080, fps_custom: false, reroute_audio: false, shutdown: false, restart_when_active: false, css: '' });
  source('Countdown', 'browser_source', { is_local_file: true, local_file: `${base}/obs/countdown.html`, width: 1920, height: 1080, fps_custom: false, reroute_audio: false, shutdown: false, restart_when_active: false, css: '' });
  text('Lower Third – Name', 'Speaker Name', 54, { w: 880, h: 84 });
  text('Lower Third – Title', `Title · ${job.short || job.name}`, 34, { color: ACC, face: body, bold: true, w: 780, h: 60 });
  text('Announcement – Title', 'ANNOUNCEMENT', 76, { color: ACC, w: 1000, h: 190 });
  text('Announcement – Details', 'Type the details here', 50, { face: body, w: 1000, h: 560 });
  text('Sermon – Title', 'SERMON TITLE', 90, { w: 1500, h: 200, align: 'center' });
  text('Sermon – Point', 'Sermon point or Scripture', 54, { color: ACC, face: body, bold: true, w: 1400, h: 260, align: 'center' });
  text('Be Right Back – Text', "WE'LL BE RIGHT BACK", 72, { w: 1920, h: 120, align: 'center' });
  text('Ending – Text', 'THANK YOU FOR JOINING US', 58, { w: 1920, h: 110, align: 'center' });

  scene('[Overlay] Corner Logo', [['Corner Logo Loop', 1500, 18, { scale: 0.5 }]]);
  scene('[Overlay] Lower Third', [['Lower Third Bar', 0, 0], ['Lower Third – Name', 420, 828], ['Lower Third – Title', 420, 922]]);
  const live = (cam) => [[cam, 0, 0, { box: [1920, 1080] }], ['Studio Graphics', 0, 0], ['[Overlay] Corner Logo', 0, 0]];
  const main = [
    scene('Starting Soon', [['Motion Background', 0, 0], ['Corner Logo Loop', 560, 120, { scale: 1 }], ['Countdown', 0, 0]]),
    scene('Intro', [['Welcome Background', 0, 0], ['Intro Sting', 0, 0]]),
    scene('Live', [...live('Camera 1'), ['[Overlay] Lower Third', 0, 0, { visible: false }]]),
    scene('Sermon', [...live('Camera 1'), ['[Overlay] Lower Third', 0, 0]]),
    scene('Sermon Title', [['Sermon Background', 0, 0], ['Sermon – Title', 210, 415], ['Sermon – Point', 260, 625]]),
    scene('Announcements', [['Announcement Background', 0, 0], ['Announcement – Title', 820, 100], ['Announcement – Details', 820, 340]]),
    scene('Be Right Back', [['Motion Background (Dark)', 0, 0], ['Corner Logo Loop', 560, 160], ['Be Right Back – Text', 0, 700]]),
    scene('Ending', [['Welcome Background', 0, 0], ['Ending – Text', 0, 880]]),
  ];
  // One scene per camera frame: cameras under the windows, the frame art on top, then editable labels and text.
  const frames = FRAME_IDS.map((id) => {
    const title = FRAME_NAME[id], Lf = frameLayout(id, {}), art = `Frame Art • ${title}`;
    if (id === 'F13') media(art, 'frame-f13-bold-animated.webm'); else image(art, `frame-${id.toLowerCase()}-bold.png`);
    const items = [], used = new Set();
    for (const w of Lf.windows) if (!used.has(w.cam)) { used.add(w.cam); items.push([w.cam, w.x, w.y, { box: [w.w, w.h] }]); }
    items.push([art, 0, 0]);
    if (Lf.names) Lf.windows.forEach((w, i) => items.push([text(`${title} – Name ${i + 1}`, `Name ${i + 1}\nTitle`, 36, { w: w.w, h: 110 }), w.x, w.y + w.h + 14]));
    else for (const w of Lf.windows) if (!w.plain && w.label) items.push([text(`${title} – Label ${w.n}`, w.label, 30, { w: Math.min(600, w.w - 40), h: 54 }), w.x + 22, w.y + w.h - 74]);
    for (const p of Lf.panels) { const [v, size] = PANEL_TEXT[p.kind]; items.push([text(`${title} – ${cap(p.kind)} Text`, v, size, { face: body, bold: true, w: p.w - 80, h: p.h - 80, align: 'center' }), p.x + 40, p.y + 40]); }
    return scene(`Frame • ${title}`, items);
  });
  const stinger = { name: 'Brand Stinger', uuid: uid('Brand Stinger'), id: 'obs_stinger_transition', versioned_id: 'obs_stinger_transition',
    settings: { path: path('transition-stinger.webm'), tp_type: 0, transition_point: 1200, hw_decode: true, preload: true, audio_monitoring: 0, audio_fade_style: 1, track_matte_enabled: false },
    mixers: 0, sync: 0, flags: 0, volume: 1, balance: 0.5, enabled: true, muted: false, hotkeys: {}, private_settings: {} };
  return { name: job.name, current_scene: 'Starting Soon', current_program_scene: 'Starting Soon',
    scene_order: [...main, ...frames, '[Overlay] Corner Logo', '[Overlay] Lower Third'].map((name) => ({ name })),
    sources, groups: [], quick_transitions: [], saved_projectors: [], transitions: [stinger], current_transition: 'Brand Stinger', transition_duration: 300,
    preview_locked: false, scaling_enabled: false, scaling_level: 0, scaling_off_x: 0, scaling_off_y: 0, modules: {} };
}

/** Every reference resolves and every media path is a file in the kit. Throws on the first problem. */
export function validateObs(coll, base, tree) {
  const names = new Set(coll.sources.map((s) => s.name)), uuids = new Set(coll.sources.map((s) => s.uuid));
  if (names.size !== coll.sources.length) throw new Error('duplicate source names');
  for (const s of coll.sources) {
    for (const it of s.settings.items || []) if (!names.has(it.name) || !uuids.has(it.source_uuid)) throw new Error('dangling item ' + it.name);
    for (const k of ['local_file', 'file']) { const p = s.settings[k]; if (p && !tree.has(p.replace(base + '/', ''))) throw new Error('missing ' + p); }
  }
  for (const o of coll.scene_order) if (!names.has(o.name)) throw new Error('scene_order ' + o.name);
  const st = coll.transitions[0].settings.path.replace(base + '/', '');
  if (!tree.has(st)) throw new Error('missing stinger ' + st);
}

// ---------------------------------------------------------------- FreeShow 1.6.x (studio spec §8.2)
/** .fstemplate / .fsoverlay: a zip with data.json ({template|overlay, files}) plus the media, by base name. */
function freeshow(job, F, tree) {
  const L = layout(F), FAKE = `/${F}-FreeShow/media/`, B = job.brand, out = [];
  const DISPLAY = `font-family: ${font(job.fonts?.heading, 'Arial Black')};`, SANS = `font-family: ${font(job.fonts?.body, 'Arial')};`, SERIF = `font-family: ${font(job.fonts?.scripture, 'Georgia')};`;
  const SHADOW = 'text-shadow: 3px 3px 10px rgb(0 0 0 / 85%);', ACC = B.a;
  const box = (top, left, width, height, extra = '') => `top:${top}px;left:${left}px;width:${width}px;height:${height}px;${extra}`;
  const textItem = (style, runs, { align = 'text-align: center;', valign = 'center', fit } = {}) => ({ style, align: valign ? `align-items: ${valign}; justify-content: center;` : '',
    lines: runs.map((line) => ({ align, text: line.map(([value, s]) => ({ value, style: s })) })), ...(fit ? { textFit: fit } : {}) });
  const base = (k) => L.get(k).split('/').pop();
  const mediaItem = (k, style, loop = true, fit = 'contain') => ({ type: 'media', src: FAKE + base(k), style, fit, loop, muted: true });
  const write = (kind, id, data, keys, dir = 'freeshow') => {
    const payload = { [kind]: { ...data, id: `${F.toLowerCase()}_${id}` }, files: keys.map((k) => FAKE + base(k)) };
    const file = `${dir}/${slugTitle(data.name)}.${kind === 'template' ? 'fstemplate' : 'fsoverlay'}`;
    out.push([file, zip([['data.json', JSON.stringify(payload)], ...keys.map((k) => [base(k), tree.get(L.get(k))])])]);
  };
  const N = job.short || job.name;
  const bar = (bg) => `background-color: ${rgb(bg, 0.9)};border-radius: 18px;border-top: 6px solid ${ACC};border-bottom: 6px solid ${B.f};padding: 10px 30px;`;

  write('template', 'lyrics', { name: `${N} Lyrics`, color: ACC, category: 'song', settings: { backgroundPath: FAKE + base('bg-standard.webm') },
    items: [textItem(box(110, 80, 1760, 720), [[['Lyrics', `${SANS}font-size: 92px;font-weight: bold;color: #ffffff;${SHADOW}`]]], { fit: 'shrinkToFit' })] }, ['bg-standard.webm']);
  write('template', 'lyrics_livestream', { name: `${N} Lyrics – Livestream`, color: ACC, category: 'song',
    items: [textItem(box(790, 160, 1600, 230, bar(B.d)), [[['Lyrics', `${SANS}font-size: 62px;font-weight: bold;color: #ffffff;${SHADOW}`]]], { fit: 'shrinkToFit' })] }, []);
  write('template', 'bible', { name: `${N} Scripture`, color: ACC, category: 'scripture', settings: { mode: 'scripture', backgroundPath: FAKE + base('still-scripture.jpg') },
    items: [
      textItem(box(70, 560, 800, 100), [[['{scripture_reference}', `${SERIF}font-size: 54px;font-weight: bold;color: #ffffff;`]]], { fit: 'shrinkToFit' }),
      textItem(box(250, 150, 1620, 660), [[['{scripture_number} ', `${SERIF}font-size: 40px;font-weight: bold;color: ${ACC};`], ['{scripture_text}', `${SERIF}font-size: 74px;color: #ffffff;${SHADOW}`]]], { fit: 'shrinkToFit' }),
      textItem(box(950, 140, 1200, 60), [[['{scripture_name}', `${SANS}font-size: 32px;color: ${rgb(ACC, 0.9)};`]]], { align: 'text-align: left;' }),
    ] }, ['still-scripture.jpg']);
  write('template', 'bible_motion', { name: `${N} Scripture – Motion`, color: ACC, category: 'scripture', settings: { mode: 'scripture', backgroundPath: FAKE + base('bg-dark.webm') },
    items: [
      textItem(box(90, 120, 1680, 660, `background-color: rgb(0 0 0 / 0.35);border-radius: 24px;border: 3px solid ${rgb(ACC, 0.8)};padding: 30px;`), [[['{scripture_number} ', `${SERIF}font-size: 40px;font-weight: bold;color: ${ACC};`], ['{scripture_text}', `${SERIF}font-size: 72px;color: #ffffff;${SHADOW}`]]], { fit: 'shrinkToFit' }),
      textItem(box(780, 120, 1680, 80), [[['{scripture_reference}', `${SERIF}font-size: 56px;font-weight: bold;color: ${ACC};${SHADOW}`]]]),
      textItem(box(855, 120, 1680, 50), [[['{scripture_name}', `${SANS}font-size: 32px;color: rgb(255 255 255 / 0.75);`]]]),
    ] }, ['bg-dark.webm']);
  write('template', 'bible_livestream', { name: `${N} Scripture – Livestream`, color: ACC, category: 'scripture', settings: { mode: 'scripture' },
    items: [
      textItem(box(745, 160, 1600, 220, `background-color: ${rgb(B.d, 0.9)};border-radius: 18px;border-top: 6px solid ${ACC};padding: 10px 30px;`), [[['{scripture_text}', `${SERIF}font-size: 52px;color: #ffffff;${SHADOW}`]]], { fit: 'shrinkToFit' }),
      textItem(box(965, 160, 900, 70, `background-color: ${B.p};border-radius: 0 0 18px 18px;border-bottom: 5px solid ${B.f};`), [[['{scripture_reference}', `${SERIF}font-size: 40px;font-weight: bold;color: ${ACC};`]]]),
    ] }, []);
  write('template', 'announcement', { name: `${N} Announcement`, color: ACC, category: 'presentation', settings: { backgroundPath: FAKE + base('still-announcement.jpg') },
    items: [
      textItem(box(100, 820, 1000, 190), [[['ANNOUNCEMENT', `${DISPLAY}font-size: 80px;color: ${ACC};${SHADOW}`]]], { align: 'text-align: left;', fit: 'shrinkToFit' }),
      textItem(box(340, 820, 1000, 560), [[['Details go here', `${SANS}font-size: 54px;color: #ffffff;${SHADOW}`]]], { align: 'text-align: left;', valign: 'flex-start', fit: 'shrinkToFit' }),
    ] }, ['still-announcement.jpg']);
  write('template', 'sermon', { name: `${N} Sermon`, color: ACC, category: 'presentation', settings: { backgroundPath: FAKE + base('still-sermon.jpg') },
    items: [
      textItem(box(425, 210, 1500, 200), [[['SERMON TITLE', `${DISPLAY}font-size: 96px;color: #ffffff;${SHADOW}`]]], { fit: 'shrinkToFit' }),
      textItem(box(625, 260, 1400, 260), [[['Sermon point or Scripture', `${SANS}font-size: 58px;color: ${ACC};${SHADOW}`]]], { fit: 'shrinkToFit' }),
    ] }, ['still-sermon.jpg']);
  write('template', 'welcome', { name: `${N} Welcome`, color: ACC, category: 'presentation', settings: { backgroundPath: FAKE + base('still-welcome.jpg') },
    items: [textItem(box(845, 260, 1400, 100), [[['WELCOME', `${DISPLAY}font-size: 64px;color: #ffffff;letter-spacing: 6px;${SHADOW}`]]])] }, ['still-welcome.jpg']);

  const full = box(0, 0, 1920, 1080);
  write('overlay', 'corner_logo', { name: `${N} Corner Logo`, color: ACC, category: null, items: [mediaItem('corner-logo.webm', box(18, 1500, 400, 250))] }, ['corner-logo.webm']);
  write('overlay', 'corner_logo_static', { name: `${N} Corner Logo (Static)`, color: ACC, category: null, items: [mediaItem('corner-logo.png', box(18, 1500, 400, 250))] }, ['corner-logo.png']);
  write('overlay', 'lower_third', { name: `${N} Lower Third`, color: ACC, category: null, items: [
    mediaItem('lower-third.webm', full),
    textItem(box(828, 420, 880, 84), [[['Speaker Name', `${DISPLAY}font-size: 54px;color: #ffffff;${SHADOW}`]]], { align: 'text-align: left;', fit: 'shrinkToFit' }),
    textItem(box(922, 420, 760, 62), [[['Title · Ministry', `${SANS}font-size: 36px;font-weight: bold;color: ${ACC};`]]], { align: 'text-align: left;', fit: 'shrinkToFit' }),
  ] }, ['lower-third.webm']);
  write('overlay', 'intro_sting', { name: `${N} Intro Sting`, color: ACC, category: null, displayDuration: 7, items: [mediaItem('intro-sting.webm', full, false)] }, ['intro-sting.webm']);
  write('overlay', 'transition_sting', { name: `${N} Transition Sting`, color: ACC, category: null, displayDuration: 2.5, items: [mediaItem('transition-stinger.webm', full, false)] }, ['transition-stinger.webm']);
  for (const id of FRAME_IDS) for (const look of ['bold', 'flat']) {
    const k = id === 'F13' ? `frame-f13-${look}-animated.webm` : `frame-${id.toLowerCase()}-${look}.png`;
    write('overlay', `frame_${id.toLowerCase()}_${look}`, { name: `${N} Frame – ${FRAME_NAME[id]} (${look === 'bold' ? 'Bold' : 'Flat'})`, color: ACC, category: null, items: [mediaItem(k, full, true, 'fill')] }, [k], 'frames/freeshow');
  }
  return out;
}

// ---------------------------------------------------------------- countdown page and READMEs
const htmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function countdownHtml(job) {
  const B = job.brand, head = font(job.fonts?.heading, 'Arial Black'), body = font(job.fonts?.body, 'Arial');
  const cssFont = (f) => `"${String(f).replace(/["\\<>]/g, '')}"`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${htmlEsc(job.name)} countdown</title>
<!--
  OBS Browser Source (transparent, 1920x1080). Counts down to the next service time.
  ── EDIT YOUR SERVICE TIMES HERE ──  (24-hour clock; day 0 = Sunday … 6 = Saturday)
-->
<script>
const SERVICE_TIMES = [
  { day: 0, time: "10:00", name: "Sunday Service" },
  { day: 3, time: "19:00", name: "Midweek Service" },
];
const HEADING = "SERVICE STARTS IN";
const LIVE_TEXT = "WELCOME · WE ARE STARTING";
</script>
<style>
  html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:${cssFont(head)},"Arial Black",Arial,sans-serif;color:#fff}
  .wrap{position:absolute;left:0;right:0;top:600px;text-align:center}
  .head{font-size:46px;letter-spacing:10px;color:${B.a};text-shadow:0 3px 12px rgba(0,0,0,.8)}
  .clock{display:inline-flex;gap:26px;margin-top:22px}
  .unit{min-width:190px;padding:18px 10px 12px;border-radius:22px;background:linear-gradient(180deg,${B.p} 0%,${B.d} 100%);
        border-top:6px solid ${B.a};border-bottom:6px solid ${B.f};box-shadow:0 18px 40px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.35)}
  .num{font-size:120px;line-height:1;text-shadow:0 4px 10px rgba(0,0,0,.6);font-variant-numeric:tabular-nums}
  .lbl{font:bold 22px ${cssFont(body)},Arial,sans-serif;letter-spacing:6px;color:#fff;opacity:.85;margin-top:6px}
  .name{margin-top:26px;font:bold 38px ${cssFont(body)},Arial,sans-serif;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.8)}
  .live{font-size:72px;color:#fff;text-shadow:0 4px 16px rgba(0,0,0,.8)}
</style>
</head>
<body>
<div class="wrap"><div class="head" id="head"></div><div class="clock" id="clock"></div><div class="name" id="name"></div></div>
<script>
// ?t=HH:MM in the URL overrides the schedule (for one-off events).
const q = new URLSearchParams(location.search).get("t");
function nextService(now) {
  const list = q ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, time: q, name: "" })) : SERVICE_TIMES;
  let best = null;
  for (const s of list) {
    const [h, m] = s.time.split(":").map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    d.setDate(d.getDate() + ((s.day - d.getDay() + 7) % 7));
    if (d - now < -15 * 60 * 1000) d.setDate(d.getDate() + 7);
    if (!best || d < best.at) best = { at: d, name: s.name };
  }
  return best;
}
const pad = (n) => String(n).padStart(2, "0");
function unit(n, l) { const u = document.createElement("div"); u.className = "unit"; u.innerHTML = '<div class="num"></div><div class="lbl"></div>'; u.firstChild.textContent = pad(n); u.lastChild.textContent = l; return u; }
function tick() {
  const now = new Date(), s = nextService(now);
  let diff = Math.round((s.at - now) / 1000);
  const head = document.getElementById("head"), clock = document.getElementById("clock"), name = document.getElementById("name");
  clock.textContent = "";
  if (diff <= 0) { head.textContent = ""; name.textContent = ""; const l = document.createElement("div"); l.className = "live"; l.textContent = LIVE_TEXT; clock.append(l); return; }
  const d = Math.floor(diff / 86400); diff %= 86400;
  const h = Math.floor(diff / 3600); diff %= 3600;
  const m = Math.floor(diff / 60), sec = diff % 60;
  head.textContent = HEADING;
  if (d) clock.append(unit(d, "DAYS"));
  clock.append(unit(h, "HRS"), unit(m, "MINS"), unit(sec, "SECS"));
  name.textContent = s.name;
}
tick();
setInterval(tick, 250);
</script>
</body>
</html>
`;
}

const obsReadme = (job, F) => `${job.name.toUpperCase()} · OBS KIT
${'='.repeat(job.name.length + 10)}

Everything for the livestream in OBS Studio 30 or newer, on Windows or Mac. Made by MediaPort in your brand.

1. PUT THE FOLDER IN PLACE
   Unzip, then move the "${F}" folder so it is exactly here:
     Windows:  C:\\${F}
     Mac:      /Users/Shared/${F}   (Finder > Go > Go to Folder… > /Users/Shared)
   Somewhere else? OBS shows "Missing Files" when you open the scenes. Click "Search Directory…",
   pick the ${F} folder, then "Apply". Everything relinks.

2. CANVAS SIZE
   OBS > Settings > Video: Base (Canvas) and Output Resolution 1920x1080.

3. IMPORT THE SCENES
   OBS > Scene Collection > Import > "…" > obs/${F}-Scenes-Windows.json (or -Mac.json) > tick it > Import.
   Then choose it under Scene Collection > ${job.name}.

4. CONNECT YOUR CAMERAS (once)
   Double-click "Camera 1" (in "Live") and pick your camera. Do the same for Camera 2–4, Slides and Guest
   if you have them. Every scene shares the same cameras. The names match the OBS positions box in the
   MediaPort studio.

5. STUDIO GRAPHICS
   Double-click "Studio Graphics" and paste your OBS screen link from MediaPort (Platform > Screen links).
   Width 1920, height 1080. Leave "Shutdown source when not visible" and "Refresh browser when scene
   becomes active" OFF.

6. SERVICE TIMES (once)
   Open obs/countdown.html in Notepad (Windows) or TextEdit (Mac), edit the lines near the top
   ({ day: 0, time: "10:00", ... }: day 0 = Sunday … 6 = Saturday, 24-hour clock), save, then in OBS
   right-click "Countdown" > Refresh.

SCENES
   Starting Soon · Intro · Live · Sermon · Sermon Title · Announcements · Be Right Back · Ending
   Frame • …          17 camera frames with the cameras already placed under the windows. Labels and panel
                      text are editable. The Flat look of every frame is in frames/flat.
   [Overlay] Lower Third   Edit the speaker name and title here; it updates in every scene.
   [Overlay] Corner Logo   The animated corner logo used in every scene.

STINGER
   The scene transition is already "Brand Stinger" with the cut at 1.2 s, while the screen is fully covered.
   By hand: Scene Transitions > + > Stinger > overlays/${F}-Transition-Sting.webm, Transition Point 1200 ms.

FREESHOW LYRICS AND SCRIPTURE IN THE STREAM
   Best: NDI. Install the free DistroAV plugin in OBS. In FreeShow add a second output with NDI on and use the
   "Livestream" templates on it (transparent). In OBS add an "NDI Source" to "Live" above the camera.
`;

const freeshowReadme = (job) => `${job.name.toUpperCase()} · FREESHOW KIT
${'='.repeat(job.name.length + 15)}

For FreeShow 1.6 or newer.

IMPORT
   File > Import > More options > Template: choose every .fstemplate in this folder.
   File > Import > More options > Overlay: choose every .fsoverlay (camera frames are in frames/freeshow).
   FreeShow copies the backgrounds and videos into its own folder, so you can delete the zip afterwards.

   No "Overlay" option? Make a new overlay, add a Media item, and pick the .webm or .png from the overlays
   or frames folder of the Broadcast Kit.

TEMPLATES
   Lyrics · Lyrics – Livestream (transparent) · Scripture · Scripture – Motion · Scripture – Livestream
   (transparent) · Announcement · Sermon · Welcome

   The Livestream templates are for a second FreeShow output with NDI turned on, feeding OBS.

OVERLAYS
   Corner Logo (animated and static) · Lower Third · Intro Sting · Transition Sting · every camera frame
   (Bold and Flat).
`;

const mainReadme = (job, F) => `${job.name} · Broadcast Kit
Made by MediaPort from your Brand Profile. If you change your brand, a fresh kit is made within the hour.

FOLDERS
   obs/            OBS scene collections (Windows and Mac), countdown.html, OBS-README.txt
   freeshow/       FreeShow templates and overlays, FreeShow-README.txt
   backgrounds/    Motion backgrounds (20 s loops) and stills at 1080p; backgrounds/4K for big screens
   overlays/       Intro sting, transition sting, corner logo, lower third (.webm with transparency + .png)
   frames/         17 camera frames, Bold and Flat; frames/freeshow has them ready for FreeShow
   brand/          Your logo files

SET UP
   1. OBS: follow obs/OBS-README.txt.
   2. FreeShow: follow freeshow/FreeShow-README.txt.

PRACTICE RUN (before your first service)
   1. In the MediaPort studio, show a lyric, a Bible verse and a name; check each on OBS and FreeShow.
   2. In OBS, switch to "Starting Soon" and check the countdown shows your next service.
   3. Switch scenes: the Brand Stinger should cover the screen and cut at the middle.
   4. Show a camera frame scene and check every camera sits inside its window.
   5. Hide everything with Clear in the studio.
`;

/**
 * Builds the kit. files: Map(renderedName → Buffer); logos: [[variant, ext, Buffer]].
 * Returns { F, tree: Map(path → Buffer), zips: [[uploadName, Buffer]] }.
 */
export function packageKit(job, files, logos = [], { maxZip = Infinity } = {}) {
  const F = folderName(job), L = layout(F), tree = new Map();
  for (const [name, rel] of L) if (files.has(name)) tree.set(rel, files.get(name));
  for (const [v, ext, buf] of logos) tree.set(`brand/${F}-logo-${v.replace('_', '-')}.${ext}`, buf);
  tree.set('obs/countdown.html', Buffer.from(countdownHtml(job)));
  for (const [os, loc] of Object.entries(LOCATIONS)) {
    const base = loc(F), coll = obsCollection(job, base, F);
    validateObs(coll, base, tree);
    tree.set(`obs/${F}-Scenes-${os}.json`, Buffer.from(JSON.stringify(coll, null, 2)));
  }
  tree.set('obs/OBS-README.txt', Buffer.from(obsReadme(job, F)));
  for (const [p, buf] of freeshow(job, F, tree)) tree.set(p, buf);
  tree.set('freeshow/FreeShow-README.txt', Buffer.from(freeshowReadme(job)));
  tree.set('README.txt', Buffer.from(mainReadme(job, F)));

  const pick = (test) => [...tree].filter(([p]) => test(p)).sort(([a], [b]) => a.localeCompare(b)).map(([p, b]) => [`${F}/${p}`, b]);
  const sets = {
    'obs-kit.zip': pick((p) => p === 'README.txt' || p.startsWith('obs/') || p.startsWith('overlays/') || (p.startsWith('backgrounds/') && !p.startsWith('backgrounds/4K/')) || /^frames\/(bold|flat)\//.test(p)),
    'freeshow-kit.zip': pick((p) => p.startsWith('freeshow/') || p.startsWith('frames/freeshow/')),
    'camera-frames.zip': pick((p) => p.startsWith('frames/')),
    'broadcast-kit.zip': pick(() => true),
  };
  const zips = [];
  for (const [name, entries] of Object.entries(sets)) {
    const size = entries.reduce((s, [, b]) => s + b.length, 0);
    if (size > maxZip) { console.log(`  ${name} would be ${(size / 1e6).toFixed(0)} MB: too big to upload, skipped (download the other kits)`); continue; }
    zips.push([name, zip(entries)]);
  }
  return { F, tree, zips };
}
