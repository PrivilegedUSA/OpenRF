package org.openrf.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Version 2 adds sessions while preserving all v1 observations, pins and radio notes. */
@Database(
    entities = [Observation::class, InvestigationSession::class, SessionScan::class, SessionReading::class],
    version = 2, exportSchema = false
)
abstract class OpenRfDatabase : RoomDatabase() {
    abstract fun observations(): ObservationDao
    abstract fun sessions(): SessionDao

    companion object {
        /** Room 2.8 compatibility mode uses SupportSQLiteDatabase because no custom driver is configured. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""CREATE TABLE IF NOT EXISTS `investigation_sessions` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `startedAtEpochMillis` INTEGER NOT NULL, `endedAtEpochMillis` INTEGER, `status` TEXT NOT NULL)""")
                db.execSQL("""CREATE TABLE IF NOT EXISTS `session_scans` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `sessionId` INTEGER NOT NULL, `medium` TEXT NOT NULL, `completedAtEpochMillis` INTEGER NOT NULL, `resultCount` INTEGER NOT NULL, `phoneLatitude` REAL, `phoneLongitude` REAL, `phoneAccuracyMeters` REAL, FOREIGN KEY(`sessionId`) REFERENCES `investigation_sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)""")
                db.execSQL("""CREATE INDEX IF NOT EXISTS `index_session_scans_sessionId` ON `session_scans` (`sessionId`)""")
                db.execSQL("""CREATE TABLE IF NOT EXISTS `session_readings` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `scanId` INTEGER NOT NULL, `identifier` TEXT NOT NULL, `displayName` TEXT NOT NULL, `rssiDbm` INTEGER NOT NULL, `frequencyMhz` INTEGER, `details` TEXT NOT NULL, `seenAtEpochMillis` INTEGER NOT NULL, FOREIGN KEY(`scanId`) REFERENCES `session_scans`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE)""")
                db.execSQL("""CREATE INDEX IF NOT EXISTS `index_session_readings_scanId` ON `session_readings` (`scanId`)""")
            }
        }

        @Volatile private var instance: OpenRfDatabase? = null
        fun get(context: Context): OpenRfDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, OpenRfDatabase::class.java, "openrf-observations.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }
    }
}
