package org.openrf.app.feature.scanner

import android.location.Location
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.openrf.app.location.PhoneLocationSource
import org.openrf.app.scanner.ScanPhase
import org.openrf.app.scanner.ScanStatus
import org.openrf.app.scanner.WirelessMedium
import org.openrf.app.scanner.WirelessReading
import org.openrf.app.scanner.WirelessScanController
import java.text.DateFormat
import java.util.Date

/** Only explicit, bounded foreground scans. Results disappear on leaving this screen unless saved. */
@Composable
fun ScannerScreen(onSave: (WirelessReading, Location) -> Unit) {
    val context = LocalContext.current
    val controller = remember(context) { WirelessScanController(context) }
    val state by controller.state.collectAsStateWithLifecycle()
    val locationSource = remember(context) { PhoneLocationSource(context) }
    val lifecycleOwner = LocalLifecycleOwner.current
    var visible by remember { mutableStateOf(true) }
    var pendingPermissionFor by remember { mutableStateOf<WirelessMedium?>(null) }
    var notice by remember { mutableStateOf("") }
    var savingKey by remember { mutableStateOf<String?>(null) }
    val savedKeys = remember { mutableStateListOf<String>() }
    val permissionsLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        val medium = pendingPermissionFor
        pendingPermissionFor = null
        if (medium != null && controller.hasPermissions(medium)) {
            savedKeys.removeAll { it.startsWith("${medium.name}:") }
            controller.start(medium)
        } else notice = "Permission not granted. Allow Precise Location${if (medium == WirelessMedium.BLE) " and Nearby devices" else ""} in Android settings to scan."
    }
    DisposableEffect(controller, lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) controller.pause()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            visible = false
            lifecycleOwner.lifecycle.removeObserver(observer)
            controller.close()
        }
    }

    fun requestScan(medium: WirelessMedium) {
        notice = ""
        if (controller.hasPermissions(medium)) {
            savedKeys.removeAll { it.startsWith("${medium.name}:") }
            controller.start(medium)
        } else {
            pendingPermissionFor = medium
            permissionsLauncher.launch(controller.requiredPermissions(medium))
        }
    }
    fun saveReading(reading: WirelessReading) {
        if (savingKey != null) return
        savingKey = reading.key
        notice = "Finding a current phone location for this survey record…"
        locationSource.currentFix { fix ->
            if (!visible) return@currentFix
            savingKey = null
            val ageMs = if (fix != null) (SystemClock.elapsedRealtimeNanos() - fix.elapsedRealtimeNanos) / 1_000_000L else Long.MAX_VALUE
            if (fix == null || ageMs !in 0..60_000L) {
                notice = "Could not obtain a recent phone location. Reading remains an unsaved scan snapshot; retry with Location services enabled."
            } else {
                onSave(reading, fix)
                savedKeys.add(reading.key)
                notice = "Survey reading saved at your PHONE location. This does not locate or identify the transmitter."
            }
        }
    }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), contentPadding = PaddingValues(vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Wireless discovery", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(5.dp))
            Text("User-started scans only · no background tracking. Signal strength is received power (dBm), not distance or proof of a camera.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (notice.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(notice, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
        item {
            ScannerControls(
                "Bluetooth LE advertisements", controller.supported(WirelessMedium.BLE), state.ble,
                state.bleResults.size, "Nearby Devices + Precise Location. Scans automatically stop after 12 seconds.",
                { requestScan(WirelessMedium.BLE) }, { controller.stopBle() }
            )
        }
        if (state.bleResults.isNotEmpty()) {
            item { Text("BLE snapshot · ${state.bleResults.size} distinct advertisers", style = MaterialTheme.typography.titleSmall) }
            items(state.bleResults, key = { it.key }) { reading ->
                ReadingRow(reading, reading.key in savedKeys, savingKey == reading.key, ::saveReading)
            }
        }
        item {
            ScannerControls(
                "Wi-Fi access points", controller.supported(WirelessMedium.WIFI), state.wifi,
                state.wifiResults.size, "One Android-managed scan per tap. Scan throttling and Location services apply.",
                { requestScan(WirelessMedium.WIFI) }, null
            )
        }
        if (state.wifiResults.isNotEmpty()) {
            item { Text("Wi-Fi snapshot · ${state.wifiResults.size} access points", style = MaterialTheme.typography.titleSmall) }
            items(state.wifiResults, key = { it.key }) { reading ->
                ReadingRow(reading, reading.key in savedKeys, savingKey == reading.key, ::saveReading)
            }
        }
        item {
            HorizontalDivider()
            Text("Save is optional: observations stay in memory only until you leave Scanner. Saved entries appear in Discoveries and CSV export, with source, timestamp, phone coordinates and location accuracy. Bluetooth identifiers may rotate. No Flock, camera, or device-type identification is performed.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(5.dp))
            Text("External SDR, ESP32 and full RF-spectrum analysis are not connected in this release.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ScannerControls(
    title: String, supported: Boolean, status: ScanStatus, count: Int, explanation: String,
    onStart: () -> Unit, onStop: (() -> Unit)?
) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(if (!supported) "Hardware unsupported" else status.message,
                color = if (status.phase == ScanPhase.FAILED || status.phase == ScanPhase.UNAVAILABLE) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodySmall)
            Text(explanation, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onStart, enabled = supported && status.phase != ScanPhase.RUNNING) { Text("Scan now") }
                if (onStop != null && status.phase == ScanPhase.RUNNING) {
                    OutlinedButton(onClick = onStop) { Text("Stop") }
                }
                if (status.phase == ScanPhase.RUNNING) CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
            }
            if (status.phase != ScanPhase.IDLE) {
                Text("$count received${if (status.phase == ScanPhase.COMPLETE) " · not live" else ""}", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun ReadingRow(reading: WirelessReading, saved: Boolean, saving: Boolean, onSave: (WirelessReading) -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(reading.displayName, style = MaterialTheme.typography.titleSmall)
            Text("${reading.medium} · ${reading.identifier}", style = MaterialTheme.typography.bodySmall)
            Text("${reading.rssiDbm} dBm" + (reading.frequencyMhz?.let { " · $it MHz" } ?: " · BLE advertisements"),
                style = MaterialTheme.typography.labelMedium)
            Text(reading.details, style = MaterialTheme.typography.bodySmall)
            Text("Seen ${DateFormat.getDateTimeInstance().format(Date(reading.seenAtEpochMillis))} · reading is a snapshot",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = { onSave(reading) }, enabled = !saved && !saving) {
                Text(if (saved) "Saved locally" else if (saving) "Getting location…" else "Save survey point")
            }
        }
    }
}
