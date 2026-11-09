package org.openrf.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [Observation::class], version = 1, exportSchema = false)
abstract class OpenRfDatabase : RoomDatabase() {
    abstract fun observations(): ObservationDao

    companion object {
        @Volatile private var instance: OpenRfDatabase? = null

        fun get(context: Context): OpenRfDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, OpenRfDatabase::class.java, "openrf-observations.db")
                .build().also { instance = it }
        }
    }
}
