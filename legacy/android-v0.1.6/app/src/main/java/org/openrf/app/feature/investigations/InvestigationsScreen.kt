package org.openrf.app.feature.investigations

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.Flow
import org.openrf.app.data.InvestigationSession
import org.openrf.app.data.SessionReading
import org.openrf.app.data.SessionScan
import org.openrf.app.data.SessionStatus
import org.openrf.app.export.SessionCsvExporter
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun InvestigationsScreen(
    sessions: List<InvestigationSession>, active: InvestigationSession?, ready: Boolean,
    message: String,
    onStart: (String) -> Unit, onStop: () -> Unit,
    onDelete: (InvestigationSession) -> Unit,
    scansFor: (Long) -> Flow<List<SessionScan>>,
    readingsFor: (Long) -> Flow<List<SessionReading>>
) {
    var selectedId by remember { mutableStateOf<Long?>(null) }
    var toDelete by remember { mutableStateOf<InvestigationSession?>(null) }
    var title by remember { mutableStateOf(defaultSessionName()) }
    val selected = sessions.firstOrNull { it.id == selectedId }

    if (selected != null) {
        SessionDetails(selected, scansFor, readingsFor, onBack = { selectedId = null })
    } else {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            contentPadding = PaddingValues(vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text("Investigations", style = MaterialTheme.typography.headlineSmall)
                Text("Private, foreground-only sessions. Open Scanner to trigger each BLE or Wi-Fi scan. No background recording or GPS route tracking.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item {
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (active == null) {
                            Text(if (ready) "Start an investigation" else "Opening local session storage…", style = MaterialTheme.typography.titleMedium)
                            OutlinedTextField(value = title, onValueChange = { title = it.take(80) },
                                label = { Text("Session name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            Button(onClick = {
                                onStart(title)
                                title = defaultSessionName()
                            }, enabled = ready && title.isNotBlank()) { Text("Start session") }
                        } else {
                            Text("ACTIVE · ${active.name}", style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.primary)
                            Text("Started ${time(active.startedAtEpochMillis)}", style = MaterialTheme.typography.bodySmall)
                            Text("Only completed scans you start on Scanner are saved automatically to this session. Leaving the app stops the session.",
                                style = MaterialTheme.typography.bodySmall)
                            Button(onClick = onStop) { Text("Stop & save session") }
                        }
                        if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            item { Text("Session history · ${sessions.size}", style = MaterialTheme.typography.titleMedium) }
            if (sessions.isEmpty()) item {
                Text("No sessions yet. Start one here, open Scanner, and run a scan.", style = MaterialTheme.typography.bodyMedium)
            }
            items(sessions, key = { it.id }) { session ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(session.name, style = MaterialTheme.typography.titleMedium)
                        Text("${session.status} · ${time(session.startedAtEpochMillis)}", style = MaterialTheme.typography.labelMedium)
                        Text(if (session.endedAtEpochMillis != null) "Ended ${time(session.endedAtEpochMillis)}" else if (session.status == SessionStatus.INTERRUPTED) "End time unknown after process interruption" else "Recording only while the app is open",
                            style = MaterialTheme.typography.bodySmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { selectedId = session.id }) { Text("View results") }
                            if (session.status != SessionStatus.ACTIVE) {
                                TextButton(onClick = { toDelete = session }) { Text("Delete") }
                            }
                        }
                    }
                }
            }
            item {
                Text("Session scan history is separate from individually saved Discoveries. Sessions capture completed scan snapshots; existing saved observations and map pins are unchanged.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    toDelete?.let { session ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("Delete investigation?") },
            text = { Text("Delete '${session.name}' and all its scan snapshots? This cannot be undone. Existing Discoveries remain untouched.") },
            confirmButton = { TextButton(onClick = { onDelete(session); toDelete = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun SessionDetails(
    session: InvestigationSession,
    scansFor: (Long) -> Flow<List<SessionScan>>,
    readingsFor: (Long) -> Flow<List<SessionReading>>,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scansFlow = remember(session.id) { scansFor(session.id) }
    val readingsFlow = remember(session.id) { readingsFor(session.id) }
    val scans by scansFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val readings by readingsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val readingsByScan = remember(readings) { readings.groupBy { it.scanId } }
    val identifierCount = remember(scans, readings) {
        val mediums = scans.associate { it.id to it.medium }
        readings.map { (mediums[it.scanId] ?: "UNKNOWN") to it.identifier }.distinct().size
    }
    var exportStatus by remember(session.id) { mutableStateOf("") }
    val documentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) {
            try {
                val bytes = SessionCsvExporter.create(session, scans, readings).toByteArray(Charsets.UTF_8)
                context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: error("Could not open the selected file")
                exportStatus = "Saved CSV locally. Review identifiers and locations before sharing."
            } catch (_: Exception) { exportStatus = "Export failed. Try another destination." }
        }
    }
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            TextButton(onClick = onBack) { Text("← All sessions") }
            Text(session.name, style = MaterialTheme.typography.headlineSmall)
            Text("${session.status} · ${time(session.startedAtEpochMillis)}", style = MaterialTheme.typography.bodySmall)
            Text("${scans.size} successful scan cycles · ${readings.size} received readings · " +
                "$identifierCount distinct observed identifiers",
                style = MaterialTheme.typography.bodyMedium)
            Text("Counts are observations, not confirmed unique devices. Wireless identifiers may change. Snapshot locations are PHONE positions, not transmitter locations.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { documentLauncher.launch("openrf-session-${session.id}.csv") }) { Text("Export session CSV") }
            if (exportStatus.isNotBlank()) Text(exportStatus, style = MaterialTheme.typography.bodySmall)
        }
        if (scans.isEmpty()) item {
            Text("No completed scans captured. Keep this session active, switch to Scanner, and complete a BLE or Wi-Fi scan.")
        }
        items(scans, key = { it.id }) { scan ->
            val subset = readingsByScan[scan.id].orEmpty()
            var expanded by remember(scan.id) { mutableStateOf(false) }
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("${scan.medium} · ${scan.resultCount} readings", style = MaterialTheme.typography.titleMedium)
                    Text(time(scan.completedAtEpochMillis), style = MaterialTheme.typography.bodySmall)
                    val lat = scan.phoneLatitude
                    val lon = scan.phoneLongitude
                    Text(if (lat != null && lon != null)
                        "Receiver: ${String.format(Locale.US, "%.6f, %.6f", lat, lon)}" +
                            (scan.phoneAccuracyMeters?.let { " · ±${it.toInt()} m" } ?: " · accuracy not reported")
                        else "Phone position unavailable for this scan",
                        style = MaterialTheme.typography.bodySmall)
                    if (subset.isEmpty()) Text("No fresh radio observations returned.", style = MaterialTheme.typography.bodySmall)
                    (if (expanded) subset else subset.take(8)).forEach { reading ->
                        HorizontalDivider()
                        Text(reading.displayName, style = MaterialTheme.typography.bodyMedium)
                        Text("${reading.identifier} · ${reading.rssiDbm} dBm" +
                            (reading.frequencyMhz?.let { " · $it MHz" } ?: ""), style = MaterialTheme.typography.bodySmall)
                        Text("Seen ${time(reading.seenAtEpochMillis)}", style = MaterialTheme.typography.labelSmall)
                    }
                    if (subset.size > 8) {
                        TextButton(onClick = { expanded = !expanded }) {
                            Text(if (expanded) "Show fewer readings" else "Show all ${subset.size} readings")
                        }
                    }
                }
            }
        }
    }
}

private fun defaultSessionName(): String = "Survey " + SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date())
private fun time(epochMillis: Long): String = DateFormat.getDateTimeInstance().format(Date(epochMillis))
