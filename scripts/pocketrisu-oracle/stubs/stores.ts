// Replaces PocketRisu's src/ts/stores.svelte.ts inside the oracle runner. The
// real module binds window listeners and pulls in the whole GUI store graph;
// message rendering only reads the database handle and the selected character.
import { writable } from 'svelte/store'

export const DBState: { db: any } = { db: {} }
export const selIdState = { selId: 0 }
export const selectedCharID = writable(0)
export const CharEmotion = writable({} as Record<string, [string, string, number][]>)
export const ReloadChatPointer = writable({} as Record<number, number>)
export const CurrentTriggerIdStore = writable<string | null>(null)
export const moduleBackgroundEmbedding = writable('')
export const alertStore = writable({ type: 'none', msg: '' })
export const ScrollToMessageStore = { value: -1 }

export function createSimpleCharacter(char: any) {
    if (!char) return null
    return {
        type: 'simple',
        customscript: char.customscript,
        chaId: char.chaId,
        additionalAssets: char.additionalAssets,
        additionalAssetManifest: char.additionalAssetManifest,
        virtualscript: char.virtualscript,
        emotionImages: char.emotionImages,
        triggerscript: char.triggerscript,
    }
}
