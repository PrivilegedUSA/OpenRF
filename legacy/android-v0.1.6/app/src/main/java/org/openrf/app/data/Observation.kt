package org.openrf.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Human-authored records only in 0.1.0. Do not reinterpret these as sensor detections. */
@Entity(tableName = "observations")
data class Observation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val category: String,
    val notes: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val recordedAtEpochMillis: Long,
    val source: String = "MANUAL",
    val verification: String = "UNVERIFIED"
)

object ObservationCategories {
    val all = listOf("ALPR candidate", "Camera candidate", "RF point of interest", "Other infrastructure", "Field note")
}

/** No Android dependency: validated in JVM tests. */
object ObservationValidator {
    fun valid(title: String, latitude: Double, longitude: Double, accuracyMeters: Float?): Boolean =
        title.isNotBlank() && title.trim().length <= 120 &&
            latitude.isFinite() && latitude in -90.0..90.0 &&
            longitude.isFinite() && longitude in -180.0..180.0 &&
            (accuracyMeters == null || (accuracyMeters.isFinite() && accuracyMeters >= 0f))
}
