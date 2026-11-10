package org.openrf.app.data

import kotlinx.coroutines.flow.Flow

/** Keep database details out of UI and receiver interfaces. */
class SessionRepository(private val dao: SessionDao) {
    val sessions: Flow<List<InvestigationSession>> = dao.allSessions()
    val active: Flow<InvestigationSession?> = dao.activeSession()

    suspend fun recoverInterrupted() = dao.recoverUnfinished()
    suspend fun activeOnce() = dao.activeOnce()
    suspend fun get(id: Long) = dao.sessionOnce(id)
    suspend fun start(name: String, now: Long): Long = dao.insertSession(
        InvestigationSession(name = name.trim().take(80), startedAtEpochMillis = now)
    )
    suspend fun stop(now: Long, interrupted: Boolean) = dao.finishActive(
        if (interrupted) SessionStatus.INTERRUPTED else SessionStatus.COMPLETED, now
    )
    suspend fun capture(scan: SessionScan, readings: List<SessionReading>): Long = dao.capture(scan, readings)
    suspend fun attachPhoneFix(scanId: Long, latitude: Double, longitude: Double, accuracyMeters: Float?) =
        dao.attachPhoneFix(scanId, latitude, longitude, accuracyMeters)
    fun scans(id: Long): Flow<List<SessionScan>> = dao.scans(id)
    fun readings(id: Long): Flow<List<SessionReading>> = dao.readings(id)
    suspend fun delete(session: InvestigationSession) = dao.deleteSession(session)
}
