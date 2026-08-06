-- SVG files are not accepted for public site media uploads.
-- Public raster images stay available for logos and hero pictures.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]
where id = 'public-site';
