package org.openrf.app.feature.map

/** MapLibre vector styles. A hosted basemap needs network access, but no login or API key. */
enum class BasemapStyle(val id: String, val label: String, val url: String) {
    STREETS("streets", "Streets", "https://tiles.openfreemap.org/styles/liberty"),
    DARK("dark", "Dark", "https://tiles.openfreemap.org/styles/dark");

    companion object {
        fun fromId(id: String?): BasemapStyle = entries.firstOrNull { it.id == id } ?: STREETS
    }
}
