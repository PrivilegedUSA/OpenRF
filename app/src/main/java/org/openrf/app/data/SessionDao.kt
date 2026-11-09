package org.openrf.app.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {
    @Query("SELECT * FROM investigation_sessions ORDER BY startedAtEpochMillis DESC, id DESC")
    fun allSessions(): Flow<List<InvestigationSession>>

    @Query("SELECT * FROM investigation_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1")
    fun activeSession(): Flow<InvestigationSession?>

    @Query("SELECT * FROM investigation_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1")
    suspend fun activeOnce(): InvestigationSession?

    @Query("SELECT * FROM investigation_sessions WHERE id = :id LIMIT 1")
    suspend fun sessionOnce(id: Long): InvestigationSession?

    @Insert
    suspend fun insertSession(session: InvestigationSession): Long

    @Query("UPDATE investigation_sessions SET status = :status, endedAtEpochMillis = :endedAt WHERE status = 'ACTIVE'")
    suspend fun finishActive(status: String, endedAt: Long)

    // If Android killed the process unexpectedly, the actual end time is unknown.
    @Query("UPDATE investigation_sessions SET status = 'INTERRUPTED' WHERE status = 'ACTIVE'")
    suspend fun recoverUnfinished()

    @Insert
    suspend fun insertScan(scan: SessionScan): Long

    @Insert
    suspend fun insertReadings(readings: List<SessionReading>)

    @Transaction
    suspend fun capture(scan: SessionScan, readings: List<SessionReading>): Long {
        val scanId = insertScan(scan)
        if (readings.isNotEmpty()) insertReadings(readings.map { it.copy(scanId = scanId) })
        return scanId
    }

    @Query("UPDATE session_scans SET phoneLatitude = :lat, phoneLongitude = :lon, phoneAccuracyMeters = :accuracy WHERE id = :id")
    suspend fun attachPhoneFix(id: Long, lat: Double, lon: Double, accuracy: Float?)

    @Query("SELECT * FROM session_scans WHERE sessionId = :id ORDER BY completedAtEpochMillis DESC, id DESC")
    fun scans(id: Long): Flow<List<SessionScan>>

    @Query("SELECT session_readings.* FROM session_readings INNER JOIN session_scans ON session_scans.id = session_readings.scanId WHERE session_scans.sessionId = :id ORDER BY session_readings.seenAtEpochMillis DESC, session_readings.id DESC")
    fun readings(id: Long): Flow<List<SessionReading>>

    @Delete
    suspend fun deleteSession(session: InvestigationSession)
}
