-- Copy PocketRisu bias pairs kept in imported sources into the new columns.
UPDATE `prompt_presets` SET `bias_json` = (
    SELECT json_group_array(json(`pair`)) FROM (
        SELECT json_array(json_extract(`value`, '$[0]'), json_extract(`value`, '$[1]')) AS `pair`
        FROM json_each(`prompt_presets`.`source_json`, '$.bias')
        WHERE json_type(`value`, '$[0]') = 'text' AND json_type(`value`, '$[1]') IN ('integer', 'real')
        ORDER BY `key`
    )
)
WHERE json_type(`source_json`, '$.bias') = 'array';
--> statement-breakpoint
UPDATE `characters` SET `bias_json` = (
    SELECT json_group_array(json(`pair`)) FROM (
        SELECT json_array(json_extract(`value`, '$[0]'), json_extract(`value`, '$[1]')) AS `pair`
        FROM json_each(`characters`.`source_extensions_json`, '$.risuai.bias')
        WHERE json_type(`value`, '$[0]') = 'text' AND json_type(`value`, '$[1]') IN ('integer', 'real')
        ORDER BY `key`
    )
)
WHERE json_type(`source_extensions_json`, '$.risuai.bias') = 'array';
