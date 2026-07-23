-- Aligns the private Hue Studio artwork bucket with its 500 MB Pro setting.
-- Safe to run more than once. Existing artwork is not changed or deleted.

update storage.buckets
set file_size_limit = 524288000
where id = 'artwork-files';

select id, file_size_limit
from storage.buckets
where id = 'artwork-files';
