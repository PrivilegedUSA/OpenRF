package org.openrf.app.scanner

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Foreground, user-initiated discovery only. Disposed whenever Scanner leaves the screen. */
class WirelessScanController(context: Context) {
    private val app = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val wifiManager = app.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private val bluetoothManager = app.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val locationManager = app.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    private val mutable = MutableStateFlow(WirelessScanState())
    val state = mutable.asStateFlow()
    private var closed = false
    private var wifiRegistered = false
    private var wifiStartMs = 0L
    private var bluetoothCallback: ScanCallback? = null
    private var bleScanner: android.bluetooth.le.BluetoothLeScanner? = null
    private var bleStopTask: Runnable? = null
    private var wifiTimeoutTask: Runnable? = null

    fun supported(medium: WirelessMedium): Boolean = when (medium) {
        WirelessMedium.WIFI -> app.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI) && wifiManager != null
        WirelessMedium.BLE -> app.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) && bluetoothManager != null
    }

    fun requiredPermissions(medium: WirelessMedium): Array<String> = buildList {
        // Wi-Fi scan APIs need precise location on modern Android; BLE uses coordinates for survey notes.
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (medium == WirelessMedium.BLE && Build.VERSION.SDK_INT >= 31) {
            add(Manifest.permission.BLUETOOTH_SCAN)
            add(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }.toTypedArray()

    fun hasPermissions(medium: WirelessMedium): Boolean = requiredPermissions(medium).all {
        ContextCompat.checkSelfPermission(app, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun locationEnabled(): Boolean = try {
        if (Build.VERSION.SDK_INT >= 28) locationManager?.isLocationEnabled == true
        else locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
            locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
    } catch (_: Exception) { false }

    fun start(medium: WirelessMedium) {
        if (closed) return
        if (!supported(medium)) { status(medium, ScanPhase.UNAVAILABLE, "Radio not supported on this phone"); return }
        if (!hasPermissions(medium)) { status(medium, ScanPhase.UNAVAILABLE, "Permission missing: allow Precise Location${if (medium == WirelessMedium.BLE) " and Nearby devices" else ""}"); return }
        if (!locationEnabled()) { status(medium, ScanPhase.UNAVAILABLE, "Enable Android Location services to scan"); return }
        when (medium) {
            WirelessMedium.BLE -> startBle()
            WirelessMedium.WIFI -> startWifi()
        }
    }

    private fun status(medium: WirelessMedium, phase: ScanPhase, message: String) {
        val next = ScanStatus(phase, message, if (phase == ScanPhase.COMPLETE || phase == ScanPhase.FAILED) System.currentTimeMillis() else null)
        mutable.update { old ->
            if (medium == WirelessMedium.BLE) old.copy(ble = next) else old.copy(wifi = next)
        }
    }

    @SuppressLint("MissingPermission") // hasPermissions checked before this method; guarded SecurityException
    private fun startBle() {
        stopBle(updateStatus = false)
        mutable.update { it.copy(bleResults = emptyList()) }
        try {
            val adapter = bluetoothManager?.adapter
            if (adapter == null || !adapter.isEnabled) {
                status(WirelessMedium.BLE, ScanPhase.UNAVAILABLE, "Turn Bluetooth on in Android settings")
                return
            }
            val scanner = adapter.bluetoothLeScanner
            if (scanner == null) { status(WirelessMedium.BLE, ScanPhase.UNAVAILABLE, "BLE scanner is unavailable"); return }
            val callback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    handler.post { if (!closed && bluetoothCallback === this) recordBle(result) }
                }
                override fun onBatchScanResults(results: MutableList<ScanResult>) {
                    handler.post { if (!closed && bluetoothCallback === this) results.forEach(::recordBle) }
                }
                override fun onScanFailed(errorCode: Int) {
                    handler.post {
                        if (!closed && bluetoothCallback === this) {
                            stopBle(updateStatus = false)
                            status(WirelessMedium.BLE, ScanPhase.FAILED, "BLE scan error $errorCode. Try again after a short pause")
                        }
                    }
                }
            }
            bluetoothCallback = callback
            bleScanner = scanner
            status(WirelessMedium.BLE, ScanPhase.RUNNING, "Scanning BLE advertisements for 12 seconds")
            scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), callback)
            bleStopTask = Runnable { stopBle() }.also { handler.postDelayed(it, 12_000L) }
        } catch (_: SecurityException) {
            stopBle(updateStatus = false)
            status(WirelessMedium.BLE, ScanPhase.FAILED, "Bluetooth permission was revoked")
        } catch (_: RuntimeException) {
            stopBle(updateStatus = false)
            status(WirelessMedium.BLE, ScanPhase.FAILED, "BLE scan could not start")
        }
    }

    @SuppressLint("MissingPermission")
    private fun recordBle(result: ScanResult) {
        if (mutable.value.ble.phase != ScanPhase.RUNNING) return
        val address = try { result.device.address ?: "unknown" } catch (_: SecurityException) { "unknown" }
        if (address == "unknown") return // Don't conflate separate anonymous devices.
        val advertisedName = result.scanRecord?.deviceName?.trim().orEmpty()
        val name = if (advertisedName.isNotEmpty()) advertisedName.take(80) else "Unnamed BLE advertiser"
        val nowElapsedMs = SystemClock.elapsedRealtime()
        val seenElapsedMs = result.timestampNanos / 1_000_000L
        if (seenElapsedMs <= 0 || nowElapsedMs - seenElapsedMs !in 0..30_000L) return
        val reading = WirelessReading(WirelessMedium.BLE, address, name, result.rssi,
            null, "BLE advertisement · identifier may rotate", WirelessScanQuality.readingEpochMillis(System.currentTimeMillis(), nowElapsedMs, seenElapsedMs))
        mutable.update { old ->
            val updated = (old.bleResults.filterNot { it.key == reading.key } + reading)
                .sortedByDescending { it.rssiDbm }.take(150)
            old.copy(bleResults = updated)
        }
    }

    @SuppressLint("MissingPermission")
    fun stopBle(updateStatus: Boolean = true) {
        bleStopTask?.let { handler.removeCallbacks(it) }
        bleStopTask = null
        val callback = bluetoothCallback
        bluetoothCallback = null
        if (callback != null) try { bleScanner?.stopScan(callback) } catch (_: SecurityException) {
            // Revoked while scanning; still clear local state.
        } catch (_: RuntimeException) { }
        bleScanner = null
        if (updateStatus && mutable.value.ble.phase == ScanPhase.RUNNING) {
            status(WirelessMedium.BLE, ScanPhase.COMPLETE, "BLE scan ended · results are a saved-in-memory snapshot, not live")
        }
    }

    private val wifiReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (closed || mutable.value.wifi.phase != ScanPhase.RUNNING || intent.action != WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) return
            wifiTimeoutTask?.let { handler.removeCallbacks(it) }
            wifiTimeoutTask = null
            unregisterWifi()
            if (!intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false)) {
                status(WirelessMedium.WIFI, ScanPhase.FAILED, "No new Wi-Fi scan results (possibly throttled); old cached readings not shown")
            } else readWifiResults()
        }
    }

    @SuppressLint("MissingPermission")
    private fun startWifi() {
        cancelWifi()
        mutable.update { it.copy(wifiResults = emptyList()) }
        try {
            val wifi = wifiManager
            if (wifi == null || !wifi.isWifiEnabled) {
                status(WirelessMedium.WIFI, ScanPhase.UNAVAILABLE, "Turn Wi-Fi on in Android settings")
                return
            }
            wifiStartMs = SystemClock.elapsedRealtime()
            val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
            if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(wifiReceiver, filter, Context.RECEIVER_EXPORTED)
            else app.registerReceiver(wifiReceiver, filter)
            wifiRegistered = true
            status(WirelessMedium.WIFI, ScanPhase.RUNNING, "Requesting one foreground Wi-Fi scan")
            if (wifi.startScan()) {
                wifiTimeoutTask = Runnable {
                    unregisterWifi()
                    status(WirelessMedium.WIFI, ScanPhase.FAILED, "Wi-Fi scan timed out; no cached results displayed")
                }.also { handler.postDelayed(it, 15_000L) }
            } else {
                unregisterWifi()
                status(WirelessMedium.WIFI, ScanPhase.FAILED, "Scan request denied or throttled by Android. Wait before trying again")
            }
        } catch (_: SecurityException) {
            unregisterWifi()
            status(WirelessMedium.WIFI, ScanPhase.FAILED, "Wi-Fi scan permission missing or Location services disabled")
        } catch (_: RuntimeException) {
            unregisterWifi()
            status(WirelessMedium.WIFI, ScanPhase.FAILED, "Wi-Fi scan could not start")
        }
    }

    @SuppressLint("MissingPermission")
    private fun readWifiResults() {
        try {
            val nowElapsed = SystemClock.elapsedRealtime()
            val nowEpoch = System.currentTimeMillis()
            val observations = wifiManager?.scanResults.orEmpty()
                .filter { WirelessScanQuality.wifiReadingIsFresh(it.timestamp, wifiStartMs, nowElapsed) }
                .mapNotNull { item ->
                    val bssid = item.BSSID?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                    WirelessReading(
                        WirelessMedium.WIFI, bssid,
                        item.SSID?.takeIf { it.isNotBlank() }?.take(80) ?: "Hidden / unnamed SSID",
                        item.level, item.frequency,
                        "Wi-Fi access point · ${item.capabilities?.take(90).orEmpty()}",
                        WirelessScanQuality.readingEpochMillis(nowEpoch, nowElapsed, item.timestamp / 1000L)
                    )
                }.distinctBy { it.key }.sortedByDescending { it.rssiDbm }.take(200)
            mutable.update { it.copy(wifiResults = observations) }
            status(WirelessMedium.WIFI, ScanPhase.COMPLETE,
                if (observations.isEmpty()) "Scan finished; no fresh Wi-Fi observations returned" else "Wi-Fi scan complete · snapshot, not continuous live data")
        } catch (_: SecurityException) {
            status(WirelessMedium.WIFI, ScanPhase.FAILED, "Wi-Fi scan results unavailable; check Precise Location")
        } catch (_: RuntimeException) {
            status(WirelessMedium.WIFI, ScanPhase.FAILED, "Could not read Wi-Fi scan results")
        }
    }

    private fun unregisterWifi() {
        if (wifiRegistered) {
            try { app.unregisterReceiver(wifiReceiver) } catch (_: IllegalArgumentException) { }
            wifiRegistered = false
        }
    }
    private fun cancelWifi() {
        wifiTimeoutTask?.let { handler.removeCallbacks(it) }
        wifiTimeoutTask = null
        unregisterWifi()
    }

    /** Stop scans when Android takes the activity out of the foreground; keep snapshot but mark it not live. */
    fun pause() {
        if (closed) return
        stopBle()
        if (mutable.value.wifi.phase == ScanPhase.RUNNING) {
            cancelWifi()
            status(WirelessMedium.WIFI, ScanPhase.FAILED, "Scan interrupted when app left foreground; retry on return")
        }
    }

    fun close() {
        if (closed) return
        closed = true
        stopBle(updateStatus = false)
        cancelWifi()
    }
}
