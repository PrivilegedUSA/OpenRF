package org.openrf.app.feature.investigations

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun InvestigationsScreen() {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Investigations", style = MaterialTheme.typography.headlineSmall)
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("No active investigation", style = MaterialTheme.typography.titleMedium)
                Text("Session recording, comparisons, and route history are not implemented yet.")
                Text("The Map and Discoveries sections already support manually saving locations, without tracking where you travel.",
                    style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
