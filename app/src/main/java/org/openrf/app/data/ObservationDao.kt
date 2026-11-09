package org.openrf.app.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ObservationDao {
    @Query("SELECT * FROM observations ORDER BY recordedAtEpochMillis DESC, id DESC")
    fun all(): Flow<List<Observation>>

    @Insert
    suspend fun insert(observation: Observation): Long

    @Delete
    suspend fun delete(observation: Observation)
}
