package org.openrf.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.Bookmarks
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.maplibre.android.MapLibre
import org.openrf.app.feature.map.MapScreen
import org.openrf.app.feature.scanner.ScannerScreen
import org.openrf.app.feature.discoveries.DiscoveriesScreen
import org.openrf.app.feature.investigations.InvestigationsScreen
import org.openrf.app.feature.settings.SettingsScreen
import org.openrf.app.ui.OpenRfTheme

class MainActivity : ComponentActivity() {
    private val model: OpenRfViewModel by viewModels { OpenRfViewModel.factory(application) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MapLibre.getInstance(applicationContext)
        setContent {
            OpenRfTheme {
                val records by model.observations.collectAsStateWithLifecycle()
                var section by remember { mutableStateOf(Screen.MAP) }
                Scaffold(
                    topBar = {
                        Surface(tonalElevation = 3.dp) {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 15.dp)) {
                                Text("OPENRF", style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.weight(1f))
                                Text("FIELD TOOL  ·  v0.1.3", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    },
                    bottomBar = {
                        NavigationBar {
                            Screen.entries.forEach { entry ->
                                NavigationBarItem(
                                    selected = section == entry,
                                    onClick = { section = entry },
                                    label = { Text(entry.label) },
                                    icon = { Icon(entry.icon, contentDescription = null) }
                                )
                            }
                        }
                    }
                ) { padding ->
                    Box(Modifier.fillMaxSize().padding(padding)) {
                        when (section) {
                            Screen.MAP -> MapScreen(records, model::add)
                            Screen.SCANNER -> ScannerScreen()
                            Screen.DISCOVERIES -> DiscoveriesScreen(records, model::delete)
                            Screen.INVESTIGATIONS -> InvestigationsScreen()
                            Screen.SETTINGS -> SettingsScreen(records)
                        }
                    }
                }
            }
        }
    }
}

private enum class Screen(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    MAP("Map", Icons.Filled.Map),
    SCANNER("Scanner", Icons.Filled.Radar),
    DISCOVERIES("Saved", Icons.Filled.Bookmarks),
    INVESTIGATIONS("Sessions", Icons.Filled.FolderOpen),
    SETTINGS("Settings", Icons.Filled.Settings)
}
