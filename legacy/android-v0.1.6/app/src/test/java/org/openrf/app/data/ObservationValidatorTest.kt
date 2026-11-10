package org.openrf.app.data

import org.junit.Assert.*
import org.junit.Test

class ObservationValidatorTest {
    @Test fun acceptsValidHumanObservation() = assertTrue(ObservationValidator.valid("Camera pole", 38.4, -120.8, null))
    @Test fun rejectsBlankTitle() = assertFalse(ObservationValidator.valid(" ", 38.4, -120.8, null))
    @Test fun rejectsBadCoordinates() {
        assertFalse(ObservationValidator.valid("test", 91.0, 0.0, null))
        assertFalse(ObservationValidator.valid("test", 0.0, -181.0, null))
        assertFalse(ObservationValidator.valid("test", Double.NaN, 0.0, null))
    }
    @Test fun rejectsInvalidAccuracy() = assertFalse(ObservationValidator.valid("test", 0.0, 0.0, -2.0f))
}
