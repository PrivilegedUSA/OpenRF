package org.openrf.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val palette = darkColorScheme(
    primary = Color(0xFF6AD3CE),
    onPrimary = Color(0xFF003734),
    secondary = Color(0xFF9DB3C7),
    background = Color(0xFF0B1119),
    surface = Color(0xFF121B27),
    surfaceVariant = Color(0xFF1D2A38),
    onSurface = Color(0xFFF1F5FA),
    onSurfaceVariant = Color(0xFFBDCBD9),
    outline = Color(0xFF546473)
)

@Composable
fun OpenRfTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = palette, content = content)
}
