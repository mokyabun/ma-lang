// Keep in sync with migrations/0001_asset_mime_types.sql, which repairs assets imported before an
// extension was listed here.
const MIME_BY_EXTENSION: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    json: 'application/json',
}

/** Imported card/module assets only carry a file extension, so derive the stored MIME type from it. */
export function mimeFromExtension(extension: string): string {
    return (
        MIME_BY_EXTENSION[extension.toLowerCase().replace(/^\./, '')] ?? 'application/octet-stream'
    )
}
