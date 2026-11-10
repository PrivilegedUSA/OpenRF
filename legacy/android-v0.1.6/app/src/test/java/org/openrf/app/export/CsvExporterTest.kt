package org.openrf.app.export

import org.junit.Assert.*
import org.junit.Test
import org.openrf.app.data.Observation

class CsvExporterTest {
    @Test fun escapesCommasQuotesAndNewlines() {
        val result = CsvExporter.create(listOf(Observation(
            id = 5, title = "Test, \"pole\"", category = "Field note", notes = "first\nsecond",
            latitude = 0.0, longitude = 0.0, accuracyMeters = null,
            recordedAtEpochMillis = 0
        )))
        assertTrue(result.contains("\"Test, \"\"pole\"\"\""))
        assertTrue(result.contains("\"first\nsecond\""))
        assertTrue(result.contains("1970-01-01T00:00:00Z"))
    }
}
