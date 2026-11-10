package org.openrf.app.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WirelessScanQualityTest {
    @Test fun rejectsCachedWifiResults() {
        assertFalse(WirelessScanQuality.wifiReadingIsFresh(1_000_000L, 60_000L, 62_000L))
        assertFalse(WirelessScanQuality.wifiReadingIsFresh(0, 60_000L, 62_000L))
    }

    @Test fun acceptsResultsFromCurrentScanWindow() {
        assertTrue(WirelessScanQuality.wifiReadingIsFresh(61_000_000L, 60_000L, 62_000L))
        assertTrue(WirelessScanQuality.wifiReadingIsFresh(59_000_000L, 60_000L, 62_000L))
    }

    @Test fun rejectsFutureAndOldWifiSamples() {
        assertFalse(WirelessScanQuality.wifiReadingIsFresh(65_000_000L, 60_000L, 62_000L))
        assertFalse(WirelessScanQuality.wifiReadingIsFresh(20_000_000L, 20_000L, 62_000L))
    }

    @Test fun computesWallTimeFromMonotonicAge() {
        assertEquals(1_700_000_000_000L - 3_000L,
            WirelessScanQuality.readingEpochMillis(1_700_000_000_000L, 65_000L, 62_000L))
        assertEquals(1_700_000_000_000L,
            WirelessScanQuality.readingEpochMillis(1_700_000_000_000L, 65_000L, 66_000L))
    }
}
