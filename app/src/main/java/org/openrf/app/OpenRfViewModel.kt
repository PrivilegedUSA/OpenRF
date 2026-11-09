package org.openrf.app

import android.app.Application
import android.location.Location
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.openrf.app.data.InvestigationSession
import org.openrf.app.data.Observation
import org.openrf.app.data.ObservationRepository
import org.openrf.app.data.ObservationValidator
import org.openrf.app.data.OpenRfDatabase
import org.openrf.app.data.RoomObservationRepository
import org.openrf.app.data.SessionReading
import org.openrf.app.data.SessionRepository
import org.openrf.app.data.SessionScan
import org.openrf.app.data.SessionStatus
import org.openrf.app.scanner.WirelessMedium
import org.openrf.app.scanner.WirelessReading
import java.util.concurrent.TimeUnit

class OpenRfViewModel(
    application: Application,
    private val repository: ObservationRepository,
    private val sessionRepository: SessionRepository
) : AndroidViewModel(application) {
    val observations = repository.observations.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val sessions = sessionRepository.sessions.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val activeSession = sessionRepository.active.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val sessionMutex = Mutex()
    private val mutableSessionReady = MutableStateFlow(false)
    val sessionReady = mutableSessionReady.asStateFlow()
    private val mutableSessionMessage = MutableStateFlow("")
    val sessionMessage = mutableSessionMessage.asStateFlow()

    init {
        // If Android killed the process, we must not silently resume a session as a background recorder.
        viewModelScope.launch {
            sessionMutex.withLock {
                try { sessionRepository.recoverInterrupted() }
                catch (_: Exception) { mutableSessionMessage.value = "Could not initialize investigation storage." }
                finally { mutableSessionReady.value = true }
            }
        }
    }

    fun add(title: String, category: String, notes: String, lat: Double, lon: Double, accuracy: Float?) {
        if (!ObservationValidator.valid(title, lat, lon, accuracy)) return
        viewModelScope.launch {
            repository.add(Observation(
                title = title.trim(), category = category, notes = notes.trim().take(2000),
                latitude = lat, longitude = lon, accuracyMeters = accuracy,
                recordedAtEpochMillis = System.currentTimeMillis()
            ))
        }
    }

    /** Save only on an explicit tap; receiver coordinates are never the transmitter coordinates. */
    fun saveWireless(reading: WirelessReading, phoneLocation: Location) {
        val accuracy = if (phoneLocation.hasAccuracy()) phoneLocation.accuracy else null
        val lat = phoneLocation.latitude
        val lon = phoneLocation.longitude
        val label = when (reading.medium) {
            WirelessMedium.BLE -> "BLE advertiser"
            WirelessMedium.WIFI -> "Wi-Fi access point"
        }
        val title = "$label: ${reading.displayName}".take(120)
        if (!ObservationValidator.valid(title, lat, lon, accuracy)) return
        val notes = "Receiver-side survey only; coordinates mark PHONE at save time, not signal source. " +
            "Identifier: ${reading.identifier}. RSSI: ${reading.rssiDbm} dBm. " +
            (reading.frequencyMhz?.let { "Frequency: $it MHz. " } ?: "BLE frequency/channel not measured. ") +
            "Seen at: ${java.time.Instant.ofEpochMilli(reading.seenAtEpochMillis)}. " + reading.details
        viewModelScope.launch {
            repository.add(Observation(
                title = title, category = label, notes = notes.take(2000),
                latitude = lat, longitude = lon, accuracyMeters = accuracy,
                recordedAtEpochMillis = reading.seenAtEpochMillis,
                source = if (reading.medium == WirelessMedium.BLE) "BLE_SCAN" else "WIFI_SCAN",
                verification = "UNIDENTIFIED"
            ))
        }
    }

    fun delete(record: Observation) { viewModelScope.launch { repository.delete(record) } }

    fun startSession(name: String) {
        if (name.isBlank() || !mutableSessionReady.value) return
        viewModelScope.launch {
            sessionMutex.withLock {
                try {
                    if (sessionRepository.activeOnce() == null) {
                        sessionRepository.start(name, System.currentTimeMillis())
                        mutableSessionMessage.value = "Session started. Open Scanner and run scans to capture results."
                    }
                } catch (_: Exception) { mutableSessionMessage.value = "Unable to start session. Check local storage." }
            }
        }
    }

    /** Invoked on explicit Stop or on app backgrounding. Never starts an Android background service. */
    fun stopSession(interrupted: Boolean = false) {
        if (!mutableSessionReady.value) return
        viewModelScope.launch {
            sessionMutex.withLock {
                try {
                    if (sessionRepository.activeOnce() != null) {
                        sessionRepository.stop(System.currentTimeMillis(), interrupted)
                        mutableSessionMessage.value = if (interrupted) "Session ended when OpenRF left the foreground." else "Session ended and saved locally."
                    }
                } catch (_: Exception) { mutableSessionMessage.value = "Unable to finish session. Check local storage." }
            }
        }
    }

    /** Persist one completed scan atomically. Zero-result scans are retained; failures are not recorded as completed. */
    fun captureScan(
        sessionId: Long, medium: WirelessMedium, readings: List<WirelessReading>, completedAtMillis: Long,
        onStored: (Long?) -> Unit
    ) {
        viewModelScope.launch {
            val stored = sessionMutex.withLock {
                try {
                    if (sessionRepository.get(sessionId)?.status != SessionStatus.ACTIVE) null
                    else {
                        val safeReadings = readings.filter { it.medium == medium && it.identifier.isNotBlank() }.take(200)
                        sessionRepository.capture(
                            SessionScan(sessionId = sessionId, medium = medium.name,
                                completedAtEpochMillis = completedAtMillis, resultCount = safeReadings.size),
                            safeReadings.map { reading ->
                                SessionReading(
                                    scanId = 0, identifier = reading.identifier.take(128),
                                    displayName = reading.displayName.take(120), rssiDbm = reading.rssiDbm,
                                    frequencyMhz = reading.frequencyMhz, details = reading.details.take(400),
                                    seenAtEpochMillis = reading.seenAtEpochMillis
                                )
                            }
                        )
                    }
                } catch (_: Exception) {
                    mutableSessionMessage.value = "A scan could not be saved to the session."
                    null
                }
            }
            onStored(stored)
        }
    }

    fun attachScanLocation(scanId: Long, location: Location) {
        if (scanId <= 0) return
        val elapsedAgeMs = TimeUnit.NANOSECONDS.toMillis(android.os.SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos)
        if (elapsedAgeMs !in 0..60_000L) return
        val lat = location.latitude
        val lon = location.longitude
        val accuracy = if (location.hasAccuracy()) location.accuracy else null
        if (!ObservationValidator.valid("Session receiver position", lat, lon, accuracy)) return
        viewModelScope.launch {
            try { sessionRepository.attachPhoneFix(scanId, lat, lon, accuracy) } catch (_: Exception) { /* Fix remains unknown. */ }
        }
    }

    fun scansForSession(id: Long) = sessionRepository.scans(id)
    fun readingsForSession(id: Long) = sessionRepository.readings(id)

    fun deleteSession(session: InvestigationSession) {
        viewModelScope.launch {
            sessionMutex.withLock {
                try {
                    if (sessionRepository.get(session.id)?.status != SessionStatus.ACTIVE)
                        sessionRepository.delete(session)
                } catch (_: Exception) { mutableSessionMessage.value = "Unable to delete session." }
            }
        }
    }

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val db = OpenRfDatabase.get(application)
                return OpenRfViewModel(application, RoomObservationRepository(db.observations()),
                    SessionRepository(db.sessions())) as T
            }
        }
    }
}
