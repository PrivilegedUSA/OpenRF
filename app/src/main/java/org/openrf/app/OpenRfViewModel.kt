package org.openrf.app

import android.app.Application
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
