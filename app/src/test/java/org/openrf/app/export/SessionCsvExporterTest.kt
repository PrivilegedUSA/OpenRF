package org.openrf.app.export

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openrf.app.data.InvestigationSession
import org.openrf.app.data.SessionReading
import org.openrf.app.data.SessionScan
import org.openrf.app.data.SessionStatus

class SessionCsvExporterTest {
    private val session = InvestigationSession(
        id = 4, name = "Morning walk", startedAtEpochMillis = 1_600_000_000_000,
        endedAtEpochMillis = 1_600_000_060_000, status = SessionStatus.COMPLETED
    )

    @Test fun exportsPhoneLocationAndRepeatedReadings() {
        val scan = SessionScan(id = 3, sessionId = 4, medium = "WIFI", completedAtEpochMillis = 1_600_000_030_000,
            resultCount = 2, phoneLatitude = 38.0, phoneLongitude = -120.0, phoneAccuracyMeters = 10f)
        val reading = SessionReading(scanId = 3, identifier = "11:22:33:44:55:66", displayName = "Access Point",
            rssiDbm = -61, frequencyMhz = 2412, details = "Wi-Fi test", seenAtEpochMillis = 1_600_000_029_000)
        val csv = SessionCsvExporter.create(session, listOf(scan), listOf(reading, reading.copy(id = 2, rssiDbm = -65)))
        assertEquals(3, csv.lineSequence().filter { it.isNotBlank() }.count())
        assertTrue(csv.contains("38.0,-120.0,10.0"))
        assertTrue(csv.contains("2412"))
        assertTrue(csv.contains("-65"))
    }

    @Test fun preservesZeroResultScans() {
        val csv = SessionCsvExporter.create(session, listOf(
            SessionScan(id = 7, sessionId = 4, medium = "BLE", completedAtEpochMillis = 1_600_000_035_000, resultCount = 0)
        ), emptyList())
        assertEquals(2, csv.lineSequence().filter { it.isNotBlank() }.count())
        assertTrue(csv.contains("\"BLE\""))
    }

    @Test fun preventsSpreadsheetFormulaEvaluationForAdvertisedNames() {
        val csv = SessionCsvExporter.create(session,
            listOf(SessionScan(id = 1, sessionId = 4, medium = "WIFI", completedAtEpochMillis = 1_600_000_035_000, resultCount = 1)),
            listOf(SessionReading(scanId = 1, identifier = "AA:BB", displayName = "=IMPORTXML(1)",
                rssiDbm = -40, frequencyMhz = 5200, details = "+CMD", seenAtEpochMillis = 1_600_000_035_000)))
        assertTrue(csv.contains("\"'=IMPORTXML(1)\""))
        assertTrue(csv.contains("\"'+CMD\""))
    }

    @Test fun emptySessionStillExportsSummaryRow() {
        val csv = SessionCsvExporter.create(session, emptyList(), emptyList())
        assertEquals(2, csv.lineSequence().filter { it.isNotBlank() }.count())
        assertTrue(csv.contains("Morning walk"))
    }
}
