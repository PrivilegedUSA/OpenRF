package org.openrf.app.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/** Private, explicit foreground-only survey; a session is not a GPS route. */
@Entity(tableName = "investigation_sessions")
data class InvestigationSession(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val startedAtEpochMillis: Long,
    val endedAtEpochMillis: Long? = null,
    val status: String = SessionStatus.ACTIVE
)

object SessionStatus {
    const val ACTIVE = "ACTIVE"
    const val COMPLETED = "COMPLETED"
    const val INTERRUPTED = "INTERRUPTED"
}

/** A completed, user-triggered radio scan, including successful scans with zero results.
 *  Nullable coordinates are a PHONE fix taken near the scan, never an estimated transmitter position.
 */
@Entity(
    tableName = "session_scans",
    foreignKeys = [ForeignKey(
        entity = InvestigationSession::class, parentColumns = ["id"], childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("sessionId")]
)
data class SessionScan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val medium: String,
    val completedAtEpochMillis: Long,
    val resultCount: Int,
    val phoneLatitude: Double? = null,
    val phoneLongitude: Double? = null,
    val phoneAccuracyMeters: Float? = null
)

/** Readings are snapshots, not continuous RF samples or confirmed device identities. */
@Entity(
    tableName = "session_readings",
    foreignKeys = [ForeignKey(
        entity = SessionScan::class, parentColumns = ["id"], childColumns = ["scanId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("scanId")]
)
data class SessionReading(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val scanId: Long,
    val identifier: String,
    val displayName: String,
    val rssiDbm: Int,
    val frequencyMhz: Int?,
    val details: String,
    val seenAtEpochMillis: Long
)
