package org.openrf.app.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.util.Consumer

/** Single foreground request. Prefer a quick available network fix; GPS can supply a fix too.
 *  No continuous updates, route recording, or background service are registered.
 */
class PhoneLocationSource(private val context: Context) {
    private fun fineAllowed(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun coarseAllowed(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun hasPermission(): Boolean = fineAllowed() || coarseAllowed()

    fun currentFix(callback: (Location?) -> Unit) {
        val fine = fineAllowed()
        val coarse = coarseAllowed() || fine
        if (!coarse) { callback(null); return }
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = mutableListOf<String>()
        try {
            if (coarse && manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                providers.add(LocationManager.NETWORK_PROVIDER)
            if (fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER))
                providers.add(LocationManager.GPS_PROVIDER)
        } catch (_: SecurityException) { callback(null); return }
        if (providers.isEmpty()) { callback(null); return }

        // Both providers are one-shot. The first valid result wins; wait for the
        // other provider only when the first one returns null or throws.
        var remaining = providers.size
        var delivered = false
        val executor = ContextCompat.getMainExecutor(context)
        providers.forEach { provider ->
            try {
                val cancellationSignal: android.os.CancellationSignal? = null
                val consumer = Consumer<Location> { result ->
                    if (!delivered && result != null) {
                        delivered = true
                        callback(result)
                    }
                    remaining--
                    if (!delivered && remaining == 0) callback(null)
                }
                LocationManagerCompat.getCurrentLocation(
                    manager, provider, cancellationSignal, executor, consumer
                )
            } catch (_: SecurityException) {
                remaining--
                if (!delivered && remaining == 0) callback(null)
            } catch (_: IllegalArgumentException) {
                remaining--
                if (!delivered && remaining == 0) callback(null)
            }
        }
    }
}
