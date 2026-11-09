package org.openrf.app.export

import org.openrf.app.data.Observation
import java.time.Instant

object CsvExporter {
    private fun quote(value: String): String = "\"" + value.replace("\"", "\"\"") + "\""

    fun create(records: List<Observation>): String = buildString {
        appendLine("id,title,category,notes,latitude,longitude,accuracy_meters,recorded_utc,source,verification")
        records.forEach { row ->
            appendLine(listOf(
                row.id.toString(), quote(row.title), quote(row.category), quote(row.notes),
                row.latitude.toString(), row.longitude.toString(), row.accuracyMeters?.toString() ?: "",
                quote(Instant.ofEpochMilli(row.recordedAtEpochMillis).toString()),
                quote(row.source), quote(row.verification)
            ).joinToString(","))
        }
    }
}
