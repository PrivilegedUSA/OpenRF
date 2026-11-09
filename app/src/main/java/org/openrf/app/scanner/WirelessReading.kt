package org.openrf.app.scanner

/** Actual Android radio scan data. Neither RSSI nor an identifier establishes a device type or location. */
enum class WirelessMedium { BLE, WIFI }

data class WirelessReading(
    val medium: WirelessMedium,
    val identifier: String,
    val displayName: String,
    val rssiDbm: Int,
    val frequencyMhz: Int?,
    val details: String,
    val seenAtEpochMillis: Long
) {
    val key: String get() = "${medium.name}:$identifier"
}

enum class ScanPhase { IDLE, RUNNING, COMPLETE, UNAVAILABLE, FAILED }

data class ScanStatus(val phase: ScanPhase = ScanPhase.IDLE, val message: String = "No scan started", val completedAtMillis: Long? = null)

data class WirelessScanState(
    val ble: ScanStatus = ScanStatus(),
    val wifi: ScanStatus = ScanStatus(),
    val bleResults: List<WirelessReading> = emptyList(),
    val wifiResults: List<WirelessReading> = emptyList()
)

/** Pure functions tested independently of Android. ScanResult timestamps are microseconds since boot. */
object WirelessScanQuality {
    fun wifiReadingIsFresh(timestampMicros: Long, scanStartElapsedMs: Long, nowElapsedMs: Long): Boolean {
        if (timestampMicros <= 0 || scanStartElapsedMs < 0 || nowElapsedMs < scanStartElapsedMs) return false
        val seenElapsedMs = timestampMicros / 1000L
        return seenElapsedMs <= nowElapsedMs + 1000L &&
            seenElapsedMs >= scanStartElapsedMs - 3000L &&
            nowElapsedMs - seenElapsedMs <= 30_000L
    }

    fun readingEpochMillis(nowEpochMillis: Long, nowElapsedMs: Long, seenElapsedMs: Long): Long =
        nowEpochMillis - (nowElapsedMs - seenElapsedMs).coerceAtLeast(0L)
}
