-- Brand kit, mark and lead person for the seeded organisations. Graphics read these through the org profile.
UPDATE orgs SET settings = json_set(settings,
  '$.brand', json('{"p":"#1d1238","d":"#0b0618","a":"#f7ba49","f":"#ff8a3d","m":"#e0337f","l":"#f4efff"}'),
  '$.lead', json('["Prophet Segun Adebayo","The Setman"]'),
  '$.mark', 'P')
WHERE slug = 'photizo';

-- Placeholder brand until the RCCG Throne of Grace brand images are supplied.
UPDATE orgs SET settings = json_set(settings,
  '$.brand', json('{"p":"#0e2a5c","d":"#061634","a":"#f2c14e","f":"#d7263d","m":"#3a7bd5","l":"#f4f7ff"}'),
  '$.lead', json('["Pastor in charge","Add the name in People"]'),
  '$.mark', 'TG')
WHERE slug = 'rccg-tog';
