import type { Store } from '@/db'
import type { SystemLogService } from '@/modules/system/logs'

export class DebugService {
    constructor(
        private readonly store: Store,
        private readonly systemLogs: SystemLogService,
    ) {}

    requestLogs() {
        return this.store.generation.requestLogs(this.systemLogs.requestLogCutoff())
    }

    /** Hides request logs up to now and drops the stored request bodies. */
    clearRequestLogs() {
        const deletedDetails = this.store.requestDebug.clear()
        const cutoff = this.systemLogs.clearRequestLogs(this.store.generation.requestLogCursor())
        return { deletedDetails, cutoff }
    }

    usage() {
        return this.store.generation.usage()
    }

    requestLog(id: string) {
        return this.store.generation.requestLogDetail(id)
    }

    listRequests() {
        return this.store.requestDebug.list()
    }

    clearRequests() {
        return this.store.requestDebug.clear()
    }
}
