package org.openrf.app.feature.settings

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import org.openrf.app.data.Observation
import org.openrf.app.export.CsvExporter

@Composable
fun SettingsScreen(records: List<Observation>) {
    val context = LocalContext.current
    var status by remember { mutableStateOf("") }
    var permissionState by remember { mutableStateOf(checkLocation(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissionState = checkLocation(context) }
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/csv")
    ) { uri ->
        if (uri != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { stream ->
                    stream.write(CsvExporter.create(records).toByteArray(Charsets.UTF_8))
                } ?: error("Unable to open selected file")
                status = "CSV exported using Android's document picker."
            } catch (ex: Exception) { status = "Export failed: ${ex.localizedMessage ?: "unknown error"}" }
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Settings & hardware", style = MaterialTheme.typography.headlineSmall)
        Text("OpenRF v0.1.5 · local observations, optional BLE / Wi-Fi surveys, online maps")
        ElevatedCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Location permission", style = MaterialTheme.typography.titleMedium)
                Text(if (permissionState) "Granted" else "Not granted")
                Text("The map automatically requests one foreground location fix when opened and permission is granted. If permission has not yet been requested, it asks once. No background tracking or route logging.",
                    style = MaterialTheme.typography.bodySmall)
                Button(onClick = {
                    permissionLauncher.launch(arrayOf(
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    ))
                }) { Text("Request location permission") }
            }
        }
        ElevatedCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Export private observations", style = MaterialTheme.typography.titleMedium)
                Text("Save ${records.size} local records to a CSV of your choosing. No automatic uploads.",
                    style = MaterialTheme.typography.bodySmall)
                Button(onClick = { exportLauncher.launch("openrf-observations.csv") }) { Text("Export CSV") }
            }
        }
        ElevatedCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("Map and privacy", style = MaterialTheme.typography.titleMedium)
                Text("MapLibre loads street or dark OpenFreeMap tiles online (map data from OpenStreetMap). The map service receives ordinary requests for areas viewed; your saved observation database is not uploaded. Change the basemap using the Layers icon on the Map screen.")
                Text("BLE and Wi-Fi scanning only runs while Scanner is visible and on request. Offline map downloads, RF spectrum analysis, hardware pairing, sessions and proximity alerts are not implemented.")
            }
        }
        if (status.isNotBlank()) Text(status, style = MaterialTheme.typography.bodySmall)
    }
}

private fun checkLocation(context: android.content.Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
