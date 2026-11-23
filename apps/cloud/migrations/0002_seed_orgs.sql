-- The first two organisations (brief §3.3). No members, keys or secrets are seeded:
-- the platform owner invites each organisation's owner from /platform.

INSERT INTO orgs (id, slug, name, short_name, tz, locale, settings, pack, status, created_at) VALUES
('org_photizo', 'photizo', 'Photizo-Fire Global Ministries', 'Photizo', 'Europe/London', 'en-GB',
 '{"location":"Scarborough, United Kingdom","motto":"The Nations Are Taken.","departments":["Administration","Media","Finance","Compliance","Publicity","Lit Nation"],"website":"photizofiregm.org","connectors":{"icalUrl":"https://media.photizofiregm.org/calendar.ics","liveStatusUrl":"https://media.photizofiregm.org/api/public/live"}}',
 'church', 'active', 1795392000000),
('org_rccg_tog', 'rccg-tog', 'RCCG Throne of Grace, Hessle', 'Throne of Grace', 'Europe/London', 'en-GB',
 '{"location":"Hessle, United Kingdom","motto":"","departments":[],"website":"rccgthroneofgracehessleuk.org","connectors":{}}',
 'church', 'active', 1795392000000);
