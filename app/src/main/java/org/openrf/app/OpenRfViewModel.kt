package org.openrf.app

import android.app.Application
import android.location.Location
import org.openrf.app.scanner.WirelessMedium
import org.openrf.app.scanner.WirelessReading
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import org.openrf.app.data.Observation
import org.openrf.app.data.ObservationRepository
import org.openrf.app.data.ObservationValidator
import org.openrf.app.data.OpenRfDatabase
import org.openrf.app.data.RoomObservationRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class OpenRfViewModel(application: Application, private val repository: ObservationRepository) : AndroidViewModel(application) {
    val observations = repository.observations.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

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

    /** Save only when the user explicitly chooses a radio observation; this is the PHONE location, not emitter position. */
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

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val db = OpenRfDatabase.get(application)
                return OpenRfViewModel(application, RoomObservationRepository(db.observations())) as T
            }
        }
    }
}
