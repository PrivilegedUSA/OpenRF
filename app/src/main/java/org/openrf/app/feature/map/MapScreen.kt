package org.openrf.app.feature.map

import android.Manifest
import android.content.Context
import android.location.Location
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
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

private const val PERMISSION_PROMPTED_KEY = "location_permission_prompted"
private const val BASEMAP_KEY = "basemap_style"
private data class DraftPoint(val latitude: Double, val longitude: Double, val accuracyMeters: Float?)

@Composable
fun MapScreen(records: List<Observation>, onSave: (String, String, String, Double, Double, Float?) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val preferences = remember(context) { context.getSharedPreferences("openrf_map", Context.MODE_PRIVATE) }
    val locationSource = remember(context) { PhoneLocationSource(context) }
    val mapView = remember(context) { MapView(context).apply { onCreate(null) } }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleLoaded by remember { mutableStateOf(false) }
    var requestedStyleId by remember { mutableStateOf<String?>(null) }
    var basemapId by rememberSaveable { mutableStateOf(BasemapStyle.fromId(preferences.getString(BASEMAP_KEY, null)).id) }
    var styleMenuExpanded by remember { mutableStateOf(false) }
    var currentLocation by remember { mutableStateOf<Location?>(null) }
    var draft by remember { mutableStateOf<DraftPoint?>(null) }
    var notice by remember { mutableStateOf("Long-press the map to record a location.") }

    // A MapView has its own Android view lifecycle. No background location service is started.
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
        // A tab can be entered while the activity is already resumed.
        if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStart()
        if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
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
            // Temporary regional fallback, never represented as the user's location.
            // When permitted, a real device fix takes precedence immediately.
            val saved = records.firstOrNull()
            readyMap.cameraPosition = CameraPosition.Builder()
                .target(if (saved != null) LatLng(saved.latitude, saved.longitude) else LatLng(39.0, -98.0))
                .zoom(if (saved != null) 13.0 else 3.5)
                .build()
            map = readyMap
        }
    }

    // Changing base styles must not reset the current camera or remove saved observations.
    LaunchedEffect(map, basemapId) {
        val activeMap = map ?: return@LaunchedEffect
        styleLoaded = false
        requestedStyleId = basemapId
        val requestId = basemapId
        activeMap.setStyle(BasemapStyle.fromId(requestId).url) {
            if (requestedStyleId == requestId) styleLoaded = true
        }
    }

    LaunchedEffect(map, styleLoaded, records, currentLocation) {
        val activeMap = map ?: return@LaunchedEffect
        if (!styleLoaded) return@LaunchedEffect
        activeMap.clear()
        records.forEach { record ->
            activeMap.addMarker(MarkerOptions()
                .position(LatLng(record.latitude, record.longitude))
                .title(record.title)
                .snippet("${record.category} · ${record.verification.lowercase()}; tap Saved for details"))
        }
        currentLocation?.let { fix ->
            activeMap.addMarker(MarkerOptions()
                .position(LatLng(fix.latitude, fix.longitude))
                .title("Your last foreground location fix (${fix.provider})")
                .snippet(if (fix.hasAccuracy()) "Reported accuracy: ±${fix.accuracy.toInt()} m" else "Accuracy not supplied"))
        }
    }

    fun locate() {
        if (!locationSource.hasPermission()) {
            notice = "Location permission is not granted. Tap the location button to request it."
            return
        }
        notice = "Finding your location…"
        locationSource.currentFix { fix ->
            if (fix == null) {
                notice = "No location fix. Check Location services, signal, or permissions, then retry."
            } else {
                currentLocation = fix
                map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(fix.latitude, fix.longitude), 15.0))
                notice = "Location (${fix.provider}) · ${if (fix.hasAccuracy()) "±${fix.accuracy.toInt()} m" else "accuracy unknown"}. One-time foreground fix."
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result.values.any { it }) locate()
        else notice = "Location denied. The map and manual pins still work; tap the location button to try again."
    }

    // Automatically locate when returning to this screen with permission. Prompt just once
    // across launches; the user can always opt in later via the location button.
    LaunchedEffect(map) {
        if (map == null) return@LaunchedEffect
        if (locationSource.hasPermission()) {
            locate()
        } else if (!preferences.getBoolean(PERMISSION_PROMPTED_KEY, false)) {
            preferences.edit().putBoolean(PERMISSION_PROMPTED_KEY, true).apply()
            notice = "Allow location to automatically center the map on your position."
            permissionLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ))
        } else {
            notice = "Location is off. Tap the location button to enable it, or long-press to add a pin."
        }
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
            AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
            Column(
                Modifier.align(Alignment.TopEnd).padding(12.dp),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box {
                    FilledTonalIconButton(onClick = { styleMenuExpanded = true }) {
                        Icon(Icons.Filled.Layers, contentDescription = "Choose street or dark basemap")
                    }
                    DropdownMenu(expanded = styleMenuExpanded, onDismissRequest = { styleMenuExpanded = false }) {
                        BasemapStyle.entries.forEach { style ->
                            DropdownMenuItem(
                                text = { Text(if (style.id == basemapId) "✓ ${style.label}" else style.label) },
                                onClick = {
                                    basemapId = style.id
                                    preferences.edit().putString(BASEMAP_KEY, style.id).apply()
                                    styleMenuExpanded = false
                                }
                            )
                        }
                    }
                }
                FilledTonalIconButton(onClick = {
                    if (locationSource.hasPermission()) locate()
                    else permissionLauncher.launch(arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ))
                }) { Icon(Icons.Filled.MyLocation, contentDescription = "Center on my current location") }
                FilledTonalIconButton(onClick = {
                    val fix = currentLocation
                    if (fix != null) draft = DraftPoint(fix.latitude, fix.longitude, if (fix.hasAccuracy()) fix.accuracy else null)
                    else notice = "First obtain a location fix, or long-press anywhere to add a manual record."
                }) { Icon(Icons.Filled.AddLocationAlt, contentDescription = "Record at last location fix") }
            }
            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                shape = RoundedCornerShape(12.dp),
                tonalElevation = 2.dp
            ) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 9.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(if (styleLoaded) "${BasemapStyle.fromId(basemapId).label} map" else "Loading ${BasemapStyle.fromId(basemapId).label.lowercase()} map… internet required",
                        style = MaterialTheme.typography.labelMedium)
                    Text(notice, style = MaterialTheme.typography.bodySmall)
                    Text("Map data © OpenStreetMap contributors · Tiles © OpenFreeMap / OpenMapTiles",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
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
