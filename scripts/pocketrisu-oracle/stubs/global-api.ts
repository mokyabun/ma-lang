// Replaces PocketRisu's src/ts/globalApi.svelte.ts inside the oracle runner.
// Parity scenarios carry no stored assets, so every asset lookup is empty.
export const aiWatermarkingLawApplies = () => false
export const getFileSrc = async () => ''
export const prefetchAssetManifests = async () => {}
export const resolvePrioritizedAssetManifestNames = async () => []
export const loadAssetManifestItems = async () => []
export const downloadFile = async () => {}
export const readImage = async () => new Uint8Array()
export const saveAsset = async () => ''
export const forageStorage = {}
export class AppendableBuffer {}
export class LocalWriter {}
export class VirtualWriter {}
