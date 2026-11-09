package org.openrf.app.sensor

/** Future receiver drivers implement this contract; v0.1.0 has no active scanner. */
interface SensorSource {
    val id: String
    val capabilities: Set<String>
    suspend fun connect(): SensorConnectionState
    suspend fun disconnect()
}

enum class SensorConnectionState { UNSUPPORTED, DISCONNECTED, CONNECTING, CONNECTED, FAILED }
