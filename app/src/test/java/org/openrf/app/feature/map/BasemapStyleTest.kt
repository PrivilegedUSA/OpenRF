package org.openrf.app.feature.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BasemapStyleTest {
    @Test fun defaultsToStreetLabels() {
        assertEquals(BasemapStyle.STREETS, BasemapStyle.fromId(null))
        assertEquals(BasemapStyle.STREETS, BasemapStyle.fromId("unknown"))
        assertTrue(BasemapStyle.STREETS.url.startsWith("https://tiles.openfreemap.org/styles/"))
    }

    @Test fun darkStyleIsSelectable() {
        assertEquals(BasemapStyle.DARK, BasemapStyle.fromId("dark"))
        assertEquals("Dark", BasemapStyle.DARK.label)
    }
}
