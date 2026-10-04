-- Assets imported before their extension had a known MIME type (notably AVIF) were stored as
-- application/octet-stream, so clients never rendered them. Recover the type from linked extensions.
UPDATE `assets`
SET `mime_type` = `recovered`.`mime`
FROM (
    SELECT `asset_id`, MIN(CASE lower(ltrim(`extension`, '.'))
            WHEN 'png' THEN 'image/png'
            WHEN 'jpg' THEN 'image/jpeg'
            WHEN 'jpeg' THEN 'image/jpeg'
            WHEN 'webp' THEN 'image/webp'
            WHEN 'gif' THEN 'image/gif'
            WHEN 'avif' THEN 'image/avif'
            WHEN 'svg' THEN 'image/svg+xml'
            WHEN 'bmp' THEN 'image/bmp'
            WHEN 'ico' THEN 'image/x-icon'
            WHEN 'mp3' THEN 'audio/mpeg'
            WHEN 'wav' THEN 'audio/wav'
            WHEN 'ogg' THEN 'audio/ogg'
            WHEN 'mp4' THEN 'video/mp4'
            WHEN 'webm' THEN 'video/webm'
            WHEN 'json' THEN 'application/json'
        END) AS `mime`
    FROM (
        SELECT `asset_id`, `extension` FROM `prompt_module_assets`
        UNION ALL
        SELECT `asset_id`, `extension` FROM `character_assets`
    )
    GROUP BY `asset_id`
) AS `recovered`
WHERE `recovered`.`asset_id` = `assets`.`id`
    AND `recovered`.`mime` IS NOT NULL
    AND `assets`.`mime_type` = 'application/octet-stream';
