package org.openrf.app.feature.map

import android.Manifest
import android.location.Location
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.openrf.app.data.Observation
import org.openrf.app.data.ObservationCategories
import org.openrf.app.data.ObservationValidator
import org.openrf.app.location.PhoneLocationSource
import java.util.Locale

private data class DraftPoint(val latitude: Double, val longitude: Double, val accuracyMeters: Float?)

@Composable
fun MapScreen(records: List<Observation>, onSave: (String, String, String, Double, Double, Float?) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val locationSource = remember(context) { PhoneLocationSource(context) }
    val mapView = remember(context) { MapView(context).apply { onCreate(null) } }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var currentLocation by remember { mutableStateOf<Location?>(null) }
    var draft by remember { mutableStateOf<DraftPoint?>(null) }
    var notice by remember { mutableStateOf("Long-press the map to record a location.") }

    // MapView is a classic Android view: its lifecycle must follow the host.
    DisposableEffect(mapView, owner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> Unit
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose {
            owner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    LaunchedEffect(mapView) {
        mapView.getMapAsync { readyMap ->
            readyMap.addOnMapLongClickListener { latLng ->
                draft = DraftPoint(latLng.latitude, latLng.longitude, null)
                true
            }
            readyMap.setStyle("https://demotiles.maplibre.org/style.json") {
                map = readyMap
                readyMap.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(25.0, 0.0)).zoom(1.5).build()
            }
        }
    }

    LaunchedEffect(map, records, currentLocation) {
        val activeMap = map ?: return@LaunchedEffect
        activeMap.clear()
        records.forEach { record ->
            activeMap.addMarker(MarkerOptions()
                .position(LatLng(record.latitude, record.longitude))
                .title(record.title)
                .snippet("${record.category} · ${record.verification.lowercase()}; tap Discoveries for details"))
        }
        currentLocation?.let { fix ->
            activeMap.addMarker(MarkerOptions()
                .position(LatLng(fix.latitude, fix.longitude))
                .title("On-demand location fix (${fix.provider})")
                .snippet(if (fix.hasAccuracy()) "Reported accuracy: ±${fix.accuracy.toInt()} m" else "Accuracy not supplied"))
        }
    }

    fun locate() {
        notice = "Requesting a current location fix…"
        locationSource.currentFix { fix ->
            if (fix == null) {
                notice = "No location fix. Check that Location is enabled, then try again."
            } else {
                currentLocation = fix
                map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(fix.latitude, fix.longitude), 15.0))
                notice = "Location fix (${fix.provider}) · ${if (fix.hasAccuracy()) "±${fix.accuracy.toInt()} m" else "accuracy unknown"}. No background tracking."
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result.values.any { it }) locate()
        else notice = "Location permission denied. You can still long-press the map."
    }

    Column(Modifier.fillMaxSize()) {
        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Text(
                "Development map tiles need internet. Manual observations are saved on-device.",
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp),
                style = MaterialTheme.typography.labelMedium
            )
        }
        Box(Modifier.weight(1f)) {
            AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
            Column(
                Modifier.align(Alignment.TopEnd).padding(12.dp),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilledTonalIconButton(onClick = {
                    if (locationSource.hasPermission()) locate()
                    else permissionLauncher.launch(arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ))
                }) { Icon(Icons.Filled.MyLocation, contentDescription = "Find my current location") }
                FilledTonalIconButton(onClick = {
                    val fix = currentLocation
                    if (fix != null) draft = DraftPoint(fix.latitude, fix.longitude, if (fix.hasAccuracy()) fix.accuracy else null)
                    else notice = "Find your location or long-press the map before adding a record."
                }) { Icon(Icons.Filled.AddLocationAlt, contentDescription = "Add at current GPS fix") }
            }
            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                shape = RoundedCornerShape(12.dp),
                tonalElevation = 2.dp
            ) {
                Text(notice, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
    draft?.let { selected ->
        AddObservationDialog(selected,
            onDismiss = { draft = null },
            onSave = { title, category, notes ->
                onSave(title, category, notes, selected.latitude, selected.longitude, selected.accuracyMeters)
                draft = null
                notice = "Manual observation saved on this device. Not verified or shared."
            }
        )
    }
}

@Composable
private fun AddObservationDialog(
    point: DraftPoint,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(ObservationCategories.all.first()) }
    var menuExpanded by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Record manual observation") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("This is a user-reported observation, not a scanner detection.", style = MaterialTheme.typography.bodySmall)
                Text(
                    "${String.format(Locale.US, "%.6f, %.6f", point.latitude, point.longitude)}" +
                        (point.accuracyMeters?.let { " · ±${it.toInt()} m" } ?: " · manually placed pin"),
                    style = MaterialTheme.typography.labelMedium
                )
                OutlinedTextField(
                    value = title, onValueChange = { title = it.take(120) },
                    label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth()
                )
                Box {
                    OutlinedButton(onClick = { menuExpanded = true }) {
                        Text(category, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        ObservationCategories.all.forEach { item ->
                            DropdownMenuItem(text = { Text(item) }, onClick = {
                                category = item; menuExpanded = false
                            })
                        }
                    }
                }
                OutlinedTextField(
                    value = notes, onValueChange = { notes = it.take(2000) },
                    label = { Text("Notes (optional)") }, minLines = 2, maxLines = 4,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = ObservationValidator.valid(title, point.latitude, point.longitude, point.accuracyMeters),
                onClick = { onSave(title.trim(), category, notes.trim()) }
            ) { Text("Save locally") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
