package org.openrf.app.feature.scanner

import android.content.pm.PackageManager
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bluetooth
import androidx.compose.material.icons.outlined.Radio
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

@Composable
fun ScannerScreen() {
    val packageManager = LocalContext.current.packageManager
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Wireless & RF scanner", style = MaterialTheme.typography.headlineSmall)
        Text(
            "No scanning is running in v0.1.4. This page displays hardware support only; it does not claim to detect signals.",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        FeatureStatus("Wi-Fi adapter", packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI),
            "Wi-Fi discovery requires a future implementation and Android permissions.")
        FeatureStatus("Bluetooth LE", packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE),
            "BLE discovery is not active in this release.")
        FeatureStatus("External SDR / ESP32", false,
            "External receiver drivers are planned. Nothing is connected or measured.")
        HorizontalDivider()
        Text("A phone is not a general RF spectrum analyzer. Advanced frequencies require compatible receiver hardware.",
            style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun FeatureStatus(title: String, supported: Boolean, detail: String) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(if (supported) "Hardware available · scan inactive" else "Unavailable / not connected",
                color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
            Text(detail, style = MaterialTheme.typography.bodySmall)
        }
    }
}
