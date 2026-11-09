package org.openrf.app.export

import org.openrf.app.data.InvestigationSession
import org.openrf.app.data.SessionReading
import org.openrf.app.data.SessionScan
import java.time.Instant

/** User-triggered, local-only export. Coordinates are receiver locations, not emitter locations. */
object SessionCsvExporter {
    private fun safeText(value: String): String {
        // Prevent spreadsheet formula execution for attacker-controlled SSIDs/BLE names.
        val dangerous = value.trimStart().firstOrNull() in listOf('=', '+', '-', '@', '\t', '\r', '\n')
        val valueForCell = if (dangerous) "'$value" else value
        return "\"" + valueForCell.replace("\"", "\"\"") + "\""
    }

    private fun utc(epoch: Long?): String = epoch?.let { Instant.ofEpochMilli(it).toString() }.orEmpty()

    fun create(session: InvestigationSession, scans: List<SessionScan>, readings: List<SessionReading>): String = buildString {
        appendLine("session_id,session_name,session_state,session_started_utc,session_ended_utc,scan_id,medium,scan_completed_utc,scan_count,phone_latitude,phone_longitude,phone_accuracy_meters,identifier,advertised_name,rssi_dbm,frequency_mhz,reading_seen_utc,details")
        val byScan = readings.groupBy { it.scanId }
        if (scans.isEmpty()) appendLine(prefix(session) + "," + List(13) { "" }.joinToString(","))
        scans.forEach { scan ->
            val base = prefix(session) + "," + listOf(
                scan.id.toString(), safeText(scan.medium), safeText(utc(scan.completedAtEpochMillis)), scan.resultCount.toString(),
                scan.phoneLatitude?.toString().orEmpty(), scan.phoneLongitude?.toString().orEmpty(),
                scan.phoneAccuracyMeters?.toString().orEmpty()
            ).joinToString(",")
            val captured = byScan[scan.id].orEmpty()
            if (captured.isEmpty()) appendLine(base + "," + List(6) { "" }.joinToString(","))
            captured.forEach { row ->
                appendLine(base + "," + listOf(
                    safeText(row.identifier), safeText(row.displayName), row.rssiDbm.toString(),
                    row.frequencyMhz?.toString().orEmpty(), safeText(utc(row.seenAtEpochMillis)),
                    safeText(row.details)
                ).joinToString(","))
            }
        }
    }

    private fun prefix(session: InvestigationSession): String = listOf(
        session.id.toString(), safeText(session.name), safeText(session.status),
        safeText(utc(session.startedAtEpochMillis)), safeText(utc(session.endedAtEpochMillis))
    ).joinToString(",")
}
