package org.openrf.app.feature.discoveries

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.openrf.app.data.Observation
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DiscoveriesScreen(records: List<Observation>, onDelete: (Observation) -> Unit) {
    var search by remember { mutableStateOf("") }
    var toDelete by remember { mutableStateOf<Observation?>(null) }
    val filtered = remember(records, search) {
        records.filter { it.title.contains(search, ignoreCase = true) ||
            it.category.contains(search, ignoreCase = true) ||
            it.notes.contains(search, ignoreCase = true) }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Discoveries", style = MaterialTheme.typography.headlineSmall)
        Text("Manual observations only · ${records.size} saved", style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(value = search, onValueChange = { search = it },
            label = { Text("Search records") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        if (filtered.isEmpty()) {
            Text(if (records.isEmpty()) "No records yet. Long-press the map to save your first observation."
                else "No matching observations.", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(filtered, key = { it.id }) { item ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(item.title, style = MaterialTheme.typography.titleMedium)
                            Text("${item.category} · UNVERIFIED · MANUAL", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary)
                            Text("${String.format(Locale.US, "%.6f, %.6f", item.latitude, item.longitude)}" +
                                (item.accuracyMeters?.let { " · ±${it.toInt()} m" } ?: " · pin placement"),
                                style = MaterialTheme.typography.bodySmall)
                            Text(DateFormat.getDateTimeInstance().format(Date(item.recordedAtEpochMillis)),
                                style = MaterialTheme.typography.bodySmall)
                            if (item.notes.isNotBlank()) Text(item.notes, style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = { toDelete = item }) { Text("Delete record") }
                        }
                    }
                }
            }
        }
    }
    toDelete?.let { record ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("Delete observation?") },
            text = { Text("This removes the local record '${record.title}'. It cannot be undone.") },
            confirmButton = { TextButton(onClick = { onDelete(record); toDelete = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("Cancel") } }
        )
    }
}
