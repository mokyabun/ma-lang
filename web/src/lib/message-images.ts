import type { CharacterAsset, ModuleAsset } from '@malang/shared'

import { assetUrl } from './api'

export type MessageImageAsset = Pick<
    CharacterAsset | ModuleAsset,
    'assetId' | 'extension' | 'mimeType' | 'name' | 'sourceUri' | 'type'
>

const EMOTION_TAG = /<emotion\s*=\s*["']([^"']+)["']\s*\/?\s*>/gi
const RISU_IMAGE_TAG = /<img\s*=\s*["']([^"']+)["']\s*\/?\s*>/gi
const RISU_ASSET_TAG = /\{\{\s*(img|image|emotion|asset)\s*::\s*([^{}]+?)\s*}}/gi
const HTML_IMAGE_SOURCE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi
const MARKDOWN_IMAGE_SOURCE = /(!\[[^\]]*]\(\s*)(<[^>]+>|[^\s)]+)([^)]*\))/g
const LOCAL_ASSET_PATH = /^\/api\/v1\/assets\/[0-9a-f-]+$/i
const ABSOLUTE_IMAGE_SOURCE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i

export function expandMessageImages(
    value: string,
    assets: MessageImageAsset[],
    seed: string,
): string {
    const imageAssets = assets.filter((asset) => asset.mimeType.startsWith('image/'))

    return (
        value
            // These shorthands are Malang extensions; PocketRisu shows an unresolved one as text.
            .replace(EMOTION_TAG, (full, rawName: string) => {
                const asset = findImageAsset(imageAssets, rawName, seed)
                return asset ? imageMarkup(asset, rawName, 'malang-emotion-image') : full
            })
            .replace(RISU_IMAGE_TAG, (full, rawValue: string) => {
                if (LOCAL_ASSET_PATH.test(rawValue)) {
                    return `<img class="malang-message-image" src="${rawValue}" alt="" loading="lazy" decoding="async">`
                }
                const asset = findImageAsset(imageAssets, rawValue, seed)
                return asset ? imageMarkup(asset, rawValue) : full
            })
            .replace(RISU_ASSET_TAG, (_full, rawType: string, rawName: string) => {
                const asset = findImageAsset(imageAssets, rawName, seed)
                if (!asset) return ''
                const image = imageMarkup(
                    asset,
                    rawName,
                    rawType.toLocaleLowerCase() === 'emotion' ? 'malang-emotion-image' : '',
                )
                return rawType.toLocaleLowerCase() === 'image'
                    ? `<div class="risu-inlay-image">${image}</div>`
                    : image
            })
            .replace(
                HTML_IMAGE_SOURCE,
                (full, prefix: string, quote: string, rawSource: string) => {
                    const source = resolveRelativeImageSource(imageAssets, rawSource, seed)
                    return source ? `${prefix}${quote}${source}${quote}` : full
                },
            )
            .replace(
                MARKDOWN_IMAGE_SOURCE,
                (full, prefix: string, rawSource: string, suffix: string) => {
                    const bracketed = rawSource.startsWith('<') && rawSource.endsWith('>')
                    const sourceValue = bracketed ? rawSource.slice(1, -1) : rawSource
                    const source = resolveRelativeImageSource(imageAssets, sourceValue, seed)
                    if (!source) return full
                    return `${prefix}${bracketed ? `<${source}>` : source}${suffix}`
                },
            )
    )
}

function resolveRelativeImageSource(
    assets: MessageImageAsset[],
    rawSource: string,
    seed: string,
): string | undefined {
    const source = rawSource.trim()
    if (!source || ABSOLUTE_IMAGE_SOURCE.test(source)) return undefined
    const asset = findImageAsset(assets, decodeURIComponentSafe(source), seed)
    return asset ? assetUrl(asset.assetId) : undefined
}

function findImageAsset(assets: MessageImageAsset[], rawName: string, seed: string) {
    const target = normalizeAssetName(rawName)
    if (!target) return undefined

    const exact = assets.filter((asset) => normalizeAssetName(asset.name) === target)
    const variants = exact.length
        ? exact
        : assets.filter((asset) => normalizeAssetFamily(asset) === target)
    if (!variants.length) return undefined
    return variants[stableIndex(seed + target, variants.length)]
}

function normalizeAssetFamily(asset: MessageImageAsset): string {
    let name = asset.name.trim()
    const extension = asset.extension.trim().replace(/^\./, '')
    if (extension) name = name.replace(new RegExp(`\\.${escapeRegex(extension)}$`, 'i'), '')
    name = name.replace(/\.\d+$/, '')
    return normalizeAssetName(name)
}

function normalizeAssetName(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase()
        .replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, '')
        .replace(/[^\p{L}\p{N}]+/gu, '')
}

function stableIndex(seed: string, length: number): number {
    let hash = 0
    for (const character of seed) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
    return hash % length
}

function imageMarkup(asset: MessageImageAsset, alt: string, variantClass = ''): string {
    const className = ['malang-message-image', variantClass].filter(Boolean).join(' ')
    return `<img class="${className}" src="${assetUrl(asset.assetId)}" alt="${escapeAttribute(alt)}" loading="lazy" decoding="async">`
}

function escapeAttribute(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeURIComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}
