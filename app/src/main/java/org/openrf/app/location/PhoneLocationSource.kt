package org.openrf.app.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat

/** Single on-demand fix only; never registers a background tracker. */
class PhoneLocationSource(private val context: Context) {
    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun currentFix(callback: (Location?) -> Unit) {
        if (!hasPermission()) { callback(null); return }
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) { callback(null); return }
        try {
            // Core 1.17 exposes Android and AndroidX CancellationSignal overloads.
            // Type the signal explicitly to avoid Kotlin overload ambiguity.
            val cancellationSignal: android.os.CancellationSignal? = null
            val locationConsumer = androidx.core.util.Consumer<Location> { location ->
                callback(location)
            }
            LocationManagerCompat.getCurrentLocation(
                manager, provider, cancellationSignal,
                ContextCompat.getMainExecutor(context), locationConsumer
            )
        } catch (_: SecurityException) { callback(null) }
        catch (_: IllegalArgumentException) { callback(null) }
    }
}
